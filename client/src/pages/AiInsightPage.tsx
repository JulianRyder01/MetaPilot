import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import {
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  Database,
  FileText,
  FolderOpen,
  FolderTree,
  Library,
  Lightbulb,
  ListChecks,
  Loader2,
  MessagesSquare,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Send,
  Sparkles,
  Square,
  Wand2,
  X,
} from "lucide-react"
import { toast } from "@/lib/toast"
import { ApiError, type KbSource, type SymlinkTree } from "@/lib/api"

import { useT } from "@/i18n"
import { cn } from "@/lib/utils"
import {
  insightAsk,
  insightEmbeddingStart,
  insightEmbeddingStatus,
  insightEmbeddingStop,
  insightIndex,
  insightPlan,
  insightPlanStream,
  insightResources,
  insightStatus,
  insightSymlinkTree,
  type InsightMode,
  type InsightOutput,
  type InsightPlanStepId,
  type InsightResourceNode,
  type InsightResources,
  type InsightSourceRef,
  type InsightStatus,
  type NotIndexedDetail,
} from "@/plugins/ai_insight/api"
import { PluginGate } from "@/components/plugins/PluginGate"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Progress as ProgressBar } from "@/components/ui/progress"

interface Msg {
  role: "user" | "assistant"
  content: string
  sources?: KbSource[]
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** 数据源 → 选择集 key */
const srcKey = (r: InsightSourceRef) => `${r.type}:${r.id}:${r.path ?? ""}`

/** 洞察规划执行路线（todo list）：与后端 /plan/stream 的 step id 对应，顺序即展示顺序 */
const PLAN_STEP_ORDER: InsightPlanStepId[] = ["retrieve", "plan", "review", "generate", "save"]

interface PlanStepState {
  status: "pending" | "running" | "done" | "error"
  content?: string
}

function emptyPlanSteps(): Record<InsightPlanStepId, PlanStepState> {
  return Object.fromEntries(PLAN_STEP_ORDER.map((id) => [id, { status: "pending" }])) as Record<InsightPlanStepId, PlanStepState>
}

/** AI 思考输出展示：JSON 美化缩进，非 JSON 原样 */
function formatPlanOutput(raw: string) {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

/** 记住停留在「第一步 · 建索引」还是「第二步 · 问 AI」，切换页面/刷新后恢复 */
const TAB_STORAGE_KEY = "aiInsight.activeTab"

/** 来源跳转：优先用后端下发的链接（能力提供方元数据生成）；旧数据回退 learn/symlink 规则 */
function sourceHref(src: KbSource): string | null {
  if (src.link?.kind === "symlink" && src.link.href) return src.link.href
  if (src.link?.kind === "learn") return `/learn/${src.link.collectionId}/${src.link.sectionId}`
  if (src.link?.kind === "symlink") return `/files?mount=${src.link.mountId}`
  return null
}

/** AI 回答里的 [来源N] 转成锚点链接，交给 Markdown 渲染成可点击的引用徽章。
 *  msgIdx 为消息下标，保证多轮对话中来源锚点 id 唯一；已处于链接语法（[来源N](…)）时不替换。 */
const SOURCE_REF_RE = /\[来源(\d+)\](?!\()/g
function toMarkdownRefs(text: string, msgIdx: number) {
  return text.replace(SOURCE_REF_RE, `[来源$1](#src-${msgIdx}-$1)`)
}

/** 自定义 Markdown 链接组件：#src-{msg}-{n} 渲染为引用徽章（点击滚动到来源卡片），其余按普通链接 */
function AnswerLink({
  href,
  children,
  sources,
}: {
  href?: string
  children?: React.ReactNode
  sources: KbSource[]
}) {
  const m = href?.match(/^#src-(\d+)-(\d+)$/)
  if (m) {
    const n = Number(m[2])
    const src = sources[n - 1]
    // 编号越界（模型输出与返回来源数不一致）：降级为纯文本，不渲染空徽章
    if (!src) return <>{children}</>
    return (
      <a
        href={href}
        title={`${src.collectionName} / ${src.docName} / ${src.sectionName}`}
        className="mx-0.5 inline-flex items-center gap-0.5 rounded bg-primary/15 px-1.5 py-0.5 text-xs font-medium text-primary no-underline"
        onClick={(e) => {
          e.preventDefault()
          document.getElementById(`src-${m[1]}-${n}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
        }}
      >
        {children}
      </a>
    )
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-primary underline-offset-2 hover:underline"
    >
      {children}
    </a>
  )
}

/** 数据源树节点行（库/文档集/文档/软链接挂载/挂载内路径） */
function TreeRow({
  label,
  status,
  indent,
  checked,
  indeterminate,
  hasChildren,
  expanded,
  onToggle,
  onExpand,
  onBrowse,
}: {
  label: React.ReactNode
  status?: InsightStatus
  indent: number
  checked: boolean
  indeterminate: boolean
  hasChildren: boolean
  expanded: boolean
  onToggle: () => void
  onExpand: () => void
  onBrowse?: () => void
}) {
  const t = useT()
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors",
        checked ? "bg-primary/5" : "hover:bg-accent/50",
      )}
      style={{ paddingLeft: `${8 + indent * 18}px` }}
    >
      {hasChildren ? (
        <button
          type="button"
          onClick={onExpand}
          className="rounded p-0.5 text-muted-foreground hover:bg-accent"
          aria-label={expanded ? "collapse" : "expand"}
        >
          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
      ) : (
        <span className="w-5" />
      )}
      <Checkbox
        checked={indeterminate ? "indeterminate" : checked}
        onCheckedChange={onToggle}
        className="size-4"
      />
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="truncate font-medium">{label}</span>
        {onBrowse && (
          <button
            type="button"
            onClick={onBrowse}
            className="inline-flex items-center gap-0.5 rounded bg-accent px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <FolderOpen className="size-3" />
            {t("insight.symlinkBrowse")}
          </button>
        )}
      </span>
      {status &&
        (status.running ? (
          <Badge variant="secondary">
            {t("insight.indexingProgress", { done: status.done ?? 0, total: status.total ?? 0 })}
          </Badge>
        ) : status.indexed ? (
          <Badge variant="success">{t("insight.indexedCount", { count: status.sectionCount })}</Badge>
        ) : (
          <Badge variant="secondary">{t("insight.notIndexed")}</Badge>
        ))}
    </div>
  )
}

export default function AiInsightPage() {
  const t = useT()
  const [searchParams] = useSearchParams()

  const [resources, setResources] = useState<InsightResources>({
    libraries: [],
    symlinks: [],
    sourceTypes: {},
  })
  // 挂载类数据源可用性（后端能力元数据）：必须在 resources state 声明之后使用
  const symlinkAvailable = resources.sourceTypes?.symlink?.available ?? false
  const [loadingResources, setLoadingResources] = useState(true)
  // 数据检索库：第一步（建索引）与第二步（问答）共用同一套选择，切 tab 选择保留
  const [sel, setSel] = useState<Map<string, InsightSourceRef>>(new Map())

  // 树展开与软链接路径懒加载
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [symChildren, setSymChildren] = useState<Record<string, SymlinkTree["items"]>>({})
  const loadedCidRef = useRef<string | null>(null)

  const [embedStatus, setEmbedStatus] = useState<Awaited<ReturnType<typeof insightEmbeddingStatus>> | null>(null)
  const [model, setModel] = useState("")
  const [indexProgress, setIndexProgress] = useState<Record<string, InsightStatus>>({})
  const [indexing, setIndexing] = useState(false)

  // 第一步 / 第二步：默认打开第二步（问 AI）；切换页面再回来仍停留在原步骤
  const [activeTab, setActiveTab] = useState<string>(() => {
    try {
      const v = localStorage.getItem(TAB_STORAGE_KEY)
      return v === "index" || v === "ask" ? v : "ask"
    } catch {
      return "ask"
    }
  })
  const handleTabChange = (v: string) => {
    setActiveTab(v)
    try {
      localStorage.setItem(TAB_STORAGE_KEY, v)
    } catch {
      /* 忽略：隐私模式等场景不可写 */
    }
  }

  // 左侧数据检索库面板：可收起
  const [panelOpen, setPanelOpen] = useState(true)

  // 对话
  const [mode, setMode] = useState<"assist" | "wander" | "reflect" | "plan">("assist")
  const [question, setQuestion] = useState("")
  const [asking, setAsking] = useState(false)
  const [messages, setMessages] = useState<Msg[]>([])
  const [autoIndex, setAutoIndex] = useState<{ total: number; done: number } | null>(null)

  // 洞察规划
  const [planOutput, setPlanOutput] = useState<InsightOutput>("canvas")
  const [planLib, setPlanLib] = useState("")
  const [planning, setPlanning] = useState(false)
  const [planResult, setPlanResult] = useState<Awaited<ReturnType<typeof insightPlan>> | null>(null)
  // 洞察规划执行路线：每步状态与 AI 思考输出（/plan/stream 实时推送）
  const [planSteps, setPlanSteps] = useState<Record<InsightPlanStepId, PlanStepState>>(emptyPlanSteps())
  // 流式规划请求的取消句柄：离开页面时中断，避免悬挂
  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => () => abortRef.current?.abort(), [])

  const loadResources = useCallback(async () => {
    setLoadingResources(true)
    try {
      const r = await insightResources()
      setResources(r)
      // ?cid=：默认选中该文档集
      const cid = searchParams.get("cid")
      if (cid && loadedCidRef.current !== cid) {
        loadedCidRef.current = cid
        const found = r.libraries.flatMap((l) => l.collections ?? []).find((c) => c.id === cid)
        if (found) {
          const ref: InsightSourceRef = { type: "collection", id: cid }
          setSel((prev) => {
            if (prev.has(srcKey(ref))) return prev
            const next = new Map(prev)
            next.set(srcKey(ref), ref)
            return next
          })
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("insight.loadResourcesFailed"))
    } finally {
      setLoadingResources(false)
    }
  }, [searchParams, t])

  const loadEmbed = useCallback(async () => {
    try {
      const st = await insightEmbeddingStatus()
      setEmbedStatus(st)
      if (!model && st.models) setModel(st.model || Object.keys(st.models)[0] || "")
    } catch {
      /* 忽略：状态区展示骨架 */
    }
  }, [model])

  useEffect(() => {
    loadResources()
    loadEmbed()
    const timer = setInterval(loadEmbed, 5000)
    return () => clearInterval(timer)
  }, [loadResources, loadEmbed])

  const indexedKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const lib of resources.libraries) {
      if (lib.status?.indexed) keys.add(srcKey({ type: "library", id: lib.id }))
      for (const c of lib.collections ?? []) {
        if (c.status?.indexed) keys.add(srcKey({ type: "collection", id: c.id }))
        for (const d of c.documents ?? []) {
          if (d.status?.indexed) keys.add(srcKey({ type: "document", id: d.id }))
        }
      }
    }
    for (const s of resources.symlinks) {
      if (s.status?.indexed) keys.add(srcKey({ type: "symlink", id: s.id }))
    }
    return keys
  }, [resources])

  function toggle(set: Map<string, InsightSourceRef>, setter: (m: Map<string, InsightSourceRef>) => void, ref: InsightSourceRef) {
    const k = srcKey(ref)
    const next = new Map(set)
    if (next.has(k)) next.delete(k)
    else next.set(k, ref)
    setter(next)
  }

  function toggleBranch(set: Map<string, InsightSourceRef>, setter: (m: Map<string, InsightSourceRef>) => void, refs: InsightSourceRef[]) {
    const next = new Map(set)
    const allSelected = refs.length > 0 && refs.every((r) => next.has(srcKey(r)))
    for (const r of refs) {
      if (allSelected) next.delete(srcKey(r))
      else next.set(srcKey(r), r)
    }
    setter(next)
  }

  /** 树节点 → 全部后代 refs（用于三态与全选） */
  function collectRefs(node: InsightResourceNode, parent: InsightSourceRef | null): InsightSourceRef[] {
    const self: InsightSourceRef = parent
      ? parent
      : { type: "library", id: node.id }
    const out: InsightSourceRef[] = []
    if (parent) out.push(self)
    for (const c of node.collections ?? []) out.push(...collectRefs(c, { type: "collection", id: c.id }))
    for (const d of node.documents ?? []) out.push({ type: "document", id: d.id })
    return out
  }

  /** 软链接挂载节点 → 后代 refs（含已浏览的路径） */
  function collectSymRefs(mount: InsightResourceNode): InsightSourceRef[] {
    const out: InsightSourceRef[] = [{ type: "symlink", id: mount.id }]
    const walk = (path: string, items: SymlinkTree["items"]) => {
      for (const it of items) {
        if (it.type === "file") out.push({ type: "symlink", id: mount.id, path: path ? `${path}/${it.name}` : it.name })
        else {
          const p = path ? `${path}/${it.name}` : it.name
          walk(p, symChildren[`${mount.id}:${p}`] ?? [])
        }
      }
    }
    walk("", symChildren[`${mount.id}:`] ?? [])
    return out
  }

  async function browseSym(mountId: string, path: string) {
    const cacheKey = `${mountId}:${path}`
    if (symChildren[cacheKey]) return
    try {
      const tree = await insightSymlinkTree(mountId, path)
      setSymChildren((prev) => ({ ...prev, [cacheKey]: tree.items }))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("insight.loadResourcesFailed"))
    }
  }

  /** 轮询一组 key 的索引进度直至全部完成 */
  async function pollIndexing(keys: string[]) {
    while (true) {
      const sts = await Promise.all(keys.map((k) => insightStatus(k)))
      const map: Record<string, InsightStatus> = {}
      keys.forEach((k, i) => {
        map[k] = sts[i]
      })
      setIndexProgress(map)
      const failed = sts.find((s) => s.error)
      if (failed) throw new Error(failed.error || t("insight.indexFailed"))
      if (!sts.some((s) => s.running)) break
      await sleep(700)
    }
  }

  async function doIndex() {
    const refs = [...sel.values()]
    if (refs.length === 0) return
    setIndexing(true)
    try {
      const { started } = await insightIndex(refs)
      toast.success(t("insight.indexQueued"))
      await pollIndexing(started)
      setIndexProgress({})
      toast.success(t("insight.indexDone", { ok: started.length, total: started.length }))
      await loadResources()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("insight.indexFailed"))
    } finally {
      setIndexing(false)
    }
  }

  /** 确保所选源已索引：未索引则自动建索引（显示进度），完成后返回 */
  async function ensureIndexed(refs: InsightSourceRef[]) {
    const missing = refs.filter((r) => !indexedKeys.has(srcKey(r)))
    if (missing.length === 0) return
    setAutoIndex({ total: missing.length, done: 0 })
    try {
      const { started } = await insightIndex(missing)
      let finished = 0
      while (true) {
        const sts = await Promise.all(started.map((k) => insightStatus(k)))
        const done = sts.filter((s) => !s.running && !s.error)
        finished = done.length
        setAutoIndex({ total: started.length, done: finished })
        const failed = sts.find((s) => s.error)
        if (failed) throw new Error(failed.error || t("insight.autoIndexFailed"))
        if (finished === started.length) break
        await sleep(700)
      }
      await loadResources()
    } finally {
      setAutoIndex(null)
    }
  }

  async function ask() {
    const refs = [...sel.values()]
    if (refs.length === 0 || !question.trim() || asking) return
    const q = question.trim()
    setQuestion("")
    setMessages((m) => [...m, { role: "user", content: q }])
    setAsking(true)
    try {
      await ensureIndexed(refs)
      const history = messages.slice(-8).map((m) => ({ role: m.role, content: m.content }))
      const r = await insightAsk(refs, mode as InsightMode, q, history)
      setMessages((m) => [...m, { role: "assistant", content: r.answer, sources: r.sources }])
    } catch (e) {
      const detail = e instanceof ApiError ? (e.detail as NotIndexedDetail | undefined) : undefined
      if (e instanceof ApiError && e.status === 409 && detail?.code === "NOT_INDEXED") {
        toast.error(t("insight.autoIndexFailed"))
      } else {
        toast.error(e instanceof Error ? e.message : t("insight.askFailed"))
      }
    } finally {
      setAsking(false)
    }
  }

  async function runPlan() {
    const refs = [...sel.values()]
    if (refs.length === 0 || !question.trim() || planning) return
    setPlanning(true)
    setPlanResult(null)
    setPlanSteps(emptyPlanSteps())
    const ac = new AbortController()
    abortRef.current = ac
    try {
      await ensureIndexed(refs)
      await insightPlanStream(refs, question.trim(), planOutput, planLib, 12, (evt) => {
        if (evt.type === "step") {
          setPlanSteps((prev) => ({
            ...prev,
            [evt.step]: { ...prev[evt.step], status: evt.status === "start" ? "running" : "done" },
          }))
        } else if (evt.type === "think") {
          // 流式增量（delta）追加到该步思考内容；每步结束的完整 content 事件直接覆盖
          setPlanSteps((prev) => ({
            ...prev,
            [evt.step]: {
              ...prev[evt.step],
              content: evt.delta != null ? (prev[evt.step].content ?? "") + evt.delta : evt.content,
            },
          }))
        } else if (evt.type === "done") {
          setPlanResult(evt.result)
          toast.success(t("insight.planDone", { name: evt.result.collectionName }))
        } else if (evt.type === "error") {
          // 把仍在运行中的步骤标记为失败（error 事件由 insightPlanStream 抛错，此处仅更新 UI）
          setPlanSteps((prev) => {
            const next = { ...prev }
            for (const id of PLAN_STEP_ORDER) {
              if (next[id].status === "running") next[id] = { ...next[id], status: "error" }
            }
            return next
          })
        }
      }, ac.signal)
    } catch (e) {
      const detail = e instanceof ApiError ? (e.detail as { code?: string } | undefined) : undefined
      if (detail?.code === "NOT_INDEXED") {
        toast.error(t("insight.autoIndexFailed"))
      } else {
        toast.error(e instanceof Error ? e.message : t("insight.planFailed"))
      }
    } finally {
      abortRef.current = null
      setPlanning(false)
    }
  }

  async function startEmbedding() {
    const r = await insightEmbeddingStart(model)
    if (r.started) toast.success(r.message ?? t("insight.startServiceToast"))
    else toast.error(r.error ?? t("insight.startFailed"))
    loadEmbed()
  }

  async function stopEmbedding() {
    await insightEmbeddingStop()
    toast.success(t("insight.serviceStopped"))
    loadEmbed()
  }

  const embedHealthy = embedStatus?.healthy ?? false

  // ---------------- 树渲染 ----------------
  const renderLibraryTree = (set: Map<string, InsightSourceRef>, setter: (m: Map<string, InsightSourceRef>) => void) => (
    <div className="space-y-0.5">
      {resources.libraries.map((lib) => {
        const libRef: InsightSourceRef = { type: "library", id: lib.id }
        const refs = collectRefs(lib, libRef)
        const selectedCount = refs.filter((r) => set.has(srcKey(r))).length
        return (
          <div key={lib.id}>
            <TreeRow
              label={<><Database className="size-3.5 text-primary" /> {lib.name}</>}
              status={lib.status}
              indent={0}
              checked={selectedCount === refs.length && refs.length > 0}
              indeterminate={selectedCount > 0 && selectedCount < refs.length}
              hasChildren={refs.length > 0}
              expanded={expanded.has(lib.id)}
              onToggle={() => toggleBranch(set, setter, refs)}
              onExpand={() => {
                const n = new Set(expanded)
                if (n.has(lib.id)) n.delete(lib.id)
                else n.add(lib.id)
                setExpanded(n)
              }}
            />
            {expanded.has(lib.id) &&
              (lib.collections ?? []).map((col) => {
                const colRef: InsightSourceRef = { type: "collection", id: col.id }
                const colRefs = collectRefs(col, colRef)
                const colCount = colRefs.filter((r) => set.has(srcKey(r))).length
                return (
                  <div key={col.id}>
                    <TreeRow
                      label={<><FileText className="size-3.5 text-muted-foreground" /> {col.name}</>}
                      status={col.status}
                      indent={1}
                      checked={colCount === colRefs.length && colRefs.length > 0}
                      indeterminate={colCount > 0 && colCount < colRefs.length}
                      hasChildren={colRefs.length > 0}
                      expanded={expanded.has(col.id)}
                      onToggle={() => toggleBranch(set, setter, colRefs)}
                      onExpand={() => {
                        const n = new Set(expanded)
                        if (n.has(col.id)) n.delete(col.id)
                        else n.add(col.id)
                        setExpanded(n)
                      }}
                    />
                    {expanded.has(col.id) &&
                      (col.documents ?? []).map((doc) => (
                        <TreeRow
                          key={doc.id}
                          label={doc.name}
                          status={doc.status}
                          indent={2}
                          checked={set.has(srcKey({ type: "document", id: doc.id }))}
                          indeterminate={false}
                          hasChildren={false}
                          expanded={false}
                          onToggle={() => toggle(set, setter, { type: "document", id: doc.id })}
                          onExpand={() => undefined}
                        />
                      ))}
                  </div>
                )
              })}
          </div>
        )
      })}
    </div>
  )

  const renderSymlinkTree = (set: Map<string, InsightSourceRef>, setter: (m: Map<string, InsightSourceRef>) => void) => {
    const renderMount = (mount: InsightResourceNode) => {
      const items = symChildren[`${mount.id}:`] ?? []
      const refs = collectSymRefs(mount)
      const selectedCount = refs.filter((r) => set.has(srcKey(r))).length
      return (
        <div key={mount.id}>
          <TreeRow
            label={<><FolderTree className="size-3.5 text-primary" /> {mount.name}</>}
            status={mount.status}
            indent={0}
            checked={selectedCount === refs.length && refs.length > 0}
            indeterminate={selectedCount > 0 && selectedCount < refs.length}
            hasChildren={true}
            expanded={expanded.has(mount.id)}
            onToggle={() => toggleBranch(set, setter, refs)}
            onExpand={() => {
              const n = new Set(expanded)
              if (n.has(mount.id)) n.delete(mount.id)
              else n.add(mount.id)
              setExpanded(n)
            }}
            onBrowse={() => {
              setExpanded((prev) => new Set(prev).add(mount.id))
              browseSym(mount.id, "")
            }}
          />
          {expanded.has(mount.id) && renderItems(mount.id, "", items, set, setter)}
        </div>
      )
    }

    const renderItems = (
      mountId: string,
      path: string,
      items: SymlinkTree["items"],
      set: Map<string, InsightSourceRef>,
      setter: (m: Map<string, InsightSourceRef>) => void,
    ) => {
      if (items.length === 0) {
        return <p className="py-1 pl-12 text-xs text-muted-foreground">{t("insight.treeEmpty")}</p>
      }
      return (
        <div>
          {items.map((it) => {
            const full = path ? `${path}/${it.name}` : it.name
            if (it.type === "dir") {
              const sub = symChildren[`${mountId}:${full}`] ?? []
              const subRefs = (() => {
                const refs: InsightSourceRef[] = []
                const walk = (p: string, list: SymlinkTree["items"]) => {
                  for (const x of list) {
                    if (x.type === "file") refs.push({ type: "symlink", id: mountId, path: p ? `${p}/${x.name}` : x.name })
                    else walk(`${p}/${x.name}`, symChildren[`${mountId}:${p}/${x.name}`] ?? [])
                  }
                }
                walk(full, sub)
                return refs
              })()
              const dirSelCount = subRefs.filter((r) => set.has(srcKey(r))).length
              return (
                <div key={full}>
                  <TreeRow
                    label={<><FolderOpen className="size-3.5 text-muted-foreground" /> {it.name}</>}
                    indent={1}
                    checked={subRefs.length > 0 && dirSelCount === subRefs.length}
                    indeterminate={dirSelCount > 0 && dirSelCount < subRefs.length}
                    hasChildren={true}
                    expanded={expanded.has(full)}
                    onToggle={() => toggleBranch(set, setter, subRefs)}
                    onExpand={() => {
                      const n = new Set(expanded)
                      if (n.has(full)) n.delete(full)
                      else n.add(full)
                      setExpanded(n)
                    }}
                    onBrowse={() => {
                      setExpanded((prev) => new Set(prev).add(full))
                      browseSym(mountId, full)
                    }}
                  />
                  {expanded.has(full) && renderItems(mountId, full, sub, set, setter)}
                </div>
              )
            }
            return (
              <TreeRow
                key={full}
                label={<><FileText className="size-3.5 text-muted-foreground" /> {it.name}</>}
                indent={1}
                checked={set.has(srcKey({ type: "symlink", id: mountId, path: full }))}
                indeterminate={false}
                hasChildren={false}
                expanded={false}
                onToggle={() => toggle(set, setter, { type: "symlink", id: mountId, path: full })}
                onExpand={() => undefined}
              />
            )
          })}
        </div>
      )
    }

    return <div className="space-y-0.5">{resources.symlinks.map(renderMount)}</div>
  }

  const renderTree = (set: Map<string, InsightSourceRef>, setter: (m: Map<string, InsightSourceRef>) => void) => (
    <div className="space-y-3">
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">{t("insight.groupLibrary")}</p>
        {resources.libraries.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("insight.noSources")}</p>
        ) : (
          renderLibraryTree(set, setter)
        )}
      </div>
      {symlinkAvailable && (
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            {resources.sourceTypes?.symlink?.label ?? t("insight.groupSymlink")}
          </p>
          {resources.symlinks.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("insight.noSourcesWithSymlink")}</p>
          ) : (
            renderSymlinkTree(set, setter)
          )}
        </div>
      )}
    </div>
  )

  const modes: { id: "assist" | "wander" | "reflect" | "plan"; icon: typeof Brain; label: string; desc: string }[] = [
    { id: "assist", icon: Brain, label: t("insight.modeAssist"), desc: t("insight.modeAssistDesc") },
    { id: "wander", icon: Wand2, label: t("insight.modeWander"), desc: t("insight.modeWanderDesc") },
    { id: "reflect", icon: Sparkles, label: t("insight.modeReflect"), desc: t("insight.modeReflectDesc") },
    { id: "plan", icon: Network, label: t("insight.modePlan"), desc: t("insight.modePlanDesc") },
  ]

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Lightbulb className="size-6 text-primary" />
          {t("insight.pageTitle")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(symlinkAvailable ? "insight.introWithSymlink" : "insight.intro")}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{t("insight.mustIndexBefore")}</p>
      </div>

      <PluginGate pluginId="ai_insight" hint={t("insight.pluginHint")}>
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList>
            <TabsTrigger value="index">{t("insight.stepIndex")}</TabsTrigger>
            <TabsTrigger value="ask">{t("insight.stepAsk")}</TabsTrigger>
          </TabsList>

          <div className="flex items-start gap-5">
            {/* ---------------- 左侧：数据检索库（可收起） ---------------- */}
            {panelOpen ? (
              <aside className="w-80 shrink-0 space-y-3 rounded-xl border bg-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="flex items-center gap-2 text-sm font-semibold">
                    <Library className="size-4 text-primary" />
                    {t("insight.kbTitle")}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setPanelOpen(false)}
                    className="rounded-md p-1 text-muted-foreground hover:bg-accent"
                    title={t("insight.collapsePanel")}
                    aria-label={t("insight.collapsePanel")}
                  >
                    <PanelLeftClose className="size-4" />
                  </button>
                </div>

                {/* 快捷入口：问答（靠前） + 已选/已索引统计 */}
                <div className="space-y-2">
                  <Button
                    size="sm"
                    variant={activeTab === "ask" ? "secondary" : "default"}
                    className="w-full justify-start"
                    onClick={() => handleTabChange("ask")}
                  >
                    <MessagesSquare className="size-4" />
                    {t("insight.goAsk")}
                  </Button>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{t("insight.selectedCount", { count: sel.size })}</span>
                    <span>{t("insight.kbIndexed", { count: indexedKeys.size })}</span>
                  </div>
                </div>

                {/* 数据源树 */}
                <div className="max-h-[55vh] overflow-y-auto pr-1">
                  {loadingResources ? (
                    <div className="space-y-2">
                      <Skeleton className="h-8 w-full" />
                      <Skeleton className="h-8 w-full" />
                    </div>
                  ) : (
                    renderTree(sel, setSel)
                  )}
                </div>

                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {t(symlinkAvailable ? "insight.kbHintWithSymlink" : "insight.kbHint")}
                </p>
              </aside>
            ) : (
              <button
                type="button"
                onClick={() => setPanelOpen(true)}
                className="flex w-10 shrink-0 flex-col items-center gap-2 rounded-xl border bg-card py-3 text-muted-foreground transition-colors hover:bg-accent"
                title={t("insight.expandPanel")}
                aria-label={t("insight.expandPanel")}
              >
                <Library className="size-4 text-primary" />
                <PanelLeftOpen className="size-4" />
              </button>
            )}

            {/* ---------------- 右侧：主区域 ---------------- */}
            <div className="min-w-0 flex-1 space-y-4">
              {/* 第一步：建索引 */}
              <TabsContent value="index" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Sparkles className="size-4 text-primary" />
                      {t("insight.vectorModelTitle")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-wrap items-center gap-3 text-sm">
                    {!embedStatus ? (
                      <Skeleton className="h-6 w-72" />
                    ) : (
                      <>
                        <Badge variant={embedHealthy ? "success" : "destructive"}>
                          {embedHealthy ? t("insight.embeddingRunning") : t("insight.embeddingNotReady")}
                        </Badge>
                        <Select value={model} onValueChange={setModel}>
                          <SelectTrigger className="w-72">
                            <SelectValue placeholder={t("insight.selectModelPlaceholder")} />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(embedStatus.models ?? {}).map(([id, label]) => (
                              <SelectItem key={id} value={id}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {embedHealthy ? (
                          <Button size="sm" variant="outline" onClick={stopEmbedding}>
                            <Square className="size-4" />
                            {t("insight.stopService")}
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={startEmbedding}>
                            <Play className="size-4" />
                            {t("insight.startService")}
                          </Button>
                        )}
                      </>
                    )}
                    {embedStatus && (
                      <p className="w-full text-xs text-muted-foreground">
                        {embedStatus.downloadHint ?? t("insight.modelDownloadHint")}
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex-row items-center justify-between gap-3">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Database className="size-4 text-primary" />
                        {t("insight.buildIndexTitle")}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {t(symlinkAvailable ? "insight.indexIntroWithSymlink" : "insight.indexIntro")}
                      </p>
                    </div>
                    <Button onClick={doIndex} disabled={indexing || sel.size === 0 || !embedHealthy}>
                      {indexing ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                      {indexing ? t("insight.indexing") : t("insight.buildVectorIndex")}
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Library className="size-3.5" />
                      {t("insight.buildIndexHint", { count: sel.size })}
                    </p>
                    {Object.keys(indexProgress).length > 0 && (
                      <div className="mt-3 space-y-2 border-t pt-3">
                        {Object.entries(indexProgress)
                          .filter(([, s]) => s.running)
                          .map(([key, s]) => (
                            <div key={key}>
                              <p className="text-xs text-muted-foreground">
                                {t("insight.indexingProgress", { done: s.done ?? 0, total: s.total ?? 0 })} · {key}
                              </p>
                              <ProgressBar className="mt-1 h-1.5" value={s.total ? ((s.done ?? 0) / s.total) * 100 : 0} />
                            </div>
                          ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* 第二步：问 AI（含四种思考模式与洞察规划） */}
              <TabsContent value="ask" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Brain className="size-4 text-primary" />
                      {t("insight.modeTitle")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="mb-3 text-xs text-muted-foreground">{t("insight.modeIntro")}</p>
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      {modes.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setMode(m.id)}
                          className={cn(
                            "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors",
                            mode === m.id ? "border-primary/50 bg-primary/5" : "hover:bg-accent/50",
                          )}
                        >
                          <m.icon className={cn("size-4 shrink-0", mode === m.id ? "text-primary" : "text-muted-foreground")} />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">{m.label}</span>
                            <span className="block truncate text-xs text-muted-foreground">{m.desc}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* 洞察规划专用：生成类型 + 目标库 */}
                {mode === "plan" && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Network className="size-4 text-primary" />
                        {t("insight.modePlan")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex flex-wrap items-center gap-3 text-sm">
                        <span className="text-muted-foreground">{t("insight.planOutputTitle")}</span>
                        <Select value={planOutput} onValueChange={(v) => setPlanOutput(v as InsightOutput)}>
                          <SelectTrigger className="w-52">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="canvas">{t("insight.planOutputCanvas")}</SelectItem>
                            <SelectItem value="course">{t("insight.planOutputCourse")}</SelectItem>
                          </SelectContent>
                        </Select>
                        <span className="text-muted-foreground">{t("insight.planLibraryTitle")}</span>
                        <Select value={planLib} onValueChange={setPlanLib}>
                          <SelectTrigger className="w-56">
                            <SelectValue placeholder={t("insight.planLibraryAuto")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">{t("insight.planLibraryAuto")}</SelectItem>
                            {resources.libraries.map((l) => (
                              <SelectItem key={l.id} value={l.id}>
                                {l.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Textarea
                        placeholder={t("insight.planGoalPlaceholder")}
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        className="min-h-20"
                      />
                      <Button
                        onClick={runPlan}
                        disabled={planning || !question.trim() || sel.size === 0}
                      >
                        {planning ? <Loader2 className="size-4 animate-spin" /> : <Network className="size-4" />}
                        {t("insight.planButton")}
                      </Button>
                      {planResult && (
                        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                          <p className="flex items-center gap-2 text-sm font-medium">
                            <Check className="size-4 text-primary" />
                            {t("insight.planDone", { name: planResult.collectionName })}
                          </p>
                          {planResult.summary && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {t("insight.planSummary")}：{planResult.summary}
                            </p>
                          )}
                          <div className="mt-3 flex gap-2">
                            <Button size="sm" asChild>
                              <Link to={planResult.kind === "canvas" ? `/canvas/${planResult.collectionId}` : `/course/${planResult.collectionId}`}>
                                {planResult.kind === "canvas" ? t("insight.planOpenCanvas") : t("insight.planOpenCourse")}
                              </Link>
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* 洞察规划执行中：执行路线（todo list）+ 实时 AI 思考输出 */}
                {mode === "plan" && planning && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <ListChecks className="size-4 text-primary" />
                        {t("insight.planRoadmap")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <ol className="space-y-1.5">
                        {PLAN_STEP_ORDER.map((id, idx) => {
                          const st = planSteps[id]
                          const label =
                            id === "generate"
                              ? t(planOutput === "canvas" ? "insight.planStep.generateCanvas" : "insight.planStep.generateCourse")
                              : t(`insight.planStep.${id}`)
                          return (
                            <li key={id} className="flex items-center gap-2 text-sm">
                              <span className="flex size-5 shrink-0 items-center justify-center">
                                {st.status === "done" ? (
                                  <Check className="size-4 text-primary" />
                                ) : st.status === "running" ? (
                                  <Loader2 className="size-4 animate-spin text-primary" />
                                ) : st.status === "error" ? (
                                  <X className="size-4 text-destructive" />
                                ) : (
                                  <span className="size-2 rounded-full bg-muted-foreground/40" />
                                )}
                              </span>
                              <span className={cn("min-w-0 truncate", st.status === "pending" ? "text-muted-foreground" : "font-medium")}>
                                {idx + 1}. {label}
                              </span>
                              {st.status === "running" && (
                                <span className="shrink-0 text-xs text-muted-foreground">{t("insight.planStepRunning")}</span>
                              )}
                            </li>
                          )
                        })}
                      </ol>

                      {/* AI 思考过程：已完成/进行中步骤的输出实时展示 */}
                      <div className="space-y-2 border-t pt-3">
                        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                          <Brain className="size-3.5" />
                          {t("insight.planThinking")}
                        </p>
                        {PLAN_STEP_ORDER.filter((id) => planSteps[id].content).map((id) => (
                          <div key={id} className="rounded-md border bg-muted/40 p-2.5">
                            <p className="mb-1 text-xs font-medium">
                              {id === "generate"
                                ? t(planOutput === "canvas" ? "insight.planStep.generateCanvas" : "insight.planStep.generateCourse")
                                : t(`insight.planStep.${id}`)}
                            </p>
                            <pre className="max-h-52 overflow-auto whitespace-pre-wrap text-xs leading-relaxed">
                              {formatPlanOutput(planSteps[id].content ?? "")}
                            </pre>
                          </div>
                        ))}
                        {!PLAN_STEP_ORDER.some((id) => planSteps[id].status === "running") &&
                          !PLAN_STEP_ORDER.some((id) => planSteps[id].status === "done") && (
                            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Loader2 className="size-3.5 animate-spin" />
                              {t("insight.planConnecting")}
                            </p>
                          )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* 对话区 */}
                {mode !== "plan" && (
                  <Card className="flex min-h-[420px] flex-col">
                    <CardHeader>
                      <CardTitle className="text-base">{t("insight.askTitle")}</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-1 flex-col gap-4">
                      <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
                        {autoIndex && (
                          <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
                            <p className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Loader2 className="size-3.5 animate-spin" />
                              {t("insight.autoIndexing", { done: autoIndex.done, total: autoIndex.total })}
                            </p>
                            <ProgressBar className="mt-2 h-1.5" value={autoIndex.total ? (autoIndex.done / autoIndex.total) * 100 : 0} />
                          </div>
                        )}
                        {messages.length === 0 && (
                          <p className="py-8 text-center text-sm text-muted-foreground">
                            {t("insight.askPlaceholder")}
                          </p>
                        )}
                        {messages.map((m, i) => (
                          <div
                            key={i}
                            className={
                              m.role === "user"
                                ? "ml-auto max-w-[85%] rounded-lg bg-primary px-4 py-2.5 text-sm text-primary-foreground"
                                : "mr-auto max-w-full rounded-lg bg-muted px-4 py-3 text-sm"
                            }
                          >
                            {m.role === "assistant" ? (
                              <div className="markdown-body [&_p]:my-0">
                                <ReactMarkdown
                                  remarkPlugins={[remarkGfm]}
                                  components={{
                                    a: ({ href, children }) => (
                                      <AnswerLink href={href} sources={m.sources ?? []}>
                                        {children}
                                      </AnswerLink>
                                    ),
                                  }}
                                >
                                  {toMarkdownRefs(m.content, i)}
                                </ReactMarkdown>
                              </div>
                            ) : (
                              <div className="whitespace-pre-wrap">{m.content}</div>
                            )}
                            {m.sources && m.sources.length > 0 && (
                              <div className="mt-3 space-y-1.5 border-t pt-2">
                                <p className="text-xs font-medium text-muted-foreground">{t("insight.refSources")}</p>
                                {m.sources.map((s, j) => {
                                  const href = sourceHref(s)
                                  const body = (
                                    <span
                                      id={`src-${i}-${j + 1}`}
                                      className="flex scroll-mt-24 flex-col rounded-md border bg-background px-3 py-1.5 text-xs hover:bg-accent"
                                    >
                                      <span className="font-medium">
                                        {t("insight.sourceRef", { n: j + 1 })} {s.collectionName} / {s.docName} / {s.sectionName}
                                      </span>
                                      <span className="line-clamp-2 text-muted-foreground">{s.excerpt}</span>
                                    </span>
                                  )
                                  return href ? (
                                    <Link key={j} to={href} className="block">
                                      {body}
                                    </Link>
                                  ) : (
                                    <span key={j} className="block">
                                      {body}
                                    </span>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        ))}
                        {asking && (
                          <div className="mr-auto flex items-center gap-2 rounded-lg bg-muted px-4 py-2.5 text-sm text-muted-foreground">
                            <Loader2 className="size-4 animate-spin" />
                            {t("insight.asking")}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Textarea
                          placeholder={t("insight.inputPlaceholder")}
                          value={question}
                          onChange={(e) => setQuestion(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault()
                              ask()
                            }
                          }}
                          className="min-h-12 flex-1"
                        />
                        <Button
                          onClick={ask}
                          disabled={asking || !question.trim() || sel.size === 0}
                          className="self-end"
                        >
                          <Send className="size-4" />
                          {t("insight.askButton")}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </div>
          </div>
        </Tabs>
      </PluginGate>
    </div>
  )
}
