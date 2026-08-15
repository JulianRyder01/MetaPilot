/** 前端插件注册表类型定义（docs/04-插件开发规范.md §6）。 */
import type { ComponentType } from "react"
import type { LucideIcon } from "lucide-react"
import type { Block } from "@/lib/api"
import type { Lang } from "@/i18n"

/** 插件贡献的顶栏导航项（仅插件启用时显示） */
export interface PluginNavItem {
  /** 导航目标路由 */
  to: string
  /** 导航显示名 */
  label: string
  /** 图标：lucide 组件或图标名字符串（第三方 bundle 用字符串名，宿主动态解析） */
  icon: LucideIcon | string
}

/** 插件贡献的页面路由（渲染在 AppLayout 之下） */
export interface PluginRoute {
  path: string
  /** 页面组件（App.tsx 渲染时才创建元素，避免模块顶层建元素） */
  Component: ComponentType
}

/** 块渲染器 props（与核心 BlockRenderer 一致） */
export interface PluginBlockRendererProps {
  block: Block
  collectionId: string
}

/** 导入对话框贡献的 tab（如课程插件提供的课程包导入） */
export interface PluginImportTab {
  id: string
  label: string
  Component: ComponentType<{ libraryId?: string; onImported?: () => void }>
}

/** 「我的库」页贡献的分区（如软链接挂载区） */
export interface PluginLibrarySection {
  id: string
  Component: ComponentType
}

/** 设置页贡献的分区（如主题选装） */
export interface PluginSettingsSection {
  id: string
  title: string
  Component: ComponentType
}

/** 主题选择面板贡献的分区（如「主题」插件的特色主题列表） */
export interface PluginThemeSection {
  id: string
  Component: ComponentType
}

/** 插件前端注册信息：id 与后端 plugin.json 的 id 一致 */
export interface PluginFrontend {
  id: string
  /** 插件贡献的路由 */
  routes?: PluginRoute[]
  /** 插件贡献的顶栏导航项 */
  navItems?: PluginNavItem[]
  /** 扩展点：组件块渲染器（块类型 → 渲染组件），核心 BlockRenderer 据此渲染非 markdown 块 */
  blockRenderers?: Record<string, ComponentType<PluginBlockRendererProps>>
  /** 扩展点：导入对话框贡献的 tab */
  importTabs?: PluginImportTab[]
  /** 扩展点：「我的库」页贡献的分区 */
  librarySections?: PluginLibrarySection[]
  /** 扩展点：设置页贡献的分区 */
  settingsSections?: PluginSettingsSection[]
  /** 扩展点：主题选择面板贡献的分区 */
  themeSections?: PluginThemeSection[]
  /** 词典（第三方 frontend.js 可注入，覆盖/补充宿主词典） */
  i18n?: Partial<Record<Lang, Record<string, string>>>
}
