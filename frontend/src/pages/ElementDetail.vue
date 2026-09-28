<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import type { TreeNodeData } from 'element-plus/es/components/tree/src/tree.type'
import { ArrowLeft, Delete, Edit, Plus, Warning } from '@element-plus/icons-vue'
import EmptyPanel from '@/components/common/EmptyPanel.vue'
import SeverityTag from '@/components/common/SeverityTag.vue'
import StatBadge from '@/components/common/StatBadge.vue'
import { useHallStore } from '@/stores/hallStore'
import { useDecayStore } from '@/stores/decayStore'
import { ELEMENT_POSITIONS, ELEMENT_STATUSES, type Element, type ElementPosition, type ElementStatus } from '@/types/element'
import { PATTERN_NAMES, PIGMENTS, type PaintLayer, type PatternName, type Pigment } from '@/types/layer'
import { DECAY_TYPES, SEVERITIES, type Decay, type DecayType, type Severity } from '@/types/decay'

const route = useRoute()
const router = useRouter()
const hallStore = useHallStore()
const decayStore = useDecayStore()

const hallId = computed(() => String(route.params.id ?? ''))
const hall = computed(() => hallStore.hallById(hallId.value) ?? null)

const positionFilter = ref<ElementPosition | ''>('')
const statusFilter = ref<ElementStatus | ''>('')
const selectedId = ref<string>('')
const expandedLayerIds = ref<string[]>([])

const elementDialogVisible = ref(false)
const layerDialogVisible = ref(false)
const decayDialogVisible = ref(false)
const editingElementId = ref<string | null>(null)
const editingLayerId = ref<string | null>(null)

const elementFormRef = ref<FormInstance>()
const layerFormRef = ref<FormInstance>()
const decayFormRef = ref<FormInstance>()

const elementForm = reactive<{
  position: ElementPosition
  name: string
  baseLayer: string
  status: ElementStatus
}>({
  position: '檐下',
  name: '',
  baseLayer: '一麻五灰',
  status: '观察'
})

const layerForm = reactive<{
  level: number
  patternName: PatternName
  pigment: Pigment
  thicknessMm: number
}>({
  level: 1,
  patternName: '旋子',
  pigment: '石青',
  thicknessMm: 1.5
})

const decayForm = reactive<{
  layerId: string
  type: DecayType
  severity: Severity
  areaCm2: number
  causeGuess: string
}>({
  layerId: '',
  type: '起甲',
  severity: '轻度',
  areaCm2: 10,
  causeGuess: ''
})

const elementRules: FormRules = {
  name: [{ required: true, message: '请填写构件名称', trigger: 'blur' }],
  baseLayer: [{ required: true, message: '请填写地仗做法', trigger: 'blur' }]
}

const layerRules: FormRules = {
  level: [{ required: true, message: '请填写层位序号', trigger: 'change' }],
  thicknessMm: [{ required: true, message: '请填写厚度', trigger: 'change' }]
}

const decayRules: FormRules = {
  areaCm2: [{ required: true, message: '请填写病害面积', trigger: 'change' }]
}

/**
 * 校正「当前殿宇 + 已选构件」。
 * 直链 / 刷新进入时 Dexie liveQuery 尚未回填，store 里 halls、elements 都还是空的，
 * 此时不能把 currentHallId 置空（否则会污染 localStorage 的 lastHallId），
 * 而要等 halls 首次载入完成后再重新校正。因此该函数由下面的 watch 监听
 * halls / elements 数据本身来反复触发，而不是只在路由参数变化时执行一次。
 */
function syncCurrentHall(id: string): void {
  if (id.length === 0) return
  const exists = hallStore.hallById(id)
  if (!exists) {
    // 数据仍在首次载入中：保持现状，待 halls 到位后 watch 会再次触发
    if (!hallStore.hallsReady) return
    hallStore.setCurrentHall(null)
    selectedId.value = ''
    return
  }
  hallStore.setCurrentHall(id)
  const list = hallStore.elements.filter((element) => element.hallId === id)
  if (!list.some((element) => element.id === selectedId.value)) {
    selectedId.value = list[0]?.id ?? ''
  }
}

watch(
  [hallId, () => hallStore.halls, () => hallStore.elements],
  ([id]) => syncCurrentHall(String(id ?? '')),
  { immediate: true }
)

