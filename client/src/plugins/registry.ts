/** 前端插件注册表（docs/04-插件开发规范.md §6）。
 *
 * 各插件在 client/src/plugins/<plugin_id>.ts 登记前端信息（路由/导航），
 * 本文件汇总后供 App.tsx（路由）与 AppLayout.tsx（导航）自动读取。
 */
import { coursePlugin } from "./course"
import { themesPlugin } from "./themes"
import { symlinkPlugin } from "./symlink"
import type { PluginFrontend, PluginNavItem } from "./types"

/** 全部前端插件（顺序即展示顺序：course → themes → symlink） */
export const pluginFrontends: PluginFrontend[] = [
  coursePlugin,
  themesPlugin,
  symlinkPlugin,
]

/** 插件贡献的路由（App.tsx 渲染在 AppLayout 之下） */
export const pluginRoutes = pluginFrontends.flatMap((p) => p.routes ?? [])

/** 插件贡献的顶栏导航项（带 pluginId，AppLayout 按插件启用状态过滤显示） */
export const pluginNavItems: (PluginNavItem & { pluginId: string })[] = pluginFrontends.flatMap(
  (p) => (p.navItems ?? []).map((n) => ({ ...n, pluginId: p.id })),
)
