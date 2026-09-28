import { liveQuery } from 'dexie'
import { onScopeDispose, ref, shallowRef, type Ref } from 'vue'
import { db, createId } from '@/utils/db'

export type IdbRecord = { id: string; createdAt?: number; updatedAt?: number }

export interface UseIdbTableOptions<T extends IdbRecord> {
  /** 是否按 updatedAt 倒序，默认 true */
  sortByUpdatedAt?: boolean
  /** 是否在创建该 hook 时立即开始订阅，默认 true */
  immediate?: boolean
  /** 数据变化后的额外回调 */
  onChange?: (rows: T[]) => void
}

export interface UseIdbTableResult<T extends IdbRecord> {
  rows: Ref<T[]>
  loading: Ref<boolean>
  /** 是否已完成首次载入：用于区分「数据为空」与「尚未读取」 */
  ready: Ref<boolean>
  error: Ref<string | null>
  /** 手动刷新一次（非响应式场景使用） */
  refresh: () => Promise<void>
  /** 停止 liveQuery 订阅 */
  stop: () => void
  getById: (id: string) => Promise<T | undefined>
  list: () => Promise<T[]>
  create: (payload: NewRecord<T>, idPrefix?: string) => Promise<T>
  update: (id: string, patch: Partial<T>) => Promise<void>
  upsert: (row: T) => Promise<void>
  remove: (id: string) => Promise<void>
  bulkRemove: (ids: string[]) => Promise<void>
  bulkPut: (list: T[]) => Promise<void>
  clear: () => Promise<void>
}

/** 新增记录入参：id / 时间戳由封装层补齐 */
export type NewRecord<T extends IdbRecord> = Omit<T, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string
  createdAt?: number
  updatedAt?: number
}

/**
 * Dexie 单表增删改查 + liveQuery 响应式订阅封装。
 * 页面统一通过它读写 IndexedDB，避免组件内部直接触碰 Dexie 实例。
 */
export function useIdbTable<T extends IdbRecord>(
  tableSelector: (database: typeof db) => import('dexie').Table<T, string>,
  options: UseIdbTableOptions<T> = {}
): UseIdbTableResult<T> {
  const { sortByUpdatedAt = true, immediate = true, onChange } = options
  const table = tableSelector(db)

  const rows = ref([]) as Ref<T[]>
  const loading = ref(false)
  const ready = ref(false)
  const error = ref<string | null>(null)
  const subscription = shallowRef<{ unsubscribe: () => void } | null>(null)

  const applySort = (list: T[]): T[] => {
    if (!sortByUpdatedAt) return [...list]
    return [...list].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
  }

  const refresh = async (): Promise<void> => {
    loading.value = true
    try {
      rows.value = applySort(await table.toArray())
      error.value = null
      ready.value = true
      onChange?.(rows.value)
    } catch (err) {
      error.value = err instanceof Error ? err.message : '读取本地数据失败'
    } finally {
      loading.value = false
    }
  }

  const stop = (): void => {
    subscription.value?.unsubscribe()
    subscription.value = null
  }

  const create = async (payload: NewRecord<T>, idPrefix = 'row'): Promise<T> => {
    const now = Date.now()
    const record = {
      ...(payload as object),
      id: payload.id ?? createId(idPrefix),
      createdAt: payload.createdAt ?? now,
      updatedAt: payload.updatedAt ?? now
    } as T
    await table.put(record)
    return record
  }

  const update = async (id: string, patch: Partial<T>): Promise<void> => {
    await table.update(id, { ...patch, updatedAt: Date.now() } as never)
  }

  const upsert = async (row: T): Promise<void> => {
    await table.put({ ...row, updatedAt: Date.now() } as T)
  }

  const remove = async (id: string): Promise<void> => {
    await table.delete(id)
  }

  const bulkRemove = async (ids: string[]): Promise<void> => {
    await table.bulkDelete(ids)
  }

  const bulkPut = async (list: T[]): Promise<void> => {
    await table.bulkPut(list)
  }

  const clear = async (): Promise<void> => {
    await table.clear()
  }

  if (immediate) {
    const observable = liveQuery(async () => applySort(await table.toArray()))
    subscription.value = observable.subscribe({
      next: (list) => {
        rows.value = list
        error.value = null
        ready.value = true
        onChange?.(list)
      },
      error: (err: unknown) => {
        error.value = err instanceof Error ? err.message : '订阅本地数据失败'
      }
    })
    void refresh()
  }

  onScopeDispose(stop)

  return {
    rows,
    loading,
    ready,
    error,
    refresh,
    stop,
    getById: (id: string) => table.get(id),
    list: () => table.toArray(),
    create,
    update,
    upsert,
    remove,
    bulkRemove,
    bulkPut,
    clear
  }
}
