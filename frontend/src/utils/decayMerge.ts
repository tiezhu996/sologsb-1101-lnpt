import type { Decay, DecayType, Severity } from '@/types/decay'
import type { RepairStep } from '@/types/repair'
import { SEVERITY_WEIGHT, round } from '@/utils/severity'

/** 成因初判的占位文本：合并去重时不参与保留 */
const CAUSE_PLACEHOLDER = '待现场复核'

/** 判断病害是否仍在册（未被合并归档）。旧备份缺字段时 undefined 也视为在册 */
export function isActiveDecay(decay: Decay): boolean {
  return decay.mergedInto == null
}

/** 合并预览：档案台确认弹窗与 store 实际写入共用同一份规则 */
export interface MergePlan {
  layerId: string
  type: DecayType
  severity: Severity
  areaCm2: number
  causeGuess: string
  /** 参与合并的源记录，按登记时间从早到晚排序 */
  sources: Decay[]
  /** 工序接续方案：工序本体不变，仅按拼接后的先后重新编号 seq */
  steps: Array<{ step: RepairStep; seq: number }>
}

export type MergePlanResult = { ok: true; plan: MergePlan } | { ok: false; message: string }

/**
 * 成因说明去重保留：按常见分隔符拆成短句，去空白、去占位文本、
 * 按源记录登记顺序去重，再以「；」拼接；全部为空则回退占位文本。
 */
export function mergeCauses(causes: string[]): string {
  const seen = new Set<string>()
  const kept: string[] = []
  causes.forEach((cause) => {
    cause
      .split(/[；;、，,。.|\n\r/]+/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0 && part !== CAUSE_PLACEHOLDER)
      .forEach((part) => {
        if (!seen.has(part)) {
          seen.add(part)
          kept.push(part)
        }
      })
  })
  return kept.length > 0 ? kept.join('；') : CAUSE_PLACEHOLDER
}

/**
 * 校验并生成合并方案：
 * - 两条以上记录；
 * - 同一彩画层位、同一病害类型；
 * - 全部未修复且未被合并归档。
 * 面积求和；严重程度取最高；成因去重保留；工序按源记录登记顺序整体接续并重排 seq。
 */
export function buildMergePlan(
  selected: Decay[],
  stepsOf: (decayId: string) => RepairStep[]
): MergePlanResult {
  if (selected.length < 2) {
    return { ok: false, message: '请至少勾选两条病害记录再合并' }
  }
  if (selected.some((decay) => !isActiveDecay(decay))) {
    return { ok: false, message: '勾选记录中包含已被合并归档的旧记录，无法再次合并' }
  }
  const layerId = selected[0].layerId
  if (selected.some((decay) => decay.layerId !== layerId)) {
    return { ok: false, message: '仅可合并同一彩画层位上的病害记录' }
  }
  const type = selected[0].type
  if (selected.some((decay) => decay.type !== type)) {
    return { ok: false, message: `仅可合并相同病害类型的记录（需同为「${type}」）` }
  }
  if (selected.some((decay) => decay.repaired)) {
    return { ok: false, message: '已修复的病害记录不能参与合并' }
  }

  const sources = [...selected].sort(
    (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)
  )
  const areaCm2 = round(
    sources.reduce((sum, decay) => sum + decay.areaCm2, 0),
    1
  )
  const severity = sources.reduce<Severity>(
    (highest, decay) => (SEVERITY_WEIGHT[decay.severity] > SEVERITY_WEIGHT[highest] ? decay.severity : highest),
    '轻度'
  )
  const causeGuess = mergeCauses(sources.map((decay) => decay.causeGuess))

  const steps: Array<{ step: RepairStep; seq: number }> = []
  sources.forEach((decay) => {
    stepsOf(decay.id)
      .slice()
      .sort((a, b) => a.seq - b.seq || a.createdAt - b.createdAt)
      .forEach((step) => steps.push({ step, seq: steps.length + 1 }))
  })

  return {
    ok: true,
    plan: { layerId, type, severity, areaCm2, causeGuess, sources, steps }
  }
}
