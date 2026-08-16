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

/** 集合转换操作涉及的集合最小信息（库列表返回的精简集合，避免核心向插件暴露完整数据结构） */
export interface FolderRef {
  id: string
  name: string
  kind: string
}

/** 集合操作上下文：核心向插件注入的库级能力（回调内真实调用后端 API，禁止 mock） */
export interface CollectionActionCtx {
  libraryId: string
  refresh: () => void
  navigate: (to: string) => void
  /** 填空弹窗（取消返回 null）：插件新建集合等命名交互 */
  prompt: (options: {
    title: string
    placeholder?: string
    initialValue?: string
    confirmText?: string
    cancelText?: string
  }) => Promise<string | null>
  /** 确认弹窗：插件执行不可逆操作（如转换）前确认 */
  confirm: (options: {
    title: string
    description?: string
    confirmText?: string
    destructive?: boolean
  }) => Promise<boolean>
}

/** 「我的库」页集合创建/转换操作扩展点（插件向库首页注入新建按钮与集合转换操作）。
 *
 * - create*：库首页操作区的新建按钮（label 为 i18n key，icon 为 lucide 图标名字符串）；
 * - convert*：文件夹卡片上的转换操作（canConvert 返回 true 才显示）；
 * - 回调真实调用后端 API（禁止 mock），完成后调用 ctx.refresh() 刷新列表。
 */
export interface PluginCollectionAction {
  id: string
  /** 新建按钮文案（i18n key） */
  createLabel?: string
  /** 新建按钮图标（lucide 图标名，宿主动态解析） */
  createIcon?: string
  onCreate?: (ctx: CollectionActionCtx) => void
  /** 转换操作文案（i18n key） */
  convertLabel?: string
  /** 转换操作图标（lucide 图标名） */
  convertIcon?: string
  /** 某集合是否可执行转换（false 则不显示转换操作） */
  canConvert?: (col: FolderRef) => boolean
  onConvert?: (col: FolderRef, ctx: CollectionActionCtx) => void
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
  /** 扩展点：「我的库」页集合创建/转换操作（新建按钮 + 集合转换） */
  collectionActions?: PluginCollectionAction[]
  /** 扩展点：设置页贡献的分区 */
  settingsSections?: PluginSettingsSection[]
  /** 扩展点：主题选择面板贡献的分区 */
  themeSections?: PluginThemeSection[]
  /** 词典（第三方 frontend.js 可注入，覆盖/补充宿主词典） */
  i18n?: Partial<Record<Lang, Record<string, string>>>
}
