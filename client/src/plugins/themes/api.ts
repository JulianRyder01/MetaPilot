/** 主题插件 API 客户端（docs/04 §6）。 */
import { request, type ThemeDef } from "@/lib/api"

export const listThemes = () => request<ThemeDef[]>("/plugins/themes")
