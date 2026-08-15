/**
 * 世界语言插件前端 bundle（frontend/frontend.js）。
 *
 * 协议（docs/04-插件开发指南.md §6.2）：
 * - IIFE，使用宿主注入的全局 React（window.React）；
 * - 经 window.MetaPilotI18n（宿主通用 i18n 桥）感知当前界面语言 / 取词条 / 订阅语言切换；
 * - 语言数据由插件后端提供（/api/plugins/world_languages/languages），真实拉取，非 mock；
 * - 执行时调用 window.MetaPilotPluginRegistry.register(...) 注册路由/导航/词典。
 *
 * 展示格式：当前界面语言下的称呼（该语言的自称），如中文界面下「英语（English）」。
 */
(function () {
  "use strict"
  var React = window.React
  var h = React.createElement
  var I18N = window.MetaPilotI18n || null

  // 兜底词典：仅在宿主未提供 i18n 桥时使用；正常路径词条经 registerI18n 注入宿主词典。
  var FALLBACK = {
    "world-lang.nav": { "zh-CN": "语言", "zh-TW": "語言", "en": "Languages" },
    "world-lang.title": { "zh-CN": "世界语言", "zh-TW": "世界語言", "en": "World Languages" },
    "world-lang.subtitle": {
      "zh-CN": "按当前界面语言展示全世界主要语言：界面称呼 + 该语言本国人民的自称（autonym）。",
      "zh-TW": "依目前介面語言展示全世界主要語言：介面稱呼 + 該語言本國人民的自稱（autonym）。",
      "en": "All major languages of the world, shown in the current UI language: local name + the language's own autonym.",
    },
    "world-lang.search": { "zh-CN": "搜索语言（名称 / 自称 / 代码）…", "zh-TW": "搜尋語言（名稱 / 自稱 / 代碼）…", "en": "Search languages (name / autonym / code)…" },
    "world-lang.count": { "zh-CN": "共 {n} 种语言", "zh-TW": "共 {n} 種語言", "en": "{n} languages" },
    "world-lang.loading": { "zh-CN": "加载中…", "zh-TW": "載入中…", "en": "Loading…" },
    "world-lang.error": { "zh-CN": "语言目录加载失败（请确认插件已启用，或后端可达）", "zh-TW": "語言目錄載入失敗（請確認外掛已啟用，或後端可達）", "en": "Failed to load the language catalog (is the plugin enabled / backend reachable?)" },
    "world-lang.empty": { "zh-CN": "没有匹配的语言", "zh-TW": "沒有符合的語言", "en": "No matching languages" },
    "world-lang.region.asia-east": { "zh-CN": "东亚与北亚", "zh-TW": "東亞與北亞", "en": "East & North Asia" },
    "world-lang.region.asia-south": { "zh-CN": "东南亚与南亚", "zh-TW": "東南亞與南亞", "en": "Southeast & South Asia" },
    "world-lang.region.asia-west": { "zh-CN": "中亚与西亚", "zh-TW": "中亞與西亞", "en": "Central & West Asia" },
    "world-lang.region.europe": { "zh-CN": "欧洲", "zh-TW": "歐洲", "en": "Europe" },
    "world-lang.region.africa": { "zh-CN": "非洲", "zh-TW": "非洲", "en": "Africa" },
    "world-lang.region.americas": { "zh-CN": "美洲", "zh-TW": "美洲", "en": "Americas" },
    "world-lang.region.oceania": { "zh-CN": "大洋洲", "zh-TW": "大洋洲", "en": "Oceania" },
    "world-lang.region.constructed": { "zh-CN": "人工语言", "zh-TW": "人工語言", "en": "Constructed languages" },
  }

  function t(key, params) {
    var s = I18N ? I18N.translate(key, params) : null
    if (s && s !== key) return s
    var m = FALLBACK[key]
    if (!m) return key
    var lang = I18N ? I18N.getLang() : "zh-CN"
    var tmpl = m[lang] || m["zh-CN"] || key
    if (!params) return tmpl
    return String(tmpl).replace(/\{(\w+)\}/g, function (_, k) {
      return k in params ? String(params[k]) : "{" + k + "}"
    })
  }

  var REGION_ORDER = ["asia-east", "asia-south", "asia-west", "europe", "africa", "americas", "oceania", "constructed"]

  function LanguagesPage() {
    var useState = React.useState
    var useEffect = React.useEffect
    var items = useState([])[0]
    var setItems = useState([])[1]
    var loading = useState(true)[0]
    var setLoading = useState(false)[1]
    var error = useState("")[0]
    var setError = useState("")[1]
    var query = useState("")[0]
    var setQuery = useState("")[1]
    var lang = useState(I18N ? I18N.getLang() : "zh-CN")[0]
    var setLang = useState("")[1]

    useEffect(function () {
      var cancelled = false
      fetch("/api/plugins/world_languages/languages")
        .then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status)
          return r.json()
        })
        .then(function (d) {
          if (cancelled) return
          setItems((d && d.languages) || [])
          setLoading(false)
        })
        .catch(function (e) {
          if (cancelled) return
          setError(String((e && e.message) || e))
          setLoading(false)
        })
      return function () {
        cancelled = true
      }
    }, [])

    // 界面语言切换时实时更新展示（经宿主 i18n 桥订阅）
    useEffect(function () {
      if (!I18N || !I18N.subscribe) return undefined
      return I18N.subscribe(function (l) {
        setLang(l)
      })
    }, [])

    var q = String(query || "").trim().toLowerCase()
    var filtered = items.filter(function (it) {
      if (!q) return true
      var names = it.names || {}
      var hay = [it.code || "", it.autonym || "", names["zh-CN"] || "", names["zh-TW"] || "", names["en"] || ""]
        .join(" ")
        .toLowerCase()
      return hay.indexOf(q) !== -1
    })

    var groups = []
    filtered.forEach(function (it) {
      var region = it.region || "other"
      var g = null
      for (var i = 0; i < groups.length; i++) {
        if (groups[i].region === region) g = groups[i]
      }
      if (!g) {
        g = { region: region, items: [] }
        groups.push(g)
      }
      g.items.push(it)
    })
    groups.sort(function (a, b) {
      var ia = REGION_ORDER.indexOf(a.region)
      var ib = REGION_ORDER.indexOf(b.region)
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
    })

    var body
    if (loading) {
      body = h("p", { className: "text-sm text-muted-foreground" }, t("world-lang.loading"))
    } else if (error) {
      body = h(
        "div",
        { className: "rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/30" },
        t("world-lang.error"),
      )
    } else if (groups.length === 0) {
      body = h("p", { className: "text-sm text-muted-foreground" }, t("world-lang.empty"))
    } else {
      body = h(
        "div",
        { className: "space-y-6" },
        groups.map(function (g) {
          return h(
            "section",
            { key: g.region },
            h(
              "div",
              { className: "mb-2 flex items-baseline gap-2" },
              h("h2", { className: "text-base font-semibold" }, t("world-lang.region." + g.region)),
              h("span", { className: "text-xs text-muted-foreground" }, String(g.items.length)),
            ),
            h(
              "ul",
              { className: "grid grid-cols-1 gap-1.5 sm:grid-cols-2" },
              g.items.map(function (it) {
                var names = it.names || {}
                var label = names[lang] || names["zh-CN"] || it.code || ""
                return h(
                  "li",
                  {
                    key: it.code,
                    className:
                      "flex items-baseline gap-2 rounded-lg border bg-card px-3 py-2 text-sm",
                  },
                  h("span", { className: "font-medium" }, label),
                  h("span", { className: "text-muted-foreground" }, "（" + it.autonym + "）"),
                  h("span", { className: "ml-auto text-[10px] uppercase text-muted-foreground/70" }, it.code),
                )
              }),
            ),
          )
        }),
      )
    }

    return h(
      "div",
      { className: "mx-auto max-w-3xl space-y-4 px-6 py-8" },
      h("div", null,
        h("h1", { className: "flex items-center gap-2 text-2xl font-semibold" }, t("world-lang.title")),
        h("p", { className: "mt-1 text-sm text-muted-foreground" }, t("world-lang.subtitle")),
      ),
      h("div", { className: "flex flex-wrap items-center gap-2" },
        h("input", {
          className:
            "h-9 w-full max-w-xs rounded-md border bg-background px-3 text-sm outline-none transition-colors focus:border-primary",
          type: "search",
          placeholder: t("world-lang.search"),
          value: query,
          onChange: function (e) {
            setQuery(e.target.value)
          },
        }),
        h("span", { className: "text-xs text-muted-foreground" }, t("world-lang.count", { n: filtered.length })),
      ),
      body,
    )
  }

  window.MetaPilotPluginRegistry.register({
    id: "world_languages",
    routes: [{ path: "/languages", Component: LanguagesPage }],
    navItems: [{ to: "/languages", label: "world-lang.nav", icon: "Languages" }],
    // 词典随注册注入宿主 i18n（覆盖/补充，key 前缀 = 插件域）
    i18n: {
      "zh-CN": {
        "world-lang.nav": "语言",
        "world-lang.title": "世界语言",
        "world-lang.subtitle": "按当前界面语言展示全世界主要语言：界面称呼 + 该语言本国人民的自称（autonym）。",
        "world-lang.search": "搜索语言（名称 / 自称 / 代码）…",
        "world-lang.count": "共 {n} 种语言",
        "world-lang.loading": "加载中…",
        "world-lang.error": "语言目录加载失败（请确认插件已启用，或后端可达）",
        "world-lang.empty": "没有匹配的语言",
        "world-lang.region.asia-east": "东亚与北亚",
        "world-lang.region.asia-south": "东南亚与南亚",
        "world-lang.region.asia-west": "中亚与西亚",
        "world-lang.region.europe": "欧洲",
        "world-lang.region.africa": "非洲",
        "world-lang.region.americas": "美洲",
        "world-lang.region.oceania": "大洋洲",
        "world-lang.region.constructed": "人工语言",
      },
      "zh-TW": {
        "world-lang.nav": "語言",
        "world-lang.title": "世界語言",
        "world-lang.subtitle": "依目前介面語言展示全世界主要語言：介面稱呼 + 該語言本國人民的自稱（autonym）。",
        "world-lang.search": "搜尋語言（名稱 / 自稱 / 代碼）…",
        "world-lang.count": "共 {n} 種語言",
        "world-lang.loading": "載入中…",
        "world-lang.error": "語言目錄載入失敗（請確認外掛已啟用，或後端可達）",
        "world-lang.empty": "沒有符合的語言",
        "world-lang.region.asia-east": "東亞與北亞",
        "world-lang.region.asia-south": "東南亞與南亞",
        "world-lang.region.asia-west": "中亞與西亞",
        "world-lang.region.europe": "歐洲",
        "world-lang.region.africa": "非洲",
        "world-lang.region.americas": "美洲",
        "world-lang.region.oceania": "大洋洲",
        "world-lang.region.constructed": "人工語言",
      },
      en: {
        "world-lang.nav": "Languages",
        "world-lang.title": "World Languages",
        "world-lang.subtitle": "Major languages of the world, shown in the current UI language: local name + the language's own autonym.",
        "world-lang.search": "Search languages (name / autonym / code)…",
        "world-lang.count": "{n} languages",
        "world-lang.loading": "Loading…",
        "world-lang.error": "Failed to load the language catalog (is the plugin enabled / backend reachable?)",
        "world-lang.empty": "No matching languages",
        "world-lang.region.asia-east": "East & North Asia",
        "world-lang.region.asia-south": "Southeast & South Asia",
        "world-lang.region.asia-west": "Central & West Asia",
        "world-lang.region.europe": "Europe",
        "world-lang.region.africa": "Africa",
        "world-lang.region.americas": "Americas",
        "world-lang.region.oceania": "Oceania",
        "world-lang.region.constructed": "Constructed languages",
      },
    },
  })
})()
