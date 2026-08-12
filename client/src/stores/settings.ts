import { create } from "zustand"
import { persist } from "zustand/middleware"

interface SettingsState {
  /** 打开依赖已禁用插件的文档时，是否弹出警告气泡 */
  showPluginWarnings: boolean
  /** 插件未启用导致的操作报错，是否弹出错误气泡 */
  showPluginErrors: boolean
  setShowPluginWarnings: (v: boolean) => void
  setShowPluginErrors: (v: boolean) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      showPluginWarnings: true,
      showPluginErrors: true,
      setShowPluginWarnings: (v) => set({ showPluginWarnings: v }),
      setShowPluginErrors: (v) => set({ showPluginErrors: v }),
    }),
    { name: "metapilot-settings" },
  ),
)
