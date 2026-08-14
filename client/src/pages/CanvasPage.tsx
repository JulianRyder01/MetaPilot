import { useCallback, useEffect, useRef, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { ArrowLeft, Box, Download, FileText, Link2, Maximize, Minus, Plus, Redo2, Save, StickyNote, Trash2, Undo2 } from "lucide-react"
import { toast } from "@/lib/toast"

import { useT } from "@/i18n"
import { api, type CanvasEdge, type CanvasNode, type Collection } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { useDialogs } from "@/components/ui/dialog-provider"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

function genId(prefix: string) {
  return `${prefix}${Math.random().toString(36).slice(2, 9)}`
}

/** 节点连接点（四边中点），用于拖拽创建连线。 */
const SIDES = [
  { key: "top", dx: 0.5, dy: 0 },
  { key: "right", dx: 1, dy: 0.5 },
  { key: "bottom", dx: 0.5, dy: 1 },
  { key: "left", dx: 0, dy: 0.5 },
]

/** 画布内容层尺寸（board 坐标空间），超出部分随平移可见。 */
const BOARD_SIZE = 8000
const MIN_ZOOM = 0.2
const MAX_ZOOM = 3

/** JSON Canvas 预设色（"1"~"6"，Obsidian 红橙黄绿青紫），渲染时映射为实际色值。 */
const PRESET_COLORS: Record<string, string> = {
  "1": "#e03131",
  "2": "#e8590c",
  "3": "#f08c00",
  "4": "#2f9e44",
  "5": "#0c8599",
  "6": "#9c36b5",
}

/** 解析节点/边的颜色：支持 hex 与 JSON Canvas 预设数字串。 */
function resolveColor(c?: string): string | undefined {
  if (!c) return undefined
  if (c in PRESET_COLORS) return PRESET_COLORS[c]
  return c
}

/** 箭头三角形顶点：以 (px,py) 为尖，指向 angle 方向。 */
function arrowPoints(px: number, py: number, angle: number, size = 8) {
  const a1 = angle + Math.PI / 6
  const a2 = angle - Math.PI / 6
  return `${px},${py} ${px - size * Math.cos(a1)},${py - size * Math.sin(a1)} ${px - size * Math.cos(a2)},${py - size * Math.sin(a2)}`
}

export default function CanvasPage() {
  const { cid } = useParams()
  const t = useT()
  const dialogs = useDialogs()
  const [col, setCol] = useState<Collection | null>(null)
  const [nodes, setNodes] = useState<CanvasNode[]>([])
  const [edges, setEdges] = useState<CanvasEdge[]>([])
  const [dirty, setDirty] = useState(false)
  const [linking, setLinking] = useState<{ fromId: string; fromSide: string } | null>(null)
  const [linkPos, setLinkPos] = useState<{ x: number; y: number } | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState("")
  /** 视图变换：缩放 + 平移（Obsidian Canvas 风格）。 */
  const [view, setView] = useState({ zoom: 1, panX: 0, panY: 0 })
  const [panning, setPanning] = useState<{ startX: number; startY: number; startPanX: number; startPanY: number } | null>(null)
  /** 选中节点（Obsidian 风格：点击单选、Shift 多选、空白框选）。 */
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  /** 选中的边（点击边选中，Delete 删除）。 */
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  /** 边 label 编辑草稿（选中边时顶栏输入框）。 */
  const [edgeLabelDraft, setEdgeLabelDraft] = useState("")
  /** 框选矩形（board 坐标）。 */
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  /** 拖拽中的多节点移动（记录各节点起始位置，统一位移）。 */
  const [dragState, setDragState] = useState<{ startX: number; startY: number; ids: string[]; origins: Record<string, { x: number; y: number }> } | null>(null)
  /** 拖拽期间是否真的发生了位移（用于区分「点击选中」与「移动」）。 */
  const dragMovedRef = useRef(false)
  /** 撤销/重做历史栈。 */
  const undoStack = useRef<{ nodes: CanvasNode[]; edges: CanvasEdge[] }[]>([])
  const redoStack = useRef<{ nodes: CanvasNode[]; edges: CanvasEdge[] }[]>([])
  /** 复制缓冲区（节点 + 关联边）。 */
  const clipboardRef = useRef<{ nodes: CanvasNode[]; edges: CanvasEdge[] } | null>(null)
  const spaceDownRef = useRef(false)
  const boardRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    if (!cid) return
    const c = await api.getCollection(cid)
    setCol(c)
    setNodes(c.canvas?.nodes ?? [])
    setEdges(c.canvas?.edges ?? [])
    setSelectedIds([])
    setSelectedEdgeId(null)
    undoStack.current = []
    redoStack.current = []
    setDirty(false)
  }, [cid])

  useEffect(() => {
    load()
  }, [load])

  async function save() {
    if (!cid) return
    try {
      await api.updateCollectionCanvas(cid, nodes, edges)
      setDirty(false)
      toast.success(t("core.canvas.saved"))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("core.canvas.saveFailed"))
    }
  }

  // ---- 历史（撤销/重做） ----

  function pushHistory() {
    undoStack.current.push({ nodes: structuredClone(nodes), edges: structuredClone(edges) })
    if (undoStack.current.length > 50) undoStack.current.shift()
    redoStack.current = []
  }

  function undo() {
    const prev = undoStack.current.pop()
    if (!prev) return
    redoStack.current.push({ nodes: structuredClone(nodes), edges: structuredClone(edges) })
    setNodes(prev.nodes)
    setEdges(prev.edges)
    setDirty(true)
  }

  function redo() {
    const next = redoStack.current.pop()
    if (!next) return
    undoStack.current.push({ nodes: structuredClone(nodes), edges: structuredClone(edges) })
    setNodes(next.nodes)
    setEdges(next.edges)
    setDirty(true)
  }

  /** 新建节点（text/file/link/group），文件/链接/分组需弹窗输入（Obsidian 兼容字段）。 */
  async function addNode(type: CanvasNode["type"]) {
    const base = {
      id: genId("n"),
      type,
      x: 40 + Math.random() * 200,
      y: 40 + Math.random() * 120,
      width: 200,
      height: 80,
    }
    let node: CanvasNode
    if (type === "file") {
      const file = await dialogs.prompt({
        title: t("core.canvas.addFileTitle"),
        description: t("core.canvas.addFileDesc"),
        placeholder: "path/to/file.md",
      })
      if (file == null) return
      if (!file.trim()) return
      node = { ...base, file: file.trim() }
    } else if (type === "link") {
      const url = await dialogs.prompt({
        title: t("core.canvas.addLinkTitle"),
        initialValue: "https://",
      })
      if (url == null) return
      if (!url.trim()) return
      node = { ...base, url: url.trim() }
    } else if (type === "group") {
      const label = await dialogs.prompt({
        title: t("core.canvas.addGroupTitle"),
        placeholder: t("core.canvas.groupName"),
      })
      if (label == null) return
      node = { ...base, width: 320, height: 200, label: label.trim() || undefined }
    } else {
      node = { ...base, text: t("core.canvas.doubleClickEdit") }
    }
    pushHistory()
    setNodes((n) => [...n, node])
    setSelectedIds([node.id])
    setSelectedEdgeId(null)
    setDirty(true)
  }

  /** 更新节点字段（不进入历史，由调用方决定）。 */
  function updateNode(id: string, patch: Partial<CanvasNode>) {
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, ...patch } : n)))
    setDirty(true)
  }

  /** 给所有选中节点应用颜色（hex 或 JSON Canvas 预设串）。 */
  function applyNodeColor(color?: string) {
    if (selectedIds.length === 0) return
    pushHistory()
    const idSet = new Set(selectedIds)
    setNodes((ns) => ns.map((n) => (idSet.has(n.id) ? { ...n, color } : n)))
    setDirty(true)
  }

  /** 删除一组节点并清理关联边。 */
  function removeNodes(ids: string[]) {
    if (ids.length === 0) return
    pushHistory()
    const idSet = new Set(ids)
    setNodes((n) => n.filter((x) => !idSet.has(x.id)))
    setEdges((e) => e.filter((x) => !idSet.has(x.fromNode) && !idSet.has(x.toNode)))
    setSelectedIds((s) => s.filter((id) => !idSet.has(id)))
    setDirty(true)
  }

  function removeNode(id: string) {
    removeNodes([id])
  }

  // ---- 边操作 ----

  function selectEdge(e: CanvasEdge) {
    setSelectedEdgeId(e.id)
    setSelectedIds([])
    setEdgeLabelDraft(e.label ?? "")
  }

  function removeEdge(id: string) {
    pushHistory()
    setEdges((es) => es.filter((x) => x.id !== id))
    setSelectedEdgeId(null)
    setDirty(true)
  }

  function updateEdge(id: string, patch: Partial<CanvasEdge>) {
    setEdges((es) => es.map((x) => (x.id === id ? { ...x, ...patch } : x)))
    setDirty(true)
  }

  /** 切换边端点箭头（fromEnd/toEnd，JSON Canvas 默认 none/arrow）。 */
  function toggleEdgeEnd(id: string, end: "fromEnd" | "toEnd") {
    pushHistory()
    setEdges((es) =>
      es.map((x) => (x.id === id ? { ...x, [end]: x[end] === "arrow" ? "none" : "arrow" } : x)),
    )
    setDirty(true)
  }

  /** 编辑边 label（聚焦时入历史，输入中实时更新）。 */
  function startEdgeLabelEdit() {
    pushHistory()
  }

  // ---- 复制 / 粘贴 ----

  function copySelection() {
    if (selectedIds.length === 0) return
    const idSet = new Set(selectedIds)
    clipboardRef.current = {
      nodes: structuredClone(nodes.filter((n) => idSet.has(n.id))),
      edges: structuredClone(edges.filter((e) => idSet.has(e.fromNode) && idSet.has(e.toNode))),
    }
  }

  function pasteClipboard() {
    const clip = clipboardRef.current
    if (!clip || clip.nodes.length === 0) return
    pushHistory()
    const idMap = new Map<string, string>()
    const newNodes: CanvasNode[] = clip.nodes.map((n) => {
      const id = genId("n")
      idMap.set(n.id, id)
      return { ...structuredClone(n), id, x: n.x + 24, y: n.y + 24 }
    })
    const newEdges: CanvasEdge[] = clip.edges.map((e) => ({
      ...structuredClone(e),
      id: genId("e"),
      fromNode: idMap.get(e.fromNode) ?? e.fromNode,
      toNode: idMap.get(e.toNode) ?? e.toNode,
    }))
    setNodes((ns) => [...ns, ...newNodes])
    setEdges((es) => [...es, ...newEdges])
    setSelectedIds(newNodes.map((n) => n.id))
    setDirty(true)
  }

  // ---- 视图变换：屏幕坐标 ↔ 画布坐标 ----

  const screenToBoard = useCallback(
    (clientX: number, clientY: number) => {
      const rect = boardRef.current?.getBoundingClientRect()
      if (!rect) return { x: 0, y: 0 }
      return {
        x: (clientX - rect.left - view.panX) / view.zoom,
        y: (clientY - rect.top - view.panY) / view.zoom,
      }
    },
    [view],
  )

  /** 以画布容器内某点 (px,py) 为锚缩放。 */
  function zoomAt(px: number, py: number, factor: number) {
    setView((v) => {
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor))
      const k = zoom / v.zoom
      return { zoom, panX: px - (px - v.panX) * k, panY: py - (py - v.panY) * k }
    })
  }

  function zoomCenter(factor: number) {
    const rect = boardRef.current?.getBoundingClientRect()
    if (!rect) return
    zoomAt(rect.width / 2, rect.height / 2, factor)
  }

  /** 适应画布：让全部节点居中显示。 */
  function fitView() {
    const rect = boardRef.current?.getBoundingClientRect()
    if (!rect) return
    if (nodes.length === 0) {
      setView({ zoom: 1, panX: 0, panY: 0 })
      return
    }
    const minX = Math.min(...nodes.map((n) => n.x))
    const minY = Math.min(...nodes.map((n) => n.y))
    const maxX = Math.max(...nodes.map((n) => n.x + n.width))
    const maxY = Math.max(...nodes.map((n) => n.y + n.height))
    const pad = 60
    const zoom = Math.min(
      (rect.width - pad * 2) / (maxX - minX || 1),
      (rect.height - pad * 2) / (maxY - minY || 1),
    )
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
    setView({
      zoom: z,
      panX: rect.width / 2 - (minX + (maxX - minX) / 2) * z,
      panY: rect.height / 2 - (minY + (maxY - minY) / 2) * z,
    })
  }

  // 滚轮：Ctrl/⌘+滚轮缩放（以鼠标为锚），普通滚轮平移（Obsidian 风格）
  useEffect(() => {
    const board = boardRef.current
    if (!board) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = board.getBoundingClientRect()
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top
      if (e.ctrlKey || e.metaKey) {
        zoomAt(px, py, e.deltaY < 0 ? 1.1 : 1 / 1.1)
      } else {
        setView((v) => ({
          ...v,
          panX: v.panX - (e.shiftKey ? e.deltaY : e.deltaX),
          panY: v.panY - (e.shiftKey ? 0 : e.deltaY),
        }))
      }
    }
    board.addEventListener("wheel", onWheel, { passive: false })
    return () => board.removeEventListener("wheel", onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 空格键：按住空格 + 左键拖拽平移画布
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space") return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return
      e.preventDefault()
      spaceDownRef.current = true
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceDownRef.current = false
    }
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
    }
  }, [])

  // ---- 拖拽移动节点（支持多选整体移动） ----
  function onNodeMouseDown(e: React.MouseEvent, node: CanvasNode) {
    if (editingId) return
    // 空格或中键：平移画布
    if (spaceDownRef.current || e.button === 1) {
      startPan(e)
      return
    }
    // 点击选中：未选中则单选（Shift 加选）；已选中则保持（便于整体拖动）
    const p = screenToBoard(e.clientX, e.clientY)
    setSelectedEdgeId(null)
    if (!selectedIds.includes(node.id)) {
      const next = e.shiftKey ? [...selectedIds, node.id] : [node.id]
      setSelectedIds(next)
      const ids = next
      const origins: Record<string, { x: number; y: number }> = {}
      for (const id of ids) {
        const n = nodes.find((x) => x.id === id)
        if (n) origins[id] = { x: n.x, y: n.y }
      }
      setDragState({ startX: p.x, startY: p.y, ids, origins })
    } else {
      // 已选中：记录本次起点（供整体位移）
      const origins: Record<string, { x: number; y: number }> = {}
      for (const id of selectedIds) {
        const n = nodes.find((x) => x.id === id)
        if (n) origins[id] = { x: n.x, y: n.y }
      }
      setDragState({ startX: p.x, startY: p.y, ids: selectedIds, origins })
    }
  }

  function startPan(e: React.MouseEvent) {
    e.preventDefault()
    setPanning({ startX: e.clientX, startY: e.clientY, startPanX: view.panX, startPanY: view.panY })
  }

  function onBoardMouseDown(e: React.MouseEvent) {
    // 空格/中键：平移；左键空白：框选（Obsidian 风格）
    if (spaceDownRef.current || e.button === 1) {
      startPan(e)
    } else if (e.button === 0) {
      const p = screenToBoard(e.clientX, e.clientY)
      setMarquee({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
      setSelectedEdgeId(null)
      if (!e.shiftKey) setSelectedIds([])
    }
  }

  function onBoardMouseMove(e: React.MouseEvent) {
    if (panning) {
      setView((v) => ({
        ...v,
        panX: panning.startPanX + (e.clientX - panning.startX),
        panY: panning.startPanY + (e.clientY - panning.startY),
      }))
      return
    }
    const p = screenToBoard(e.clientX, e.clientY)
    if (dragState) {
      const dx = p.x - dragState.startX
      const dy = p.y - dragState.startY
      if (dx !== 0 || dy !== 0) dragMovedRef.current = true
      setNodes((ns) =>
        ns.map((n) => {
          const o = dragState.origins[n.id]
          if (!o) return n
          return { ...n, x: Math.max(-BOARD_SIZE / 2, o.x + dx), y: Math.max(-BOARD_SIZE / 2, o.y + dy) }
        }),
      )
    } else if (marquee) {
      setMarquee((m) => (m ? { ...m, x1: p.x, y1: p.y } : m))
    }
    if (linking) {
      setLinkPos(p)
    }
  }

  function onBoardMouseUp() {
    if (dragState) {
      if (dragMovedRef.current) setDirty(true)
      setDragState(null)
      dragMovedRef.current = false
    }
    if (marquee) {
      // 框选结算：与矩形相交的节点
      const m = marquee
      const minX = Math.min(m.x0, m.x1)
      const maxX = Math.max(m.x0, m.x1)
      const minY = Math.min(m.y0, m.y1)
      const maxY = Math.max(m.y0, m.y1)
      const hit = nodes
        .filter((n) => n.x < maxX && n.x + n.width > minX && n.y < maxY && n.y + n.height > minY)
        .map((n) => n.id)
      setSelectedIds((s) => (hit.length ? (s.length ? [...new Set([...s, ...hit])] : hit) : s))
      setMarquee(null)
    }
    setLinking(null)
    setLinkPos(null)
    setPanning(null)
  }

  // 键盘：删除选中、复制/粘贴、撤销/重做（Obsidian 风格快捷键）
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const inField = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      if (e.code === "Space") return
      if ((e.key === "Delete" || e.key === "Backspace") && !inField) {
        if (selectedEdgeId) {
          e.preventDefault()
          removeEdge(selectedEdgeId)
        } else if (selectedIds.length > 0) {
          e.preventDefault()
          removeNodes(selectedIds)
        }
        return
      }
      const mod = e.ctrlKey || e.metaKey
      if (!mod || inField) return
      const k = e.key.toLowerCase()
      if (k === "z") {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (k === "y") {
        e.preventDefault()
        redo()
      } else if (k === "c") {
        copySelection()
      } else if (k === "v") {
        e.preventDefault()
        pasteClipboard()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, selectedIds])

  // ---- 连线：从节点连接点拖到目标节点 ----
  function startLink(nodeId: string, side: string) {
    setLinking({ fromId: nodeId, fromSide: side })
  }
  function endLinkOn(targetId: string) {
    if (linking && linking.fromId !== targetId) {
      pushHistory()
      setEdges((es) => [
        ...es,
        { id: genId("e"), fromNode: linking.fromId, fromSide: linking.fromSide, toNode: targetId },
      ])
      setDirty(true)
    }
    setLinking(null)
    setLinkPos(null)
  }

  async function startEdit(node: CanvasNode) {
    if (node.type === "text") {
      setEditingId(node.id)
      setEditText(node.text ?? "")
      return
    }
    if (node.type === "file") {
      const file = await dialogs.prompt({
        title: t("core.canvas.addFileTitle"),
        initialValue: node.file ?? "",
      })
      if (file != null && file.trim()) {
        pushHistory()
        updateNode(node.id, { file: file.trim() })
      }
      return
    }
    if (node.type === "link") {
      const url = await dialogs.prompt({
        title: t("core.canvas.addLinkTitle"),
        initialValue: node.url ?? "",
      })
      if (url != null && url.trim()) {
        pushHistory()
        updateNode(node.id, { url: url.trim() })
      }
      return
    }
    // group：编辑标签
    const label = await dialogs.prompt({
      title: t("core.canvas.addGroupTitle"),
      initialValue: node.label ?? "",
    })
    if (label != null) {
      pushHistory()
      updateNode(node.id, { label: label.trim() || undefined })
    }
  }
  function commitEdit() {
    if (editingId) {
      pushHistory()
      setNodes((ns) => ns.map((n) => (n.id === editingId ? { ...n, text: editText } : n)))
      setDirty(true)
    }
    setEditingId(null)
  }

  const nodeById = (id: string) => nodes.find((n) => n.id === id)
  const selectedEdge = selectedEdgeId ? edges.find((e) => e.id === selectedEdgeId) ?? null : null

  /** 导出为 Obsidian 原生 .canvas（JSON Canvas 顶层 nodes/edges，无 .mpf 包装）。 */
  function exportCanvasFile() {
    const payload = { nodes, edges }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${col?.name || "canvas"}.canvas`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }
  const centerOf = (node: CanvasNode, side?: string) => {
    const s = side ? SIDES.find((x) => x.key === side) : undefined
    return { x: node.x + node.width * (s?.dx ?? 0.5), y: node.y + node.height * (s?.dy ?? 0.5) }
  }

  if (!col) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-6 py-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[500px] w-full" />
      </div>
    )
  }
  if (col.kind !== "canvas") {
    return <p className="px-6 py-10 text-sm text-muted-foreground">{t("core.canvas.notCanvas")}</p>
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link to="/" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" />
            {t("core.canvas.backToLibrary")}
          </Link>
          <h1 className="text-xl font-semibold">{col.name}</h1>
          <Badge variant="outline">{t("core.canvas.badge")}</Badge>
          {dirty && <Badge variant="secondary">{t("core.canvas.dirty")}</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={undo} title={t("core.canvas.undo")} disabled={undoStack.current.length === 0}>
            <Undo2 className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={redo} title={t("core.canvas.redo")} disabled={redoStack.current.length === 0}>
            <Redo2 className="size-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Plus className="size-4" />
                {t("core.canvas.addNode")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => addNode("text")}>
                <StickyNote className="size-4" />
                {t("core.canvas.addNodeText")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => addNode("file")}>
                <FileText className="size-4" />
                {t("core.canvas.addNodeFile")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => addNode("link")}>
                <Link2 className="size-4" />
                {t("core.canvas.addNodeLink")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => addNode("group")}>
                <Box className="size-4" />
                {t("core.canvas.addNodeGroup")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" onClick={save}>
            <Save className="size-4" />
            {t("common.save")}
          </Button>
        </div>
      </div>

      <p className="mb-3 text-xs text-muted-foreground">
        {t("core.canvas.help")}
      </p>

      <div
        ref={boardRef}
        className="relative h-[560px] select-none overflow-hidden rounded-lg border bg-muted/20"
        onMouseDown={onBoardMouseDown}
        onMouseMove={onBoardMouseMove}
        onMouseUp={onBoardMouseUp}
        onMouseLeave={onBoardMouseUp}
      >
        {/* 内容层（board 坐标空间，随视图变换平移缩放） */}
        <div
          className="absolute left-0 top-0"
          style={{
            width: BOARD_SIZE,
            height: BOARD_SIZE,
            transform: `translate(${view.panX}px, ${view.panY}px) scale(${view.zoom})`,
            transformOrigin: "0 0",
          }}
        >
          {/* 连线层 */}
          <svg className="pointer-events-none absolute inset-0" width={BOARD_SIZE} height={BOARD_SIZE}>
            {edges.map((e) => {
              const a = nodeById(e.fromNode)
              const b = nodeById(e.toNode)
              if (!a || !b) return null
              const p1 = centerOf(a, e.fromSide)
              const p2 = centerOf(b, e.toSide)
              const color = resolveColor(e.color) ?? "#94a3b8"
              const selected = selectedEdgeId === e.id
              const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x)
              // JSON Canvas 默认：fromEnd=none、toEnd=arrow
              const fromEnd = e.fromEnd === "arrow"
              const toEnd = e.toEnd === "arrow" || e.toEnd == null
              return (
                <g key={e.id}>
                  <line
                    x1={p1.x}
                    y1={p1.y}
                    x2={p2.x}
                    y2={p2.y}
                    stroke={color}
                    strokeWidth={selected ? 3 : 1.5}
                    style={{ pointerEvents: "stroke", cursor: "pointer" }}
                    onMouseDown={(ev) => {
                      ev.stopPropagation()
                      selectEdge(e)
                    }}
                  />
                  {toEnd && <polygon points={arrowPoints(p2.x, p2.y, angle)} fill={color} className="pointer-events-none" />}
                  {fromEnd && <polygon points={arrowPoints(p1.x, p1.y, angle + Math.PI)} fill={color} className="pointer-events-none" />}
                </g>
              )
            })}
            {linking && linkPos && (() => {
              const a = nodeById(linking.fromId)
              if (!a) return null
              const p1 = centerOf(a, linking.fromSide)
              return <line x1={p1.x} y1={p1.y} x2={linkPos.x} y2={linkPos.y} stroke="#6366f1" strokeWidth={1.5} strokeDasharray="4 3" />
            })()}
          </svg>

          {/* 边 label（显示在连线中点上方） */}
          {edges.map((e) => {
            const a = nodeById(e.fromNode)
            const b = nodeById(e.toNode)
            if (!a || !b || !e.label) return null
            const p1 = centerOf(a, e.fromSide)
            const p2 = centerOf(b, e.toSide)
            return (
              <div
                key={`${e.id}-label`}
                className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground"
                style={{ left: (p1.x + p2.x) / 2, top: (p1.y + p2.y) / 2 }}
              >
                {e.label}
              </div>
            )
          })}

          {/* 节点层 */}
          {nodes.map((node) => {
            const isEditing = editingId === node.id
            const isSelected = selectedIds.includes(node.id)
            return (
              <div
                key={node.id}
                onMouseDown={(e) => onNodeMouseDown(e, node)}
                onMouseUp={() => endLinkOn(node.id)}
                className={cn(
                  "absolute cursor-grab rounded-md border bg-card p-2 shadow-sm active:cursor-grabbing",
                  isSelected && "ring-2 ring-primary",
                )}
                style={{
                  left: node.x,
                  top: node.y,
                  width: node.width,
                  height: node.height,
                  borderColor: node.color || undefined,
                  background: node.type === "group" ? "rgba(100,116,139,0.15)" : undefined,
                }}
              >
                {/* 删除 */}
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => removeNode(node.id)}
                  className="absolute -right-2 -top-2 z-10 rounded-full bg-background p-0.5 text-muted-foreground opacity-0 shadow hover:text-destructive group-hover:opacity-100 hover:opacity-100"
                  title={t("core.canvas.deleteNode")}
                >
                  <Trash2 className="size-3" />
                </button>

                {node.type === "text" ? (
                  isEditing ? (
                    <textarea
                      autoFocus
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onBlur={commitEdit}
                      onMouseDown={(e) => e.stopPropagation()}
                      className="h-full w-full resize-none bg-transparent text-xs outline-none"
                    />
                  ) : (
                    <div onDoubleClick={() => startEdit(node)} className="h-full w-full overflow-auto whitespace-pre-wrap text-xs">
                      {node.text || t("core.canvas.empty")}
                    </div>
                  )
                ) : node.type === "file" ? (
                  <div className="flex h-full w-full items-center gap-1.5 text-xs text-muted-foreground" title={node.file}>
                    <FileText className="size-3.5 shrink-0 text-primary" />
                    <span className="truncate">{node.file?.split("/").pop() || node.file}</span>
                  </div>
                ) : node.type === "link" ? (
                  <a
                    href={node.url}
                    target="_blank"
                    rel="noreferrer"
                    onMouseDown={(e) => e.stopPropagation()}
                    className="flex h-full w-full items-center gap-1.5 text-xs text-primary hover:underline"
                  >
                    <Link2 className="size-3.5 shrink-0" />
                    <span className="truncate">{node.label || node.url}</span>
                  </a>
                ) : (
                  <div className="flex h-full w-full items-center gap-1 text-xs font-medium">
                    <StickyNote className="size-3.5" />
                    {node.label || t("core.canvas.group")}
                  </div>
                )}

                {/* 连接点 */}
                {!isEditing && (
                  <>
                    {SIDES.map((s) => (
                      <div
                        key={s.key}
                        onMouseDown={(e) => {
                          e.stopPropagation()
                          startLink(node.id, s.key)
                        }}
                        className="absolute z-10 size-2.5 rounded-full border border-primary bg-background opacity-0 hover:opacity-100"
                        style={{ left: `calc(${s.dx * 100}% - 5px)`, top: `calc(${s.dy * 100}% - 5px)` }}
                        title={t("core.canvas.dragLink")}
                      />
                    ))}
                  </>
                )}
              </div>
            )
          })}

          {/* 框选矩形 */}
          {marquee && (
            <div
              className="pointer-events-none absolute z-20 rounded-sm border border-primary/70 bg-primary/10"
              style={{
                left: Math.min(marquee.x0, marquee.x1),
                top: Math.min(marquee.y0, marquee.y1),
                width: Math.abs(marquee.x1 - marquee.x0),
                height: Math.abs(marquee.y1 - marquee.y0),
              }}
            />
          )}

          {nodes.length === 0 && (
            <p className="absolute left-0 top-0 text-sm text-muted-foreground" style={{ padding: 40 }}>
              {t("core.canvas.emptyBoard")}
            </p>
          )}
        </div>

        {/* 选中节点的工具条（Obsidian 风格：色板 / 分组标签 / 删除） */}
        {!selectedEdge && selectedIds.length > 0 && (
          <div
            className="absolute top-2 left-1/2 z-30 flex max-w-[95%] -translate-x-1/2 flex-wrap items-center gap-1 rounded-lg border bg-background/95 p-1.5 text-xs shadow-sm"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {Object.entries(PRESET_COLORS).map(([k, v]) => {
              const active = selectedIds.length === 1 && nodes.find((n) => n.id === selectedIds[0])?.color === k
              return (
                <button
                  key={k}
                  onClick={() => applyNodeColor(k)}
                  className={cn(
                    "size-4 rounded-full border border-black/15 transition-transform hover:scale-110",
                    active && "ring-2 ring-primary ring-offset-1",
                  )}
                  style={{ background: v }}
                  title={t("core.canvas.colorTitle", { color: k })}
                />
              )
            })}
            <button
              onClick={() => applyNodeColor(undefined)}
              className={cn(
                "size-4 rounded-full border border-dashed border-muted-foreground/60",
                selectedIds.length === 1 && !nodes.find((n) => n.id === selectedIds[0])?.color && "ring-2 ring-primary ring-offset-1",
              )}
              title={t("core.canvas.clearColor")}
            />
            {selectedIds.length === 1 &&
              nodes.find((n) => n.id === selectedIds[0])?.type === "group" &&
              (() => {
                const g = nodes.find((n) => n.id === selectedIds[0])!
                return (
                  <>
                    <span className="mx-1 h-4 w-px bg-border" />
                    <input
                      defaultValue={g.label ?? ""}
                      onFocus={pushHistory}
                      onChange={(e) => updateNode(g.id, { label: e.target.value || undefined })}
                      placeholder={t("core.canvas.groupName")}
                      className="h-6 w-28 rounded border bg-transparent px-1.5 outline-none placeholder:text-muted-foreground"
                    />
                  </>
                )
              })()}
            <span className="mx-1 h-4 w-px bg-border" />
            <Button
              variant="ghost"
              size="icon"
              className="size-6 text-destructive"
              onClick={() => removeNodes(selectedIds)}
              title={t("core.canvas.deleteNode")}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        )}

        {/* 选中边的工具条（Obsidian 风格：端点箭头/标签/颜色/删除） */}
        {selectedEdge && (
          <div
            className="absolute top-2 left-1/2 z-30 flex max-w-[95%] -translate-x-1/2 flex-wrap items-center gap-1 rounded-lg border bg-background/95 p-1.5 text-xs shadow-sm"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <span className="pl-1 text-muted-foreground">{t("core.canvas.edgeStart")}</span>
            <Button
              variant={selectedEdge.fromEnd === "arrow" ? "default" : "ghost"}
              size="sm"
              className="h-6 px-1.5"
              onClick={() => toggleEdgeEnd(selectedEdge.id, "fromEnd")}
              title={t("core.canvas.toggleStartArrow")}
            >
              {t("core.canvas.arrow")}
            </Button>
            <span className="pl-1 text-muted-foreground">{t("core.canvas.edgeEnd")}</span>
            <Button
              variant={selectedEdge.toEnd === "arrow" || selectedEdge.toEnd == null ? "default" : "ghost"}
              size="sm"
              className="h-6 px-1.5"
              onClick={() => toggleEdgeEnd(selectedEdge.id, "toEnd")}
              title={t("core.canvas.toggleEndArrow")}
            >
              {t("core.canvas.arrow")}
            </Button>
            <span className="mx-1 h-4 w-px bg-border" />
            <input
              value={edgeLabelDraft}
              onFocus={startEdgeLabelEdit}
              onChange={(e) => {
                setEdgeLabelDraft(e.target.value)
                updateEdge(selectedEdge.id, { label: e.target.value })
              }}
              placeholder={t("core.canvas.edgeLabel")}
              className="h-6 w-24 rounded border bg-transparent px-1.5 outline-none placeholder:text-muted-foreground"
            />
            <span className="mx-1 h-4 w-px bg-border" />
            {Object.entries(PRESET_COLORS).map(([k, v]) => (
              <button
                key={k}
                onClick={() => {
                  pushHistory()
                  updateEdge(selectedEdge.id, { color: k })
                }}
                className={cn(
                  "size-4 rounded-full border border-black/15 transition-transform hover:scale-110",
                  selectedEdge.color === k && "ring-2 ring-primary ring-offset-1",
                )}
                style={{ background: v }}
                title={t("core.canvas.colorTitle", { color: k })}
              />
            ))}
            <button
              onClick={() => {
                pushHistory()
                updateEdge(selectedEdge.id, { color: undefined })
              }}
              className={cn(
                "size-4 rounded-full border border-dashed border-muted-foreground/60",
                !selectedEdge.color && "ring-2 ring-primary ring-offset-1",
              )}
              title={t("core.canvas.clearColor")}
            />
            <span className="mx-1 h-4 w-px bg-border" />
            <Button
              variant="ghost"
              size="icon"
              className="size-6 text-destructive"
              onClick={() => removeEdge(selectedEdge.id)}
              title={t("core.canvas.deleteEdge")}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        )}

        {/* 缩放控件 */}
        <div className="absolute right-3 bottom-3 z-20 flex items-center gap-0.5 rounded-lg border bg-background/95 p-1 shadow-sm">
          <Button variant="ghost" size="icon" className="size-6" onClick={() => zoomCenter(1 / 1.2)} title={t("core.canvas.zoomOut")}>
            <Minus className="size-3.5" />
          </Button>
          <span className="w-11 text-center text-xs tabular-nums text-muted-foreground">
            {Math.round(view.zoom * 100)}%
          </span>
          <Button variant="ghost" size="icon" className="size-6" onClick={() => zoomCenter(1.2)} title={t("core.canvas.zoomIn")}>
            <Plus className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="size-6" onClick={fitView} title={t("core.canvas.fitView")}>
            <Maximize className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{t("core.canvas.stats", { nodes: nodes.length, edges: edges.length })}</p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCanvasFile}>
            <Download className="size-4" />
            {t("core.canvas.exportCanvas")}
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={cid ? api.exportMpfUrl(cid, "collection") : "#"}>
              <Download className="size-4" />
              {t("core.canvas.exportMpf")}
            </a>
          </Button>
        </div>
      </div>
    </div>
  )
}
