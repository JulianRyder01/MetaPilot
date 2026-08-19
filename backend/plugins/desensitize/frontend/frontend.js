/**
 * 脱敏上传插件 — 前端（frontend/frontend.js，运行时动态加载，即插即用）。
 *
 * 库内「脱敏上传」弹窗：选目标文件夹(或新建) → 批量上传(pdf/图片/doc/docx/txt/markdown)
 * → 逐文件提取+识别（文件内阶段级进度）→ 识别结果逐项【勾选选择哪些脱敏】+ 【预览脱敏效果】
 * → 一键把勾选项脱敏入库。全部真实调用后端 /api/plugins/desensitize/*，无 mock。
 * 样式全部用宿主 CSS 变量(明暗自适应)。
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

  function btn(disabled, onClick, label, extra) {
    return h("button", {
      type: "button", disabled: !!disabled, onClick: onClick,
      style: { display: "inline-flex", alignItems: "center", gap: "4px",
               padding: "6px 12px", borderRadius: "6px", fontSize: "14px", fontWeight: 500,
               cursor: disabled ? "not-allowed" : "pointer",
               background: disabled ? "var(--muted)" : "var(--primary)",
               color: disabled ? "var(--muted-foreground)" : "var(--primary-foreground)",
               border: "none" },
    }, label, extra || null)
  }

  function Field(props) {
    return h("label", { style: { display: "flex", flexDirection: "column", gap: "4px", fontSize: "14px", color: "var(--foreground)" } },
      h("span", { style: { color: "var(--muted-foreground)" } }, props.label),
      props.children)
  }

  // 简单脱敏预览：对文本按条目做全局替换（与后端 mask_text 语义一致，纯前端预览用）
  function naiveMask(text, items) {
    var out = text || ""
    for (var i = 0; i < items.length; i++) {
      var v = items[i].value
      if (!v) continue
      out = out.split(v).join(Array(v.length + 1).join("█"))
    }
    return out
  }

  function DesensitizeDialog(props) {
    var libId = props.libraryId
    var folders = useState([])
    var targetId = useState("")
    var newName = useState("")
    var makingFolder = useState(false)
    var files = useState([])
    var taskId = useState("")
    var status = useState(null)
    var err = useState("")
    var applying = useState(false)
    var imported = useState(null)
    var note = useState("")
    // 勾选：name -> { value: true }；预览：当前预览的文件 {name, maskedText}；展开：name -> true
    var checked = useState({})
    var previewing = useState("")   // 正在预览哪个文件
    var previewText = useState("")  // 该文件的脱敏后文本
    var expanded = useState({})     // 识别项列表是否展开

    var foldersV = folders[0], setFolders = folders[1]
    var targetV = targetId[0], setTarget = targetId[1]
    var newNameV = newName[0], setNewName = newName[1]
    var makingV = makingFolder[0], setMaking = makingFolder[1]
    var filesV = files[0], setFiles = files[1]
    var taskIdV = taskId[0], setTaskId = taskId[1]
    var statusV = status[0], setStatus = status[1]
    var errV = err[0], setErr = err[1]
    var applyingV = applying[0], setApplying = applying[1]
    var importedV = imported[0], setImported = imported[1]
    var noteV = note[0], setNote = note[1]
    var checkedV = checked[0], setChecked = checked[1]
    var previewingV = previewing[0], setPreviewing = previewing[1]
    var previewTextV = previewText[0], setPreviewText = previewText[1]
    var expandedV = expanded[0], setExpanded = expanded[1]

    useEffect(function () {
      fetch("/api/libraries/" + libId).then(function (r) { return r.json() }).then(function (lib) {
        var f = (lib && lib.folders) || []
        setFolders(f)
        if (f.length) setTarget(f[0].id)
      }).catch(function () { setErr("无法加载库文件夹列表") })
    }, [])

    // 任务完成后初始化勾选：每文件默认全选
    useEffect(function () {
      if (statusV && statusV.status === "done") {
        var c = {}
        statusV.files.forEach(function (f) {
          if (f.stage === "done" && f.items) {
            var m = {}
            f.items.forEach(function (it) { m[it.value] = true })
            c[f.name] = m
          }
        })
        setChecked(c)
        setPreviewing(""); setPreviewText("")
      }
    }, [statusV])

    useEffect(function () {
      if (!taskIdV) return
      var iv = setInterval(function () {
        fetch(API + "/import/" + taskIdV).then(function (r) { return r.json() }).then(function (d) {
          setStatus(d)
          if (d.status === "done" || d.status === "error") clearInterval(iv)
        }).catch(function () {})
      }, 1500)
      return function () { clearInterval(iv) }
    }, [taskIdV])

    function onPick(e) {
      var chosen = Array.prototype.slice.call(e.target.files || [])
      if (!chosen.length) return
      setFiles(filesV.concat(chosen))
      setErr(""); setImported(null); setStatus(null)
    }
    function removeFile(i) { var n = filesV.slice(); n.splice(i, 1); setFiles(n) }

    // 新建文件夹
    function makeFolder() {
      var name = (newNameV || "").trim()
      if (!name) { setErr("请输入新文件夹名称"); return }
      setMaking(true); setErr("")
      fetch("/api/libraries/" + libId + "/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name, kind: "note" }),
      }).then(function (r) { return r.json() }).then(function (f) {
        if (f && f.id) {
          setFolders(foldersV.concat([f]))
          setTarget(f.id); setNewName("")
        } else { setErr((f && f.detail) || "新建文件夹失败") }
      }).catch(function (e) { setErr(e.message || "新建文件夹失败") })
        .finally(function () { setMaking(false) })
    }

    function startRun() {
      if (!filesV.length) { setErr("请先选择要脱敏的文件"); return }
      setErr(""); setImported(null); setStatus(null)
      var fd = new FormData()
      for (var i = 0; i < filesV.length; i++) fd.append("files", filesV[i])
      if (targetV) fd.append("folderId", targetV)
      fetch(API + "/import", { method: "POST", body: fd })
        .then(function (r) { return r.json() })
        .then(function (d) { if (d && d.taskId) setTaskId(d.taskId); else setErr((d && d.detail) || "启动导入失败") })
        .catch(function (e) { setErr(e.message || "启动导入失败") })
    }

    function toggleItem(fname, value) {
      var c = JSON.parse(JSON.stringify(checkedV))
      if (!c[fname]) c[fname] = {}
      c[fname][value] = !c[fname][value]
      setChecked(c); setPreviewing(""); setPreviewText("")
    }
    function selectAll(fname) { var c = JSON.parse(JSON.stringify(checkedV)); (statusV.files.find(function (x) { return x.name === fname }) || {}).items.forEach(function (it) { if (!c[fname]) c[fname] = {}; c[fname][it.value] = true }); setChecked(c) }
    function selectNone(fname) { var c = JSON.parse(JSON.stringify(checkedV)); c[fname] = {}; setChecked(c) }

    // 预览：把勾选项交给后端 /apply 做真实替换，返回脱敏后文本
    function preview(f) {
      var sel = Object.keys((checkedV[f.name] || {})).filter(function (v) { return checkedV[f.name][v] })
      var items = ((f.items || []).filter(function (it) { return sel.indexOf(it.value) >= 0 }))
      var fd = null
      fetch(API + "/apply", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: f.text || "", items: items }),
      }).then(function (r) { return r.json() }).then(function (d) {
        setPreviewing(f.name); setPreviewText(d.text !== undefined ? d.text : naiveMask(f.text, items))
      }).catch(function () { setPreviewing(f.name); setPreviewText(naiveMask(f.text, items)) })
    }

    function applyImport() {
      if (!targetV && statusV && statusV.status === "done") { setErr("请选择入库目标文件夹"); return }
      setApplying(true); setErr(""); setImported(null)
      var filesPayload = (statusV.files || []).filter(function (f) { return f.stage === "done" }).map(function (f) {
        var sel = Object.keys((checkedV[f.name] || {})).filter(function (v) { return checkedV[f.name][v] })
        return { name: f.name, selected: sel }
      })
      fetch(API + "/import/" + taskIdV + "/apply", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId: targetV, files: filesPayload }),
      }).then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.detail || "入库失败"); return d }) })
        .then(function (d) { setImported(d); setNote("已批量脱敏并入库") })
        .catch(function (e) { setErr(e.message || "入库失败") })
        .finally(function () { setApplying(false) })
    }

    var running = taskIdV && statusV && statusV.status === "running"
    var allDone = taskIdV && statusV && statusV.status === "done"
    function fname(id) { var x = foldersV.filter(function (f) { return f.id === id })[0]; return x ? (x.name || id) : id }

    return h("div", {
      className: "desensitize-overlay",
      style: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
               display: "flex", alignItems: "center", justifyContent: "center",
               padding: "16px", backgroundColor: "rgba(0,0,0,0.55)" },
    },
      h("div", {
        className: "desensitize-dialog",
        style: { width: "100%", maxWidth: "820px", maxHeight: "88vh", overflow: "auto",
                 background: "var(--popover)", color: "var(--popover-foreground)", border: "1px solid var(--border)",
                 borderRadius: "12px", padding: "20px", boxShadow: "0 20px 60px rgba(0,0,0,.35)" },
      },
        h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
          h("h2", { style: { fontSize: "20px", fontWeight: 600, margin: 0 } }, "脱敏上传"),
          h("button", { type: "button", style: { background: "none", border: "none", cursor: "pointer", fontSize: "16px", color: "var(--muted-foreground)" }, onClick: props.onClose }, "✕")),
        h("p", { style: { marginTop: "4px", fontSize: "12px", color: "var(--muted-foreground)" } },
          "上传 PDF/图片/doc/docx/txt/markdown → 识别 → 逐项勾选/预览 → 脱敏入库。"),

        // 目标文件夹（含新建）
        h("div", { style: { marginTop: "12px" } },
          h(Field, { label: "入库目标文件夹" },
            h("div", { style: { display: "flex", gap: "8px" } },
              h("select", {
                value: targetV, onChange: function (e) { setTarget(e.target.value) },
                style: { flex: 1, background: "var(--input)", color: "var(--foreground)", border: "1px solid var(--border)", borderRadius: "6px", padding: "6px 8px", fontSize: "14px", outline: "none" },
              }, foldersV.map(function (f) {
                return h("option", { key: f.id, value: f.id }, (f.name || f.id) + (f.kind ? " (" + f.kind + ")" : ""))
              })),
              h("input", {
                placeholder: "新建文件夹名…", value: newNameV,
                onChange: function (e) { setNewName(e.target.value) },
                style: { flex: 1, minWidth: "140px", background: "var(--input)", color: "var(--foreground)", border: "1px solid var(--border)", borderRadius: "6px", padding: "6px 8px", fontSize: "13px", outline: "none" },
              }),
              btn(makingV, function () { if (!makingV) makeFolder() }, "新建")))),

        // 选择文件
        h("div", { style: { marginTop: "12px", display: "flex", alignItems: "center", gap: "8px" } },
          h("input", { type: "file", multiple: true, accept: ACCEPT, onChange: onPick, style: { color: "var(--foreground)" } })),
        filesV.length ? h("div", { style: { marginTop: "6px" } },
          filesV.map(function (f, i) {
            return h("div", { key: i, style: { display: "flex", alignItems: "center", justifyContent: "space-between", border: "1px solid var(--border)", borderRadius: "6px", padding: "4px 8px", marginBottom: "4px", fontSize: "14px" } },
              h("span", { style: { overflow: "hidden", textOverflow: "ellipsis" } }, f.name),
              h("button", { type: "button", style: { marginLeft: "8px", fontSize: "12px", color: "var(--destructive)", background: "none", border: "none", cursor: "pointer" }, onClick: function () { removeFile(i) } }, "移除"))
          })) : null,
        filesV.length && !taskIdV ? h("div", { style: { marginTop: "10px" } }, btn(false, startRun, "开始识别")) : null,

        errV ? h("p", { style: { marginTop: "8px", fontSize: "14px", color: "var(--destructive)" } }, errV) : null,

        // 进度
        (taskIdV && statusV && statusV.status !== "done") ? h("div", { style: { marginTop: "12px", border: "1px solid var(--border)", borderRadius: "8px", padding: "12px" } },
          h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "14px" } },
            h("span", { style: { fontWeight: 600 } }, running ? "识别中…" : "处理中"),
            h("span", { style: { color: "var(--muted-foreground)" } }, statusV.done + "/" + statusV.total)),
          h("div", { style: { marginTop: "4px", height: "8px", width: "100%", overflow: "hidden", borderRadius: "4px", background: "var(--muted)" } },
            h("div", { style: { height: "100%", background: "var(--primary)", width: (statusV.total ? Math.round((statusV.done / statusV.total) * 100) : 0) + "%" } })),
          h("div", { style: { marginTop: "10px" } },
            statusV.files.map(function (f, i) {
              var stageColor = f.stage === "error" ? "var(--destructive)" : f.stage === "done" ? "var(--primary)" : "var(--muted-foreground)"
              return h("div", { key: i, style: { fontSize: "12px", marginBottom: "6px" } },
                h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
                  h("span", { style: { fontWeight: 500 } }, f.name),
                  h("span", { style: { color: stageColor } }, STAGE_LABEL[f.stage] || f.stage)),
                h("div", { style: { marginTop: "2px", height: "6px", width: "100%", overflow: "hidden", borderRadius: "3px", background: "var(--muted)" } },
                  h("div", { style: { height: "100%", background: "var(--primary)", width: Math.round((f.progress || 0) * 100) + "%" } })),
                f.error ? h("div", { style: { color: "var(--destructive)" } }, f.error) : null)
            }))) : null,

        // 完成后：逐文件勾选 + 预览
        allDone ? h("div", { style: { marginTop: "12px" } },
          h("div", { style: { fontSize: "15px", fontWeight: 600, marginBottom: "6px" } }, "识别结果（勾选要脱敏的项，可预览后入库）"),
          (statusV.files || []).map(function (f, i) {
            if (f.stage !== "done") return null
            var c = checkedV[f.name] || {}
            var selCount = Object.keys(c).filter(function (k) { return c[k] }).length
            var isPreviewing = previewingV === f.name
            return h("div", { key: i, style: { border: "1px solid var(--border)", borderRadius: "8px", padding: "10px", marginBottom: "8px" } },
              h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
                h("span", { style: { fontWeight: 600, fontSize: "14px" } }, f.name),
                h("span", { style: { fontSize: "12px", color: "var(--muted-foreground)" } },
                  "已选 " + selCount + "/" + (f.items ? f.items.length : 0) + " 项")),
              // 项清单（可展开）
              h("div", { style: { marginTop: "6px" } },
                (f.items || []).map(function (it, j) {
                  return h("label", { key: j, style: { display: "flex", alignItems: "center", gap: "6px", padding: "2px 0", fontSize: "13px" } },
                    h("input", { type: "checkbox", checked: !!c[it.value], onChange: function () { toggleItem(f.name, it.value) } }),
                    h("span", { style: { color: "var(--destructive)" } }, it.value),
                    h("span", { style: { background: "var(--muted)", borderRadius: "3px", padding: "0 4px", fontSize: "12px", color: "var(--muted-foreground)" } }, it.typeLabel || it.type || ""))
                })),
              f.items && f.items.length ? h("div", { style: { marginTop: "6px", display: "flex", gap: "6px", alignItems: "center" } },
                h("button", { type: "button", style: btnLnk, onClick: function () { selectAll(f.name) } }, "全选"),
                h("button", { type: "button", style: btnLnk, onClick: function () { selectNone(f.name) } }, "全不选"),
                h("button", { type: "button", style: btnLnk, onClick: function () { preview(f) } }, "预览脱敏"))
              : h("p", { style: { fontSize: "12px", color: "var(--muted-foreground)" } }, "（未识别到敏感信息）"),
              // 预览结果
              isPreviewing ? h("div", { style: { marginTop: "8px" } },
                h("div", { style: { fontSize: "12px", color: "var(--muted-foreground)", marginBottom: "2px" } }, "脱敏预览（█=替换）"),
                h("pre", { style: { whiteSpace: "pre-wrap", wordBreak: "break-word", background: "var(--muted)", borderRadius: "6px", padding: "8px", fontSize: "12px", maxHeight: "160px", overflow: "auto", margin: 0 } },
                  previewTextV || ""))
              : null)
          }),
          // 底部操作：入库到所选文件夹
          h("div", { style: { marginTop: "12px", display: "flex", alignItems: "center", gap: "8px" } },
            btn(applyingV, function () { if (!applyingV) applyImport() }, "脱敏选中的项并入库到「" + (targetV ? fname(targetV) : "所选文件夹") + "」"),
            applyingV ? h("span", { style: { fontSize: "12px", color: "var(--muted-foreground)" } }, "处理中…") : null)) : null,

        // 入库结果
        importedV ? h("div", { style: { marginTop: "12px", border: "1px solid var(--border)", borderRadius: "8px", padding: "12px", fontSize: "14px" } },
          h("p", { style: { fontWeight: 600, color: "var(--primary)" } }, "已入库 " + importedV.count + " 个文档："),
          (importedV.imported || []).map(function (r, i) {
            return h("p", { key: i, style: { fontSize: "12px", color: "var(--muted-foreground)" } },
              r.name + " → " + (r.docId ? "已生成文档（" + r.maskedCount + " 处脱敏）" : "失败"))
          })) : null,
        noteV ? h("p", { style: { marginTop: "8px", fontSize: "14px", color: "var(--primary)" } }, noteV) : null,
      ))
  }

  var btnLnk = { background: "none", border: "none", cursor: "pointer", fontSize: "12px", color: "var(--primary)", textDecoration: "underline", padding: 0 }

  // ---------- 打开弹窗 ----------
  function openDialog(libraryId) {
    try {
      if (!window.React) { alert("宿主未暴露 window.React，无法打开脱敏弹窗"); return }
      var mk = window.createRoot
      if (!mk && window.ReactDOMClient) mk = window.ReactDOMClient.createRoot
      if (!mk) { alert("宿主未暴露 createRoot，无法挂载弹窗（需 main.tsx 注入 window.createRoot）。请强刷后重试。"); return }
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
      setTimeout(function () { throw e })
    }
  }

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
