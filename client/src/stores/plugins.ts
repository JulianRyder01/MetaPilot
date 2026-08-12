import { create } from "zustand"
import { api, type PluginInfo } from "@/lib/api"

interface PluginsState {
  plugins: PluginInfo[]
  loaded: boolean
  refresh: () => Promise<void>
  /** 切换插件启用状态并同步本地缓存 */
  setEnabled: (id: string, enabled: boolean) => Promise<void>
  /** 查询插件是否启用（未加载时先加载） */
  isEnabled: (id: string) => boolean
}

export const usePluginsStore = create<PluginsState>((set, get) => ({
  plugins: [],
  loaded: false,

  refresh: async () => {
    const plugins = await api.listPlugins()
    set({ plugins, loaded: true })
  },

  setEnabled: async (id, enabled) => {
    const updated = await api.setPluginEnabled(id, enabled)
    set({
      plugins: get().plugins.map((p) => (p.id === id ? updated : p)),
    })
  },

  isEnabled: (id) => {
    const found = get().plugins.find((p) => p.id === id)
    return found ? found.enabled : true // 未加载/未知插件默认视为启用
  },
}))

/** 确保插件列表已加载（在页面/组件中使用） */
export function ensurePluginsLoaded() {
  const { loaded, refresh } = usePluginsStore.getState()
  if (!loaded) {
    refresh().catch(() => {})
  }
}
