/** 前端插件注册表类型定义（docs/04-插件开发规范.md §6）。 */
import type { ComponentType } from "react"
import type { LucideIcon } from "lucide-react"

/** 插件贡献的顶栏导航项（仅插件启用时显示） */
export interface PluginNavItem {
  /** 导航目标路由 */
  to: string
  /** 导航显示名 */
  label: string
  icon: LucideIcon
}

/** 插件贡献的页面路由（渲染在 AppLayout 之下） */
export interface PluginRoute {
  path: string
  /** 页面组件（App.tsx 渲染时才创建元素，避免模块顶层建元素） */
  Component: ComponentType
}

/** 插件前端注册信息：id 与后端 plugin.json 的 id 一致 */
export interface PluginFrontend {
  id: string
  /** 插件贡献的路由 */
  routes?: PluginRoute[]
  /** 插件贡献的顶栏导航项 */
  navItems?: PluginNavItem[]
}
