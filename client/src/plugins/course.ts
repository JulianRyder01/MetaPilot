/** 课程插件（official）：课程页路由 + 统计导航 + 扩展点（块渲染器/课程导入 tab/集合创建转换）。 */
import { BarChart3 } from "lucide-react"
import type { ComponentType } from "react"

import CoursePage from "@/pages/CoursePage"
import StatsPage from "@/pages/StatsPage"
import { CourseImportTab } from "./course/importTab"
import {
  renderChoice,
  renderFillBlank,
  renderShortAnswer,
  renderInteractive,
} from "./course/renderers"

import type { PluginBlockRendererProps, PluginFrontend } from "./types"

export const coursePlugin: PluginFrontend = {
  id: "course",
  routes: [
    { path: "/course/:cid", Component: CoursePage },
    { path: "/stats", Component: StatsPage },
  ],
  navItems: [{ to: "/stats", label: "nav.stats", icon: BarChart3 }],
  // 扩展点：题目/交互块渲染（核心 BlockRenderer 按块类型查，不写死 course）
  blockRenderers: {
    single_choice: renderChoice as ComponentType<PluginBlockRendererProps>,
    multiple_choice: renderChoice as ComponentType<PluginBlockRendererProps>,
    fill_blank: renderFillBlank as ComponentType<PluginBlockRendererProps>,
    short_answer: renderShortAnswer as ComponentType<PluginBlockRendererProps>,
    interactive: renderInteractive as ComponentType<PluginBlockRendererProps>,
  },
  // 扩展点：导入对话框的课程包 tab（核心 ImportDialog 渲染插槽）
  importTabs: [
    { id: "course", label: "core.library.tabCourse", Component: CourseImportTab },
  ],
}
