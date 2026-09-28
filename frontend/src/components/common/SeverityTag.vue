<script setup lang="ts">
import { computed } from 'vue'
import { CircleCloseFilled, SuccessFilled, WarningFilled } from '@element-plus/icons-vue'
import type { Severity } from '@/types/decay'
import { SEVERITY_BG, SEVERITY_COLOR, SEVERITY_ICON } from '@/utils/severity'

const props = withDefaults(
  defineProps<{
    severity: Severity
    /** 是否显示图标 */
    icon?: boolean
    /** 是否显示面积，传入平方厘米 */
    areaCm2?: number
    /** 尺寸 */
    size?: 'default' | 'small' | 'large'
    /** 是否使用描边风格 */
    plain?: boolean
  }>(),
  {
    icon: true,
    areaCm2: undefined,
    size: 'default',
    plain: false
  }
)

const iconComponent = computed(() => {
  const name = SEVERITY_ICON[props.severity]
  if (name === 'CircleCloseFilled') return CircleCloseFilled
  if (name === 'WarningFilled') return WarningFilled
  return SuccessFilled
})

const style = computed(() => ({
  color: props.plain ? SEVERITY_COLOR[props.severity] : '#ffffff',
  backgroundColor: props.plain ? SEVERITY_BG[props.severity] : SEVERITY_COLOR[props.severity],
  borderColor: SEVERITY_COLOR[props.severity]
}))

const areaText = computed(() => {
  if (props.areaCm2 === undefined) return ''
  const value = props.areaCm2
  if (value >= 10000) return `${(value / 10000).toFixed(2)} m²`
  if (value >= 100) return `${(value / 100).toFixed(2)} dm²`
  return `${value} cm²`
})
</script>

<template>
  <span class="severity-tag" :class="[`is-${size}`, { 'is-plain': plain }]" :style="style">
    <el-icon v-if="icon" class="severity-tag__icon">
      <component :is="iconComponent" />
    </el-icon>
    <span class="severity-tag__text">{{ severity }}</span>
    <span v-if="areaText" class="severity-tag__area">· {{ areaText }}</span>
  </span>
</template>

<style scoped>
.severity-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 10px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 13px;
  font-weight: 600;
  line-height: 20px;
  white-space: nowrap;
}

.severity-tag.is-small {
  padding: 0 8px;
  font-size: 12px;
  line-height: 18px;
}

.severity-tag.is-large {
  padding: 4px 14px;
  font-size: 15px;
  line-height: 24px;
}

.severity-tag__icon {
  font-size: 13px;
}

.severity-tag__area {
  font-weight: 400;
  opacity: 0.9;
}
</style>