const hallElements = computed<Element[]>(() => hallStore.elements.filter((element) => element.hallId === hallId.value))

const filteredElements = computed<Element[]>(() =>
  hallElements.value.filter((element) => {
    if (positionFilter.value && element.position !== positionFilter.value) return false
    if (statusFilter.value && element.status !== statusFilter.value) return false
    return true
  })
)

const treeData = computed<TreeNodeData[]>(() =>
  ELEMENT_POSITIONS.filter((position) => !positionFilter.value || position === positionFilter.value)
    .map((position) => {
      const children = filteredElements.value.filter((element) => element.position === position)
      return {
        id: `pos_${position}`,
        label: `${position}（${children.length}）`,
        isPosition: true,
        disabled: children.length === 0,
        children: children.map((element) => ({
          id: element.id,
          label: `${element.name} · ${element.layerCount} 层`,
          isPosition: false,
          disabled: false,
          children: [] as TreeNodeData[]
        }))
      }
    })
    .filter((node) => (node.children as TreeNodeData[]).length > 0 || !positionFilter.value)
)

const selectedElement = computed<Element | null>(
  () => hallElements.value.find((element) => element.id === selectedId.value) ?? null
)

const selectedLayers = computed<PaintLayer[]>(() =>
  selectedElement.value ? hallStore.layersOfElement(selectedElement.value.id) : []
)

const selectedStats = computed(() => {
  const element = selectedElement.value
  if (!element) return { decayCount: 0, unrepaired: 0, area: 0, severity: { 轻度: 0, 中度: 0, 重度: 0 } }
  const layers = hallStore.layersOfElement(element.id)
  const layerIds = layers.map((layer) => layer.id)
  const decays = hallStore.decays.filter((decay) => layerIds.includes(decay.layerId))
  const severity: Record<Severity, number> = { 轻度: 0, 中度: 0, 重度: 0 }
  decays.forEach((decay) => {
    severity[decay.severity] += 1
  })
  return {
    decayCount: decays.length,
    unrepaired: decays.filter((decay) => !decay.repaired).length,
    area: decays.reduce((sum, decay) => sum + decay.areaCm2, 0),
    severity
  }
})

function layerDecays(layerId: string): Decay[] {
  return hallStore.decaysOfLayer(layerId)
}

function layerSeverity(layerId: string): Severity | null {
  const list = layerDecays(layerId)
  if (list.length === 0) return null
  if (list.some((decay) => decay.severity === '重度')) return '重度'
  if (list.some((decay) => decay.severity === '中度')) return '中度'
  return '轻度'
}

const severityEnum: Record<Severity, Severity> = { 轻度: '轻度', 中度: '中度', 重度: '重度' }

/** 模板中安全地把 null 收敛为 Severity 枚举 */
function layerSeverityTag(layerId: string): Severity {
  return severityEnum[layerSeverity(layerId) ?? '轻度']
}

function handleTreeClick(data: TreeNodeData): void {
  if (data.isPosition === true) return
  selectedId.value = String(data.id)
}

/** 层位展开状态由表格回传，保持与 expandedLayerIds 同步 */
function handleExpandChange(_row: PaintLayer, expanded: PaintLayer[]): void {
  expandedLayerIds.value = expanded.map((item) => item.id)
}

function openElementDialog(element?: Element): void {
  if (element) {
    editingElementId.value = element.id
    elementForm.position = element.position
    elementForm.name = element.name
    elementForm.baseLayer = element.baseLayer
    elementForm.status = element.status
  } else {
    editingElementId.value = null
    elementForm.position = positionFilter.value || '檐下'
    elementForm.name = ''
    elementForm.baseLayer = '一麻五灰'
    elementForm.status = '观察'
  }
  elementDialogVisible.value = true
}

async function submitElement(): Promise<void> {
  if (!elementFormRef.value) return
  const valid = await elementFormRef.value.validate().catch(() => false)
  if (!valid) return
  if (editingElementId.value) {
    await hallStore.updateElement(editingElementId.value, {
      position: elementForm.position,
      name: elementForm.name.trim(),
      baseLayer: elementForm.baseLayer.trim(),
      status: elementForm.status
    })
    ElMessage.success('构件信息已更新')
  } else {
    const element = await hallStore.createElement({
      hallId: hallId.value,
      position: elementForm.position,
      name: elementForm.name.trim(),
      layerCount: 0,
      baseLayer: elementForm.baseLayer.trim(),
      status: elementForm.status
    })
    selectedId.value = element.id
    ElMessage.success('构件已新增，可继续圈定彩画层位')
  }
  elementDialogVisible.value = false
}

