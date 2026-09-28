<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Coin, Grid, OfficeBuilding, Tools, WarningFilled } from '@element-plus/icons-vue'
import { useHallStore } from '@/stores/hallStore'
import { useRepairStore } from '@/stores/repairStore'

const route = useRoute()
const router = useRouter()
const hallStore = useHallStore()
const repairStore = useRepairStore()

const navItems = computed(() => {
  const currentHallId = hallStore.currentHallId
  return [
    { path: '/halls', label: '殿宇总览', icon: OfficeBuilding, badge: String(hallStore.halls.length) },
    {
      path: currentHallId ? `/halls/${currentHallId}/elements` : '/halls',
      label: '构件与层位',
      icon: Grid,
      badge: String(hallStore.elements.length),
      disabled: !currentHallId
    },
    { path: '/decays', label: '病害档案台', icon: WarningFilled, badge: String(hallStore.totalUnrepaired) },
    { path: '/repair', label: '修复工序', icon: Tools, badge: String(repairStore.totalSteps) },
    { path: '/backup', label: '本地数据', icon: Coin, badge: '' }
  ]
})

const activePath = computed(() => {
  if (route.path.startsWith('/halls/')) return `/halls/${route.params.id}/elements`
  return route.path
})

function go(path: string): void {
  void router.push(path)
}
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="app-header__brand">
        <span class="app-header__mark">彩</span>
        <div>
          <h1 class="app-header__title">古建筑彩绘病害档案</h1>
          <p class="app-header__sub">殿宇 · 构件 · 层位 · 病害 · 修复工序</p>
        </div>
      </div>
      <nav class="app-nav">
        <button
          v-for="item in navItems"
          :key="item.label"
          class="app-nav__item"
          :class="{ 'is-active': activePath === item.path, 'is-disabled': item.disabled }"
          type="button"
          :disabled="item.disabled"
          @click="go(item.path)"
        >
          <el-icon><component :is="item.icon" /></el-icon>
          <span>{{ item.label }}</span>
          <em v-if="item.badge" class="app-nav__badge">{{ item.badge }}</em>
        </button>
      </nav>
    </header>

    <main class="app-main">
      <router-view v-slot="{ Component }">
        <component :is="Component" />
      </router-view>
    </main>

    <footer class="app-footer">
      <span>数据仅存于本浏览器（IndexedDB / localStorage），不上传任何服务器。</span>
      <span>当前殿宇：{{ hallStore.currentHall ? hallStore.currentHall.name : '未选择' }}</span>
    </footer>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.app-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 24px;
  background: linear-gradient(120deg, #4b3226 0%, #6d4a30 60%, #8a5a2b 100%);
  color: #f6efe4;
}

.app-header__brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.app-header__mark {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.3);
  font-size: 20px;
  font-weight: 700;
}

.app-header__title {
  margin: 0;
  font-size: 18px;
  letter-spacing: 2px;
}

.app-header__sub {
  margin: 2px 0 0;
  font-size: 12px;
  letter-spacing: 1px;
  color: rgba(246, 239, 228, 0.75);
}

.app-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.app-nav__item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  color: #f6efe4;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.18s ease;
}

.app-nav__item:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.16);
}

.app-nav__item.is-active {
  background: #f6efe4;
  color: #6d4a30;
  font-weight: 600;
}

.app-nav__item.is-disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.app-nav__badge {
  font-style: normal;
  font-size: 11px;
  padding: 0 6px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.18);
}

.app-main {
  flex: 1;
  width: 100%;
  max-width: 1320px;
  margin: 0 auto;
  padding: 20px 24px 32px;
}

.app-footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 24px 20px;
  font-size: 12px;
  color: #8c8479;
}
</style>
