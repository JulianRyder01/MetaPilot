import { useCallback, useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { Check, Database, Loader2, Play, Rocket, Send, Sparkles, Square } from "lucide-react"
import { toast } from "@/lib/toast"

import { type KbSource } from "@/lib/api"
import {
  kbAsk,
  kbEmbeddingStart,
  kbEmbeddingStatus,
  kbEmbeddingStop,
  kbIndex,
  kbSources,
  type KbSourceItem,
  type KbSourceRef,
} from "@/plugins/knowledge_base/api"
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
import { cn } from "@/lib/utils"

interface Msg {
  role: "user" | "assistant"
  content: string
  sources?: KbSource[]
}

/** 来源跳转：learn → 学习页；symlink → 文件浏览器（挂载根） */
function sourceHref(src: KbSource): string | null {
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

/** 勾选源列表的小组件：库 / 软链接分组 */
function SourcePicker({
  sources,
  selected,
  onToggle,
  disabled,
}: {
  sources: KbSourceItem[]
  selected: Set<string>
  onToggle: (key: string) => void
  disabled?: boolean
}) {
  const groups: { label: string; items: KbSourceItem[] }[] = [
    { label: "默认库（含课程 / 笔记）", items: sources.filter((s) => s.type === "library") },
    { label: "软链接（本机目录）", items: sources.filter((s) => s.type === "symlink") },
  ]
  return (
    <div className="space-y-3">
      {groups.map((g) =>
        g.items.length === 0 ? null : (
          <div key={g.label}>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">{g.label}</p>
            <div className="space-y-1.5">
              {g.items.map((s) => (
                <label
                  key={s.key}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm transition-colors",
                    selected.has(s.key) ? "border-primary/50 bg-primary/5" : "hover:bg-accent/50",
                  )}
                >
                  <span className="flex items-center gap-2.5">
                    <Checkbox
                      checked={selected.has(s.key)}
                      disabled={disabled}
                      onCheckedChange={() => onToggle(s.key)}
                    />
                    <span className="font-medium">{s.name}</span>
                    {s.type === "symlink" && s.root && (
                      <span className="max-w-48 truncate text-xs text-muted-foreground">{s.root}</span>
                    )}
                  </span>
                  <Badge variant={s.status.indexed ? "success" : "secondary"}>
                    {s.status.indexed ? `已索引 ${s.status.sectionCount} 段` : "未索引"}
                  </Badge>
                </label>
              ))}
            </div>
          </div>
        ),
      )}
    </div>
  )
}

