/** 前端插件运行时：第三方插件 frontend.js 动态加载、路由/导航运行时注册。
 *
 * 协议（docs/04-插件开发规范.md §前端 bundle）：
 * - 插件包 frontend/frontend.js 为 IIFE，使用宿主注入的全局 React（window.React）；
 * - 脚本内调用 window.MetaPilotPluginRegistry.register({ id, routes, navItems }) 注册前端能力；
 * - routes 的 Component 为 React 组件；navItems 的 icon 可为 lucide 图标名字符串（宿主动态解析），
 *   也可直接传组件。
 *
 * 官方插件前端仍静态内置（registry.ts builtinFrontends），第三方插件经本模块运行时注册，
 * App.tsx / AppLayout.tsx 合并内置与动态两部分路由与导航。
 */
import { create } from "zustand"

import type { PluginFrontend } from "./types"

interface PluginRuntimeState {
  /** 运行时注册的前端插件（id → 前端信息），仅含第三方/动态加载的插件 */
  frontends: Record<string, PluginFrontend>
  /** 已处理（加载成功/失败）的插件 id，避免重复加载 */
  settled: Record<string, boolean>
  register: (f: PluginFrontend) => void
  /** 动态加载插件 frontend.js 并等待脚本执行（脚本内自行 register） */
  load: (id: string, url: string) => Promise<void>
}

export const usePluginRuntime = create<PluginRuntimeState>((set, get) => ({
  frontends: {},
  settled: {},

  register: (f) => {
    if (!f?.id) return
    set((s) => ({ frontends: { ...s.frontends, [f.id]: f } }))
  },

  load: async (id, url) => {
    if (get().settled[id]) return
    set((s) => ({ settled: { ...s.settled, [id]: true } }))
    ensurePluginRegistry()
    await new Promise<void>((resolve) => {
      const script = document.createElement("script")
      script.src = url
      script.async = true
      script.onload = () => resolve()
      script.onerror = () => {
        console.error(`[plugins] 前端 bundle 加载失败: ${id} (${url})`)
        resolve()
      }
      document.head.appendChild(script)
    })
  },
}))

/** 全局注册入口：frontend.js 内调用 window.MetaPilotPluginRegistry.register(...) */
export function ensurePluginRegistry() {
  if (!window.MetaPilotPluginRegistry) {
    window.MetaPilotPluginRegistry = {
      register: (f) => usePluginRuntime.getState().register(f),
    }
  }
  // 供第三方 bundle 使用宿主 React（frontend.js 内 const { React } = window）
  if (!window.React) {
    // 延迟引入避免循环依赖：React 由 main.tsx 提前注入，这里仅兜底
    void import("react").then((m) => {
      const React = (m as { default?: unknown }).default ?? m
      window.React = React
    })
  }
}

declare global {
  interface Window {
    MetaPilotPluginRegistry?: { register: (f: PluginFrontend) => void }
    React?: unknown
  }
}
