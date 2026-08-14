import { Route, Routes } from "react-router-dom"

import AppLayout from "@/components/layout/AppLayout"
import LibraryHome from "@/pages/LibraryHome"
import LibraryDetail from "@/pages/LibraryDetail"
import CanvasPage from "@/pages/CanvasPage"
import PluginsPage from "@/pages/PluginsPage"
import SettingsPage from "@/pages/SettingsPage"
import { pluginRoutes } from "@/plugins/registry"

export default function App() {
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
        {/* 插件路由：由前端插件注册表（client/src/plugins/registry.ts）自动收集 */}
        {pluginRoutes.map((r) => (
          <Route key={r.path} path={r.path} element={<r.Component />} />
        ))}
      </Route>
    </Routes>
  )
}
