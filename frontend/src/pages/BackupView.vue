<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Download, Upload, WarnTriangleFilled } from '@element-plus/icons-vue'
import EmptyPanel from '@/components/common/EmptyPanel.vue'
import StatBadge from '@/components/common/StatBadge.vue'
import { useHallStore } from '@/stores/hallStore'
import { useDecayStore } from '@/stores/decayStore'
import { useRepairStore } from '@/stores/repairStore'
import {
  DB_VERSION,
  clearAllTables,
  readLastBackupAt,
  readStampedDbVersion,
  type BackupPayload
} from '@/utils/db'
import {
  exportBackupJson,
  importBackup,
  readFileText,
  remapIds,
  seedDemoData,
  validateBackup
} from '@/utils/export'
import { formatArea } from '@/utils/severity'

const hallStore = useHallStore()
const decayStore = useDecayStore()
const repairStore = useRepairStore()

const fileInput = ref<HTMLInputElement | null>(null)
const importOverwrite = ref(true)
const lastBackupAt = ref<string | null>(null)
const stampedVersion = ref<number>(DB_VERSION)
const importPreview = ref<BackupPayload | null>(null)
const importErrors = ref<string[]>([])
const importing = ref(false)
const exporting = ref(false)

onMounted(() => {
  lastBackupAt.value = readLastBackupAt()
  stampedVersion.value = readStampedDbVersion()
})

const counts = computed(() => ({
  halls: hallStore.halls.length,
  elements: hallStore.elements.length,
  layers: hallStore.layers.length,
  decays: decayStore.decays.length,
  repairSteps: repairStore.steps.length
}))

const storageRows = computed(() => [
  { table: 'halls（殿宇）', key: 'id, name, era, structureType, roofType, updatedAt', count: counts.value.halls },
  { table: 'elements（构件）', key: 'id, hallId, position, status, updatedAt', count: counts.value.elements },
  { table: 'layers（彩画层位）', key: 'id, elementId, level, patternName, pigment', count: counts.value.layers },
  {
    table: 'decays（病害）',
    key: 'id, layerId, type, severity, repaired, repairedAt, mergedInto, mergedAt, updatedAt',
    count: counts.value.decays
  },
  { table: 'repairSteps（工序）', key: 'id, decayId, seq, name, state, updatedAt', count: counts.value.repairSteps }
])

const localStorageRows = computed(() => [
  { key: 'gbmuralarch:db-version', value: String(stampedVersion.value), note: '本地结构版本号' },
  { key: 'gbmuralarch:last-backup-at', value: lastBackupAt.value ?? '尚未导出', note: '最近一次导出备份时间' },
  { key: 'gbmuralarch:ui-prefs', value: 'lastHallId / repairSort', note: '界面偏好（殿宇选中态、工序排序方式）' }
])

const versionMatch = computed(() => stampedVersion.value === DB_VERSION)

async function doExport(): Promise<void> {
  exporting.value = true
  try {
    const result = await exportBackupJson()
    lastBackupAt.value = readLastBackupAt()
    ElMessage.success(
      `已导出 ${result.fileName}（殿宇 ${result.counts.halls} / 构件 ${result.counts.elements} / 层位 ${result.counts.layers} / 病害 ${result.counts.decays} / 工序 ${result.counts.repairSteps}）`
    )
  } finally {
    exporting.value = false
  }
}

function pickFile(): void {
  fileInput.value?.click()
}

async function onFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  importErrors.value = []
  importPreview.value = null
  try {
    const text = await readFileText(file)
    const parsed: unknown = JSON.parse(text)
    const result = validateBackup(parsed)
    if (!result.ok || !result.payload) {
      importErrors.value = result.errors
      ElMessage.error('备份文件校验未通过，请检查下方问题列表')
      return
    }
    importPreview.value = result.payload
    ElMessage.success('备份文件校验通过，确认后即可导入')
  } catch {
    importErrors.value = ['文件不是合法的 JSON，或读取过程中出现异常']
    ElMessage.error('无法解析该文件')
  }
}

