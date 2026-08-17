/** 软链接插件（official）：「我的库」页挂载分区扩展点。
 *
 * 软链接视为库：在「我的库」页直接浏览（MountBrowser 视图），不再有独立文件浏览器页（/files 已废弃）。
 */
import { SymlinkLibrarySection } from "./symlink/librarySection"

import type { PluginFrontend } from "./types"

export const symlinkPlugin: PluginFrontend = {
  id: "symlink",
  routes: [],
  // 扩展点：「我的库」页的挂载分区（核心 LibraryHome 渲染插槽，不写死 symlink）
  librarySections: [{ id: "symlink-mounts", Component: SymlinkLibrarySection }],
}
