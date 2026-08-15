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

import { registerI18n, translate, useI18nStore, type Lang } from "@/i18n"
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
    // 词典随注册注入宿主 i18n（第三方插件可自带三语词典）
    if (f.i18n) registerI18n(f.i18n)
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
  ensureI18nBridge()
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

/** 宿主全局 i18n 桥（通用协议，与任何具体插件解耦）：
 *
 * 第三方 frontend.js 无法 import 宿主模块，需要感知当前界面语言/取词条时
 * 经 window.MetaPilotI18n：
 * - getLang(): 当前界面语言（zh-CN / zh-TW / en）；
 * - translate(key, params?): 取词条（含插件经 registerI18n 注入的词典）；
 * - subscribe(fn): 订阅界面语言变化（返回取消订阅函数）。
 */
export function ensureI18nBridge() {
  if (!window.MetaPilotI18n) {
    window.MetaPilotI18n = {
      getLang: () => useI18nStore.getState().lang,
      translate: (key: string, params?: Record<string, string | number>) => translate(key, params),
      subscribe: (fn: (lang: Lang) => void) => useI18nStore.subscribe((s) => fn(s.lang)),
    }
  }
}

declare global {
  interface Window {
    MetaPilotPluginRegistry?: { register: (f: PluginFrontend) => void }
    MetaPilotI18n?: {
      getLang: () => Lang
      translate: (key: string, params?: Record<string, string | number>) => string
      subscribe: (fn: (lang: Lang) => void) => () => void
    }
    React?: unknown
  }
}