async function confirmImport(): Promise<void> {
  if (!importPreview.value) return
  importing.value = true
  try {
    const payload = importOverwrite.value ? importPreview.value : remapIds(importPreview.value)
    const confirmed = await ElMessageBox.confirm(
      importOverwrite.value
        ? '覆盖导入将清空当前全部本地数据后写入备份内容，是否继续？'
        : '追加导入会为备份数据重新分配 id 并保留现有档案，是否继续？',
      '导入确认',
      { type: 'warning', confirmButtonText: '开始导入', cancelButtonText: '取消' }
    ).catch(() => false)
    if (!confirmed) return
    const result = await importBackup(payload, importOverwrite.value)
    ElMessage.success(
      `导入完成：殿宇 ${result.halls} / 构件 ${result.elements} / 层位 ${result.layers} / 病害 ${result.decays} / 工序 ${result.repairSteps}`
    )
    importPreview.value = null
  } finally {
    importing.value = false
  }
}

async function doClear(): Promise<void> {
  const confirmed = await ElMessageBox.confirm(
    '将清空浏览器 IndexedDB 中的全部业务数据（殿宇、构件、层位、病害、工序），此操作不可撤销。是否继续？',
    '清空本地数据',
    { type: 'error', confirmButtonText: '确认清空', cancelButtonText: '取消' }
  ).catch(() => false)
  if (!confirmed) return
  await clearAllTables()
  hallStore.setCurrentHall(null)
  decayStore.resetFilter()
  decayStore.clearSelection()
  ElMessage.success('本地数据已清空')
}

async function doSeed(): Promise<void> {
  await seedDemoData()
  ElMessage.success('已生成本地样例档案')
}

function previewCount(payload: BackupPayload, key: keyof Pick<BackupPayload, 'halls' | 'elements' | 'layers' | 'decays' | 'repairSteps'>): number {
  return payload[key].length
}

const previewKeys: Array<{ key: keyof Pick<BackupPayload, 'halls' | 'elements' | 'layers' | 'decays' | 'repairSteps'>; label: string }> = [
  { key: 'halls', label: '殿宇' },
  { key: 'elements', label: '构件' },
  { key: 'layers', label: '层位' },
  { key: 'decays', label: '病害' },
  { key: 'repairSteps', label: '工序' }
]
</script>