async function removeElement(element: Element): Promise<void> {
  const confirmed = await ElMessageBox.confirm(
    `删除构件「${element.name}」将同时删除其层位与病害记录，是否继续？`,
    '删除确认',
    { type: 'warning' }
  ).catch(() => false)
  if (!confirmed) return
  await hallStore.removeElement(element.id)
  if (selectedId.value === element.id) selectedId.value = hallElements.value[0]?.id ?? ''
  ElMessage.success('构件已删除')
}

function openLayerDialog(layer?: PaintLayer): void {
  if (!selectedElement.value) {
    ElMessage.warning('请先在左侧选择一个构件')
    return
  }
  if (layer) {
    editingLayerId.value = layer.id
    layerForm.level = layer.level
    layerForm.patternName = layer.patternName
    layerForm.pigment = layer.pigment
    layerForm.thicknessMm = layer.thicknessMm
  } else {
    editingLayerId.value = null
    const levels = selectedLayers.value.map((item) => item.level)
    layerForm.level = levels.length === 0 ? 1 : Math.max(...levels) + 1
    layerForm.patternName = '旋子'
    layerForm.pigment = '石青'
    layerForm.thicknessMm = 1.5
  }
  layerDialogVisible.value = true
}

async function submitLayer(): Promise<void> {
  if (!layerFormRef.value || !selectedElement.value) return
  const valid = await layerFormRef.value.validate().catch(() => false)
  if (!valid) return
  const duplicated = selectedLayers.value.some(
    (layer) => layer.level === layerForm.level && layer.id !== editingLayerId.value
  )
  if (duplicated) {
    ElMessage.warning(`层位序号 ${layerForm.level} 已存在，请更换`)
    return
  }
  if (editingLayerId.value) {
    await hallStore.updateLayer(editingLayerId.value, {
      level: layerForm.level,
      patternName: layerForm.patternName,
      pigment: layerForm.pigment,
      thicknessMm: layerForm.thicknessMm
    })
    ElMessage.success('层位已更新')
  } else {
    const layer = await hallStore.createLayer({
      elementId: selectedElement.value.id,
      level: layerForm.level,
      patternName: layerForm.patternName,
      pigment: layerForm.pigment,
      thicknessMm: layerForm.thicknessMm
    })
    expandedLayerIds.value = Array.from(new Set([...expandedLayerIds.value, layer.id]))
    ElMessage.success('层位已新增')
  }
  layerTableKey.value += 1
  layerDialogVisible.value = false
}

async function removeLayer(layer: PaintLayer): Promise<void> {
  const confirmed = await ElMessageBox.confirm(
    `删除第 ${layer.level} 层（${layer.patternName}）将同时删除该层病害记录，是否继续？`,
    '删除确认',
    { type: 'warning' }
  ).catch(() => false)
  if (!confirmed) return
  await hallStore.removeLayer(layer.id)
  ElMessage.success('层位已删除')
}

function openDecayDialog(layerId: string): void {
  decayForm.layerId = layerId
  decayForm.type = '起甲'
  decayForm.severity = '轻度'
  decayForm.areaCm2 = 10
  decayForm.causeGuess = ''
  decayDialogVisible.value = true
}

async function submitDecay(): Promise<void> {
  if (!decayFormRef.value) return
  const valid = await decayFormRef.value.validate().catch(() => false)
  if (!valid) return
  await decayStore.createDecay({
    layerId: decayForm.layerId,
    type: decayForm.type,
    severity: decayForm.severity,
    areaCm2: decayForm.areaCm2,
    causeGuess: decayForm.causeGuess.trim() || '待现场复核',
    repaired: false,
    repairedAt: null
  })
  expandedLayerIds.value = Array.from(new Set([...expandedLayerIds.value, decayForm.layerId]))
  decayDialogVisible.value = false
  ElMessage.success('病害记录已挂接到该层位')
}