export default function KnowledgeBasePage() {
  const symlinkEnabled = usePluginEnabled("symlink")
  const [sources, setSources] = useState<KbSourceItem[]>([])
  const [selectedIndex, setSelectedIndex] = useState<Set<string>>(new Set())
  const [selectedAsk, setSelectedAsk] = useState<Set<string>>(new Set())
  const [embedStatus, setEmbedStatus] = useState<Awaited<ReturnType<typeof kbEmbeddingStatus>> | null>(null)
  const [model, setModel] = useState("")
  const [loadingSources, setLoadingSources] = useState(true)
  const [indexing, setIndexing] = useState(false)
  const [question, setQuestion] = useState("")
  const [asking, setAsking] = useState(false)
  const [messages, setMessages] = useState<Msg[]>([])

  const loadSources = useCallback(async () => {
    setLoadingSources(true)
    try {
      const list = await kbSources()
      setSources(list)
      // 默认勾选第一个未索引源用于建索引；问答默认勾选全部已索引源
      setSelectedIndex((prev) => (prev.size ? prev : new Set(list.slice(0, 1).map((s) => s.key))))
      setSelectedAsk((prev) => {
        if (prev.size) return prev
        const indexed = list.filter((s) => s.status.indexed).map((s) => s.key)
        return new Set(indexed)
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载数据源失败")
    } finally {
      setLoadingSources(false)
    }
  }, [])

  const loadEmbed = useCallback(async () => {
    try {
      const st = await kbEmbeddingStatus()
      setEmbedStatus(st)
      if (!model && st.models) setModel(st.model || Object.keys(st.models)[0] || "")
    } catch {
      /* 忽略：状态区展示骨架 */
    }
  }, [model])

  useEffect(() => {
    loadSources()
    loadEmbed()
    const timer = setInterval(loadEmbed, 5000) // 轮询服务就绪状态
    return () => clearInterval(timer)
  }, [loadSources, loadEmbed])

  const indexedSources = useMemo(() => sources.filter((s) => s.status.indexed), [sources])

  function toggle(set: Set<string>, setter: (s: Set<string>) => void, key: string) {
    const next = new Set(set)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setter(next)
  }

  async function startEmbedding() {
    const r = await kbEmbeddingStart(model)
    if (r.started) toast.success(r.message ?? "服务启动中（首次运行会自动下载所选模型）")
    else toast.error(r.error ?? "启动失败")
    loadEmbed()
  }

  async function stopEmbedding() {
    await kbEmbeddingStop()
    toast.success("服务已停止")
    loadEmbed()
  }

  async function doIndex() {
    const refs: KbSourceRef[] = sources
      .filter((s) => selectedIndex.has(s.key))
      .map((s) => ({ type: s.type, id: s.id }))
    if (refs.length === 0) return
    setIndexing(true)
    try {
      const { results } = await kbIndex(refs)
      const ok = results.filter((r) => r.indexed).length
      const failed = results.filter((r) => r.error)
      toast.success(`索引完成：${ok}/${results.length} 个数据源`)
      failed.forEach((r) => r.error && toast.error(r.error))
      await loadSources()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "索引失败")
    } finally {
      setIndexing(false)
    }
  }

  async function ask() {
    const refs: KbSourceRef[] = sources
      .filter((s) => selectedAsk.has(s.key) && s.status.indexed)
      .map((s) => ({ type: s.type, id: s.id }))
    if (refs.length === 0 || !question.trim()) return
    setMessages((m) => [...m, { role: "user", content: question }])
    setAsking(true)
    try {
      const r = await kbAsk(refs, question.trim())
      setMessages((m) => [...m, { role: "assistant", content: r.answer, sources: r.sources }])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "问答失败")
    } finally {
      setAsking(false)
      setQuestion("")
    }
  }

  const embedHealthy = embedStatus?.healthy ?? false

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Rocket className="size-6 text-primary" />
          AI 知识库
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {symlinkEnabled
            ? "对「默认库（含课程）」与「软链接本机目录」多数据源建立向量索引，用 AI 提问并溯源到具体内容。"
            : "对「默认库（含课程）」建立向量索引，用 AI 提问并溯源到具体内容。"}
          必须先在<b>第一步 · 建索引</b> 完成索引，才可在第二步提问。
        </p>
      </div>

      <PluginGate pluginId="knowledge_base" hint="AI 问答与文档溯源">
        <Tabs defaultValue="index">
          <TabsList>
            <TabsTrigger value="index">第一步 · 建索引</TabsTrigger>
            <TabsTrigger value="ask">第二步 · 问 AI</TabsTrigger>
          </TabsList>

          {/* ---------------- 第一步：建索引 ---------------- */}
          <TabsContent value="index" className="space-y-4">
            {/* embedding 服务 + 模型选择 */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="size-4 text-primary" />
                  向量模型与本地服务
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-3 text-sm">
                {!embedStatus ? (
                  <Skeleton className="h-6 w-72" />
                ) : (
                  <>
                    <Badge variant={embedHealthy ? "success" : "destructive"}>
                      {embedHealthy ? "运行中" : "未就绪"}
                    </Badge>
                    <Select value={model} onValueChange={setModel}>
                      <SelectTrigger className="w-72">
                        <SelectValue placeholder="选择 embedding 模型" />
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
                        停止服务
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={startEmbedding}>
                        <Play className="size-4" />
                        启动服务（首次自动下载所选模型）
                      </Button>
                    )}
                  </>
                )}
                {embedStatus && (
                  <p className="w-full text-xs text-muted-foreground">
                    模型下载多路自动尝试（ModelScope → HF-Mirror → HuggingFace），首次下载 0.6B 约 2-3 分钟、4B 需更久，页面会自动刷新状态。
                  </p>
                )}
              </CardContent>
            </Card>

            {/* 数据源多选 + 建索引 */}
            <Card>
              <CardHeader className="flex-row items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Database className="size-4 text-primary" />
                    选择数据源（可多选）
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {symlinkEnabled
                      ? "默认库与软链接挂载都可建索引，索引按数据源独立存储。"
                      : "默认库可建索引，索引按数据源独立存储。"}
                  </p>
                </div>
                <Button onClick={doIndex} disabled={indexing || selectedIndex.size === 0 || !embedHealthy}>
                  {indexing ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                  {indexing ? "索引中..." : "建立向量索引"}
                </Button>
              </CardHeader>
              <CardContent>
                {loadingSources ? (
                  <div className="space-y-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : sources.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {symlinkEnabled
                      ? "暂无可用数据源：请先在「我的库」创建库，或在软链接插件中挂载本机目录。"
                      : "暂无可用数据源：请先在「我的库」创建库。"}
                  </p>
                ) : (
                  <SourcePicker
                    sources={sources}
                    selected={selectedIndex}
                    onToggle={(k) => toggle(selectedIndex, setSelectedIndex, k)}
                    disabled={indexing}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------- 第二步：问 AI ---------------- */}
          <TabsContent value="ask" className="space-y-4">
            {indexedSources.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  还没有已建立索引的数据源。请先到<b>「第一步 · 建索引」</b>，
                  {symlinkEnabled ? "对选中的库 / 软链接目录建立向量索引后再提问。" : "对选中的库建立向量索引后再提问。"}
                </CardContent>
              </Card>
            ) : (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">选择已索引的数据源（可多选，合并检索）</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <SourcePicker
                      sources={indexedSources}
                      selected={selectedAsk}
                      onToggle={(k) => toggle(selectedAsk, setSelectedAsk, k)}
                    />
                  </CardContent>
                </Card>

                <Card className="flex min-h-[360px] flex-col">
                  <CardHeader>
                    <CardTitle className="text-base">AI 问答（回答将标注来源）</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col gap-4">
                    <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
                      {messages.length === 0 && (
                        <p className="py-8 text-center text-sm text-muted-foreground">
                          从已索引的数据源中提问，例如："这个课程里卷积核是怎么工作的？"
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
                              <p className="text-xs font-medium text-muted-foreground">参考来源</p>
                              {m.sources.map((s, j) => {
                                const href = sourceHref(s)
                                const body = (
                                  <span className="flex flex-col rounded-md border bg-background px-3 py-1.5 text-xs hover:bg-accent">
                                    <span className="font-medium">
                                      [来源{j + 1}] {s.collectionName} / {s.docName} / {s.sectionName}
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
                          正在检索并生成回答...
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Textarea
                        placeholder="输入你的问题..."
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
                        disabled={asking || !question.trim() || selectedAsk.size === 0}
                        className="self-end"
                      >
                        <Send className="size-4" />
                        提问
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
        </Tabs>
      </PluginGate>
    </div>
  )
}
