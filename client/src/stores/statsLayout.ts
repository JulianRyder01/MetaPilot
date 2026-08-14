import { create } from "zustand"
import { persist } from "zustand/middleware"

export type WidgetSize = "sm" | "md" | "lg" | "xl"

interface StatsLayoutState {
  /** widgetId -> 是否可见 */
  visible: Record<string, boolean>
  /** widgetId -> 尺寸 */
  size: Record<string, WidgetSize>
  /** 显示顺序 */
  order: string[]
  setVisible: (id: string, v: boolean) => void
  setSize: (id: string, size: WidgetSize) => void
  setOrder: (order: string[]) => void
  /** 依据当前可用组件合并默认布局（新组件默认可见、追加到末尾，移除不存在的） */
  syncWidgets: (widgets: { id: string; defaultSize?: string }[]) => void
}

/** 统计页组件布局偏好（本地持久化）。 */
export const useStatsLayoutStore = create<StatsLayoutState>()(
  persist(
    (set) => ({
      visible: {},
      size: {},
      order: [],
      setVisible: (id, v) => set((s) => ({ visible: { ...s.visible, [id]: v } })),
      setSize: (id, size) => set((s) => ({ size: { ...s.size, [id]: size } })),
      setOrder: (order) => set({ order }),
      syncWidgets: (widgets) =>
        set((s) => {
          const ids = new Set(widgets.map((w) => w.id))
          const visible = { ...s.visible }
          const size = { ...s.size }
          const order = [...s.order]
          let dirty = false
          for (const w of widgets) {
            if (!(w.id in visible)) {
              visible[w.id] = true
              dirty = true
            }
            if (!size[w.id]) {
              size[w.id] = (w.defaultSize as WidgetSize) || "md"
              dirty = true
            }
            if (!order.includes(w.id)) {
              order.push(w.id)
              dirty = true
            }
          }
          for (const id of [...order]) {
            if (!ids.has(id)) {
              delete visible[id]
              delete size[id]
              order.splice(order.indexOf(id), 1)
              dirty = true
            }
          }
          return dirty ? { visible, size, order } : {}
        }),
    }),
    { name: "metapilot-stats-layout" },
  ),
)
