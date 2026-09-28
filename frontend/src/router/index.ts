import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/halls'
  },
  {
    path: '/halls',
    name: 'hall-list',
    component: () => import('@/pages/HallList.vue'),
    meta: { title: '殿宇总览', icon: 'OfficeBuilding' }
  },
  {
    path: '/halls/:id/elements',
    name: 'element-detail',
    component: () => import('@/pages/ElementDetail.vue'),
    meta: { title: '构件与层位', icon: 'Grid' }
  },
  {
    path: '/decays',
    name: 'decay-board',
    component: () => import('@/pages/DecayBoard.vue'),
    meta: { title: '病害档案台', icon: 'WarningFilled' }
  },
  {
    path: '/repair',
    name: 'repair-plan',
    component: () => import('@/pages/RepairPlan.vue'),
    meta: { title: '修复工序', icon: 'Tools' }
  },
  {
    path: '/backup',
    name: 'backup-view',
    component: () => import('@/pages/BackupView.vue'),
    meta: { title: '本地数据与备份', icon: 'Coin' }
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/halls'
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 })
})

router.afterEach((to) => {
  const title = typeof to.meta.title === 'string' ? to.meta.title : '古建筑彩绘病害档案'
  document.title = `${title} · 古建筑彩绘病害档案`
})

export default router
