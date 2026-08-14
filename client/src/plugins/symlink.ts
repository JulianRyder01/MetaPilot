/** 软链接插件（official）：文件浏览器页路由。
 *
 * 顶栏不占用入口：软链接挂载分区已集成在「我的库」页（LibraryHome），
 * 文件浏览器页经挂载分区/文件软链接跳转进入。
 */
import FilesPage from "@/pages/FilesPage"

import type { PluginFrontend } from "./types"

export const symlinkPlugin: PluginFrontend = {
  id: "symlink",
  routes: [{ path: "/files", Component: FilesPage }],
}
