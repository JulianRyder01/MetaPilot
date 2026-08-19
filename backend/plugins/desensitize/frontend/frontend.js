/**
 * 去敏感信息插件 — 前端 demo（frontend/frontend.js，运行时动态加载，即插即用）。
 *
 * 协议（docs/04-插件开发规范.md §6.2）：本文件为 IIFE，使用宿主注入的全局 React（window.React），
 * 执行时调用 window.MetaPilotPluginRegistry.register({ id, routes, navItems, i18n }) 注册。
 * 全部数据均真实调用后端 /api/plugins/desensitize/*，不含任何 mock。
 *
 * 工作流：状态/配置（ollama 地址与模型、拉取模型）→ 输入文本或上传 PDF/图片 → 本地模型识别
 * 敏感信息并标出（红色高亮）→ 勾选确认 → 文本/markdown 用 █ 替换、PDF 按敏感内容涂黑、
 * 图片整图涂黑 → 预览并下载结果。
 */
(function () {
  "use strict"
  var React = window.React
  var h = React.createElement
  var useState = React.useState
  var useEffect = React.useEffect

  var API = "/api/plugins/desensitize"

  // ---------- 小组件（用宿主 tailwind 风格类名） ----------
  function btn(props, label) {
    var cls =
      "inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors " +
      (props.disabled
        ? "cursor-not-allowed bg-muted text-muted-foreground"
        : "bg-primary text-primary-foreground hover:bg-primary/80")
    return h("button", Object.assign({ className: cls, type: "button" }, props), label)
  }

  function Card(props) {
    return h("div", { className: "rounded-xl border bg-card p-4 shadow-sm" }, props.children)
  }

  function Field(props) {
    return h("label", { className: "flex flex-col gap-1 text-sm" },
      h("span", { className: "text-muted-foreground" }, props.label),
      props.children)
  }

  function input(cls, props) {
    var c = "rounded-md border bg-background px-3 py-1.5 text-sm outline-none " + (cls || "")
    return h("input", Object.assign({ className: c }, props))
  }

  // 高亮原文：按敏感区间把命中部分标红
  function Highlighted(props) {
    var text = props.text || ""
    var spans = props.spans || []
    var segs = []
    var last = 0
    var sorted = spans.slice().sort(function (a, b) { return a.start - b.start })
    for (var i = 0; i < sorted.length; i++) {
      var s = sorted[i]
      if (s.start < last) continue
      if (s.start > last) segs.push(text.slice(last, s.start))
      segs.push(h("mark", { key: i, className: "rounded bg-red-200 px-0.5 text-red-900" },
        text.slice(s.start, s.end)))
      last = s.end
    }
    if (last < text.length) segs.push(text.slice(last))
    return h("pre", {
      className: "max-h-72 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-xs",
    }, segs)
  }

  // ---------- 主页面 ----------
  function DesensitizePage() {
    // 注意：useState 返回 [state, setState] 元组，这里保留整个元组（[0]=值，[1]=setter）
    var status = useState({ ollamaHealthy: false, model: "", modelReady: false, modelInstalled: [], url: "" })
    var url = useState("")
    var model = useState("")
    var pullMsg = useState("")
    var busy = useState(false)
    var err = useState("")

    var text = useState("")
    var mode = useState("text")            // text | file
    var fileName = useState("")
    var fileBuf = useState(null)            // {kind, blob}

    var result = useState(null)             // {items, kind, ocr, text}
    var selected = useState({})             // value -> true
    var applied = useState(null)            // {text, spans}
    var note = useState("")

    var setStatus = status[1], setUrl = url[1], setModel = model[1]
    var setPullMsg = pullMsg[1], setBusy = busy[1], setErr = err[1]
    var setText = text[1], setMode = mode[1], setFileName = fileName[1], setFileBuf = fileBuf[1]
    var setResult = result[1], setSelected = selected[1], setApplied = applied[1], setNote = note[1]

    function refreshStatus() {
      fetch(API + "/status").then(function (r) { return r.json() }).then(function (d) {
        setStatus(d)
        if (!url[0]) setUrl(d.url)
        if (!model[0]) setModel(d.model)
      }).catch(function () { setStatus({ ollamaHealthy: false }) })
    }
    useEffect(function () { refreshStatus() }, [])

    function run(fn) {
      setErr(""); setNote("")
      setBusy(true)
      return Promise.resolve(fn())
        .catch(function (e) { setErr(e && e.message ? e.message : JSON.stringify(e)) })
        .finally(function () { setBusy(false) })
    }

    function saveConfig() {
      run(function () {
        return fetch(API + "/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url[0], model: model[0] }),
        }).then(function (r) { return r.json() }).then(function (d) {
          setStatus({ ollamaHealthy: status[0].ollamaHealthy, model: d.model, url: d.url, modelReady: false, modelInstalled: status[0].modelInstalled })
          refreshStatus()
        })
      })
    }

    function pullModel() {
      run(function () {
        return fetch(API + "/pull", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: model[0] || undefined }),
        }).then(function (r) { return r.json().then((function (d) {
          if (!r.ok) throw new Error(d.detail || "拉取失败")
          return d
        })) }).then(function (d) { setPullMsg(d.message || "模型已就绪"); refreshStatus() })
      })
    }

    function analyzeText() {
      if (!text[0].trim()) { setErr("请先输入文本或 Markdown"); return }
      run(function () {
        return fetch(API + "/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: text[0], model: model[0] || undefined }),
        }).then(function (r) { return r.json().then((function (d) {
          if (!r.ok) throw new Error(d.detail || "识别失败")
          return d
        })) }).then(function (d) { setResult(d); setApplied(null); setSelected({}) })
      })
    }

    function onFileChange(e) {
      var f = e.target.files && e.target.files[0]
      if (!f) return
      setFileName(f.name); setApplied(null); setResult(null); setSelected({})
      run(function () {
        var fd = new FormData()
        fd.append("file", f)
        if (model[0]) fd.append("model", model[0])
        return fetch(API + "/file/analyze", { method: "POST", body: fd })
          .then(function (r) { return r.json().then((function (d) {
            if (!r.ok) throw new Error(d.detail || "分析失败")
            return d
          })) })
          .then(function (d) {
            setMode("file"); setFileBuf({ kind: d.kind, blob: f })
            setResult(d)
          })
      })
    }

    function toggleItem(it) {
      var next = Object.assign({}, selected[0])
      if (next[it.value]) delete next[it.value]
      else next[it.value] = true
      setSelected(next)
    }

    function confirmItems() {
      var list = Object.keys(selected[0]).map(function (v) {
        var it = (result[0] && result[0].items || []).filter(function (x) { return x.value === v })[0]
        return it
      })
      return list
    }

    function applyText() {
      var list = confirmItems()
      if (!list.length) { setNote("请先勾选要脱敏的敏感信息"); return }
      run(function () {
        return fetch(API + "/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: text[0], items: list }),
        }).then(function (r) { return r.json() }).then(function (d) { setApplied(d) })
      })
    }

    function redactFile(full) {
      if (!fileBuf[0]) { setNote("请先上传文件并完成识别"); return }
      run(function () {
        var payload = { items: confirmItems() }
        if (full) payload.full = true
        var fd = new FormData()
        fd.append("file", fileBuf[0].blob)
        fd.append("payload", JSON.stringify(payload))
        return fetch(API + "/file/redact", { method: "POST", body: fd })
          .then(function (r) { if (!r.ok) return r.json().then((function (d) { throw new Error(d.detail || "涂黑失败") })); return r.blob() })
          .then(function (blob) {
            var a = document.createElement("a")
            a.href = URL.createObjectURL(blob)
            a.download = (fileName[0] || "redacted").replace(/\.[^.]+$/, "") + "_redacted.pdf"
            document.body.appendChild(a); a.click(); a.remove()
            setNote("已生成并下载涂黑后的文件")
          })
      })
    }

    var statusOk = status[0].ollamaHealthy
    var modelOk = status[0].ollamaHealthy && status[0].modelReady

    return h("div", { className: "mx-auto max-w-5xl space-y-5 px-6 py-8" },
      h("div", { className: "flex items-center gap-3" },
        h("h1", { className: "text-2xl font-semibold" }, "去敏感信息"),
        h("span", {
          className: "rounded-full px-2 py-0.5 text-xs " +
            (statusOk ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"),
        }, statusOk ? "ollama 在线" : "ollama 未连接")),

      // 状态与配置
      h(Card, { key: "cfg" },
        h("div", { className: "flex flex-wrap items-end gap-3" },
          h(Field, { label: "ollama 地址" }, input(null, {
            value: url[0], onChange: function (e) { setUrl(e.target.value) },
            placeholder: "http://127.0.0.1:11434",
          })),
          h(Field, { label: "本地模型" }, input(null, {
            value: model[0], onChange: function (e) { setModel(e.target.value) },
            placeholder: "qwen3.5:4b",
          })),
          btn({ onClick: saveConfig, disabled: busy[0] }, "保存配置"),
          btn({ onClick: pullModel, disabled: busy[0] || !statusOk }, "拉取模型"),
        ),
        h("p", { className: "mt-2 text-xs text-muted-foreground" },
          modelOk
            ? "模型 " + status[0].model + " 已就绪，可直接识别。"
            : statusOk
              ? "本机模型未就绪：已安装 " + (status[0].modelInstalled.join(", ") || "（无）") +
                "，可先「拉取模型」或修改模型名。"
              : "未检测到 ollama，请先启动 ollama（ollama serve）并确认地址。"),
        pullMsg[0] ? h("p", { className: "mt-1 text-xs text-green-600" }, pullMsg[0]) : null),

      // 输入
      h(Card, { key: "in" },
        h("div", { className: "flex flex-wrap gap-3" },
          h("button", {
            type: "button",
            className: "rounded-md px-3 py-1.5 text-sm " + (mode[0] === "text" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"),
            onClick: function () { setMode("text") },
          }, "文本 / Markdown"),
          h("button", {
            type: "button",
            className: "rounded-md px-3 py-1.5 text-sm " + (mode[0] === "file" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"),
            onClick: function () { setMode("file") },
          }, "PDF / 图片"),
        ),
        mode[0] === "text"
          ? h("div", { className: "mt-3 space-y-3" },
            h("textarea", {
              className: "min-h-40 w-full rounded-md border bg-background p-3 text-sm outline-none",
              value: text[0],
              onChange: function (e) { setText(e.target.value) },
              placeholder: "粘贴含敏感信息的文本或 Markdown，例如：\n联系人：张三，电话 13800138000，邮箱 zhangsan@example.com，住址：北京市朝阳区某某路 88 号。",
            }),
            h("div", { className: "flex items-center gap-2" },
              btn({ onClick: analyzeText, disabled: busy[0] || !modelOk }, "分析敏感信息")))
          : h("div", { className: "mt-3 space-y-3" },
            h("input", {
              type: "file", accept: ".pdf,.png,.jpg,.jpeg,.bmp,.webp,.gif",
              className: "block w-full text-sm",
              onChange: onFileChange,
            }),
            fileName[0] ? h("p", { className: "text-xs text-muted-foreground" }, "已选择： " + fileName[0]) : null),

        err[0] ? h("p", { className: "mt-2 text-sm text-red-600" }, err[0]) : null),

      // 识别结果
      result[0] && h(Card, { key: "res" },
        h("div", { className: "flex items-center justify-between" },
          h("h2", { className: "text-base font-medium" },
            "识别结果（" + result[0].items.length + " 处敏感信息，请勾选确认）"),
          h("button", {
            type: "button", className: "text-xs text-primary underline",
            onClick: function () {
              var all = {}
              result[0].items.forEach(function (it) { all[it.value] = true })
              setSelected(all)
            },
          }, "全选")),
        h("div", { className: "mt-3 grid gap-1.5 md:grid-cols-2" },
          result[0].items.map(function (it, i) {
            return h("label", {
              key: i,
              className: "flex items-center gap-2 rounded-md border p-2 text-sm " +
                (selected[0][it.value] ? "border-primary bg-primary/5" : "bg-muted/30"),
            },
              h("input", { type: "checkbox", checked: !!selected[0][it.value], onChange: function () { toggleItem(it) } }),
              h("span", { className: "font-medium text-red-700" }, it.value),
              h("span", { className: "rounded bg-muted px-1 text-xs" }, it.typeLabel || it.type),
              it.found ? null : h("span", { className: "text-xs text-amber-600" }, "（未精确匹配）"))
          })),
        // 原文（标出敏感信息）
        mode[0] === "text"
          ? h("div", { className: "mt-3" },
            h("p", { className: "mb-1 text-xs text-muted-foreground" }, "原文（红色为识别的敏感信息）"),
            h(Highlighted, { text: text[0], spans: result[0].items }))
          : h("div", { className: "mt-3" },
            h("p", { className: "mb-1 text-xs text-muted-foreground" },
              "已提取文本（" + fileName[0] + "，红色为敏感信息）"),
            h(Highlighted, { text: result[0].text || "", spans: result[0].items })),

        h("div", { className: "mt-3 flex flex-wrap gap-2" },
          mode[0] === "text"
            ? btn({ onClick: applyText, disabled: busy[0] }, "应用替换（黑色块）")
            : h(React.Fragment, null,
              btn({ onClick: redactFile, disabled: busy[0] }, "按勾选内容涂黑文件"),
              result[0].kind === "image"
                ? btn({ onClick: function () { redactFile(true) }, disabled: busy[0] }, "整张图片涂黑")
                : null))),

      // 应用结果
      applied[0] && h(Card, {
        key: "applied",
        className: "border-green-600/40",
      },
        h("h2", { className: "text-base font-medium" }, "脱敏后结果"),
        h("p", { className: "mt-1 text-xs text-muted-foreground" }, "已用黑色块（█）替换 " + applied[0].spans.length + " 处敏感内容"),
        h("pre", {
          className: "mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-xs",
        }, applied[0].text || ""),
        h("button", {
          type: "button",
          className: "mt-2 text-xs text-primary underline",
          onClick: function () { navigator.clipboard && navigator.clipboard.writeText(applied[0].text || "") },
        }, "复制脱敏文本")),

      note[0] ? h("p", { className: "text-sm text-green-700" }, note[0]) : null)
  }

  window.MetaPilotPluginRegistry.register({
    id: "desensitize",
    routes: [{ path: "/desensitize", Component: DesensitizePage }],
    navItems: [{ to: "/desensitize", label: "desensitize.nav", icon: "ShieldCheck" }],
    i18n: {
      "zh-CN": { "desensitize.nav": "去敏感信息" },
      "zh-TW": { "desensitize.nav": "去敏感資訊" },
      "en": { "desensitize.nav": "Desensitize" },
    },
  })
})()
