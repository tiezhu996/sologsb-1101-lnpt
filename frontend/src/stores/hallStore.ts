import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { db, readUiPrefs, writeUiPrefs } from '@/utils/db'
import { useIdbTable } from '@/hooks/useIdbTable'
import type { Element } from '@/types/element'
import type { Hall, HallStat } from '@/types/hall'
import type { PaintLayer } from '@/types/layer'
import type { Decay } from '@/types/decay'

/**
 * 殿宇 store：维护殿宇列表、当前选中殿宇，并派生出各殿宇的病害统计。
 */
export const useHallStore = defineStore('hall', () => {
  const hallsTable = useIdbTable<Hall>((database) => database.halls)
  const elementsTable = useIdbTable<Element>((database) => database.elements, { sortByUpdatedAt: false })
  const layersTable = useIdbTable<PaintLayer>((database) => database.layers, { sortByUpdatedAt: false })
  const decaysTable = useIdbTable<Decay>((database) => database.decays)

  const prefs = readUiPrefs()
  const currentHallId = ref<string | null>(prefs.lastHallId)
  const keyword = ref('')
  const eraFilter = ref<string[]>([])
  const structureFilter = ref<string[]>([])

  watch(currentHallId, (value) => {
    writeUiPrefs({ ...readUiPrefs(), lastHallId: value })
  })

  const halls = computed<Hall[]>(() => hallsTable.rows.value)
  const elements = computed<Element[]>(() => elementsTable.rows.value)
  const layers = computed<PaintLayer[]>(() => layersTable.rows.value)
  const decays = computed<Decay[]>(() => decaysTable.rows.value)
  const loading = computed(() => hallsTable.loading.value)

  /** 殿宇表是否已完成首次载入：直链场景用于区分「殿宇不存在」与「尚未读取」 */
  const hallsReady = computed(() => hallsTable.ready.value)

  const currentHall = computed<Hall | null>(
    () => halls.value.find((hall) => hall.id === currentHallId.value) ?? null
  )

  const eraOptions = computed<string[]>(() =>
    Array.from(new Set(halls.value.map((hall) => hall.era).filter((era) => era.length > 0))).sort()
  )

  /** 殿宇 id → 病害记录列表 */
  const decaysByHall = computed<Record<string, Decay[]>>(() => {
    const layerToElement = new Map<string, string>()
    layers.value.forEach((layer) => layerToElement.set(layer.id, layer.elementId))
    const elementToHall = new Map<string, string>()
    elements.value.forEach((element) => elementToHall.set(element.id, element.hallId))

    const grouped: Record<string, Decay[]> = {}
    decays.value.forEach((decay) => {
      const elementId = layerToElement.get(decay.layerId)
      const hallId = elementId ? elementToHall.get(elementId) : undefined
      if (!hallId) return
      if (!grouped[hallId]) grouped[hallId] = []
      grouped[hallId].push(decay)
    })
    return grouped
  })

  const stats = computed<HallStat[]>(() =>
    halls.value.map((hall) => {
      const list = decaysByHall.value[hall.id] ?? []
      const hallElements = elements.value.filter((element) => element.hallId === hall.id)
      const elementIds = new Set(hallElements.map((element) => element.id))
      const layerCount = layers.value.filter((layer) => elementIds.has(layer.elementId)).length
      const repaired = list.filter((decay) => decay.repaired).length
      return {
        hallId: hall.id,
        decayCount: list.length,
        unrepairedCount: list.length - repaired,
        elementCount: hallElements.length,
        layerCount,
        repairedPercent: list.length === 0 ? 0 : Math.round((repaired / list.length) * 100)
      }
    })
  )

  const statMap = computed<Record<string, HallStat>>(() => {
    const map: Record<string, HallStat> = {}
    stats.value.forEach((stat) => {
      map[stat.hallId] = stat
    })
    return map
  })

  /** 殿宇总览的筛选结果（关键字 + 年代 + 结构类型） */
  const filteredHalls = computed<Hall[]>(() =>
    halls.value.filter((hall) => {
      const kw = keyword.value.trim()
      if (kw.length > 0) {
        const haystack = `${hall.name}${hall.era}${hall.roofType}${hall.structureType}`
        if (!haystack.includes(kw)) return false
      }
      if (eraFilter.value.length > 0 && !eraFilter.value.includes(hall.era)) return false
      if (structureFilter.value.length > 0 && !structureFilter.value.includes(hall.structureType)) return false
      return true
    })
  )

  const totalDecay = computed(() => decays.value.length)
  const totalUnrepaired = computed(() => decays.value.filter((decay) => !decay.repaired).length)
  const totalArea = computed(() => decays.value.reduce((sum, decay) => sum + decay.areaCm2, 0))

  function setCurrentHall(id: string | null): void {
    currentHallId.value = id
  }

  async function createElement(
    payload: Omit<Element, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Element> {
    return elementsTable.create(payload, 'elem')
  }

  async function updateElement(id: string, patch: Partial<Element>): Promise<void> {
    await elementsTable.update(id, patch)
  }

  async function createLayer(
    payload: Omit<PaintLayer, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<PaintLayer> {
    const layer = await layersTable.create(payload, 'lay')
    await syncLayerCount(payload.elementId)
    return layer
  }

  async function updateLayer(id: string, patch: Partial<PaintLayer>): Promise<void> {
    await layersTable.update(id, patch)
    const layer = layers.value.find((item) => item.id === id)
    if (layer) await syncLayerCount(layer.elementId)
  }

  async function removeLayer(id: string): Promise<void> {
    const layer = layers.value.find((item) => item.id === id)
    const decayIds = decays.value.filter((decay) => decay.layerId === id).map((decay) => decay.id)
    await db.transaction('rw', [db.layers, db.decays, db.repairSteps], async () => {
      await db.repairSteps.where('decayId').anyOf(decayIds).delete()
      await db.decays.bulkDelete(decayIds)
      await db.layers.delete(id)
    })
    if (layer) await syncLayerCount(layer.elementId)
  }

  /** 级联删除构件及其层位、病害、工序 */
  async function removeElement(id: string): Promise<void> {
    const layerIds = layersOfElement(id).map((layer) => layer.id)
    const decayIds = decays.value.filter((decay) => layerIds.includes(decay.layerId)).map((decay) => decay.id)
    await db.transaction(
      'rw',
      [db.elements, db.layers, db.decays, db.repairSteps],
      async () => {
        await db.repairSteps.where('decayId').anyOf(decayIds).delete()
        await db.decays.bulkDelete(decayIds)
        await db.layers.bulkDelete(layerIds)
        await db.elements.delete(id)
      }
    )
  }

  /** 层位数量变化后回写构件 layerCount，保证卡片回显一致 */
  async function syncLayerCount(elementId: string): Promise<void> {
    const count = layers.value.filter((layer) => layer.elementId === elementId).length
    const element = elements.value.find((item) => item.id === elementId)
    if (element && element.layerCount !== count) {
      await elementsTable.update(elementId, { layerCount: count } as Partial<Element>)
    }
  }

  function resetFilters(): void {
    keyword.value = ''
    eraFilter.value = []
    structureFilter.value = []
  }

  async function createHall(payload: Omit<Hall, 'id' | 'createdAt' | 'updatedAt'>): Promise<Hall> {
    const hall = await hallsTable.create(payload, 'hall')
    currentHallId.value = hall.id
    return hall
  }

  async function updateHall(id: string, patch: Partial<Hall>): Promise<void> {
    await hallsTable.update(id, patch)
  }

  /** 级联删除：殿宇 → 构件 → 层位 → 病害 → 工序 */
  async function removeHall(id: string): Promise<void> {
    const elementIds = elements.value.filter((element) => element.hallId === id).map((element) => element.id)
    const layerIds = layers.value
      .filter((layer) => elementIds.includes(layer.elementId))
      .map((layer) => layer.id)
    const decayIds = decays.value.filter((decay) => layerIds.includes(decay.layerId)).map((decay) => decay.id)
    await db.transaction(
      'rw',
      [db.halls, db.elements, db.layers, db.decays, db.repairSteps],
      async () => {
        await db.repairSteps.where('decayId').anyOf(decayIds).delete()
        await db.decays.bulkDelete(decayIds)
        await db.layers.bulkDelete(layerIds)
        await db.elements.bulkDelete(elementIds)
        await db.halls.delete(id)
      }
    )
    if (currentHallId.value === id) currentHallId.value = null
  }

  function elementById(id: string): Element | undefined {
    return elements.value.find((element) => element.id === id)
  }

  function hallById(id: string): Hall | undefined {
    return halls.value.find((hall) => hall.id === id)
  }

  function layersOfElement(elementId: string): PaintLayer[] {
    return layers.value
      .filter((layer) => layer.elementId === elementId)
      .sort((a, b) => a.level - b.level)
  }

  function decaysOfLayer(layerId: string): Decay[] {
    return decays.value.filter((decay) => decay.layerId === layerId)
  }

  function elementDecayCount(elementId: string): number {
    const layerIds = layersOfElement(elementId).map((layer) => layer.id)
    return decays.value.filter((decay) => layerIds.includes(decay.layerId)).length
  }

  return {
    halls,
    elements,
    layers,
    decays,
    loading,
    hallsReady,
    currentHallId,
    currentHall,
    keyword,
    eraFilter,
    structureFilter,
    eraOptions,
    stats,
    statMap,
    decaysByHall,
    filteredHalls,
    totalDecay,
    totalUnrepaired,
    totalArea,
    setCurrentHall,
    resetFilters,
    createHall,
    updateHall,
    removeHall,
    createElement,
    updateElement,
    removeElement,
    createLayer,
    updateLayer,
    removeLayer,
    syncLayerCount,
    elementById,
    hallById,
    layersOfElement,
    decaysOfLayer,
    elementDecayCount
  }
})
