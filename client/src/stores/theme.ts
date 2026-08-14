import { create } from "zustand"
import { persist } from "zustand/middleware"

import { type ThemeDef } from "@/lib/api"
import { listThemes } from "@/plugins/themes/api"

/**
 * 主题状态：黑夜/白天模式（核心功能，不依赖插件）+ 主题插件提供的特色主题。
 *
 * - mode 切换 html 的 .dark class（Tailwind 暗色变量），始终可用；
 * - themeId 由「主题」插件提供（后端 /api/plugins/themes），选中后把该主题的
 *   light/dark CSS 变量注入 documentElement，与 mode 叠加生效；
 * - themes 缓存自后端，插件禁用时保留本地缓存（未拉取到则退化为默认主题）。
 */

type Mode = "light" | "dark"

interface ThemeState {
  mode: Mode
  themeId: string | null
  themes: ThemeDef[]
  themesLoaded: boolean
  setMode: (mode: Mode) => void
  toggleMode: () => void
  setTheme: (themeId: string | null) => void
  /** 拉取「主题」插件提供的主题清单；force=true 时忽略已加载标记（启用/重新打开面板时用） */
  fetchThemes: (force?: boolean) => Promise<void>
}

/** 当前已注入的 CSS 变量名（切换主题/主题关闭时先移除） */
const injectedKeys = new Set<string>()

function applyToDom(s: Pick<ThemeState, "mode" | "themeId" | "themes">) {
  const root = document.documentElement
  root.classList.toggle("dark", s.mode === "dark")

  for (const key of injectedKeys) root.style.removeProperty(key)
  injectedKeys.clear()

  const theme = s.themes.find((t) => t.id === s.themeId)
  if (!theme) {
    // 主题不存在（缓存过期/被移除）：清除标记，退化为默认主题
    delete root.dataset.theme
    return
  }
  root.dataset.theme = theme.id
  const vars = theme.variables[s.mode]
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value)
    injectedKeys.add(key)
  }
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: "light",
      themeId: null,
      themes: [],
      themesLoaded: false,

      setMode: (mode) => set({ mode }),
      toggleMode: () => set({ mode: get().mode === "light" ? "dark" : "light" }),
      setTheme: (themeId) => set({ themeId }),

      fetchThemes: async (force = false) => {
        if (!force && get().themesLoaded) return
        try {
          const themes = await listThemes()
          set({ themes, themesLoaded: true })
        } catch {
          // 插件未启用（503）：request 层会按 showPluginErrors 设置弹提示；
          // 这里保留本地缓存，面板上显示「去启用插件」引导，缓存主题仍可切换
          set({ themesLoaded: true })
        }
      },
    }),
    {
      name: "metapilot-theme",
      // 主题数据缓存自后端，持久化以便离线/后端不可用时仍可应用
      partialize: (s) => ({ mode: s.mode, themeId: s.themeId, themes: s.themes }),
    },
  ),
)

// 任何状态变化（含 persist 恢复、fetchThemes 成功）都同步到 DOM
useThemeStore.subscribe((s) => applyToDom(s))

// 模块加载即应用一次（首帧前生效，避免暗色闪烁）
applyToDom(useThemeStore.getState())
