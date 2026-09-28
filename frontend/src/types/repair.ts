/** 修复工序：针对某条病害记录的施工步骤 */
export type RepairStepName = '除尘' | '回贴' | '灌浆' | '补绘' | '封护'
export type RepairState = '未开始' | '进行中' | '已完成'

export interface RepairStep {
  id: string
  decayId: string
  /** 工序先后序号，从 1 开始 */
  seq: number
  name: RepairStepName
  material: string
  operator: string
  state: RepairState
  createdAt: number
  updatedAt: number
}

export const REPAIR_STEP_NAMES: RepairStepName[] = ['除尘', '回贴', '灌浆', '补绘', '封护']
export const REPAIR_STATES: RepairState[] = ['未开始', '进行中', '已完成']

/** 工序按病害归组后的时间线节点 */
export interface RepairGroup {
  decayId: string
  decay: import('./decay').Decay | null
  layer: import('./layer').PaintLayer | null
  element: import('./element').Element | null
  hall: import('./hall').Hall | null
  steps: RepairStep[]
  doneCount: number
  totalCount: number
  percent: number
}
