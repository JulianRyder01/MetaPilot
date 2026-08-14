/** 主题插件（official）：无独立页面与顶栏导航。
 *
 * 主题能力经「右上角主题面板 / 设置页」内置入口提供（ThemeToggle / ThemeSelector），
 * 数据源为 GET /api/plugins/themes（见 lib/api.ts listThemes）。
 */
import type { PluginFrontend } from "./types"

export const themesPlugin: PluginFrontend = {
  id: "themes",
}
