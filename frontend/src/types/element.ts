/** 构件：殿宇内的具体木构件或其表面部位 */
export type ElementPosition = '檐下' | '室内' | '梁枋' | '斗拱' | '天花'
export type ElementStatus = '完好' | '观察' | '待修'

export interface Element {
  id: string
  hallId: string
  position: ElementPosition
  name: string
  /** 彩画层数，与 PaintLayer 记录数保持一致的期望值 */
  layerCount: number
  /** 地仗做法：一麻五灰 / 单披灰 / 血料腻子等 */
  baseLayer: string
  status: ElementStatus
  createdAt: number
  updatedAt: number
}

export const ELEMENT_POSITIONS: ElementPosition[] = ['檐下', '室内', '梁枋', '斗拱', '天花']
export const ELEMENT_STATUSES: ElementStatus[] = ['完好', '观察', '待修']
