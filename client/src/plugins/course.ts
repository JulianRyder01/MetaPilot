/** 课程插件（official）：学习页路由 + 统计导航。 */
import { BarChart3 } from "lucide-react"

import CoursePage from "@/pages/CoursePage"
import LearnPage from "@/pages/LearnPage"
import EditPage from "@/pages/EditPage"
import StatsPage from "@/pages/StatsPage"

import type { PluginFrontend } from "./types"

export const coursePlugin: PluginFrontend = {
  id: "course",
  routes: [
    { path: "/course/:cid", Component: CoursePage },
    { path: "/learn/:cid/:sid", Component: LearnPage },
    { path: "/edit/:cid", Component: EditPage },
    { path: "/stats", Component: StatsPage },
  ],
  navItems: [{ to: "/stats", label: "nav.stats", icon: BarChart3 }],
}
