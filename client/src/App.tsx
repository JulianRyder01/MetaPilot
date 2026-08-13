import { Route, Routes } from "react-router-dom"

import AppLayout from "@/components/layout/AppLayout"
import LibraryHome from "@/pages/LibraryHome"
import LibraryDetail from "@/pages/LibraryDetail"
import CoursePage from "@/pages/CoursePage"
import LearnPage from "@/pages/LearnPage"
import StatsPage from "@/pages/StatsPage"
import KnowledgeBasePage from "@/pages/KnowledgeBasePage"
import PluginsPage from "@/pages/PluginsPage"
import SettingsPage from "@/pages/SettingsPage"
import FilesPage from "@/pages/FilesPage"
import EditPage from "@/pages/EditPage"

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<LibraryHome />} />
        <Route path="/library/:lid" element={<LibraryDetail />} />
        <Route path="/course/:cid" element={<CoursePage />} />
        <Route path="/learn/:cid/:sid" element={<LearnPage />} />
        <Route path="/edit/:cid" element={<EditPage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/kb" element={<KnowledgeBasePage />} />
        <Route path="/plugins" element={<PluginsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/files" element={<FilesPage />} />
      </Route>
    </Routes>
  )
}
