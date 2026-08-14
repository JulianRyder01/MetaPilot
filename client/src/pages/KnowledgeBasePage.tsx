import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { Database, Loader2, Play, Rocket, Send, Sparkles } from "lucide-react"
import { toast } from "@/lib/toast"

import { api, type Collection, type KbEmbeddingStatus, type KbSource, type KbStatus } from "@/lib/api"
import { kbAsk, kbEmbeddingStart, kbEmbeddingStatus, kbIndex, kbStatus as kbStatusApi } from "@/plugins/knowledge_base/api"
import { PluginGate } from "@/components/plugins/PluginGate"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"

interface Msg {
  role: "user" | "assistant"
  content: string
  sources?: KbSource[]
}

function renderAnswer(text: string, sources: KbSource[], collectionId: string) {
  // 把 [来源N] 渲染为高亮标记
  const parts = text.split(/(\[来源\d+\])/g)
  return parts.map((p, i) => {
    const m = p.match(/\[来源(\d+)\]/)
    if (m) {
      const idx = Number(m[1]) - 1
      const src = sources[idx]
      if (src) {
        return (
          <Link
            key={i}
            to={`/learn/${collectionId}/${src.sectionId}`}
            className="mx-0.5 rounded bg-primary/15 px-1.5 py-0.5 text-xs font-medium text-primary hover:bg-primary/25"
            title={`${src.docName} / ${src.sectionName}`}
          >
            {p}
          </Link>
        )
      }
      return <span key={i}>{p}</span>
    }
    return <span key={i}>{p}</span>
  })
}

export default function KnowledgeBasePage() {
  const [params] = useSearchParams()
  const [collections, setCollections] = useState<Collection[]>([])
  const [cid, setCid] = useState<string>(params.get("cid") ?? "")
  const [embedStatus, setEmbedStatus] = useState<KbEmbeddingStatus | null>(null)
  const [kbStatus, setKbStatus] = useState<KbStatus | null>(null)
  const [indexing, setIndexing] = useState(false)
  const [question, setQuestion] = useState("")
  const [asking, setAsking] = useState(false)
  const [messages, setMessages] = useState<Msg[]>([])

  const loadCollections = useCallback(async () => {
    const libs = await api.listLibraries()
    const cols: Collection[] = []
    for (const lib of libs) {
      for (const c of lib.collections) {
        try {
          cols.push(await api.getCollection(c.id))
        } catch {
          /* ignore */
        }
      }
    }
    setCollections(cols)
    if (!cid && cols.length > 0) setCid(cols[0].id)
  }, [cid])

  useEffect(() => {
    loadCollections()
    kbEmbeddingStatus().then(setEmbedStatus).catch(() => {})
  }, [loadCollections])

  useEffect(() => {
    if (cid) kbStatusApi(cid).then(setKbStatus).catch(() => {})
  }, [cid])

  async function startEmbedding() {
    const r = await kbEmbeddingStart()
    if (r.started) {
      toast.success(r.message ?? "服务启动中")
    } else {
      toast.error(r.error ?? "启动失败")
    }
    kbEmbeddingStatus().then(setEmbedStatus).catch(() => {})
  }

  async function doIndex() {
    if (!cid) return
    setIndexing(true)
    try {
      const r = await kbIndex(cid)
      toast.success(`索引完成：${r.sectionCount} 个小节（向量维度 ${r.vectorDim}）`)
      kbStatusApi(cid).then(setKbStatus)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "索引失败")
    } finally {
      setIndexing(false)
    }
  }

  async function ask() {
    if (!cid || !question.trim()) return
    setMessages((m) => [...m, { role: "user", content: question }])
    setAsking(true)
    try {
      const r = await kbAsk(cid, question.trim())
      setMessages((m) => [...m, { role: "assistant", content: r.answer, sources: r.sources }])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "问答失败")
    } finally {
      setAsking(false)
      setQuestion("")
    }
  }

  const selectedName = useMemo(
    () => collections.find((c) => c.id === cid)?.name ?? "选择课程",
    [collections, cid],
  )

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Rocket className="size-6 text-primary" />
            个人知识库
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            对课程的"库-文档集-文档-小节"进行向量编码，用 AI 提问并溯源到具体知识点。
          </p>
        </div>
      </div>

      <PluginGate pluginId="knowledge_base" hint="AI 问答与文档溯源">
        {/* 课程选择 + 索引 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">索引管理</CardTitle>
          </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Select value={cid} onValueChange={setCid}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder={selectedName} />
            </SelectTrigger>
            <SelectContent>
              {collections.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={doIndex} disabled={!cid || indexing}>
            {indexing ? <Loader2 className="size-4 animate-spin" /> : <Database className="size-4" />}
            建立向量索引
          </Button>
          {kbStatus && (
            <Badge variant={kbStatus.indexed ? "success" : "secondary"}>
              {kbStatus.indexed
                ? `已索引 ${kbStatus.sectionCount} 个小节`
                : "未索引"}
            </Badge>
          )}
        </CardContent>
      </Card>

      {/* embedding 服务状态 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4 text-primary" />
            本地 Embedding 服务
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3 text-sm">
          {!embedStatus ? (
            <Skeleton className="h-6 w-64" />
          ) : (
            <>
              <Badge variant={embedStatus.healthy ? "success" : "destructive"}>
                {embedStatus.healthy ? "运行中" : "未就绪"}
              </Badge>
              <span className="text-muted-foreground">
                {embedStatus.model} · {embedStatus.url}
              </span>
              {!embedStatus.healthy && (
                <Button size="sm" variant="outline" onClick={startEmbedding}>
                  <Play className="size-4" />
                  启动服务（conda 环境）
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* 问答区 */}
      <Card className="flex min-h-[400px] flex-col">
        <CardHeader>
          <CardTitle className="text-base">AI 问答（回答将标注来源）</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-4">
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
            {messages.length === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">
                先选择课程并建立索引，然后开始提问。例如："这个课程里卷积核是怎么工作的？"
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
                <div className="markdown-body [&_p]:my-0">
                  {renderAnswer(m.content, m.sources ?? [], cid)}
                </div>
                {m.sources && m.sources.length > 0 && (
                  <div className="mt-3 space-y-1.5 border-t pt-2">
                    <p className="text-xs font-medium text-muted-foreground">参考来源</p>
                    {m.sources.map((s, j) => (
                      <Link
                        key={j}
                        to={`/learn/${cid}/${s.sectionId}`}
                        className="flex flex-col rounded-md border bg-background px-3 py-1.5 text-xs hover:bg-accent"
                      >
                        <span className="font-medium">
                          [来源{j + 1}] {s.docName} / {s.sectionName}
                        </span>
                        <span className="line-clamp-2 text-muted-foreground">{s.excerpt}</span>
                      </Link>
                    ))}
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
            <Button onClick={ask} disabled={asking || !question.trim() || !cid} className="self-end">
              <Send className="size-4" />
              提问
            </Button>
          </div>
        </CardContent>
      </Card>
      </PluginGate>
    </div>
  )
}
