import { Route, Routes } from "react-router-dom"

import AppLayout from "@/components/layout/AppLayout"
import LibraryHome from "@/pages/LibraryHome"
import LibraryDetail from "@/pages/LibraryDetail"
import CanvasPage from "@/pages/CanvasPage"
import LearnPage from "@/pages/LearnPage"
import EditPage from "@/pages/EditPage"
import PluginsPage from "@/pages/PluginsPage"
import SettingsPage from "@/pages/SettingsPage"
import { allPluginRoutes, usePluginRuntimeFrontends } from "@/plugins/registry"

export default function App() {
  // 内置官方插件路由 + 第三方插件运行时动态注册的路由（frontend.js）
  const dynamic = usePluginRuntimeFrontends()
  const pluginRoutes = allPluginRoutes(dynamic)

  return (
    <Routes>
      <Route element={<AppLayout />}>
        {/* 核心路由：文档库与系统页面 */}
        <Route path="/" element={<LibraryHome />} />
        <Route path="/library/:lid" element={<LibraryDetail />} />
        <Route path="/plugins" element={<PluginsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        {/* 图表画布（.mpf canvas 类型，官方核心） */}
        <Route path="/canvas/:cid" element={<CanvasPage />} />
        {/* 文档阅读/编辑（库-文件夹-文档-小节，官方核心能力）：
            课程等补丁类型在此基础上叠加插件能力（进度/判题/交互块），禁用插件时仍可阅读/编辑文档结构 */}
        <Route path="/learn/:cid/:sid" element={<LearnPage />} />
        <Route path="/edit/:cid" element={<EditPage />} />
        {/* 插件路由：内置 + 第三方运行时注册，自动收集 */}
        {pluginRoutes.map((r) => (
          <Route key={r.path} path={r.path} element={<r.Component />} />
        ))}
      </Route>
    </Routes>
  )
}
