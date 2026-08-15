/**
 * 第三方插件前端 bundle（frontend/frontend.js）示例。
 *
 * 协议（docs/04-插件开发规范.md §前端 bundle）：
 * - 本文件为 IIFE，使用宿主注入的全局 React（window.React）；
 * - 执行时调用 window.MetaPilotPluginRegistry.register({ id, routes, navItems }) 注册前端能力；
 * - 宿主 App 自动把 routes 挂到路由、navItems 挂到顶栏导航（启用该插件时）。
 *
 * 打包方式：与 plugin.json、__init__.py 一起打成 zip（frontend/frontend.js 保持相对路径），
 * 在「插件管理 → 插件商店 → 上传」或「本地上传」安装，前端刷新后即出现路由与导航。
 */
(function () {
  "use strict"
  var React = window.React
  var h = React.createElement

  function DemoPage() {
    var msg = React.useState("加载中…")[0]
    var setMsg = React.useState("")[1]
    React.useEffect(function () {
      fetch("/api/plugins/demo_greeting/hello")
        .then(function (r) { return r.json() })
        .then(function (d) { setMsg(d.message) })
        .catch(function () { setMsg("（后端不可达，请确认插件已启用）") })
    }, [])
    return h("div", { className: "mx-auto max-w-2xl space-y-4 px-6 py-10" },
      h("h1", { className: "text-2xl font-semibold" }, "第三方插件示例"),
      h("p", { className: "text-sm text-muted-foreground" }, msg),
      h("p", { className: "text-xs text-muted-foreground" },
        "本页面由 frontend/frontend.js 在运行时注册（window.MetaPilotPluginRegistry.register），未改动宿主前端代码。")
    )
  }

  window.MetaPilotPluginRegistry.register({
    id: "demo_greeting",
    routes: [{ path: "/demo", Component: DemoPage }],
    navItems: [{ to: "/demo", label: "demo.nav", icon: "Hand" }],
    // 词典随注册注入宿主 i18n（覆盖/补充，key 前缀建议用插件 id）
    i18n: {
      "zh-CN": { "demo.nav": "示例插件" },
      "zh-TW": { "demo.nav": "範例外掛" },
      "en": { "demo.nav": "Demo Plugin" },
    },
  })
})()