<template>
  <div>
    <div class="page-title">
      <div>
        <h2>本地数据与备份</h2>
        <p>全部档案保存在浏览器 IndexedDB（Dexie）与 localStorage，刷新或重启浏览器后仍在，可导出 JSON 长期归档。</p>
      </div>
      <div class="page-title__actions">
        <el-button :icon="Download" :loading="exporting" type="primary" @click="doExport">导出 JSON 备份</el-button>
        <el-button :icon="Upload" @click="pickFile">导入 JSON 备份</el-button>
      </div>
    </div>

    <input ref="fileInput" type="file" accept="application/json,.json" class="hidden-input" @change="onFileChange" />

    <div class="stat-row">
      <StatBadge label="本地结构版本" :value="DB_VERSION" icon="Coin" tone="primary" />
      <StatBadge label="殿宇" :value="counts.halls" suffix="处" icon="OfficeBuilding" tone="info" />
      <StatBadge label="构件" :value="counts.elements" suffix="件" icon="Grid" tone="info" />
      <StatBadge label="彩画层位" :value="counts.layers" suffix="层" icon="Files" />
      <StatBadge label="病害记录" :value="counts.decays" suffix="条" icon="Histogram" tone="warning" />
      <StatBadge label="工序" :value="counts.repairSteps" suffix="道" icon="Tools" tone="success" />
      <StatBadge label="病害总面积" :value="formatArea(decayStore.totalArea)" icon="PieChart" />
    </div>

    <div v-if="!versionMatch" class="section-card version-warn">
      <el-icon><WarnTriangleFilled /></el-icon>
      <span>
        localStorage 记录的版本（{{ stampedVersion }}）与当前代码结构版本（{{ DB_VERSION }}）不一致，
        打开页面时会自动执行升级迁移，如遇异常请先导出备份。
      </span>
    </div>

    <div class="section-card">
      <div class="section-card__head">
        <h3>本地存储结构（IndexedDB 数据库 gbmuralarch）</h3>
        <el-tag type="info" effect="plain">数据结构版本 v{{ DB_VERSION }}</el-tag>
      </div>
      <el-table :data="storageRows" size="small">
        <el-table-column label="表 / 模型" prop="table" width="220" />
        <el-table-column label="索引键" prop="key" min-width="320" />
        <el-table-column label="当前记录数" width="130">
          <template #default="{ row }">
            <span class="mono">{{ row.count }}</span>
          </template>
        </el-table-column>
      </el-table>
      <p class="muted storage-note">
        版本 1 → 2 的迁移：decays 表补充 repairedAt 索引，修复状态字段缺失的历史数据按 updatedAt 回填。<br />
        版本 2 → 3 的迁移：decays 表补充 mergedInto / mergedAt 索引，用于同层位同类病害合并后旧记录归档留痕。
      </p>
    </div>

    <div class="section-card">
      <div class="section-card__head">
        <h3>localStorage 元数据</h3>
        <span class="muted">最近导出：{{ lastBackupAt ?? '尚未导出' }}</span>
      </div>
      <el-table :data="localStorageRows" size="small">
        <el-table-column label="键" prop="key" min-width="230" />
        <el-table-column label="当前值" prop="value" min-width="220" show-overflow-tooltip />
        <el-table-column label="说明" prop="note" min-width="200" />
      </el-table>
    </div>

    <div class="section-card">
      <div class="section-card__head">
        <h3>导入设置</h3>
      </div>
      <el-radio-group v-model="importOverwrite">
        <el-radio :value="true">覆盖导入（先清空本地数据）</el-radio>
        <el-radio :value="false">追加导入（重新分配 id，保留现有档案）</el-radio>
      </el-radio-group>

      <div v-if="importErrors.length > 0" class="import-errors">
        <p v-for="(error, index) in importErrors" :key="index" class="import-errors__item">{{ error }}</p>
      </div>

      <div v-if="importPreview" class="import-preview">
        <div class="import-preview__head">
          <strong>待导入文件校验通过</strong>
          <span class="muted">导出时间：{{ importPreview.exportedAt }} · 文件版本 v{{ importPreview.dbVersion }}</span>
        </div>
        <div class="import-preview__counts">
          <el-tag v-for="item in previewKeys" :key="item.key" effect="plain" round>
            {{ item.label }}：{{ previewCount(importPreview, item.key) }}
          </el-tag>
        </div>
        <div class="import-preview__actions">
          <el-button type="primary" :loading="importing" @click="confirmImport">确认导入</el-button>
          <el-button @click="importPreview = null">取消</el-button>
        </div>
      </div>
    </div>

    <div class="section-card">
      <div class="section-card__head">
        <h3>维护操作</h3>
      </div>
      <div class="maintain-actions">
        <el-button @click="pickFile" :icon="Upload">选择备份文件</el-button>
        <el-button @click="doSeed">生成样例数据</el-button>
        <el-button type="danger" plain :icon="Delete" @click="doClear">清空本地数据</el-button>
      </div>
      <p class="muted maintain-note">
        容器本身无状态：不连接数据库服务、不挂载命名卷，数据只随浏览器本地存储存在，迁移设备时请使用导出 / 导入。
      </p>
    </div>

    <div v-if="counts.halls === 0" class="section-card">
      <EmptyPanel
        title="本地暂无殿宇档案"
        description="可以导入此前导出的 JSON 备份，或直接生成一份样例数据快速体验全部页面。"
        action-text="导入 JSON 备份"
        secondary-text="生成样例数据"
        show-seed
        @action="pickFile"
        @secondary="doSeed"
        @seed="doSeed"
      />
    </div>
  </div>
</template>

<style scoped>
.page-title__actions {
  display: flex;
  gap: 8px;
}

.hidden-input {
  display: none;
}

.version-warn {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #b06b00;
  background: #fdf7e8;
  border-color: #f0d9ac;
}

.storage-note {
  margin: 10px 0 0;
  font-size: 12px;
}

.import-errors {
  margin-top: 12px;
  padding: 10px 12px;
  background: #fdecea;
  border: 1px solid #f2c4bd;
  border-radius: 8px;
}

.import-errors__item {
  margin: 0 0 4px;
  font-size: 13px;
  color: #c0392b;
}

.import-preview {
  margin-top: 14px;
  padding: 14px;
  background: #faf7f1;
  border: 1px dashed #ddd3c2;
  border-radius: 10px;
}

.import-preview__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 10px;
}

.import-preview__counts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.import-preview__actions {
  display: flex;
  gap: 8px;
}

.maintain-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.maintain-note {
  margin: 12px 0 0;
  font-size: 12px;
}
</style>
