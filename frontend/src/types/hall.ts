/** 殿宇：大木/小式结构、屋顶形制的单体文物建筑 */
export type StructureType = '大木' | '小式'
export type RoofType = '庑殿' | '歇山' | '悬山'

export interface Hall {
  id: string
  name: string
  /** 始建年代，如「明嘉靖」 */
  era: string
  structureType: StructureType
  roofType: RoofType
  createdAt: number
  updatedAt: number
}

export const STRUCTURE_TYPES: StructureType[] = ['大木', '小式']
export const ROOF_TYPES: RoofType[] = ['庑殿', '歇山', '悬山']

/** 殿宇列表卡片回显用的统计聚合值 */
export interface HallStat {
  hallId: string
  decayCount: number
  unrepairedCount: number
  elementCount: number
  layerCount: number
  /** 已修复病害占比，0-100 的整数 */
  repairedPercent: number
}