async function removeDecay(decay: Decay): Promise<void> {
  const confirmed = await ElMessageBox.confirm('删除该条病害记录及其修复工序？', '删除确认', { type: 'warning' }).catch(
    () => false
  )
  if (!confirmed) return
  await decayStore.removeDecay(decay.id)
  ElMessage.success('病害记录已删除')
}

async function bumpElementStatus(status: ElementStatus): Promise<void> {
  if (!selectedElement.value) return
  await hallStore.updateElement(selectedElement.value.id, { status })
  ElMessage.success(`构件状态已改为「${status}」`)
}

function goBack(): void {
  void router.push('/halls')
}

function positionTagType(position: ElementPosition): 'primary' | 'success' | 'warning' | 'info' | 'danger' {
  if (position === '檐下') return 'warning'
  if (position === '室内') return 'info'
  if (position === '梁枋') return 'primary'
  if (position === '斗拱') return 'success'
  return 'danger'
}

const layerTableKey = ref(0)

const positionOptions = ELEMENT_POSITIONS
const statusOptions = ELEMENT_STATUSES
const patternOptions = PATTERN_NAMES
const pigmentOptions = PIGMENTS
const decayTypeOptions = DECAY_TYPES
const severityOptions = SEVERITIES
</script>

<template>
  <div>
    <div class="page-title">
      <div>
        <h2>
          {{ hall ? `${hall.name} · 构件与层位` : '构件与层位' }}
          <el-button text :icon="ArrowLeft" @click="goBack">返回殿宇总览</el-button>
        </h2>
        <p v-if="hall">{{ hall.era }} · {{ hall.structureType }} · {{ hall.roofType }}顶 · 共 {{ hallElements.length }} 件构件</p>
        <p v-else class="muted">未找到该殿宇，可能已被删除。</p>
      </div>
      <el-button type="primary" :icon="Plus" :disabled="!hall" @click="openElementDialog()">新增构件</el-button>
    </div>

    <div v-if="!hall" class="section-card">
      <EmptyPanel
        title="殿宇不存在"
        description="该殿宇可能已被删除，请返回总览重新选择或新建。"
        action-text="返回殿宇总览"
        @action="goBack"
      />
    </div>

    <template v-else>
      <div class="filter-row">
        <span class="filter-row__label">部位</span>
        <el-radio-group v-model="positionFilter" size="small">
          <el-radio-button value="">全部</el-radio-button>
          <el-radio-button v-for="item in positionOptions" :key="item" :value="item">{{ item }}</el-radio-button>
        </el-radio-group>
        <span class="filter-row__label">状态</span>
        <el-radio-group v-model="statusFilter" size="small">
          <el-radio-button value="">全部</el-radio-button>
          <el-radio-button v-for="item in statusOptions" :key="item" :value="item">{{ item }}</el-radio-button>
        </el-radio-group>
      </div>

      <div class="element-layout">
        <aside class="section-card element-tree">
          <div class="section-card__head">
            <h3>构件树</h3>
            <span class="muted">{{ filteredElements.length }} 件</span>
          </div>
          <el-tree
            v-if="treeData.length > 0"
            :data="treeData"
            node-key="id"
            :current-node-key="selectedId"
            :default-expanded-keys="treeData.map((node) => node.id)"
            :expand-on-click-node="false"
            highlight-current
            @node-click="handleTreeClick"
          />
          <EmptyPanel
            v-else
            compact
            title="该部位下暂无构件"
            description="可切换部位筛选或新增构件。"
            action-text="新增构件"
            @action="openElementDialog()"
          />
        </aside>

        <section class="element-main">
          <div v-if="!selectedElement" class="section-card">
            <EmptyPanel
              title="请选择构件"
              description="在左侧构件树中选择一件构件，即可查看并维护其彩画层位。"
              action-text="新增构件"
              @action="openElementDialog()"
            />
          </div>

          <template v-else>
            <div class="section-card">
              <div class="section-card__head">
                <div>
                  <h3>{{ selectedElement.name }}</h3>
                  <p class="muted">
                    <el-tag size="small" :type="positionTagType(selectedElement.position)" effect="plain">
                      {{ selectedElement.position }}
                    </el-tag>
                    · 地仗做法：{{ selectedElement.baseLayer }} · 层数：{{ selectedLayers.length }}
                  </p>
                </div>
                <div class="element-actions">
                  <el-button size="small" :icon="Edit" @click="openElementDialog(selectedElement)">编辑构件</el-button>
                  <el-button size="small" type="danger" text :icon="Delete" @click="removeElement(selectedElement)">
                    删除构件
                  </el-button>
                </div>
              </div>
              <div class="element-status">
                <span class="muted">构件状态：</span>
                <el-button
                  v-for="item in statusOptions"
                  :key="item"
                  size="small"
                  :type="selectedElement.status === item ? 'primary' : 'default'"
                  @click="bumpElementStatus(item)"
                >
                  {{ item }}
                </el-button>
              </div>
            </div>

            <div class="stat-row">
              <StatBadge label="层位数量" :value="selectedLayers.length" suffix="层" icon="Files" tone="primary" />
              <StatBadge label="病害总数" :value="selectedStats.decayCount" suffix="条" icon="Histogram" tone="warning" />
              <StatBadge label="未修复" :value="selectedStats.unrepaired" suffix="条" icon="WarningFilled" tone="danger" />
              <StatBadge
                label="重度病害"
                :value="selectedStats.severity.重度"
                suffix="条"
                icon="CircleCloseFilled"
                tone="danger"
              />
            </div>

            <div class="section-card">
              <div class="section-card__head">
                <h3>彩画层位</h3>
                <el-button type="primary" size="small" :icon="Plus" @click="openLayerDialog()">新增层位</el-button>
              </div>

              <el-table
                :key="layerTableKey"
                :data="selectedLayers"
                row-key="id"
                :expand-row-keys="expandedLayerIds"
                @expand-change="handleExpandChange"
              >
                <el-table-column type="expand">
                  <template #default="{ row }">
                    <div class="layer-decays">
                      <div class="layer-decays__head">
                        <span>该层病害记录（{{ layerDecays(row.id).length }} 条）</span>
                        <el-button size="small" type="primary" plain :icon="Warning" @click="openDecayDialog(row.id)">
                          挂接病害
                        </el-button>
                      </div>
                      <el-table v-if="layerDecays(row.id).length > 0" :data="layerDecays(row.id)" size="small">
                        <el-table-column label="类型" prop="type" width="90" />
                        <el-table-column label="程度" width="130">
                          <template #default="{ row: decay }">
                            <SeverityTag :severity="decay.severity" :area-cm2="decay.areaCm2" size="small" plain />
                          </template>
                        </el-table-column>
                        <el-table-column label="成因初判" prop="causeGuess" min-width="200" />
                        <el-table-column label="修复状态" width="100">
                          <template #default="{ row: decay }">
                            <el-tag size="small" :type="decay.repaired ? 'success' : 'info'" effect="plain">
                              {{ decay.repaired ? '已修复' : '未修复' }}
                            </el-tag>
                          </template>
                        </el-table-column>
                        <el-table-column label="操作" width="90">
                          <template #default="{ row: decay }">
                            <el-button size="small" type="danger" text @click="removeDecay(decay)">删除</el-button>
                          </template>
                        </el-table-column>
                      </el-table>
                      <p v-else class="muted layer-decays__empty">该层位尚未记录病害，可点击「挂接病害」新增。</p>
                    </div>
                  </template>
                </el-table-column>
                <el-table-column label="由外至内" prop="level" width="100" />
                <el-table-column label="彩画做法" prop="patternName" width="110" />
                <el-table-column label="主色颜料" width="110">
                  <template #default="{ row }">
                    <el-tag size="small" effect="plain">{{ row.pigment }}</el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="厚度" width="110">
                  <template #default="{ row }">
                    <span class="mono">{{ row.thicknessMm }} mm</span>
                  </template>
                </el-table-column>
                <el-table-column label="病害程度" width="150">
                  <template #default="{ row }">
                    <SeverityTag
                      v-if="layerSeverity(row.id)"
                      :severity="layerSeverityTag(row.id)"
                      size="small"
                    />
                    <span v-else class="muted">无病害</span>
                  </template>
                </el-table-column>
                <el-table-column label="病害数" width="90">
                  <template #default="{ row }">
                    <span class="mono">{{ layerDecays(row.id).length }}</span>
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="200">
                  <template #default="{ row }">
                    <el-button size="small" :icon="Edit" text @click="openLayerDialog(row)">编辑</el-button>
                    <el-button size="small" type="primary" text :icon="Warning" @click="openDecayDialog(row.id)">
                      挂接病害
                    </el-button>
                    <el-button size="small" type="danger" text @click="removeLayer(row)">删除</el-button>
                  </template>
                </el-table-column>
              </el-table>

              <EmptyPanel
                v-if="selectedLayers.length === 0"
                compact
                title="尚未圈定彩画层位"
                description="按由外至内顺序逐层登记：层位序号、彩画做法、主色颜料与厚度。"
                action-text="新增层位"
                @action="openLayerDialog()"
              />
            </div>
          </template>
        </section>
      </div>
    </template>

    <el-dialog v-model="elementDialogVisible" :title="editingElementId ? '编辑构件' : '新增构件'" width="520px">
      <el-form ref="elementFormRef" :model="elementForm" :rules="elementRules" label-width="96px">
        <el-form-item label="所属部位" prop="position">
          <el-select v-model="elementForm.position" class="full-width">
            <el-option v-for="item in positionOptions" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
        <el-form-item label="构件名称" prop="name">
          <el-input v-model="elementForm.name" placeholder="如：前檐明间额枋" maxlength="30" />
        </el-form-item>
        <el-form-item label="地仗做法" prop="baseLayer">
          <el-input v-model="elementForm.baseLayer" placeholder="如：一麻五灰 / 单披灰 / 血料腻子" maxlength="30" />
        </el-form-item>
        <el-form-item label="构件状态" prop="status">
          <el-radio-group v-model="elementForm.status">
            <el-radio v-for="item in statusOptions" :key="item" :value="item">{{ item }}</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="elementDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitElement">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="layerDialogVisible" :title="editingLayerId ? '编辑层位' : '新增彩画层位'" width="520px">
      <el-form ref="layerFormRef" :model="layerForm" :rules="layerRules" label-width="110px">
        <el-form-item label="由外至内序号" prop="level">
          <el-input-number v-model="layerForm.level" :min="1" :max="20" />
        </el-form-item>
        <el-form-item label="彩画做法" prop="patternName">
          <el-select v-model="layerForm.patternName" class="full-width">
            <el-option v-for="item in patternOptions" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
        <el-form-item label="主色颜料" prop="pigment">
          <el-select v-model="layerForm.pigment" class="full-width">
            <el-option v-for="item in pigmentOptions" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
        <el-form-item label="厚度（mm）" prop="thicknessMm">
          <el-input-number v-model="layerForm.thicknessMm" :min="0.1" :max="20" :step="0.1" :precision="1" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="layerDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitLayer">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="decayDialogVisible" title="挂接病害记录" width="540px">
      <el-form ref="decayFormRef" :model="decayForm" :rules="decayRules" label-width="110px">
        <el-form-item label="病害类型" prop="type">
          <el-select v-model="decayForm.type" class="full-width">
            <el-option v-for="item in decayTypeOptions" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
        <el-form-item label="严重程度" prop="severity">
          <el-radio-group v-model="decayForm.severity">
            <el-radio v-for="item in severityOptions" :key="item" :value="item">{{ item }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="面积（cm²）" prop="areaCm2">
          <el-input-number v-model="decayForm.areaCm2" :min="0.1" :max="1000000" :step="10" :precision="1" />
        </el-form-item>
        <el-form-item label="成因初判" prop="causeGuess">
          <el-input
            v-model="decayForm.causeGuess"
            type="textarea"
            :rows="3"
            maxlength="120"
            show-word-limit
            placeholder="如：地仗层脱胶，受檐口渗水影响"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="decayDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitDecay">保存病害</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.filter-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  margin-bottom: 16px;
  background: #ffffff;
  border: 1px solid var(--line);
  border-radius: 10px;
}

.filter-row__label {
  font-size: 13px;
  color: #6b6257;
}

.element-layout {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.element-tree {
  max-height: 640px;
  overflow: auto;
}

.element-main {
  display: flex;
  flex-direction: column;
}

.element-actions {
  display: flex;
  gap: 6px;
}

.element-status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.layer-decays {
  padding: 10px 16px 16px 48px;
  background: #fbf9f5;
}

.layer-decays__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 13px;
  color: #6b6257;
}

.layer-decays__empty {
  margin: 0;
  font-size: 13px;
}

.full-width {
  width: 100%;
}

@media (max-width: 900px) {
  .element-layout {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
