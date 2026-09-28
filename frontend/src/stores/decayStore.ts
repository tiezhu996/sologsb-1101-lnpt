import { defineStore } from 'pinia'
import { computed, reactive, ref } from 'vue'
import { db } from '@/utils/db'
import { useIdbTable } from '@/hooks/useIdbTable'
import {
  createEmptyDecayFilter,
  type Decay,
  type DecayFilterState,
  type DecayType,
  type Severity
} from '@/types/decay'
import type { Element } from '@/types/element'
import type { PaintLayer } from '@/types/layer'
import { SEVERITY_WEIGHT } from '@/utils/severity'

/** 病害档案台的一行：病害 + 所属层位 + 构件（含殿宇信息） */
export interface DecayRow {
  decay: Decay
  layer: PaintLayer | null
  element: Element | null
  hallId: string | null
  hallName: string
}

/**
 * 病害 store：维护筛选条件与统计派生值，供档案台、殿宇总览共用。
 */
export const useDecayStore = defineStore('decay', () => {
  const decaysTable = useIdbTable<Decay>((database) => database.decays)
  const layersTable = useIdbTable<PaintLayer>((database) => database.layers, { sortByUpdatedAt: false })
  const elementsTable = useIdbTable<Element>((database) => database.elements, { sortByUpdatedAt: false })

  const filter = ref<DecayFilterState>(createEmptyDecayFilter())
  const selectedIds = reactive<Set<string>>(new Set<string>())

  const decays = computed<Decay[]>(() => decaysTable.rows.value)
  const layers = computed<PaintLayer[]>(() => layersTable.rows.value)
  const elements = computed<Element[]>(() => elementsTable.rows.value)

  /** 展开后的档案行，附带层位、构件与殿宇归属 */
  const rows = computed<DecayRow[]>(() => {
    const layerMap = new Map<string, PaintLayer>()
    layers.value.forEach((layer) => layerMap.set(layer.id, layer))
    const elementMap = new Map<string, Element>()
    elements.value.forEach((element) => elementMap.set(element.id, element))
    return decays.value.map((decay) => {
      const layer = layerMap.get(decay.layerId) ?? null
      const element = layer ? elementMap.get(layer.elementId) ?? null : null
      return {
        decay,
        layer,
        element,
        hallId: element?.hallId ?? null,
        hallName: ''
      }
    })
  })

  /** 按筛选条件过滤后的档案行 */
  const filteredRows = computed<DecayRow[]>(() =>
    rows.value.filter((row) => {
      const { decay, layer, element } = row
      const kw = filter.value.keyword.trim()
      if (kw.length > 0) {
        const haystack = `${decay.type}${decay.severity}${decay.causeGuess}${layer?.patternName ?? ''}${
          layer?.pigment ?? ''
        }${element?.name ?? ''}${element?.position ?? ''}`
        if (!haystack.includes(kw)) return false
      }
      if (filter.value.halls.length > 0 && (!element || !filter.value.halls.includes(element.hallId))) return false
      if (filter.value.elementPositions.length > 0 && (!element || !filter.value.elementPositions.includes(element.position)))
        return false
      if (filter.value.types.length > 0 && !filter.value.types.includes(decay.type)) return false
      if (filter.value.severities.length > 0 && !filter.value.severities.includes(decay.severity)) return false
      if (filter.value.pigments.length > 0 && (!layer || !filter.value.pigments.includes(layer.pigment))) return false
      if (filter.value.onlyUnrepaired && decay.repaired) return false
      return true
    })
  )

  const severityCounts = computed<Record<Severity, number>>(() => {
    const counts: Record<Severity, number> = { 轻度: 0, 中度: 0, 重度: 0 }
    decays.value.forEach((decay) => {
      counts[decay.severity] += 1
    })
    return counts
  })

  const typeCounts = computed<Record<string, number>>(() => {
    const counts: Record<string, number> = {}
    decays.value.forEach((decay) => {
      counts[decay.type] = (counts[decay.type] ?? 0) + 1
    })
    return counts
  })

  const pigmentCounts = computed<Record<string, number>>(() => {
    const layerMap = new Map<string, PaintLayer>()
    layers.value.forEach((layer) => layerMap.set(layer.id, layer))
    const counts: Record<string, number> = {}
    decays.value.forEach((decay) => {
      const pigment = layerMap.get(decay.layerId)?.pigment
      if (!pigment) return
      counts[pigment] = (counts[pigment] ?? 0) + 1
    })
    return counts
  })

  const totalArea = computed(() => decays.value.reduce((sum, decay) => sum + decay.areaCm2, 0))
  const filteredArea = computed(() => filteredRows.value.reduce((sum, row) => sum + row.decay.areaCm2, 0))
  const unrepairedCount = computed(() => decays.value.filter((decay) => !decay.repaired).length)
  const repairedPercent = computed(() =>
    decays.value.length === 0 ? 0 : Math.round(((decays.value.length - unrepairedCount.value) / decays.value.length) * 100)
  )

  /** 按殿宇聚合病害数量，殿宇总览卡片直接消费 */
  const hallAggregate = computed<Record<string, { total: number; unrepaired: number; areaCm2: number }>>(() => {
    const aggregate: Record<string, { total: number; unrepaired: number; areaCm2: number }> = {}
    rows.value.forEach((row) => {
      if (!row.hallId) return
      const bucket = aggregate[row.hallId] ?? { total: 0, unrepaired: 0, areaCm2: 0 }
      bucket.total += 1
      if (!row.decay.repaired) bucket.unrepaired += 1
      bucket.areaCm2 += row.decay.areaCm2
      aggregate[row.hallId] = bucket
    })
    return aggregate
  })

  /** 严重程度加权风险分，用于殿宇排序 */
  const hallRisk = computed<Record<string, number>>(() => {
    const risk: Record<string, number> = {}
    rows.value.forEach((row) => {
      if (!row.hallId) return
      risk[row.hallId] = (risk[row.hallId] ?? 0) + SEVERITY_WEIGHT[row.decay.severity]
    })
    return risk
  })

  const hasFilter = computed(
    () =>
      filter.value.keyword.trim().length > 0 ||
      filter.value.halls.length > 0 ||
      filter.value.elementPositions.length > 0 ||
      filter.value.types.length > 0 ||
      filter.value.severities.length > 0 ||
      filter.value.pigments.length > 0 ||
      filter.value.onlyUnrepaired
  )

  function patchFilter(patch: Partial<DecayFilterState>): void {
    filter.value = { ...filter.value, ...patch }
  }

  function resetFilter(): void {
    filter.value = createEmptyDecayFilter()
  }

  function toggleSelection(id: string): void {
    if (selectedIds.has(id)) selectedIds.delete(id)
    else selectedIds.add(id)
  }

  function setSelection(ids: string[]): void {
    selectedIds.clear()
    ids.forEach((id) => selectedIds.add(id))
  }

  function clearSelection(): void {
    selectedIds.clear()
  }

  async function createDecay(payload: Omit<Decay, 'id' | 'createdAt' | 'updatedAt'>): Promise<Decay> {
    return decaysTable.create(payload, 'dec')
  }

  async function updateDecay(id: string, patch: Partial<Decay>): Promise<void> {
    await decaysTable.update(id, patch)
  }

  async function removeDecay(id: string): Promise<void> {
    await db.transaction('rw', [db.decays, db.repairSteps], async () => {
      await db.repairSteps.where('decayId').equals(id).delete()
      await db.decays.delete(id)
    })
    selectedIds.delete(id)
  }

  /** 批量改严重程度（档案台批量操作） */
  async function bulkSetSeverity(ids: string[], severity: Severity): Promise<number> {
    const now = Date.now()
    await db.decays
      .where('id')
      .anyOf(ids)
      .modify((decay) => {
        decay.severity = severity
        decay.updatedAt = now
      })
    return ids.length
  }

  /** 批量改病害类型 */
  async function bulkSetType(ids: string[], type: DecayType): Promise<number> {
    const now = Date.now()
    await db.decays
      .where('id')
      .anyOf(ids)
      .modify((decay) => {
        decay.type = type
        decay.updatedAt = now
      })
    return ids.length
  }

  /** 标记 / 取消已修复，由修复工序完成态调用 */
  async function setRepaired(id: string, repaired: boolean): Promise<void> {
    const now = Date.now()
    await decaysTable.update(id, { repaired, repairedAt: repaired ? now : null })
  }

  return {
    filter,
    selectedIds,
    decays,
    layers,
    elements,
    rows,
    filteredRows,
    severityCounts,
    typeCounts,
    pigmentCounts,
    totalArea,
    filteredArea,
    unrepairedCount,
    repairedPercent,
    hallAggregate,
    hallRisk,
    hasFilter,
    patchFilter,
    resetFilter,
    toggleSelection,
    setSelection,
    clearSelection,
    createDecay,
    updateDecay,
    removeDecay,
    bulkSetSeverity,
    bulkSetType,
    setRepaired
  }
})
