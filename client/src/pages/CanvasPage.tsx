import { useCallback, useEffect, useRef, useState } from "react"
import { Link, useParams } from "react-router-dom"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { AlignCenter, AlignLeft, AlignRight, ArrowLeft, Box, CornerDownRight, Download, FileText, Focus, Image, Library, Link2, Maximize, Minus, MoveHorizontal, PanelLeft, Plus, Redo2, Save, Spline, StickyNote, Trash2, Undo2, X } from "lucide-react"
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

/** 节点尺寸调整手柄（四角 + 四边中点，Obsidian 风格；边中点向外拖=连线、向内拖=单向缩放）。 */
type ResizeDir = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w"
const RESIZE_DIRS: ResizeDir[] = ["nw", "ne", "se", "sw"]
const RESIZE_STYLE: Record<ResizeDir, { style: React.CSSProperties; cursor: string }> = {
  nw: { style: { left: -5, top: -5 }, cursor: "nwse-resize" },
  ne: { style: { right: -5, top: -5 }, cursor: "nesw-resize" },
  se: { style: { right: -5, bottom: -5 }, cursor: "nwse-resize" },
  sw: { style: { left: -5, bottom: -5 }, cursor: "nesw-resize" },
  n: { style: { left: "50%", top: -5, transform: "translateX(-50%)" }, cursor: "ns-resize" },
  s: { style: { left: "50%", bottom: -5, transform: "translateX(-50%)" }, cursor: "ns-resize" },
  e: { style: { right: -5, top: "50%", transform: "translateY(-50%)" }, cursor: "ew-resize" },
  w: { style: { left: -5, top: "50%", transform: "translateY(-50%)" }, cursor: "ew-resize" },
}
const MIN_NODE_W = 60
const MIN_NODE_H = 40

/** 连接点所在边 → 单向缩放方向。 */
const SIDE_TO_DIR: Record<string, ResizeDir> = { top: "n", right: "e", bottom: "s", left: "w" }

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

/** 边的连接路径（Obsidian pathfindingMethod：smooth 平滑曲线 / straight 直线 / square 直角折线）。 */
function edgePath(p1: { x: number; y: number }, p2: { x: number; y: number }, method?: string): string {
  if (method === "straight") {
    return `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`
  }
  if (method === "square") {
    const mx = (p1.x + p2.x) / 2
    return `M ${p1.x} ${p1.y} L ${mx} ${p1.y} L ${mx} ${p2.y} L ${p2.x} ${p2.y}`
  }
  // smooth（默认）：三次贝塞尔曲线，控制点在水平方向
  return `M ${p1.x} ${p1.y} C ${p1.x + (p2.x - p1.x) / 2} ${p1.y}, ${p2.x - (p2.x - p1.x) / 2} ${p2.y}, ${p2.x} ${p2.y}`
}

/** 附着边 → 箭头指向节点内部的方向（垂直于卡片边沿）。 */
function sideAngle(side?: string): number {
  switch (side) {
    case "right":
      return Math.PI // 右边缘进入 → 指向左（节点内部）
    case "left":
      return 0
    case "top":
      return Math.PI / 2
    case "bottom":
      return -Math.PI / 2
    default:
      return 0
  }
}

