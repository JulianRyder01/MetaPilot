/**
 * 脱敏上传插件 — 前端（frontend/frontend.js，运行时动态加载，即插即用）。
 *
 * 升级版：从独立导航标签页改为「库内弹窗」。经 collectionActions 在库首页顶栏注册
 * 「脱敏上传」按钮，点击后用宿主 createRoot 弹窗展示完整流程：
 *   选目标文件夹 → 批量上传(pdf/图片/doc/docx/txt/markdown) → 逐文件提取+识别
 *   （文件内阶段级进度）→ 识别完成 → 一键脱敏并入库存为文档。
 * 全部真实调用后端 /api/plugins/desensitize/*，无 mock。
 */
(function () {
  "use strict"
  var React = window.React
  var h = React.createElement
  var useState = React.useState
  var useEffect = React.useEffect

  var API = "/api/plugins/desensitize"
  var ACCEPT = ".pdf,.png,.jpg,.jpeg,.bmp,.webp,.gif,.doc,.docx,.txt,.md,.markdown"

  var STAGE_LABEL = {
    queued: "排队中", extracting: "提取中", analyzing: "识别中",
    done: "完成", error: "出错",
  }

  // ---------- 小组件 ----------
  function btn(disabled, onClick, label, extra) {
    return h("button", {
      type: "button", disabled: !!disabled, onClick: onClick,
      style: { display: "inline-flex", alignItems: "center", gap: "4px",
               padding: "6px 12px", borderRadius: "6px", fontSize: "14px", fontWeight: 500,
               cursor: disabled ? "not-allowed" : "pointer",
               background: disabled ? "#e5e7eb" : "#2563eb",
               color: disabled ? "#9ca3af" : "#fff", border: "none" },
    }, label, extra || null)
  }

  function Field(props) {
    return h("label", { style: { display: "flex", flexDirection: "column", gap: "4px", fontSize: "14px" } },
      h("span", { style: { color: "#6b7280" } }, props.label),
      props.children)
  }

  // ---------- 弹窗主组件 ----------
  function DesensitizeDialog(props) {
    var libId = props.libraryId
    // 每个 state 保留 [值, setter] 整个元组（吸取教训：别只取 [0]）
    var folders = useState([])
    var targetId = useState("")
    var files = useState([])
    var taskId = useState("")
    var status = useState(null)
    var err = useState("")
    var applying = useState(false)
    var imported = useState(null)
    var note = useState("")

    var foldersV = folders[0], setFolders = folders[1]
    var targetV = targetId[0], setTarget = targetId[1]
    var filesV = files[0], setFiles = files[1]
    var taskIdV = taskId[0], setTaskId = taskId[1]
    var statusV = status[0], setStatus = status[1]
    var errV = err[0], setErr = err[1]
    var applyingV = applying[0], setApplying = applying[1]
    var importedV = imported[0], setImported = imported[1]
    var noteV = note[0], setNote = note[1]

    // 加载目标文件夹列表
    useEffect(function () {
      fetch("/api/libraries/" + libId).then(function (r) { return r.json() }).then(function (lib) {
        var f = (lib && lib.folders) || []
        setFolders(f)
        if (f.length) setTarget(f[0].id)
      }).catch(function () { setErr("无法加载库文件夹列表") })
    }, [])

    // taskId 就绪后轮询进度
    useEffect(function () {
      if (!taskIdV) return
      // 记录开始轮询前的状态，避免被覆盖
      var iv = setInterval(function () {
        fetch(API + "/import/" + taskIdV).then(function (r) { return r.json() }).then(function (d) {
          setStatus(d)
          if (d.status === "done" || d.status === "error") clearInterval(iv)
        }).catch(function () { /* 忽略瞬时错误 */ })
      }, 1500)
      return function () { clearInterval(iv) }
    }, [taskIdV])

    function onPick(e) {
      var chosen = Array.prototype.slice.call(e.target.files || [])
      if (!chosen.length) return
      setFiles(filesV.concat(chosen))
      setErr(""); setImported(null)
    }

    function removeFile(i) {
      var next = filesV.slice(); next.splice(i, 1); setFiles(next)
    }

    function startRun() {
      if (!filesV.length) { setErr("请先选择要脱敏的文件"); return }
      if (!targetV) { setErr("请选择入库的目标文件夹"); return }
      setErr(""); setImported(null); setStatus(null)
      var fd = new FormData()
      for (var i = 0; i < filesV.length; i++) fd.append("files", filesV[i])
      fd.append("folderId", targetV)
      fetch(API + "/import", { method: "POST", body: fd })
        .then(function (r) { return r.json() })
        .then(function (d) {
          if (d && d.taskId) setTaskId(d.taskId)
          else setErr((d && d.detail) || "启动导入失败")
        })
        .catch(function (e) { setErr(e.message || "启动导入失败") })
    }

    function applyImport() {
      if (!targetV) { setErr("请选择入库的目标文件夹"); return }
      setApplying(true); setErr(""); setImported(null)
      fetch(API + "/import/" + taskIdV + "/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId: targetV, files: [] }),
      }).then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.detail || "入库失败"); return d }) })
        .then(function (d) { setImported(d); setNote("已批量脱敏并入库") })
        .catch(function (e) { setErr(e.message || "入库失败") })
        .finally(function () { setApplying(false) })
    }

    var running = taskIdV && statusV && statusV.status === "running"
    var allDone = taskIdV && statusV && statusV.status === "done"
    var targetName = ""
    for (var i = 0; i < foldersV.length; i++) if (foldersV[i].id === targetV) targetName = foldersV[i].name

    // tailwind 类由宿主 JIT 扫描源码生成，动态注入类名无 CSS；关键定位/背景/层级改用内联样式保证可见
    return h("div", {
      className: "desensitize-overlay",
      style: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
               display: "flex", alignItems: "center", justifyContent: "center",
               padding: "16px", backgroundColor: "rgba(0,0,0,0.55)" },
    },
      h("div", {
        className: "desensitize-dialog",
        style: { width: "100%", maxWidth: "760px", maxHeight: "86vh", overflow: "auto",
                 background: "#fff", color: "#1f2937", border: "1px solid #d1d5db",
                 borderRadius: "12px", padding: "20px", boxShadow: "0 20px 60px rgba(0,0,0,.35)",
                 fontFamily: "inherit" },
      },
        // 头部
        h("div", { className: "flex items-center justify-between" },
          h("h2", { className: "text-xl font-semibold" }, "脱敏上传"),
          h("button", {
            type: "button", className: "rounded-md px-2 py-1 text-muted-foreground hover:bg-muted",
            onClick: props.onClose,
          }, "✕")),
        h("p", { className: "mt-1 text-xs text-muted-foreground" },
          "上传 PDF/图片/doc/docx/txt/markdown，识别敏感信息后一键脱敏并入库到所选文件夹。"),

        // 目标文件夹
        h(Field, { label: "入库目标文件夹" },
          h("select", {
            className: "rounded-md border bg-background px-2 py-1.5 text-sm outline-none",
            value: targetV, onChange: function (e) { setTarget(e.target.value) },
          }, foldersV.map(function (f) {
            return h("option", { key: f.id, value: f.id }, (f.name || f.id) + (f.kind ? " (" + f.kind + ")" : ""))
          }))),

        // 选择文件（批量）
        h("div", { className: "mt-3 flex items-center gap-2" },
          h("input", {
            type: "file", multiple: true, accept: ACCEPT,
            className: "block w-full text-sm", onChange: onPick,
          })),
        filesV.length ? h("div", { className: "mt-2 space-y-1" },
          filesV.map(function (f, i) {
            return h("div", { key: i, className: "flex items-center justify-between rounded-md border px-2 py-1 text-sm" },
              h("span", { className: "truncate" }, f.name),
              h("button", { type: "button", className: "ml-2 text-xs text-red-600", onClick: function () { removeFile(i) } }, "移除"))
          })) : null,

        filesV.length && !taskIdV ? h("div", { className: "mt-3" }, btn(false, startRun, "开始识别")) : null,

        errV ? h("p", { style: { marginTop: "8px", fontSize: "14px", color: "#dc2626" } }, errV) : null,

        // 进度（内联样式，不依赖宿主 tailwind）
        (taskIdV && statusV) ? h("div", { style: { marginTop: "12px", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "12px" } },
          h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "14px" } },
            h("span", { style: { fontWeight: 600 } }, running ? "识别中…" : statusV.status === "done" ? "识别完成" : "处理中"),
            h("span", { style: { color: "#6b7280" } }, statusV.done + "/" + statusV.total)),
          h("div", { style: { marginTop: "4px", height: "8px", width: "100%", overflow: "hidden", borderRadius: "4px", background: "#e5e7eb" } },
            h("div", { style: { height: "100%", background: "#2563eb", width: (statusV.total ? Math.round((statusV.done / statusV.total) * 100) : 0) + "%" } })),
          h("div", { style: { marginTop: "12px" } },
            statusV.files.map(function (f, i) {
              var stageColor = f.stage === "error" ? "#dc2626" : f.stage === "done" ? "#16a34a" : "#6b7280"
              return h("div", { key: i, style: { fontSize: "12px", marginBottom: "6px" } },
                h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
                  h("span", { style: { fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis" } }, f.name),
                  h("span", { style: { color: stageColor } },
                    STAGE_LABEL[f.stage] || f.stage,
                    f.stage === "done" && typeof f.count === "number" ? (" · " + f.count + " 项") : "")),
                h("div", { style: { marginTop: "2px", height: "6px", width: "100%", overflow: "hidden", borderRadius: "3px", background: "#e5e7eb" } },
                  h("div", { style: { height: "100%", background: "#2563eb", width: Math.round((f.progress || 0) * 100) + "%" } })),
                f.stage === "done" && f.count ? h("div", { style: { marginTop: "2px", color: "#6b7280" } },
                  "识别：" + ((f.items || []).map(function (it) { return it.value }).slice(0, 6).join("、")) + (f.count > 6 ? "…" : "")) : null,
                f.error ? h("div", { style: { color: "#dc2626" } }, f.error) : null)
            })),

          // 完成后一键脱敏入库
          allDone ? h("div", { style: { marginTop: "12px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" } },
            btn(applyingV, function () { if (!applyingV) applyImport() }, "脱敏并入库存到「" + (targetName || "所选文件夹") + "」"),
            applyingV ? h("span", { style: { fontSize: "12px", color: "#6b7280" } }, "处理中…") : null) : null,
        ) : null,

        // 入库结果
        importedV ? h("div", { style: { marginTop: "12px", border: "1px solid #86efac", borderRadius: "8px", padding: "12px", fontSize: "14px" } },
          h("p", { style: { fontWeight: 600, color: "#15803d" } }, "已入库 " + importedV.count + " 个文档："),
          (importedV.imported || []).map(function (r, i) {
            return h("p", { key: i, style: { fontSize: "12px", color: "#6b7280" } },
              r.name + " → " + (r.docId ? "已生成文档(" + r.maskedCount + " 处脱敏)" : "失败"))
          })) : null,
        noteV ? h("p", { style: { marginTop: "8px", fontSize: "14px", color: "#15803d" } }, noteV) : null,
      ))
  }

  // ---------- 打开弹窗 ----------
  function openDialog(libraryId) {
    try {
      if (!window.React) { alert("宿主未暴露 window.React，无法打开脱敏弹窗"); return }
      var mk = window.createRoot
      if (!mk && window.ReactDOMClient) mk = window.ReactDOMClient.createRoot
      if (!mk) {
        alert("宿主未暴露 createRoot，无法挂载弹窗（需 main.tsx 注入 window.createRoot）。请强刷后重试。")
        return
      }
      var el = document.createElement("div")
      el.setAttribute("data-desensitize-dialog", "1")
      document.body.appendChild(el)
      var root = mk(el)
      root.render(h(DesensitizeDialog, {
        libraryId: libraryId,
        onClose: function () { try { root.unmount() } catch (e) {} if (el.parentNode) el.parentNode.removeChild(el) },
      }))
    } catch (e) {
      alert("脱敏弹窗打开失败：" + (e && e.message))
      // 重新抛出，让浏览器控制台也记录堆栈
      setTimeout(function () { throw e })
    }
  }

  // ---------- 注册（库内按钮，无独立导航标签） ----------
  window.MetaPilotPluginRegistry.register({
    id: "desensitize",
    collectionActions: [{
      id: "desensitize-import",
      createLabel: "desensitize.import",
      createIcon: "ShieldCheck",
      onCreate: function (ctx) { openDialog(ctx.libraryId) },
    }],
    i18n: {
      "zh-CN": { "desensitize.import": "脱敏上传" },
      "zh-TW": { "desensitize.import": "脫敏上傳" },
      "en": { "desensitize.import": "Desensitize & Import" },
    },
  })
})()
