<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Edit, MagicStick, Plus, Sort } from '@element-plus/icons-vue'
import EmptyPanel from '@/components/common/EmptyPanel.vue'
import SeverityTag from '@/components/common/SeverityTag.vue'
import StatBadge from '@/components/common/StatBadge.vue'
import { useDecayStore } from '@/stores/decayStore'
import { useHallStore } from '@/stores/hallStore'
import { useRepairStore } from '@/stores/repairStore'
import type { RepairGroup } from '@/types/repair'
import { REPAIR_STATES, REPAIR_STEP_NAMES, type RepairState, type RepairStep, type RepairStepName } from '@/types/repair'
import { formatArea } from '@/utils/severity'

const hallStore = useHallStore()
const decayStore = useDecayStore()
const repairStore = useRepairStore()

const hallFilter = ref<string>('')
const stateFilter = ref<RepairState | ''>('')
const draggingId = ref<string | null>(null)
const dragOverId = ref<string | null>(null)

/** 工序材料与责任人的编辑草稿：工序 id → 字段值，失焦或回车时写回 IndexedDB */
const stepDrafts = reactive<Record<string, { material: string; operator: string }>>({})

function syncDrafts(list: RepairStep[]): void {
  const alive = new Set(list.map((step) => step.id))
  Object.keys(stepDrafts).forEach((id) => {
    if (!alive.has(id)) delete stepDrafts[id]
  })
  list.forEach((step) => {
    if (!stepDrafts[step.id]) {
      stepDrafts[step.id] = { material: step.material, operator: step.operator }
    }
  })
}

watch(() => repairStore.steps, syncDrafts, { immediate: true, deep: false })

function commitDraft(step: RepairStep, field: 'material' | 'operator'): void {
  const draft = stepDrafts[step.id]
  if (!draft) return
  const value = draft[field].trim()
  if (value === step[field]) return
  void repairStore.updateStep(step.id, { [field]: value } as Partial<RepairStep>)
}

const stepDialogVisible = ref(false)
const editingStepId = ref<string | null>(null)
const stepForm = reactive<{
  decayId: string
  name: RepairStepName
  material: string
  operator: string
  state: RepairState
}>({
  decayId: '',
  name: '除尘',
  material: '',
  operator: '',
  state: '未开始'
})

const scratchDialogVisible = ref(false)
const scratchHallId = ref<string>('')
const scratchTemplate = ref<RepairStepName[]>(['除尘', '回贴', '灌浆', '补绘', '封护'])

const hallOptions = computed(() =>
  hallStore.halls.map((hall) => ({ label: `${hall.name}（${hall.era}）`, value: hall.id }))
)

const groups = computed<RepairGroup[]>(() =>
  repairStore.groups.filter((group) => {
    if (hallFilter.value && group.element?.hallId !== hallFilter.value) return false
    if (stateFilter.value && !group.steps.some((step) => step.state === stateFilter.value)) return false
    return true
  })
)

const visibleStepCount = computed(() => groups.value.reduce((sum, group) => sum + group.steps.length, 0))

const visibleDoneCount = computed(() => groups.value.reduce((sum, group) => sum + group.doneCount, 0))

const pendingDecays = computed(() =>
  repairStore.pendingDecays.filter((decay) => {
    if (!hallFilter.value) return true
    const layer = decayStore.layers.find((item) => item.id === decay.layerId)
    const element = layer ? decayStore.elements.find((item) => item.id === layer.elementId) : undefined
    return element?.hallId === hallFilter.value
  })
)