/** 点相对节点中心的方位 → 附着边（top/right/bottom/left）。 */
function sideOfNode(node: CanvasNode, p: { x: number; y: number }): string {
  const dx = p.x - (node.x + node.width / 2)
  const dy = p.y - (node.y + node.height / 2)
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left"
  return dy > 0 ? "bottom" : "top"
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
  /** 节点尺寸调整（四角手柄拖拽）。 */
  const [resizing, setResizing] = useState<{ id: string; dir: ResizeDir; startX: number; startY: number; orig: { x: number; y: number; width: number; height: number } } | null>(null)
  /** 边中点手柄按下待定（向外拖=连线，向内拖=单向缩放）。 */
  const [pendingHandle, setPendingHandle] = useState<{ id: string; side: string; startX: number; startY: number } | null>(null)
  /** 连线中段按下（拖动改变靠近一侧的附着点，Obsidian 重新锚定）。 */
  const attachPressRef = useRef<{ edgeId: string; startX: number; startY: number } | null>(null)
  const attachDragRef = useRef<{ edgeId: string } | null>(null)
  /** 撤销/重做历史栈。 */
  const undoStack = useRef<{ nodes: CanvasNode[]; edges: CanvasEdge[] }[]>([])
  const redoStack = useRef<{ nodes: CanvasNode[]; edges: CanvasEdge[] }[]>([])
  /** 复制缓冲区（节点 + 关联边）。 */
  const clipboardRef = useRef<{ nodes: CanvasNode[]; edges: CanvasEdge[] } | null>(null)
  const spaceDownRef = useRef(false)
  const boardRef = useRef<HTMLDivElement>(null)
  /** 导航抽屉（全屏模式下收缩的全局导航，点击悬浮按钮展开）。 */
  const [navOpen, setNavOpen] = useState(false)
  const [drawerLibs, setDrawerLibs] = useState<{ libId: string; libName: string; canvases: { id: string; name: string }[] }[]>([])
  /** 右键菜单（Obsidian 风格：空白处右键单击弹出新建菜单，右键拖拽为平移）。 */
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; board: { x: number; y: number } } | null>(null)
  /** 右键手势记录（按下位置 + 是否已移动为拖拽）。 */
  const rightPressRef = useRef<{ startX: number; startY: number; moved: boolean; startPanX: number; startPanY: number } | null>(null)
  /** 右键拖拽结束后的下一次 contextmenu 应被抑制（拖拽松开也会触发 contextmenu）。 */
  const suppressCtxMenuRef = useRef(false)

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

  // 导航抽屉数据：各库下的图表集合（用于快速切换）
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const libs = await api.listLibraries()
        const out: { libId: string; libName: string; canvases: { id: string; name: string }[] }[] = []
        for (const lib of libs) {
          const full = await api.getLibrary(lib.id)
          const canvases = (full.collections ?? []).filter((c) => c.kind === "canvas")
          if (canvases.length) out.push({ libId: lib.id, libName: lib.name, canvases })
        }
        if (alive) setDrawerLibs(out)
      } catch {
        // 忽略：抽屉仅作导航增强，失败不阻断画布
      }
    })()
    return () => {
      alive = false
    }
  }, [cid])

  async function save() {
    if (!cid) return
    try {
      // 若正在编辑文本节点，先将其提交进节点数据再保存（Ctrl+Enter 保存）
      const finalNodes = editingId ? nodes.map((n) => (n.id === editingId ? { ...n, text: editText } : n)) : nodes
      await api.updateCollectionCanvas(cid, finalNodes, edges)
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

  /** 新建节点（text/file/link/group），文件/链接/分组需弹窗输入（Obsidian 兼容字段）；pos 为画布坐标（右键/双击指定位置）。 */
  async function addNode(type: CanvasNode["type"], pos?: { x: number; y: number }) {
    const base = {
      id: genId("n"),
      type,
      x: pos ? Math.max(0, pos.x - 100) : 40 + Math.random() * 200,
      y: pos ? Math.max(0, pos.y - 40) : 40 + Math.random() * 120,
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

  /** 开始拖拽调整节点尺寸（四角手柄）。 */
  function startResize(e: React.MouseEvent, node: CanvasNode, dir: ResizeDir) {
    e.stopPropagation()
    if (editingId) return
    pushHistory()
    const p = screenToBoard(e.clientX, e.clientY)
    setResizing({
      id: node.id,
      dir,
      startX: p.x,
      startY: p.y,
      orig: { x: node.x, y: node.y, width: node.width, height: node.height },
    })
  }

  /** 把选中节点编组：创建覆盖它们包围盒的分组（Obsidian Create group）。 */
  function groupSelection() {
    if (selectedIds.length < 1) return
    pushHistory()
    const idSet = new Set(selectedIds)
    const ns = nodes.filter((n) => idSet.has(n.id))
    if (ns.length === 0) return
    const pad = 32
    const minX = Math.min(...ns.map((n) => n.x)) - pad
    const minY = Math.min(...ns.map((n) => n.y)) - pad
    const maxX = Math.max(...ns.map((n) => n.x + n.width)) + pad
    const maxY = Math.max(...ns.map((n) => n.y + n.height)) + pad
    const group: CanvasNode = {
      id: genId("n"),
      type: "group",
      x: Math.max(-BOARD_SIZE / 2, minX),
      y: Math.max(-BOARD_SIZE / 2, minY),
      width: Math.max(MIN_NODE_W, maxX - minX),
      height: Math.max(MIN_NODE_H, maxY - minY),
    }
    setNodes((n) => [...n, group])
    setSelectedIds([group.id])
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

  /** 把选中的节点居中到视口（Obsidian「居中卡片」）。 */
  function centerSelection() {
    if (selectedIds.length === 0) return
    const idSet = new Set(selectedIds)
    const ns = nodes.filter((n) => idSet.has(n.id))
    if (ns.length === 0) return
    const cx = ns.reduce((s, n) => s + n.x + n.width / 2, 0) / ns.length
    const cy = ns.reduce((s, n) => s + n.y + n.height / 2, 0) / ns.length
    const rect = boardRef.current?.getBoundingClientRect()
    if (!rect) return
    setView((v) => ({
      ...v,
      panX: rect.width / 2 - cx * v.zoom,
      panY: rect.height / 2 - cy * v.zoom,
    }))
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
    // 右键：与空白处一致，记录手势（拖拽平移 / 单击弹菜单）
    if (e.button === 2) {
      setCtxMenu(null)
      rightPressRef.current = { startX: e.clientX, startY: e.clientY, moved: false, startPanX: view.panX, startPanY: view.panY }
      return
    }
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
    // 右键：按下记录手势，拖拽 = 平移，单击 = 弹新建菜单（Obsidian 风格）
    if (e.button === 2) {
      setCtxMenu(null)
      rightPressRef.current = { startX: e.clientX, startY: e.clientY, moved: false, startPanX: view.panX, startPanY: view.panY }
      return
    }
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
    // 右键拖拽平移（超过阈值后视为拖拽）
    const rp = rightPressRef.current
    if (rp) {
      if (!rp.moved && Math.hypot(e.clientX - rp.startX, e.clientY - rp.startY) > 4) rp.moved = true
      if (rp.moved) {
        setView((v) => ({
          ...v,
          panX: rp.startPanX + (e.clientX - rp.startX),
          panY: rp.startPanY + (e.clientY - rp.startY),
        }))
      }
      return
    }
    if (panning) {
      setView((v) => ({
        ...v,
        panX: panning.startPanX + (e.clientX - panning.startX),
        panY: panning.startPanY + (e.clientY - panning.startY),
      }))
      return
    }
    const p = screenToBoard(e.clientX, e.clientY)
    // 边中点手柄：向外拖 = 创建连线，向内拖 = 单向缩放（Obsidian 同点双功能）
    if (pendingHandle) {
      const hn = nodes.find((n) => n.id === pendingHandle.id)
      if (!hn) {
        setPendingHandle(null)
        return
      }
      const dx = p.x - pendingHandle.startX
      const dy = p.y - pendingHandle.startY
      if (Math.hypot(dx, dy) < 4) return
      const mid = centerOf(hn, pendingHandle.side)
      // 位移方向与「节点中心→边中点」同向 = 向外
      const outward = (mid.x - hn.x - hn.width / 2) * dx + (mid.y - hn.y - hn.height / 2) * dy
      if (outward > 0) {
        // 向外：连线
        setLinking({ fromId: hn.id, fromSide: pendingHandle.side })
        setLinkPos(p)
      } else {
        // 向内：单向缩放
        pushHistory()
        setResizing({
          id: hn.id,
          dir: SIDE_TO_DIR[pendingHandle.side] ?? "e",
          startX: pendingHandle.startX,
          startY: pendingHandle.startY,
          orig: { x: hn.x, y: hn.y, width: hn.width, height: hn.height },
        })
      }
      setPendingHandle(null)
      return
    }
    // 拖动连线中段：实时把靠近一侧的附着点吸到鼠标方位（Obsidian 重新锚定）
    const ap = attachPressRef.current
    if (ap) {
      if (!attachDragRef.current) {
        if (Math.hypot(p.x - ap.startX, p.y - ap.startY) < 5) return
        pushHistory()
        attachDragRef.current = { edgeId: ap.edgeId }
      }
      const edge = edges.find((x) => x.id === ap.edgeId)
      if (edge) {
        const na = nodes.find((n) => n.id === edge.fromNode)
        const nb = nodes.find((n) => n.id === edge.toNode)
        if (na && nb) {
          const da = Math.hypot(p.x - (na.x + na.width / 2), p.y - (na.y + na.height / 2))
          const db = Math.hypot(p.x - (nb.x + nb.width / 2), p.y - (nb.y + nb.height / 2))
          if (da <= db) updateEdge(edge.id, { fromSide: sideOfNode(na, p) })
          else updateEdge(edge.id, { toSide: sideOfNode(nb, p) })
        }
      }
      return
    }
    if (resizing) {
      const dx = p.x - resizing.startX
      const dy = p.y - resizing.startY
      const dir = resizing.dir
      setNodes((ns) =>
        ns.map((n) => {
          if (n.id !== resizing.id) return n
          const o = resizing.orig
          let x = o.x
          let y = o.y
          let width = o.width
          let height = o.height
          if (dir.includes("e")) width = Math.max(MIN_NODE_W, o.width + dx)
          if (dir.includes("s")) height = Math.max(MIN_NODE_H, o.height + dy)
          if (dir.includes("w")) {
            const w = Math.max(MIN_NODE_W, o.width - dx)
            x = o.x + (o.width - w)
            width = w
          }
          if (dir.includes("n")) {
            const h = Math.max(MIN_NODE_H, o.height - dy)
            y = o.y + (o.height - h)
            height = h
          }
          return { ...n, x, y, width, height }
        }),
      )
      return
    }
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
    // 右键释放：仅结束手势；菜单改由 contextmenu 事件触发（避免遮罩自关）
    if (rightPressRef.current) {
      const rp = rightPressRef.current
      rightPressRef.current = null
      if (rp.moved) suppressCtxMenuRef.current = true
      return
    }
    if (pendingHandle) {
      setPendingHandle(null)
      return
    }
    if (attachPressRef.current || attachDragRef.current) {
      attachPressRef.current = null
      attachDragRef.current = null
      return
    }
    if (resizing) {
      setDirty(true)
      setResizing(null)
      return
    }
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
      if (e.key === "Escape") {
        setCtxMenu(null)
        return
      }
      // Ctrl+Enter：提交文本编辑并保存画布
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault()
        commitEdit()
        void save()
        return
      }
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

  // ---- 连线：从节点边中点拖到目标节点（向外拖），向内拖为单向缩放 ----
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
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* 顶部工具栏（全屏沉浸式画布的自有工具条） */}
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b bg-background/95 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setNavOpen((v) => !v)}
            title={t("core.canvas.toggleNav")}
          >
            <PanelLeft className="size-4" />
          </Button>
          <Link to="/" className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" />
            {t("core.canvas.backToLibrary")}
          </Link>
          <span className="shrink-0 text-muted-foreground">/</span>
          <h1 className="truncate text-base font-semibold">{col.name}</h1>
          <Badge variant="outline" className="shrink-0">{t("core.canvas.badge")}</Badge>
          {dirty && <Badge variant="secondary" className="shrink-0">{t("core.canvas.dirty")}</Badge>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="size-4" />
                {t("core.canvas.export")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportCanvasFile}>{t("core.canvas.exportCanvas")}</DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={cid ? api.exportMpfUrl(cid, "collection") : "#"}>{t("core.canvas.exportMpf")}</a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* 画布区域（占满剩余空间） */}
      <div className="relative flex-1 overflow-hidden">
      <div
        ref={boardRef}
        className="absolute inset-0 select-none overflow-hidden bg-muted/20"
        onMouseDown={onBoardMouseDown}
        onMouseMove={onBoardMouseMove}
        onMouseUp={onBoardMouseUp}
        onMouseLeave={onBoardMouseUp}
        onContextMenu={(e) => {
          e.preventDefault()
          // 右键拖拽松开也会触发 contextmenu：拖拽结束后抑制一次
          if (suppressCtxMenuRef.current) {
            suppressCtxMenuRef.current = false
            return
          }
          setCtxMenu({ x: e.clientX, y: e.clientY, board: screenToBoard(e.clientX, e.clientY) })
        }}
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = "copy"
        }}
        onDrop={(e) => {
          e.preventDefault()
          const dragType = e.dataTransfer.getData("application/x-canvas-add")
          if (!dragType) return
          const p = screenToBoard(e.clientX, e.clientY)
          const map: Record<string, CanvasNode["type"]> = { card: "text", note: "text", noteVault: "file", mediaVault: "file" }
          void addNode(map[dragType] ?? "text", p)
        }}
        onDoubleClick={(e) => {
          // 空白处双击创建文本卡片（Obsidian 风格；节点上的双击为编辑）
          if ((e.target as HTMLElement).closest("[data-node]")) return
          const p = screenToBoard(e.clientX, e.clientY)
          void addNode("text", p)
        }}
      >
        {/* 内容层（board 坐标空间，随视图变换平移缩放） */}
        <div
          className="absolute left-0 top-0"
          style={{
            width: BOARD_SIZE,
            height: BOARD_SIZE,
            transform: `translate(${view.panX}px, ${view.panY}px) scale(${view.zoom})`,
            transformOrigin: "0 0",
            // Obsidian 风格点状网格（随缩放变换自动缩放）
            backgroundImage: "radial-gradient(circle, rgba(148,163,184,0.35) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
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
              const d = edgePath(p1, p2, e.styleAttributes?.pathfindingMethod)
              // JSON Canvas 默认：fromEnd=none、toEnd=arrow；箭头垂直于卡片边沿
              const fromEnd = e.fromEnd === "arrow"
              const toEnd = e.toEnd === "arrow" || e.toEnd == null
              const toAngle = sideAngle(e.toSide)
              const fromAngle = sideAngle(e.fromSide) + Math.PI
              return (
                <g key={e.id}>
                  {/* 连线路径：smooth 曲线 / straight 直线 / square 直角折线（Obsidian pathfindingMethod） */}
                  <path
                    d={d}
                    fill="none"
                    stroke={color}
                    strokeWidth={selected ? 3 : 1.5}
                    style={{ pointerEvents: "stroke", cursor: "pointer" }}
                    onMouseDown={(ev) => {
                      ev.stopPropagation()
                      selectEdge(e)
                      const bp = screenToBoard(ev.clientX, ev.clientY)
                      attachPressRef.current = { edgeId: e.id, startX: bp.x, startY: bp.y }
                    }}
                  />
                  {toEnd && <polygon points={arrowPoints(p2.x, p2.y, toAngle)} fill={color} className="pointer-events-none" />}
                  {fromEnd && <polygon points={arrowPoints(p1.x, p1.y, fromAngle)} fill={color} className="pointer-events-none" />}
                </g>
              )
            })}
            {linking && linkPos && (() => {
              const a = nodeById(linking.fromId)
              if (!a) return null
              const p1 = centerOf(a, linking.fromSide)
              return (
                <path
                  d={`M ${p1.x} ${p1.y} C ${p1.x + (linkPos.x - p1.x) / 2} ${p1.y}, ${linkPos.x - (linkPos.x - p1.x) / 2} ${linkPos.y}, ${linkPos.x} ${linkPos.y}`}
                  fill="none"
                  stroke="#6366f1"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                />
              )
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
                className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground shadow-sm"
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
                data-node
                onMouseDown={(e) => onNodeMouseDown(e, node)}
                onMouseUp={() => endLinkOn(node.id)}
                className={cn(
                  "group absolute cursor-grab p-2 active:cursor-grabbing",
                  // Obsidian：文本节点默认无边框（hover 显示淡边框），文件/链接为带边框卡片，分组为半透明圆角块
                  node.type === "text" && "rounded-md border border-transparent bg-card shadow-sm transition-colors hover:border-border",
                  (node.type === "file" || node.type === "link") && "rounded-md border bg-card shadow-sm",
                  node.type === "group" && "rounded-lg",
                  isSelected && "ring-2 ring-primary",
                )}
                style={{
                  left: node.x,
                  top: node.y,
                  width: node.width,
                  height: node.height,
                  borderColor: node.color || undefined,
                  background: node.type === "group"
                    ? `${resolveColor(node.color) ?? "rgba(100,116,139,0.6)"}1f`
                    : undefined,
                }}
              >
                {/* 删除 */}
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => removeNode(node.id)}
                  className={cn(
                    "absolute -right-2 -top-2 z-10 rounded-full bg-background p-0.5 text-muted-foreground opacity-0 shadow hover:text-destructive group-hover:opacity-100 hover:opacity-100",
                    isSelected && "opacity-100",
                  )}
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
                    <div
                      onDoubleClick={() => startEdit(node)}
                      className="markdown-body canvas-node-md h-full w-full overflow-auto text-xs"
                      style={{ textAlign: node.styleAttributes?.textAlign }}
                    >
                      {node.text ? (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{node.text}</ReactMarkdown>
                      ) : (
                        <span className="text-muted-foreground">{t("core.canvas.empty")}</span>
                      )}
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
                  // Obsidian 分组：半透明圆角块，标签在顶部居中，无内容区
                  <div className="absolute inset-x-2 top-2 text-center text-xs font-medium text-foreground/70">
                    {node.label || t("core.canvas.group")}
                  </div>
                )}

                {/* 尺寸调整手柄（hover/选中节点显示四角；Obsidian：无需先点击即可拖拽调整） */}
                {!isEditing && (
                  <>
                    {RESIZE_DIRS.map((dir) => (
                      <div
                        key={dir}
                        onMouseDown={(e) => startResize(e, node, dir)}
                        className={cn(
                          "absolute z-20 size-2.5 rounded-full border border-primary bg-background opacity-0 shadow-sm transition-opacity group-hover:opacity-100 hover:scale-125",
                          isSelected && "opacity-100",
                        )}
                        style={RESIZE_STYLE[dir].style}
                        title={t("core.canvas.resize")}
                      />
                    ))}
                  </>
                )}

                {/* 连接点 / 边中点手柄（向外拖=连线，向内拖=单向缩放） */}
                {!isEditing && (
                  <>
                    {SIDES.map((s) => (
                      <div
                        key={s.key}
                        onMouseDown={(e) => {
                          e.stopPropagation()
                          const p = screenToBoard(e.clientX, e.clientY)
                          setPendingHandle({ id: node.id, side: s.key, startX: p.x, startY: p.y })
                        }}
                        className={cn(
                          "absolute z-10 size-2.5 rounded-full border border-primary bg-background opacity-0 transition-opacity group-hover:opacity-100",
                          isSelected && "opacity-100",
                        )}
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
            {selectedIds.length === 1 &&
              nodes.find((n) => n.id === selectedIds[0])?.type === "text" &&
              (() => {
                const tn = nodes.find((n) => n.id === selectedIds[0])!
                const align = tn.styleAttributes?.textAlign ?? "left"
                return (
                  <>
                    <span className="mx-1 h-4 w-px bg-border" />
                    {(
                      [
                        { v: "left" as const, icon: AlignLeft, label: t("core.canvas.alignLeft") },
                        { v: "center" as const, icon: AlignCenter, label: t("core.canvas.alignCenter") },
                        { v: "right" as const, icon: AlignRight, label: t("core.canvas.alignRight") },
                      ]
                    ).map((a) => (
                      <Button
                        key={a.v}
                        variant={align === a.v ? "default" : "ghost"}
                        size="icon"
                        className="size-6"
                        onClick={() => {
                          pushHistory()
                          updateNode(tn.id, {
                            styleAttributes: {
                              ...(tn.styleAttributes ?? {}),
                              textAlign: a.v === "left" ? undefined : a.v,
                            },
                          })
                        }}
                        title={a.label}
                      >
                        <a.icon className="size-3.5" />
                      </Button>
                    ))}
                  </>
                )
              })()}
            <span className="mx-1 h-4 w-px bg-border" />
            <Button variant="ghost" size="icon" className="size-6" onClick={groupSelection} title={t("core.canvas.groupSelection")}>
              <Box className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="size-6" onClick={centerSelection} title={t("core.canvas.center")}>
              <Focus className="size-3.5" />
            </Button>
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
            <span className="pl-1 text-muted-foreground">{t("core.canvas.edgePath")}</span>
            {(
              [
                { v: "smooth" as const, icon: Spline, label: t("core.canvas.pathSmooth") },
                { v: "straight" as const, icon: MoveHorizontal, label: t("core.canvas.pathStraight") },
                { v: "square" as const, icon: CornerDownRight, label: t("core.canvas.pathSquare") },
              ]
            ).map((p) => (
              <Button
                key={p.v}
                variant={selectedEdge.styleAttributes?.pathfindingMethod === p.v ? "default" : "ghost"}
                size="icon"
                className="size-6"
                onClick={() => {
                  pushHistory()
                  updateEdge(selectedEdge.id, {
                    styleAttributes: {
                      ...(selectedEdge.styleAttributes ?? {}),
                      pathfindingMethod: p.v === "smooth" ? undefined : p.v,
                    },
                  })
                }}
                title={p.label}
              >
                <p.icon className="size-3.5" />
              </Button>
            ))}
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

        {/* 底部工具栏：节点统计 + Drag to add（Obsidian 风格，可拖拽到画布创建节点） */}
        <div className="absolute bottom-3 left-1/2 z-20 flex max-w-[96%] -translate-x-1/2 flex-wrap items-center gap-1 rounded-lg border bg-background/95 px-2 py-1.5 shadow-sm">
          <span className="px-1 text-xs text-muted-foreground">
            {t("core.canvas.stats", { nodes: nodes.length, edges: edges.length })}
          </span>
          <span className="mx-0.5 h-4 w-px bg-border" />
          {(
            [
              { type: "card", label: t("core.canvas.dragAddCard"), icon: StickyNote },
              { type: "note", label: t("core.canvas.dragAddNote"), icon: FileText },
              { type: "noteVault", label: t("core.canvas.dragAddNoteVault"), icon: Library },
              { type: "mediaVault", label: t("core.canvas.dragAddMediaVault"), icon: Image },
            ]
          ).map((item) => (
            <div
              key={item.type}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-canvas-add", item.type)
                e.dataTransfer.effectAllowed = "copy"
              }}
              className="flex cursor-grab items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground active:cursor-grabbing"
              title={item.label}
            >
              <item.icon className="size-3.5" />
              {item.label}
            </div>
          ))}
        </div>

        {/* 操作提示（顶部悬浮） */}
        <p className="pointer-events-none absolute top-2 left-1/2 z-20 max-w-[90%] -translate-x-1/2 truncate text-xs text-muted-foreground/70">
          {t("core.canvas.help")}
        </p>
      </div>

      {/* 右键菜单（空白处右键单击弹出；右键拖拽为平移） */}
      {ctxMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setCtxMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault()
              if (suppressCtxMenuRef.current) {
                suppressCtxMenuRef.current = false
                return
              }
              setCtxMenu({ x: e.clientX, y: e.clientY, board: screenToBoard(e.clientX, e.clientY) })
            }}
          />
          <div
            className="fixed z-50 w-44 rounded-lg border bg-popover p-1 text-sm shadow-md"
            style={{
              left: Math.min(ctxMenu.x, window.innerWidth - 190),
              top: Math.min(ctxMenu.y, window.innerHeight - 240),
            }}
          >
            <div className="px-2 py-1 text-xs text-muted-foreground">{t("core.canvas.addNode")}</div>
            {(
              [
                { type: "text" as const, label: t("core.canvas.addNodeText"), icon: StickyNote },
                { type: "file" as const, label: t("core.canvas.addNodeFile"), icon: FileText },
                { type: "link" as const, label: t("core.canvas.addNodeLink"), icon: Link2 },
                { type: "group" as const, label: t("core.canvas.addNodeGroup"), icon: Box },
              ]
            ).map((item) => (
              <button
                key={item.type}
                onClick={() => {
                  const pos = ctxMenu.board
                  setCtxMenu(null)
                  void addNode(item.type, pos)
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
              >
                <item.icon className="size-4 text-muted-foreground" />
                {item.label}
              </button>
            ))}
            {clipboardRef.current && (
              <>
                <div className="my-1 h-px bg-border" />
                <button
                  onClick={() => {
                    setCtxMenu(null)
                    pasteClipboard()
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
                >
                  {t("core.canvas.paste")}
                </button>
              </>
            )}
          </div>
        </>
      )}

      {/* 导航抽屉：全屏模式下收缩的全局导航，点击左上角按钮展开 */}
      {navOpen && (
        <>
          <div className="absolute inset-0 z-40 bg-black/20" onClick={() => setNavOpen(false)} />
          <aside className="absolute top-0 left-0 z-50 flex h-full w-72 flex-col border-r bg-background shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="font-semibold tracking-tight">MetaPilot</span>
              <Button variant="ghost" size="icon" className="size-7" onClick={() => setNavOpen(false)}>
                <X className="size-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <Link
                to="/"
                onClick={() => setNavOpen(false)}
                className="mb-3 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <ArrowLeft className="size-4" />
                {t("core.canvas.backToLibrary")}
              </Link>
              {drawerLibs.length === 0 && (
                <p className="px-2 text-xs text-muted-foreground">{t("core.canvas.noCanvases")}</p>
              )}
              {drawerLibs.map((lib) => (
                <div key={lib.libId} className="mb-4">
                  <p className="mb-1 px-2 text-xs font-medium text-muted-foreground">{lib.libName}</p>
                  {lib.canvases.map((c) => (
                    <Link
                      key={c.id}
                      to={`/canvas/${c.id}`}
                      onClick={() => setNavOpen(false)}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                        c.id === cid
                          ? "bg-accent font-medium text-accent-foreground"
                          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                      )}
                    >
                      <Box className="size-3.5 shrink-0 text-primary" />
                      <span className="truncate">{c.name}</span>
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          </aside>
        </>
      )}
    </div>
  )
}
