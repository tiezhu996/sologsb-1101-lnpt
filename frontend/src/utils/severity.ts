import type { Severity } from '@/types/decay'

/** 严重程度排序权重：重度最前 */
export const SEVERITY_WEIGHT: Record<Severity, number> = {
  重度: 30,
  中度: 20,
  轻度: 10
}

/** 严重程度配色映射，用于标签底色与统计图 */
export const SEVERITY_COLOR: Record<Severity, string> = {
  重度: '#c0392b',
  中度: '#d68910',
  轻度: '#1e8449'
}

/** 严重程度对应的浅色底（标签背景） */
export const SEVERITY_BG: Record<Severity, string> = {
  重度: '#fdecea',
  中度: '#fdf3e3',
  轻度: '#eaf6ee'
}

/** 严重程度图标（Element Plus 图标组件名） */
export const SEVERITY_ICON: Record<Severity, string> = {
  重度: 'CircleCloseFilled',
  中度: 'WarningFilled',
  轻度: 'SuccessFilled'
}

/** 面积单位换算基数：1 平方分米 = 100 平方厘米 */
const CM2_PER_DM2 = 100
/** 1 平方米 = 10000 平方厘米 */
const CM2_PER_M2 = 10000

/** 按面积自动选择可读单位 */
export function formatArea(areaCm2: number): string {
  if (!Number.isFinite(areaCm2) || areaCm2 <= 0) return '0 cm²'
  if (areaCm2 >= CM2_PER_M2) return `${(areaCm2 / CM2_PER_M2).toFixed(2)} m²`
  if (areaCm2 >= CM2_PER_DM2) return `${(areaCm2 / CM2_PER_DM2).toFixed(2)} dm²`
  return `${round(areaCm2, 1)} cm²`
}

/** 平方厘米 → 平方分米 */
export function cm2ToDm2(areaCm2: number): number {
  return round(areaCm2 / CM2_PER_DM2, 3)
}

/** 平方分米 → 平方厘米 */
export function dm2ToCm2(areaDm2: number): number {
  return round(areaDm2 * CM2_PER_DM2, 2)
}

/** 平方厘米 → 平方米 */
export function cm2ToM2(areaCm2: number): number {
  return round(areaCm2 / CM2_PER_M2, 5)
}

/** 平方米 → 平方厘米 */
export function m2ToCm2(areaM2: number): number {
  return round(areaM2 * CM2_PER_M2, 2)
}

export function round(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

/** 排序比较器：重度 > 中度 > 轻度，同级按面积降序 */
export function compareSeverity(a: Severity, b: Severity, areaA = 0, areaB = 0): number {
  const diff = SEVERITY_WEIGHT[b] - SEVERITY_WEIGHT[a]
  if (diff !== 0) return diff
  return areaB - areaA
}

/** 严重程度在 轻/中/重 中的档位比例，用于进度条着色 */
export function severityRatio(severity: Severity): number {
  return SEVERITY_WEIGHT[severity] / SEVERITY_WEIGHT['重度']
}
