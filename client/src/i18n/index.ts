/** 轻量 i18n：三语（简体中文 / 繁体中文 / English）词典 + useT hook + 语言偏好持久化。
 *
 * 用法：
 *   const t = useT()
 *   t("common.save")                        // 取当前语言词条
 *   t("learn.duration", { min: 12 })        // 参数插值：{min} 被替换
 *
 * 词典按域拆分（locales/zh-CN/*.ts 等），zh-CN 为基础全量词典，
 * zh-TW / en 为覆盖层，缺失词条回退 zh-CN，再回退 key 本身。
 * 各插件/页面在自己的域文件中维护词条（key 前缀 = 域）。
 */
import { useMemo } from "react"
import { create } from "zustand"
import { persist } from "zustand/middleware"

import { en as enDict, zhCN as zhCNDict, zhTW as zhTWDict } from "./locales"

export type Lang = "zh-CN" | "zh-TW" | "en"

/** 支持的语言（value 与后端 locale 约定一致） */
export const LANGS: { value: Lang; native: string }[] = [
  { value: "zh-CN", native: "简体中文" },
  { value: "zh-TW", native: "繁體中文" },
  { value: "en", native: "English" },
]

// ---- 运行时词典（插件注册，动态注入；优先级高于内置词典，zh-TW/en 缺失回退 zh-CN） ----
const extraDicts: Record<Lang, Record<string, string>> = { "zh-CN": {}, "zh-TW": {}, "en": {} }

/** 插件注册词典（内置插件在注册模块内调用；第三方 frontend.js 经 window.MetaPilotPluginRegistry 注入）。 */
export function registerI18n(dicts: Partial<Record<Lang, Record<string, string>>>): void {
  for (const l of LANGS) {
    if (dicts[l.value]) Object.assign(extraDicts[l.value], dicts[l.value])
  }
}

interface I18nState {
  lang: Lang
  setLang: (lang: Lang) => void
}

/** 语言偏好（本地持久化） */
export const useI18nStore = create<I18nState>()(
  persist(
    (set) => ({
      lang: "zh-CN",
      setLang: (lang) => set({ lang }),
    }),
    { name: "metapilot-locale", version: 1 },
  ),
)

type Params = Record<string, string | number>

/** 取词条（无 hook 环境也可用：默认读当前语言偏好） */
export function translate(key: string, params?: Params, lang?: Lang): string {
  const l = lang ?? useI18nStore.getState().lang
  let tmpl: string | undefined
  if (l === "zh-CN") tmpl = extraDicts["zh-CN"][key] ?? zhCNDict[key]
  else if (l === "zh-TW") tmpl = extraDicts["zh-TW"][key] ?? extraDicts["zh-CN"][key] ?? zhTWDict[key] ?? zhCNDict[key]
  else tmpl = extraDicts["en"][key] ?? extraDicts["zh-CN"][key] ?? enDict[key] ?? zhCNDict[key]
  if (tmpl === undefined) return key
  if (!params) return tmpl
  return tmpl.replace(/\{(\w+)\}/g, (_, k: string) => (k in params ? String(params[k]) : `{${k}}`))
}

/** React hook：返回随语言变化而重渲染的 t 函数 */
export function useT() {
  const lang = useI18nStore((s) => s.lang)
  return useMemo(() => (key: string, params?: Params) => translate(key, params, lang), [lang])
}
