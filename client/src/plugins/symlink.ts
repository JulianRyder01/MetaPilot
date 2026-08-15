/** 软链接插件（official）：文件浏览器页路由 + 「我的库」页挂载分区扩展点。
 *
 * 顶栏不占用入口：挂载分区经 librarySections 扩展点集成在「我的库」页，
 * 点击挂载跳转文件浏览器页 /files?mount=id（FilesPage 本插件提供）。
 */
import FilesPage from "@/pages/FilesPage"
import { SymlinkLibrarySection } from "./symlink/librarySection"

import type { PluginFrontend } from "./types"

export const symlinkPlugin: PluginFrontend = {
  id: "symlink",
  routes: [{ path: "/files", Component: FilesPage }],
  // 扩展点：「我的库」页的挂载分区（核心 LibraryHome 渲染插槽，不写死 symlink）
  librarySections: [{ id: "symlink-mounts", Component: SymlinkLibrarySection }],
}
