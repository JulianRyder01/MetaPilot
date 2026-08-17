/** 课程插件（official）：课程页路由 + 统计导航 + 扩展点（块渲染器/课程导入 tab/集合创建转换）。 */
import { BarChart3 } from "lucide-react"
import type { ComponentType } from "react"

import { toast } from "@/lib/toast"
import { translate } from "@/i18n"
import { api } from "@/lib/api"
import CoursePage from "@/pages/CoursePage"
import StatsPage from "@/pages/StatsPage"
import { CourseImportTab } from "./course/importTab"
import { convertCollection } from "./course/api"
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
  // 扩展点：库首页集合创建/转换操作（仅课程插件启用时显示）
  collectionActions: [
    {
      id: "new-course",
      createLabel: "course.library.newCourse",
      createIcon: "GraduationCap",
      onCreate: async ({ libraryId, refresh, navigate, prompt }) => {
        const name = await prompt({
          title: translate("course.library.newCourseTitle"),
          placeholder: translate("course.library.newCoursePlaceholder"),
          initialValue: translate("course.library.newCourseDefault"),
          // 「圈起 ?」帮助入口：跳转「使用教程」中如何制作课程的教程（course 插件自带教程）
          helpHref: "/tutorials#course-create-import",
          helpLabel: "course.library.newCourseHelp",
        })
        if (!name?.trim()) return
        try {
          const col = await api.createFolder(libraryId, {
            name: name.trim(),
            kind: "course",
            description: "",
            author: "",
            version: "1.0.0",
          })
          toast.success(translate("course.library.createdCourse"))
          await refresh()
          navigate(`/course/${col.id}`)
        } catch {
          toast.error(translate("course.library.createCourseFailed"))
        }
      },
    },
    {
      id: "to-course",
      convertLabel: "course.library.toCourse",
      convertIcon: "GraduationCap",
      // 图表与已是课程的不显示「转为课程」
      canConvert: (col) => col.kind !== "course" && col.kind !== "canvas",
      onConvert: async (col, { refresh, confirm }) => {
        const ok = await confirm({
          title: translate("course.library.toCourseTitle"),
          description: translate("course.library.toCourseDesc", { name: col.name }),
          confirmText: translate("course.library.toCourseConfirm"),
        })
        if (!ok) return
        try {
          await convertCollection(col.id)
          toast.success(translate("course.library.convertedCourse", { name: col.name }))
          await refresh()
        } catch {
          toast.error(translate("course.library.convertCourseFailed"))
        }
      },
    },
  ],
}
