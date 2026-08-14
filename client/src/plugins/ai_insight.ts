/** AI 洞察插件（official）：AI 洞察页路由 + 导航。 */
import { Lightbulb } from "lucide-react"

import AiInsightPage from "@/pages/AiInsightPage"

import type { PluginFrontend } from "./types"

export const aiInsightPlugin: PluginFrontend = {
  id: "ai_insight",
  routes: [{ path: "/insight", Component: AiInsightPage }],
  navItems: [{ to: "/insight", label: "nav.insight", icon: Lightbulb }],
}
