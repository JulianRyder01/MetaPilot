/** 主题插件（official）：无独立页面与顶栏导航。
 *
 * 主题能力经扩展点提供：themeSections 在「主题选择面板」渲染特色主题列表，
 * 数据源为 GET /api/plugins/themes（见 lib/api.ts listThemes）。
 */
import { FeaturedThemes } from "./themes/featuredThemes"

import type { PluginFrontend } from "./types"

export const themesPlugin: PluginFrontend = {
  id: "themes",
  // 扩展点：核心 ThemeSelector 渲染的「特色主题」分区（核心不写死 themes 插件）
  themeSections: [{ id: "themes-featured", Component: FeaturedThemes }],
}
