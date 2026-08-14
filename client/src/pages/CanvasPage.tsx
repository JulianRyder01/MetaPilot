import { useCallback, useEffect, useRef, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { ArrowLeft, Download, FileText, Link2, Maximize, Minus, Plus, Save, StickyNote, Trash2 } from "lucide-react"
import { toast } from "@/lib/toast"

import { api, type CanvasEdge, type CanvasNode, type Collection } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

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

export default function CanvasPage() {
  const { cid } = useParams()
  const [col, setCol] = useState<Collection | null>(null)
  const [nodes, setNodes] = useState<CanvasNode[]>([])
  const [edges, setEdges] = useState<CanvasEdge[]>([])
  const [dirty, setDirty] = useState(false)
  const [dragging, setDragging] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null)
  const [linking, setLinking] = useState<{ fromId: string; fromSide: string } | null>(null)
  const [linkPos, setLinkPos] = useState<{ x: number; y: number } | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState("")
  /** 视图变换：缩放 + 平移（Obsidian Canvas 风格）。 */
  const [view, setView] = useState({ zoom: 1, panX: 0, panY: 0 })
  const [panning, setPanning] = useState<{ startX: number; startY: number; startPanX: number; startPanY: number } | null>(null)
  const spaceDownRef = useRef(false)
  const boardRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    if (!cid) return
    const c = await api.getCollection(cid)
    setCol(c)
    setNodes(c.canvas?.nodes ?? [])
    setEdges(c.canvas?.edges ?? [])
  }, [cid])

  useEffect(() => {
    load()
  }, [load])

  async function save() {
    if (!cid) return
    try {
      await api.updateCollectionCanvas(cid, nodes, edges)
      setDirty(false)
      toast.success("画布已保存")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败")
    }
  }

  function addTextNode() {
    const node: CanvasNode = {
      id: genId("n"),
      type: "text",
      x: 40 + Math.random() * 200,
      y: 40 + Math.random() * 120,
      width: 200,
      height: 80,
      text: "双击编辑文本",
    }
    setNodes((n) => [...n, node])
    setDirty(true)
  }

  function removeNode(id: string) {
    setNodes((n) => n.filter((x) => x.id !== id))
    setEdges((e) => e.filter((x) => x.fromNode !== id && x.toNode !== id))
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

  // ---- 拖拽移动节点 ----
  function onNodeMouseDown(e: React.MouseEvent, node: CanvasNode) {
    if (editingId) return
    // 空格或中键：平移画布
    if (spaceDownRef.current || e.button === 1) {
      startPan(e)
      return
    }
    const p = screenToBoard(e.clientX, e.clientY)
    setDragging({ id: node.id, offsetX: p.x - node.x, offsetY: p.y - node.y })
  }

  function startPan(e: React.MouseEvent) {
    e.preventDefault()
    setPanning({ startX: e.clientX, startY: e.clientY, startPanX: view.panX, startPanY: view.panY })
  }

  function onBoardMouseDown(e: React.MouseEvent) {
    // 空白处：空格/中键平移
    if (spaceDownRef.current || e.button === 1) startPan(e)
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
    if (dragging) {
      setNodes((ns) =>
        ns.map((n) =>
          n.id === dragging.id
            ? { ...n, x: Math.max(-BOARD_SIZE / 2, p.x - dragging.offsetX), y: Math.max(-BOARD_SIZE / 2, p.y - dragging.offsetY) }
            : n,
        ),
      )
    }
    if (linking) {
      setLinkPos(p)
    }
  }

  function onBoardMouseUp() {
    setDragging(null)
    setLinking(null)
    setLinkPos(null)
    setPanning(null)
  }

  // ---- 连线：从节点连接点拖到目标节点 ----
  function startLink(nodeId: string, side: string) {
    setLinking({ fromId: nodeId, fromSide: side })
  }
  function endLinkOn(targetId: string) {
    if (linking && linking.fromId !== targetId) {
      setEdges((es) => [
        ...es,
        { id: genId("e"), fromNode: linking.fromId, fromSide: linking.fromSide, toNode: targetId },
      ])
      setDirty(true)
    }
    setLinking(null)
    setLinkPos(null)
  }

  function startEdit(node: CanvasNode) {
    if (node.type !== "text") return
    setEditingId(node.id)
    setEditText(node.text ?? "")
  }
  function commitEdit() {
    if (editingId) {
      setNodes((ns) => ns.map((n) => (n.id === editingId ? { ...n, text: editText } : n)))
      setDirty(true)
    }
    setEditingId(null)
  }

  const nodeById = (id: string) => nodes.find((n) => n.id === id)
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
    return <p className="px-6 py-10 text-sm text-muted-foreground">该文档集不是图表。</p>
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link to="/" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" />
            返回库
          </Link>
          <h1 className="text-xl font-semibold">{col.name}</h1>
          <Badge variant="outline">图表画布</Badge>
          {dirty && <Badge variant="secondary">有未保存修改</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={addTextNode}>
            <Plus className="size-4" />
            新建文本节点
          </Button>
          <Button size="sm" onClick={save}>
            <Save className="size-4" />
            保存
          </Button>
        </div>
      </div>

      <p className="mb-3 text-xs text-muted-foreground">
        拖拽节点移动；双击文本节点编辑；从节点边缘连接点拖到另一节点创建连线；滚轮平移、Ctrl+滚轮缩放、按住空格拖拽平移。
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
              return <line key={e.id} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#94a3b8" strokeWidth={1.5} />
            })}
            {linking && linkPos && (() => {
              const a = nodeById(linking.fromId)
              if (!a) return null
              const p1 = centerOf(a, linking.fromSide)
              return <line x1={p1.x} y1={p1.y} x2={linkPos.x} y2={linkPos.y} stroke="#6366f1" strokeWidth={1.5} strokeDasharray="4 3" />
            })()}
          </svg>

          {/* 节点层 */}
          {nodes.map((node) => {
            const isEditing = editingId === node.id
            return (
              <div
                key={node.id}
                onMouseDown={(e) => onNodeMouseDown(e, node)}
                onMouseUp={() => endLinkOn(node.id)}
                className="absolute cursor-grab rounded-md border bg-card p-2 shadow-sm active:cursor-grabbing"
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
                  title="删除节点"
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
                      {node.text || "（空）"}
                    </div>
                  )
                ) : node.type === "file" ? (
                  <div className="flex h-full w-full items-center gap-1.5 text-xs text-muted-foreground">
                    <FileText className="size-3.5 shrink-0 text-primary" />
                    <span className="truncate">{node.file}</span>
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
                    {node.label || "分组"}
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
                        title="拖拽连线"
                      />
                    ))}
                  </>
                )}
              </div>
            )
          })}

          {nodes.length === 0 && (
            <p className="absolute left-0 top-0 text-sm text-muted-foreground" style={{ padding: 40 }}>
              空画布，点击右上角「新建文本节点」开始
            </p>
          )}
        </div>

        {/* 缩放控件 */}
        <div className="absolute right-3 bottom-3 z-20 flex items-center gap-0.5 rounded-lg border bg-background/95 p-1 shadow-sm">
          <Button variant="ghost" size="icon" className="size-6" onClick={() => zoomCenter(1 / 1.2)} title="缩小">
            <Minus className="size-3.5" />
          </Button>
          <span className="w-11 text-center text-xs tabular-nums text-muted-foreground">
            {Math.round(view.zoom * 100)}%
          </span>
          <Button variant="ghost" size="icon" className="size-6" onClick={() => zoomCenter(1.2)} title="放大">
            <Plus className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="size-6" onClick={fitView} title="适应画布">
            <Maximize className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{nodes.length} 个节点 · {edges.length} 条连线</p>
        <Button variant="outline" size="sm" asChild>
          <a href={cid ? api.exportMpfUrl(cid, "collection") : "#"}>
            <Download className="size-4" />
            导出 .mpf
          </a>
        </Button>
      </div>
    </div>
  )
}
