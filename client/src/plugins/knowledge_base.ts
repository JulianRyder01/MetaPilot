/** 个人知识库插件（official）：AI 知识库页路由 + 导航。 */
import { Rocket } from "lucide-react"

import KnowledgeBasePage from "@/pages/KnowledgeBasePage"

import type { PluginFrontend } from "./types"

export const knowledgeBasePlugin: PluginFrontend = {
  id: "knowledge_base",
  routes: [{ path: "/kb", Component: KnowledgeBasePage }],
  navItems: [{ to: "/kb", label: "AI 知识库", icon: Rocket }],
}
