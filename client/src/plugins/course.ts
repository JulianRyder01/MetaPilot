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
    { path: "/course/:cid", element: <CoursePage /> },
    { path: "/learn/:cid/:sid", element: <LearnPage /> },
    { path: "/edit/:cid", element: <EditPage /> },
    { path: "/stats", element: <StatsPage /> },
  ],
  navItems: [{ to: "/stats", label: "统计", icon: BarChart3 }],
}
