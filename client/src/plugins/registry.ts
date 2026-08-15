/** 前端插件注册表（docs/04-插件开发规范.md §6）。
 *
 * 两层结构：
 * - builtin：官方插件静态内置（course / ai_insight / themes / symlink），随 client 打包；
 * - 动态：第三方插件经 backend /api/plugins/<id>/frontend.js 运行时加载（runtime.ts），
 *   由 App.tsx / AppLayout.tsx 合并消费，真正「即插即用」。
 */
import { coursePlugin } from "./course"
import { knowledgeBasePlugin } from "./knowledge_base"
import { themesPlugin } from "./themes"
import { symlinkPlugin } from "./symlink"
import { usePluginRuntime } from "./runtime"
import type { PluginFrontend, PluginNavItem } from "./types"

/** 官方内置前端插件（顺序即展示顺序：course → knowledge_base → themes → symlink） */
export const builtinFrontends: PluginFrontend[] = [
  coursePlugin,
  knowledgeBasePlugin,
  themesPlugin,
  symlinkPlugin,
]

/** 内置插件贡献的路由（App.tsx 渲染在 AppLayout 之下） */
export const builtinRoutes = builtinFrontends.flatMap((p) => p.routes ?? [])

/** 内置插件贡献的顶栏导航项（带 pluginId，AppLayout 按插件启用状态过滤显示） */
export const builtinNavItems: (PluginNavItem & { pluginId: string })[] = builtinFrontends.flatMap(
  (p) => (p.navItems ?? []).map((n) => ({ ...n, pluginId: p.id })),
)

/** React hook：订阅运行时动态注册的第三方前端插件（id → 前端信息） */
export function usePluginRuntimeFrontends() {
  return usePluginRuntime((s) => s.frontends)
}

/** 全部前端插件（内置 + 动态），顺序：内置在前、动态在后 */
export function allFrontends(frontends: Record<string, PluginFrontend>): PluginFrontend[] {
  return [...builtinFrontends, ...Object.values(frontends)]
}

/** 全部插件路由（内置 + 动态） */
export function allPluginRoutes(frontends: Record<string, PluginFrontend>) {
  return [
    ...builtinRoutes,
    ...Object.values(frontends).flatMap((p) => p.routes ?? []),
  ]
}

/** 全部插件导航项（内置 + 动态，带 pluginId） */
export function allPluginNavItems(frontends: Record<string, PluginFrontend>) {
  return [
    ...builtinNavItems,
    ...Object.values(frontends).flatMap((p) =>
      (p.navItems ?? []).map((n) => ({ ...n, pluginId: p.id })),
    ),
  ]
}
