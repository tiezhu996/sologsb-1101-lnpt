import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { db, readUiPrefs, writeUiPrefs } from '@/utils/db'
import { useIdbTable } from '@/hooks/useIdbTable'
import { useDecayStore } from '@/stores/decayStore'
import { useHallStore } from '@/stores/hallStore'
import type { Decay } from '@/types/decay'
import type { Element } from '@/types/element'
import type { Hall } from '@/types/hall'
import type { PaintLayer } from '@/types/layer'
import type { RepairGroup, RepairState, RepairStep, RepairStepName } from '@/types/repair'

/**
 * 工序 store：维护工序顺序与完成态，并负责把完成结果回写病害。
 */
export const useRepairStore = defineStore('repair', () => {
  const repairTable = useIdbTable<RepairStep>((database) => database.repairSteps)
  const decayStore = useDecayStore()
  const hallStore = useHallStore()

  const sortMode = ref<'manual' | 'severity'>(readUiPrefs().repairSort)
  const activeDecayId = ref<string | null>(null)

  const steps = computed<RepairStep[]>(() => repairTable.rows.value)

  /** 按病害归组的工序时间线 */
  const groups = computed<RepairGroup[]>(() => {
    const layerMap = new Map<string, PaintLayer>()
    decayStore.layers.forEach((layer) => layerMap.set(layer.id, layer))
    const elementMap = new Map<string, Element>()
    decayStore.elements.forEach((element) => elementMap.set(element.id, element))
    const decayMap = new Map<string, Decay>()
    decayStore.decays.forEach((decay) => decayMap.set(decay.id, decay))

    const grouped = new Map<string, RepairStep[]>()
    steps.value.forEach((step) => {
      const list = grouped.get(step.decayId) ?? []
      list.push(step)
      grouped.set(step.decayId, list)
    })

    const result: RepairGroup[] = []
    grouped.forEach((list, decayId) => {
      const sorted = [...list].sort((a, b) => a.seq - b.seq)
      const decay = decayMap.get(decayId) ?? null
      const layer = decay ? layerMap.get(decay.layerId) ?? null : null
      const element = layer ? elementMap.get(layer.elementId) ?? null : null
      const doneCount = sorted.filter((step) => step.state === '已完成').length
      result.push({
        decayId,
        decay,
        layer,
        element,
        hall: null,
        steps: sorted,
        doneCount,
        totalCount: sorted.length,
        percent: sorted.length === 0 ? 0 : Math.round((doneCount / sorted.length) * 100)
      })
    })
    return result.sort((a, b) => {
      if (sortMode.value === 'severity') {
        const weight = (group: RepairGroup): number => {
          const severity = group.decay?.severity
          if (severity === '重度') return 3
          if (severity === '中度') return 2
          return 1
        }
        const diff = weight(b) - weight(a)
        if (diff !== 0) return diff
      }
      return a.decayId.localeCompare(b.decayId)
    })
  })

  const totalSteps = computed(() => steps.value.length)
  const doneSteps = computed(() => steps.value.filter((step) => step.state === '已完成').length)
  const runningSteps = computed(() => steps.value.filter((step) => step.state === '进行中').length)
  const overallPercent = computed(() =>
    totalSteps.value === 0 ? 0 : Math.round((doneSteps.value / totalSteps.value) * 100)
  )

  /** 待安排工序的病害（尚无任何工序；已合并归档的旧记录不计） */
  const pendingDecays = computed<Decay[]>(() =>
    decayStore.activeDecays.filter((decay) => !steps.value.some((step) => step.decayId === decay.id))
  )

  function groupOf(decayId: string): RepairGroup | undefined {
    return groups.value.find((group) => group.decayId === decayId)
  }

  function decayById(id: string): Decay | null {
    return decayStore.decays.find((decay) => decay.id === id) ?? null
  }

  function setSortMode(mode: 'manual' | 'severity'): void {
    sortMode.value = mode
    writeUiPrefs({ ...readUiPrefs(), repairSort: mode })
  }

  function setActiveDecay(id: string | null): void {
    activeDecayId.value = id
  }

  function nextSeq(decayId: string): number {
    const list = steps.value.filter((step) => step.decayId === decayId)
    return list.length === 0 ? 1 : Math.max(...list.map((step) => step.seq)) + 1
  }

  async function addStep(payload: {
    decayId: string
    name: RepairStepName
    material: string
    operator: string
    state?: RepairState
    seq?: number
  }): Promise<RepairStep> {
    const step = await repairTable.create(
      {
        decayId: payload.decayId,
        seq: payload.seq ?? nextSeq(payload.decayId),
        name: payload.name,
        material: payload.material,
        operator: payload.operator,
        state: payload.state ?? '未开始'
      },
      'step'
    )
    await syncDecayState(payload.decayId)
    return step
  }

  async function updateStep(id: string, patch: Partial<RepairStep>): Promise<void> {
    await repairTable.update(id, patch)
    const step = steps.value.find((item) => item.id === id)
    if (step) await syncDecayState(step.decayId)
  }

  async function removeStep(id: string): Promise<void> {
    const step = steps.value.find((item) => item.id === id)
    if (!step) return
    await repairTable.remove(id)
    await normalizeSeq(step.decayId)
    await syncDecayState(step.decayId)
  }

  async function removeGroup(decayId: string): Promise<void> {
    const ids = steps.value.filter((step) => step.decayId === decayId).map((step) => step.id)
    await repairTable.bulkRemove(ids)
    await syncDecayState(decayId)
  }

  /** 拖拽后按新顺序批量回写 seq */
  async function reorder(decayId: string, orderedIds: string[]): Promise<void> {
    const now = Date.now()
    await db.transaction('rw', db.repairSteps, async () => {
      for (let index = 0; index < orderedIds.length; index += 1) {
        await db.repairSteps.update(orderedIds[index], { seq: index + 1, updatedAt: now })
      }
      const rest = steps.value
        .filter((step) => step.decayId === decayId && !orderedIds.includes(step.id))
        .sort((a, b) => a.seq - b.seq)
      for (let index = 0; index < rest.length; index += 1) {
        await db.repairSteps.update(rest[index].id, {
          seq: orderedIds.length + index + 1,
          updatedAt: now
        })
      }
    })
  }

  async function setStepState(id: string, state: RepairState): Promise<void> {
    const step = steps.value.find((item) => item.id === id)
    if (!step) return
    await repairTable.update(id, { state })
    await syncDecayState(step.decayId)
  }

  /** 完成即回写病害为已修复：同病害全部工序完成后置 repaired = true */
  async function syncDecayState(decayId: string): Promise<void> {
    const list = await db.repairSteps.where('decayId').equals(decayId).toArray()
    if (list.length === 0) return
    const allDone = list.every((step) => step.state === '已完成')
    await decayStore.setRepaired(decayId, allDone)
  }

  async function normalizeSeq(decayId: string): Promise<void> {
    const list = await db.repairSteps.where('decayId').equals(decayId).toArray()
    const sorted = list.sort((a, b) => a.seq - b.seq)
    const now = Date.now()
    await db.transaction('rw', db.repairSteps, async () => {
      for (let index = 0; index < sorted.length; index += 1) {
        if (sorted[index].seq !== index + 1) {
          await db.repairSteps.update(sorted[index].id, { seq: index + 1, updatedAt: now })
        }
      }
    })
  }

  /** 一键为某殿宇下所有未修复病害补齐标准工序链 */
  async function scaffoldForHall(hallId: string, template: RepairStepName[]): Promise<number> {
    const targets = decayStore.rows.filter(
      (row) => row.hallId === hallId && !steps.value.some((step) => step.decayId === row.decay.id)
    )
    const now = Date.now()
    const records: RepairStep[] = []
    targets.forEach((row) => {
      template.forEach((name, index) => {
        records.push({
          id: `${row.decay.id}_${index}_${Math.random().toString(36).slice(2, 7)}`,
          decayId: row.decay.id,
          seq: index + 1,
          name,
          material: '',
          operator: '',
          state: '未开始',
          createdAt: now,
          updatedAt: now
        })
      })
    })
    if (records.length > 0) await db.repairSteps.bulkPut(records)
    return records.length
  }

  /** 工序分组所属殿宇，用于时间线标题回显 */
  function hallOfGroup(group: RepairGroup): Hall | null {
    const hallId = group.element?.hallId
    if (!hallId) return null
    return hallStore.hallById(hallId) ?? null
  }

  return {
    steps,
    groups,
    sortMode,
    activeDecayId,
    totalSteps,
    doneSteps,
    runningSteps,
    overallPercent,
    pendingDecays,
    groupOf,
    decayById,
    hallOfGroup,
    setSortMode,
    setActiveDecay,
    nextSeq,
    addStep,
    updateStep,
    removeStep,
    removeGroup,
    reorder,
    setStepState,
    syncDecayState,
    normalizeSeq,
    scaffoldForHall
  }
})
