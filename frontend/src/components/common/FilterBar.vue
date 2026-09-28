<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Refresh, Search } from '@element-plus/icons-vue'

export interface FilterSelectOption {
  label: string
  value: string
}

export interface FilterSelectConfig {
  /** query key，同时作为组件内唯一标识 */
  key: string
  label: string
  options: FilterSelectOption[]
  placeholder?: string
  /** 多选（默认）或单选 */
  multiple?: boolean
}

export interface FilterModel {
  keyword: string
  [key: string]: string | string[] | boolean
}
const props = withDefaults(
  defineProps<{
    modelValue: FilterModel
    selects?: FilterSelectConfig[]
    /** 关键字输入占位文案 */
    keywordPlaceholder?: string
    /** 展示在右侧的附加开关，如「仅看未修复」 */
    switchLabel?: string
    switchValue?: boolean
    /** 是否渲染附加开关 */
    hasSwitch?: boolean
    showReset?: boolean
  }>(),
  {
    selects: () => [],
    keywordPlaceholder: '搜索关键字…',
    switchLabel: '',
    switchValue: false,
    hasSwitch: false,
    showReset: true
  }
)

const emit = defineEmits<{
  (event: 'update:modelValue', value: FilterModel): void
  (event: 'update:switchValue', value: boolean): void
  (event: 'change', value: FilterModel): void
  (event: 'reset'): void
}>()

const keyword = ref(props.modelValue.keyword ?? '')

watch(
  () => props.modelValue,
  (value) => {
    keyword.value = value.keyword ?? ''
  },
  { deep: true }
)

const activeCount = computed(() => {
  const entries = Object.entries(props.modelValue).filter(([key]) => key !== 'keyword')
  return entries.reduce((sum, [, value]) => {
    if (Array.isArray(value)) return sum + value.length
    if (typeof value === 'string' && value.length > 0) return sum + 1
    if (typeof value === 'boolean' && value) return sum + 1
    return sum
  }, 0)
})

function emitChange(next: FilterModel): void {
  emit('update:modelValue', next)
  emit('change', next)
}

function handleKeywordInput(value: string): void {
  keyword.value = value
  emitChange({ ...props.modelValue, keyword: value })
}

function handleSelect(key: string, value: string | string[]): void {
  emitChange({ ...props.modelValue, [key]: value })
}

function handleSwitch(value: boolean): void {
  emit('update:switchValue', value)
  emitChange({ ...props.modelValue, [props.switchLabel || 'switch']: value })
}

function handleReset(): void {
  const cleared: FilterModel = { keyword: '' }
  props.selects.forEach((select) => {
    cleared[select.key] = select.multiple === false ? '' : []
  })
  if (props.hasSwitch) cleared[props.switchLabel || 'switch'] = false
  keyword.value = ''
  emit('update:modelValue', cleared)
  emit('change', cleared)
  if (props.hasSwitch) emit('update:switchValue', false)
  emit('reset')
}

function valueOf(key: string): string | string[] {
  const value = props.modelValue[key]
  if (Array.isArray(value)) return value
  return typeof value === 'string' ? value : ''
}
</script>

<template>
  <div class="filter-bar">
    <div class="filter-bar__main">
      <el-input
        :model-value="keyword"
        class="filter-bar__keyword"
        :placeholder="keywordPlaceholder"
        clearable
        @update:model-value="handleKeywordInput"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>

      <div v-for="select in selects" :key="select.key" class="filter-bar__select">
        <span class="filter-bar__label">{{ select.label }}</span>
        <el-select
          :model-value="valueOf(select.key)"
          :multiple="select.multiple !== false"
          :collapse-tags="select.multiple !== false"
          collapse-tags-tooltip
          clearable
          :placeholder="select.placeholder ?? `选择${select.label}`"
          class="filter-bar__control"
          @update:model-value="(value: string | string[]) => handleSelect(select.key, value)"
        >
          <el-option
            v-for="option in select.options"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>
      </div>

      <div v-if="hasSwitch" class="filter-bar__switch">
        <el-switch
          :model-value="switchValue"
          :active-text="switchLabel"
          inline-prompt
          @update:model-value="handleSwitch"
        />
      </div>

      <slot name="extra" />
    </div>

    <div class="filter-bar__side">
      <slot name="actions" />
      <el-tag v-if="activeCount > 0" type="warning" effect="plain" round>
        {{ activeCount }} 项条件
      </el-tag>
      <el-button v-if="showReset" :icon="Refresh" text type="primary" @click="handleReset">
        重置
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.filter-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  background: #ffffff;
  border: 1px solid #e6e0d6;
  border-radius: 10px;
}

.filter-bar__main {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  flex: 1 1 520px;
}

.filter-bar__side {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-bar__keyword {
  width: 220px;
}

.filter-bar__label {
  margin-right: 6px;
  font-size: 13px;
  color: #6b6257;
}

.filter-bar__select {
  display: flex;
  align-items: center;
}

.filter-bar__control {
  width: 180px;
}
</style>
