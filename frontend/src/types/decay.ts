/** 病害记录：某彩画层位上的一处病害现状 */
export type DecayType = '起甲' | '剥落' | '空鼓' | '粉化' | '龟裂'
export type Severity = '轻度' | '中度' | '重度'

export interface Decay {
  id: string
  layerId: string
  type: DecayType
  severity: Severity
  /** 病害面积（平方厘米） */
  areaCm2: number
  /** 病害成因初判 */
  causeGuess: string
  /** 由修复工序完成后回写 */
  repaired: boolean
  repairedAt: number | null
  /**
   * 合并去向：非空表示该记录已被合并入另一条记录（档案留痕，不再在册）。
   * 在册记录该字段为 null；被合并的旧记录保留在本地但不参与筛选与统计。
   */
  mergedInto: string | null
  mergedAt: number | null
  createdAt: number
  updatedAt: number
}

export const DECAY_TYPES: DecayType[] = ['起甲', '剥落', '空鼓', '粉化', '龟裂']
export const SEVERITIES: Severity[] = ['轻度', '中度', '重度']

/** 病害档案台的组合筛选条件 */
export interface DecayFilterState {
  keyword: string
  halls: string[]
  elementPositions: string[]
  types: DecayType[]
  severities: Severity[]
  pigments: string[]
  onlyUnrepaired: boolean
}

export function createEmptyDecayFilter(): DecayFilterState {
  return {
    keyword: '',
    halls: [],
    elementPositions: [],
    types: [],
    severities: [],
    pigments: [],
    onlyUnrepaired: false
  }
}
