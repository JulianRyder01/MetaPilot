import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import {
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  Database,
  FileText,
  FolderOpen,
  FolderTree,
  Lightbulb,
  Loader2,
  Network,
  Play,
  Send,
  Sparkles,
  Square,
  Wand2,
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
  insightResources,
  insightStatus,
  insightSymlinkTree,
  type InsightMode,
  type InsightOutput,
  type InsightResourceNode,
  type InsightResources,
  type InsightSourceRef,
  type InsightStatus,
  type NotIndexedDetail,
} from "@/plugins/ai_insight/api"
import { PluginGate } from "@/components/plugins/PluginGate"
import { usePluginEnabled } from "@/stores/plugins"
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

/** 来源跳转：优先用后端下发的链接（能力提供方元数据生成）；旧数据回退 learn/symlink 规则 */
function sourceHref(src: KbSource): string | null {
  if (src.link?.kind === "symlink" && src.link.href) return src.link.href
  if (src.link?.kind === "learn") return `/learn/${src.link.collectionId}/${src.link.sectionId}`
  if (src.link?.kind === "symlink") return `/files?mount=${src.link.mountId}`
  return null
}

function renderAnswer(text: string, sources: KbSource[]) {
  const parts = text.split(/(\[来源\d+\])/g)
  return parts.map((p, i) => {
    const m = p.match(/\[来源(\d+)\]/)
    if (m) {
      const idx = Number(m[1]) - 1
      const src = sources[idx]
      if (src) {
        const href = sourceHref(src)
        const inner = (
          <span
            className="mx-0.5 inline-flex cursor-default items-center gap-1 rounded bg-primary/15 px-1.5 py-0.5 text-xs font-medium text-primary"
            title={`${src.collectionName} / ${src.docName} / ${src.sectionName}`}
          >
            {p}
          </span>
        )
        return href ? (
          <Link key={i} to={href} className="no-underline">
            {inner}
          </Link>
        ) : (
          <span key={i}>{inner}</span>
        )
      }
      return <span key={i}>{p}</span>
    }
    return <span key={i}>{p}</span>
  })
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
  const symlinkEnabled = usePluginEnabled("symlink")
  const [searchParams] = useSearchParams()

  const [resources, setResources] = useState<InsightResources>({
    libraries: [],
    symlinks: [],
    sourceTypes: {},
  })
  const [loadingResources, setLoadingResources] = useState(true)
  const [indexSel, setIndexSel] = useState<Map<string, InsightSourceRef>>(new Map())
  const [askSel, setAskSel] = useState<Map<string, InsightSourceRef>>(new Map())

  // 树展开与软链接路径懒加载
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [symChildren, setSymChildren] = useState<Record<string, SymlinkTree["items"]>>({})
  const loadedCidRef = useRef<string | null>(null)

  const [embedStatus, setEmbedStatus] = useState<Awaited<ReturnType<typeof insightEmbeddingStatus>> | null>(null)
  const [model, setModel] = useState("")
  const [indexProgress, setIndexProgress] = useState<Record<string, InsightStatus>>({})
  const [indexing, setIndexing] = useState(false)

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
          setAskSel((prev) => {
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
    const refs = [...indexSel.values()]
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
    const refs = [...askSel.values()]
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
    const refs = [...askSel.values()]
    if (refs.length === 0 || !question.trim() || planning) return
    setPlanning(true)
    setPlanResult(null)
    try {
      await ensureIndexed(refs)
      const r = await insightPlan(refs, question.trim(), planOutput, planLib)
      setPlanResult(r)
      toast.success(t("insight.planDone", { name: r.collectionName }))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("insight.planFailed"))
    } finally {
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
      {symlinkEnabled && (
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
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Lightbulb className="size-6 text-primary" />
          {t("insight.pageTitle")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(symlinkEnabled ? "insight.introWithSymlink" : "insight.intro")}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{t("insight.mustIndexBefore")}</p>
      </div>

      <PluginGate pluginId="ai_insight" hint={t("insight.pluginHint")}>
        <Tabs defaultValue="ask">
          <TabsList>
            <TabsTrigger value="ask">{t("insight.stepAsk")}</TabsTrigger>
            <TabsTrigger value="index">{t("insight.stepIndex")}</TabsTrigger>
          </TabsList>

          {/* ---------------- 问 AI（含四种思考模式与洞察规划） ---------------- */}
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
                <div className="grid gap-3 sm:grid-cols-2">
                  {modes.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMode(m.id)}
                      className={cn(
                        "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                        mode === m.id ? "border-primary/50 bg-primary/5" : "hover:bg-accent/50",
                      )}
                    >
                      <m.icon className={cn("mt-0.5 size-5", mode === m.id ? "text-primary" : "text-muted-foreground")} />
                      <span>
                        <span className="block text-sm font-medium">{m.label}</span>
                        <span className="block text-xs text-muted-foreground">{m.desc}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("insight.askSourcesTitle")}</CardTitle>
              </CardHeader>
              <CardContent>
                {loadingResources ? (
                  <div className="space-y-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ) : (
                  renderTree(askSel, setAskSel)
                )}
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
                    disabled={planning || !question.trim() || askSel.size === 0}
                  >
                    {planning ? <Loader2 className="size-4 animate-spin" /> : <Network className="size-4" />}
                    {t("insight.planButton")}
                  </Button>
                  {planning && (
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" />
                      {t("insight.planning")}
                    </p>
                  )}
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

            {/* 对话区 */}
            {mode !== "plan" && (
              <Card className="flex min-h-[360px] flex-col">
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
                        <div className="markdown-body [&_p]:my-0">{renderAnswer(m.content, m.sources ?? [])}</div>
                        {m.sources && m.sources.length > 0 && (
                          <div className="mt-3 space-y-1.5 border-t pt-2">
                            <p className="text-xs font-medium text-muted-foreground">{t("insight.refSources")}</p>
                            {m.sources.map((s, j) => {
                              const href = sourceHref(s)
                              const body = (
                                <span className="flex flex-col rounded-md border bg-background px-3 py-1.5 text-xs hover:bg-accent">
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
                      disabled={asking || !question.trim() || askSel.size === 0}
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

          {/* ---------------- 第一步：建索引 ---------------- */}
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
                  <p className="w-full text-xs text-muted-foreground">{t("insight.modelDownloadHint")}</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Database className="size-4 text-primary" />
                    {t("insight.selectSourcesTitle")}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {t(symlinkEnabled ? "insight.indexIntroWithSymlink" : "insight.indexIntro")}
                  </p>
                </div>
                <Button onClick={doIndex} disabled={indexing || indexSel.size === 0 || !embedHealthy}>
                  {indexing ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                  {indexing ? t("insight.indexing") : t("insight.buildVectorIndex")}
                </Button>
              </CardHeader>
              <CardContent>
                {loadingResources ? (
                  <div className="space-y-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : (
                  renderTree(indexSel, setIndexSel)
                )}
                {Object.keys(indexProgress).length > 0 && (
                  <div className="mt-4 space-y-2 border-t pt-3">
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
        </Tabs>
      </PluginGate>
    </div>
  )
}