watch(
  () => repairStore.activeDecayId,
  async (id) => {
    if (!id) return
    if (!hallFilter.value) {
      const layer = decayStore.layers.find((item) => item.id === repairStore.decayById(id)?.layerId)
      const element = layer ? decayStore.elements.find((item) => item.id === layer.elementId) : undefined
      if (element) hallFilter.value = element.hallId
    }
    await nextTick()
    const anchor = document.getElementById(`group_${id}`)
    anchor?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
)

function groupTitle(group: RepairGroup): string {
  const element = group.element
  const hall = repairStore.hallOfGroup(group)
  return `${hall?.name ?? '未知殿宇'} · ${element?.name ?? '构件已删除'} · ${group.decay?.type ?? '病害已删除'}`
}

function groupSubtitle(group: RepairGroup): string {
  const layer = group.layer
  const decay = group.decay
  if (!layer) return '层位已删除'
  const level = `第 ${layer.level} 层 ${layer.patternName}/${layer.pigment}`
  if (!decay) return level
  return `${level} · 病害 ${decay.type} · ${formatArea(decay.areaCm2)}`
}

function openStepDialog(decayId: string, step?: RepairStep): void {
  stepForm.decayId = decayId
  if (step) {
    editingStepId.value = step.id
    stepForm.name = step.name
    stepForm.material = step.material
    stepForm.operator = step.operator
    stepForm.state = step.state
  } else {
    editingStepId.value = null
    stepForm.name = '除尘'
    stepForm.material = ''
    stepForm.operator = ''
    stepForm.state = '未开始'
  }
  stepDialogVisible.value = true
}

async function submitStep(): Promise<void> {
  if (!stepForm.decayId) return
  if (editingStepId.value) {
    await repairStore.updateStep(editingStepId.value, {
      name: stepForm.name,
      material: stepForm.material.trim(),
      operator: stepForm.operator.trim(),
      state: stepForm.state
    })
    ElMessage.success('工序已更新')
  } else {
    await repairStore.addStep({
      decayId: stepForm.decayId,
      name: stepForm.name,
      material: stepForm.material.trim(),
      operator: stepForm.operator.trim(),
      state: stepForm.state
    })
    ElMessage.success('已追加修复工序')
  }
  stepDialogVisible.value = false
}

async function removeStep(step: RepairStep): Promise<void> {
  const confirmed = await ElMessageBox.confirm(`删除工序「${step.name}」？`, '删除确认', { type: 'warning' }).catch(
    () => false
  )
  if (!confirmed) return
  await repairStore.removeStep(step.id)
  ElMessage.success('工序已删除')
}

async function removeGroup(group: RepairGroup): Promise<void> {
  const confirmed = await ElMessageBox.confirm(
    `清空「${groupTitle(group)}」的全部 ${group.steps.length} 道工序？`,
    '删除确认',
    { type: 'warning' }
  ).catch(() => false)
  if (!confirmed) return
  await repairStore.removeGroup(group.decayId)
  ElMessage.success('该病害的工序已清空')
}

async function changeState(step: RepairStep, state: RepairState): Promise<void> {
  await repairStore.setStepState(step.id, state)
  const group = repairStore.groupOf(step.decayId)
  if (state === '已完成' && group && group.doneCount === group.totalCount) {
    ElMessage.success('该病害全部工序完成，病害已回写为「已修复」')
  } else {
    ElMessage.success(`工序状态已改为「${state}」`)
  }
}

function onDragStart(step: RepairStep): void {
  draggingId.value = step.id
}

function onDragOver(step: RepairStep, event: DragEvent): void {
  event.preventDefault()
  dragOverId.value = step.id
}

async function onDrop(group: RepairGroup, target: RepairStep): Promise<void> {
  const sourceId = draggingId.value
  draggingId.value = null
  dragOverId.value = null
  if (!sourceId || sourceId === target.id) return
  const ordered = group.steps.map((step) => step.id).filter((id) => id !== sourceId)
  const targetIndex = ordered.indexOf(target.id)
  ordered.splice(targetIndex, 0, sourceId)
  await repairStore.reorder(group.decayId, ordered)
  ElMessage.success('工序顺序已调整')
}

async function openScratch(): Promise<void> {
  scratchHallId.value = hallFilter.value || hallStore.halls[0]?.id || ''
  scratchDialogVisible.value = true
}

async function submitScratch(): Promise<void> {
  if (!scratchHallId.value) {
    ElMessage.warning('请选择殿宇')
    return
  }
  if (scratchTemplate.value.length === 0) {
    ElMessage.warning('请至少选择一道工序')
    return
  }
  const count = await repairStore.scaffoldForHall(scratchHallId.value, scratchTemplate.value)
  scratchDialogVisible.value = false
  if (count === 0) {
    ElMessage.info('该殿宇下没有待编排的病害（可能已存在工序）')
  } else {
    ElMessage.success(`已为待编排病害生成 ${count} 道工序，可逐条拖拽排序`)
  }
}

function handleEmptyAction(): void {
  const first = pendingDecays.value[0]
  if (first) openStepDialog(first.id)
}

const stepNameOptions = REPAIR_STEP_NAMES
const stateOptions = REPAIR_STATES
</script>

<template>
  <div>
    <div class="page-title">
      <div>
        <h2>修复工序时间线</h2>
        <p>
          共 {{ repairStore.totalSteps }} 道工序，已完成 {{ repairStore.doneSteps }} 道，进行中
          {{ repairStore.runningSteps }} 道；当前筛选 {{ groups.length }} 组 / {{ visibleStepCount }} 道
        </p>
      </div>
      <div class="page-title__actions">
        <el-button :icon="MagicStick" @click="openScratch">按殿宇批量生成工序</el-button>
        <el-button
          type="primary"
          :icon="Plus"
          :disabled="pendingDecays.length === 0"
          @click="handleEmptyAction"
        >
          为待编排病害排工序
        </el-button>
      </div>
    </div>

    <div class="stat-row">
      <StatBadge
        label="工序总数"
        :value="repairStore.totalSteps"
        suffix="道"
        icon="Files"
        tone="primary"
        :percent="repairStore.overallPercent"
      />
      <StatBadge label="已完成" :value="repairStore.doneSteps" suffix="道" icon="SuccessFilled" tone="success" />
      <StatBadge label="进行中" :value="repairStore.runningSteps" suffix="道" icon="Loading" tone="warning" />
      <StatBadge label="待编排病害" :value="pendingDecays.length" suffix="条" icon="WarningFilled" tone="danger" />
      <StatBadge
        label="整体完成率"
        :value="repairStore.overallPercent"
        suffix="%"
        icon="TrendCharts"
        tone="success"
        show-percent
        :percent="repairStore.overallPercent"
      />
      <StatBadge
        label="本次筛选完成"
        :value="visibleDoneCount"
        suffix="道"
        icon="Histogram"
        :percent="visibleStepCount ? Math.round((visibleDoneCount / visibleStepCount) * 100) : 0"
      />
    </div>

    <div class="section-card toolbar">
      <span class="toolbar__label">殿宇</span>
      <el-select v-model="hallFilter" clearable placeholder="全部殿宇" class="toolbar__select">
        <el-option v-for="item in hallOptions" :key="item.value" :label="item.label" :value="item.value" />
      </el-select>

      <span class="toolbar__label">工序状态</span>
      <el-radio-group v-model="stateFilter" size="small">
        <el-radio-button value="">全部</el-radio-button>
        <el-radio-button v-for="item in stateOptions" :key="item" :value="item">{{ item }}</el-radio-button>
      </el-radio-group>

      <span class="toolbar__label">排序</span>
      <el-radio-group
        :model-value="repairStore.sortMode"
        size="small"
        @update:model-value="(value: string | number | boolean | undefined) => repairStore.setSortMode(value === 'severity' ? 'severity' : 'manual')"
      >
        <el-radio-button value="manual">手动顺序</el-radio-button>
        <el-radio-button value="severity">按病害程度</el-radio-button>
      </el-radio-group>

      <el-tag v-if="repairStore.totalSteps > 0" type="info" effect="plain" round>
        <el-icon><Sort /></el-icon>
        拖拽工序卡片可调整先后
      </el-tag>
    </div>

    <div v-if="pendingDecays.length > 0" class="section-card pending">
      <div class="section-card__head">
        <h3>待编排病害（{{ pendingDecays.length }}）</h3>
        <span class="muted">这些病害尚无任何修复工序</span>
      </div>
      <div class="pending__list">
        <el-tag
          v-for="decay in pendingDecays"
          :key="decay.id"
          closable
          :disable-transitions="true"
          type="warning"
          effect="plain"
          @close="openStepDialog(decay.id)"
        >
          {{ decay.type }} / {{ decay.severity }} / {{ formatArea(decay.areaCm2) }}
        </el-tag>
      </div>
      <p class="muted pending__hint">点击标签右侧「×」即可为该病害新增第一道工序。</p>
    </div>

    <div v-if="groups.length > 0" class="timeline">
      <article
        v-for="group in groups"
        :id="`group_${group.decayId}`"
        :key="group.decayId"
        class="timeline__group"
        :class="{ 'is-active': repairStore.activeDecayId === group.decayId }"
      >
        <header class="timeline__head">
          <div>
            <h3>{{ groupTitle(group) }}</h3>
            <p class="muted">{{ groupSubtitle(group) }}</p>
          </div>
          <div class="timeline__head-right">
            <SeverityTag v-if="group.decay" :severity="group.decay.severity" size="small" plain />
            <el-tag :type="group.percent === 100 ? 'success' : 'info'" effect="plain" round>
              {{ group.doneCount }}/{{ group.totalCount }}（{{ group.percent }}%）
            </el-tag>
            <el-button size="small" type="danger" text :icon="Delete" @click="removeGroup(group)">清空</el-button>
          </div>
        </header>

        <el-progress :percentage="group.percent" :stroke-width="8" :show-text="false" class="timeline__progress" />

        <ol class="timeline__steps">
          <li
            v-for="(step, index) in group.steps"
            :key="step.id"
            class="step-card"
            :class="{
              'is-dragging': draggingId === step.id,
              'is-over': dragOverId === step.id && draggingId !== step.id,
              [`is-${step.state}`]: true
            }"
            draggable="true"
            @dragstart="onDragStart(step)"
            @dragover="onDragOver(step, $event)"
            @drop="onDrop(group, step)"
            @dragend="
              () => {
                draggingId = null
                dragOverId = null
              }
            "
          >
            <div class="step-card__seq">
              <el-icon><Sort /></el-icon>
              <span class="mono">{{ index + 1 }}</span>
            </div>
            <div class="step-card__body">
              <div class="step-card__title">
                <strong>{{ step.name }}</strong>
                <el-tag size="small" effect="plain" :type="step.state === '已完成' ? 'success' : step.state === '进行中' ? 'warning' : 'info'">
                  {{ step.state }}
                </el-tag>
              </div>
              <div class="step-card__fields">
                <el-input
                  v-model="stepDrafts[step.id].material"
                  size="small"
                  placeholder="材料 / 配比"
                  class="step-card__input"
                  @blur="commitDraft(step, 'material')"
                  @keyup.enter="commitDraft(step, 'material')"
                />
                <el-input
                  v-model="stepDrafts[step.id].operator"
                  size="small"
                  placeholder="责任人"
                  class="step-card__input"
                  @blur="commitDraft(step, 'operator')"
                  @keyup.enter="commitDraft(step, 'operator')"
                />
              </div>
            </div>
            <div class="step-card__actions">
              <el-select
                :model-value="step.state"
                size="small"
                class="step-card__state"
                @update:model-value="(value: RepairState) => changeState(step, value)"
              >
                <el-option v-for="item in stateOptions" :key="item" :label="item" :value="item" />
              </el-select>
              <el-button size="small" text :icon="Edit" @click="openStepDialog(group.decayId, step)">编辑</el-button>
              <el-button size="small" text type="danger" @click="removeStep(step)">删除</el-button>
            </div>
          </li>
        </ol>

        <div class="timeline__add">
          <el-button size="small" :icon="Plus" @click="openStepDialog(group.decayId)">追加工序</el-button>
        </div>
      </article>
    </div>

    <div v-else class="section-card">
      <EmptyPanel
        :title="repairStore.totalSteps === 0 ? '尚未安排修复工序' : '当前筛选下没有工序'"
        :description="
          repairStore.totalSteps === 0
            ? '从待编排病害开始：为每条病害追加除尘、回贴、灌浆、补绘、封护等工序，并按施工顺序拖拽调整。'
            : '可切换殿宇或工序状态筛选条件。'
        "
        :action-text="pendingDecays.length > 0 ? '为待编排病害排工序' : ''"
        :secondary-text="repairStore.totalSteps > 0 ? '按殿宇批量生成工序' : ''"
        @action="handleEmptyAction"
        @secondary="openScratch"
      />
    </div>

    <el-dialog v-model="stepDialogVisible" :title="editingStepId ? '编辑工序' : '新增修复工序'" width="540px">
      <el-form :model="stepForm" label-width="110px">
        <el-form-item label="工序名称">
          <el-select v-model="stepForm.name" class="full-width">
            <el-option v-for="item in stepNameOptions" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
        <el-form-item label="材料 / 配比">
          <el-input v-model="stepForm.material" placeholder="如：鱼鳔胶（2% 明矾水调和）" maxlength="60" />
        </el-form-item>
        <el-form-item label="责任人">
          <el-input v-model="stepForm.operator" placeholder="如：李文博" maxlength="20" />
        </el-form-item>
        <el-form-item label="工序状态">
          <el-radio-group v-model="stepForm.state">
            <el-radio v-for="item in stateOptions" :key="item" :value="item">{{ item }}</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="stepDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitStep">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="scratchDialogVisible" title="按殿宇批量生成工序" width="560px">
      <el-form label-width="110px">
        <el-form-item label="目标殿宇">
          <el-select v-model="scratchHallId" class="full-width" placeholder="选择殿宇">
            <el-option v-for="item in hallOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="工序模板">
          <el-checkbox-group v-model="scratchTemplate">
            <el-checkbox v-for="item in stepNameOptions" :key="item" :value="item">
              {{ item }}
            </el-checkbox>
          </el-checkbox-group>
        </el-form-item>
      </el-form>
      <p class="muted">将为该殿宇下所有尚无工序的病害，按所选模板依次生成工序（状态均为未开始）。</p>
      <template #footer>
        <el-button @click="scratchDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitScratch">生成工序</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page-title__actions {
  display: flex;
  gap: 8px;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.toolbar__label {
  font-size: 13px;
  color: #6b6257;
}

.toolbar__select {
  width: 200px;
}

.pending__list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.pending__hint {
  margin: 10px 0 0;
  font-size: 12px;
}

.timeline {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 16px;
}

.timeline__group {
  padding: 16px;
  background: #ffffff;
  border: 1px solid var(--line);
  border-left: 4px solid #b09a76;
  border-radius: 12px;
}

.timeline__group.is-active {
  border-left-color: #8a5a2b;
  box-shadow: 0 0 0 2px rgba(138, 90, 43, 0.16);
}

.timeline__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.timeline__head h3 {
  margin: 0;
  font-size: 16px;
}

.timeline__head p {
  margin: 2px 0 0;
  font-size: 12px;
}

.timeline__head-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.timeline__progress {
  margin: 10px 0 14px;
}

.timeline__steps {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.step-card {
  display: flex;
  gap: 12px;
  padding: 10px 12px;
  background: #fbf9f5;
  border: 1px dashed #ddd3c2;
  border-radius: 10px;
  cursor: grab;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.step-card.is-已完成 {
  border-color: #bfe0c9;
  background: #f4fbf6;
}

.step-card.is-进行中 {
  border-color: #f0d9ac;
  background: #fdf8ee;
}

.step-card.is-dragging {
  opacity: 0.5;
}

.step-card.is-over {
  border-color: #8a5a2b;
  box-shadow: 0 0 0 2px rgba(138, 90, 43, 0.18);
}

.step-card__seq {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 34px;
  color: #8a5a2b;
  font-weight: 700;
}

.step-card__body {
  flex: 1;
  min-width: 0;
}

.step-card__title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.step-card__fields {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.step-card__input {
  flex: 1 1 180px;
  min-width: 140px;
}

.step-card__actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.step-card__state {
  width: 110px;
}

.timeline__add {
  margin-top: 12px;
}

.full-width {
  width: 100%;
}
</style>
