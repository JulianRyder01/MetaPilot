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
 *
 * 动态扩充：第三方插件可经 registerLang() 注册新的界面语言（Globe 下拉 /
 * 设置页语言选择即时出现），并随 registerI18n() 注入该语言的界面词典；
 * 未覆盖词条回退简体中文。核心自身永不写死插件注册的语言。
 */
import { useMemo } from "react"
import { create } from "zustand"
import { persist } from "zustand/middleware"

import { en as enDict, zhCN as zhCNDict, zhTW as zhTWDict } from "./locales"

/** 界面语言：核心三语 + 插件经 registerLang 动态注册的语言（值为语言代码，如 ja/ko/fr…） */
export type Lang = "zh-CN" | "zh-TW" | "en" | (string & {})

/** 语言定义：value 为语言代码（与后端 locale 约定一致），native 为该语言自述名 */
export interface LangDef {
  value: string
  native: string
}

/** 核心内置语言（始终存在，不随插件增删而变） */
export const CORE_LANGS: LangDef[] = [
  { value: "zh-CN", native: "简体中文" },
  { value: "zh-TW", native: "繁體中文" },
  { value: "en", native: "English" },
]

/** 兼容旧引用：核心内置语言列表（动态扩充的语言请用 useLangs()/getAllLangs()） */
export const LANGS: LangDef[] = CORE_LANGS

// ---- 运行时词典（插件注册，动态注入；优先级高于内置词典，缺失回退 zh-CN） ----
const extraDicts: Record<string, Record<string, string>> = { "zh-CN": {}, "zh-TW": {}, "en": {} }

/** 插件注册词典（内置插件在注册模块内调用；第三方 frontend.js 经 window.MetaPilotI18n 注入）。
 *  支持任意语言键（含 registerLang 注册的动态语言）。 */
export function registerI18n(dicts: Partial<Record<Lang, Record<string, string>>>): void {
  for (const l of Object.keys(dicts) as Lang[]) {
    const d = dicts[l]
    if (!d) continue
    extraDicts[l] ??= {}
    Object.assign(extraDicts[l], d)
  }
}

interface I18nState {
  lang: Lang
  setLang: (lang: Lang) => void
  /** 插件动态注册的界面语言（不持久化：随插件加载而出现，插件删除即消失） */
  extraLangs: LangDef[]
}

/** 语言偏好（本地持久化，仅持久化 lang） */
export const useI18nStore = create<I18nState>()(
  persist(
    (set) => ({
      lang: "zh-CN",
      setLang: (lang) => set({ lang }),
      extraLangs: [],
    }),
    { name: "metapilot-locale", version: 1, partialize: (s) => ({ lang: s.lang }) },
  ),
)

/** 插件注册界面语言（value 唯一，重复注册幂等）；可附带该语言词典（等价于 registerI18n）。 */
export function registerLang(def: LangDef, dict?: Record<string, string>): void {
  const { extraLangs } = useI18nStore.getState()
  if (!extraLangs.some((l) => l.value === def.value)) {
    useI18nStore.setState({ extraLangs: [...extraLangs, def] })
  }
  if (dict) registerI18n({ [def.value]: dict })
}

/** React hook：全部可选语言 = 核心三语 + 插件动态注册的语言（顺序：核心在前、动态在后） */
export function useLangs(): LangDef[] {
  const extra = useI18nStore((s) => s.extraLangs)
  return useMemo(() => [...CORE_LANGS, ...extra], [extra])
}

/** 非组件环境取全部可选语言（与 useLangs 同序） */
export function getAllLangs(): LangDef[] {
  return [...CORE_LANGS, ...useI18nStore.getState().extraLangs]
}

type Params = Record<string, string | number>

/** 取词条（无 hook 环境也可用：默认读当前语言偏好）。
 *  查找链：该语言动态词典 → 该语言内置词典（仅核心三语有）→ zh-CN 动态词典 → zh-CN 内置词典 → key。 */
export function translate(key: string, params?: Params, lang?: Lang): string {
  const l = lang ?? useI18nStore.getState().lang
  const dyn = extraDicts[l]?.[key]
  if (dyn !== undefined) return dyn
  let tmpl: string | undefined
  if (l === "zh-CN") tmpl = zhCNDict[key]
  else if (l === "zh-TW") tmpl = zhTWDict[key] ?? zhCNDict[key]
  else if (l === "en") tmpl = enDict[key] ?? zhCNDict[key]
  if (tmpl !== undefined) return tmpl
  tmpl = extraDicts["zh-CN"]?.[key] ?? zhCNDict[key]
  if (tmpl === undefined) return key
  if (!params) return tmpl
  return tmpl.replace(/\{(\w+)\}/g, (_, k: string) => (k in params ? String(params[k]) : `{${k}}`))
}

/** React hook：返回随语言变化而重渲染的 t 函数 */
export function useT() {
  const lang = useI18nStore((s) => s.lang)
  return useMemo(() => (key: string, params?: Params) => translate(key, params, lang), [lang])
}
