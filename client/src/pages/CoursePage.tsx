import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Circle,
  Download,
  GraduationCap,
  Pencil,
  Play,
  Rocket,
  Sparkles,
} from "lucide-react"
import { toast } from "sonner"

import { api, type Collection, type Progress } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress as ProgressBar } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { ImportDialog } from "@/components/library/ImportDialog"
import { PluginGate } from "@/components/plugins/PluginGate"

export default function CoursePage() {
  const { cid } = useParams()
  const navigate = useNavigate()
  const [col, setCol] = useState<Collection | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)

  const load = useCallback(async () => {
    if (!cid) return
    const [c, p] = await Promise.all([api.getCollection(cid), api.getProgress(cid)])
    setCol(c)
    setProgress(p)
  }, [cid])

  useEffect(() => {
    load()
  }, [load])

  const allSections = useMemo(() => {
    if (!col) return []
    return col.documents.flatMap((d) => d.sections.map((s) => ({ doc: d, section: s })))
  }, [col])

  const completedCount = useMemo(() => {
    if (!progress) return 0
    return allSections.filter(({ section }) => progress.completedSections.includes(section.id)).length
  }, [allSections, progress])

  const total = allSections.length
  const percent = total ? Math.round((completedCount / total) * 100) : 0

  async function exportCourse() {
    if (!cid) return
    try {
      const a = document.createElement("a")
      a.href = api.exportCourseUrl(cid)
      a.download = "course.zip"
      a.click()
    } catch {
      toast.error("导出失败")
    }
  }

  function continueLearning() {
    if (!cid) return
    const pos = progress?.lastPosition
    if (pos) {
      navigate(`/learn/${cid}/${pos.sectionId}`)
    } else if (allSections.length > 0) {
      navigate(`/learn/${cid}/${allSections[0].section.id}`)
    }
  }

  if (!col) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-6 py-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Link to="/" className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        返回库
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{col.name}</h1>
            <Badge variant="secondary">v{col.version}</Badge>
            {col.packageId && <Badge variant="outline">{col.packageId}</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {col.description || "暂无简介"}
            {col.author && <span className="ml-2">作者：{col.author}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ImportDialog libraryId={undefined} />
          <Button variant="outline" size="sm" onClick={exportCourse}>
            <Download className="size-4" />
            导出
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate(`/edit/${cid}`)}>
            <Pencil className="size-4" />
            编辑
          </Button>
          <Button size="sm" onClick={continueLearning}>
            <Play className="size-4" />
            继续学习
          </Button>
        </div>
      </div>

      {/* 进度 */}
      <div className="mb-6 rounded-lg border p-4">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium">学习进度</span>
          <span className="text-muted-foreground">
            {completedCount} / {total} 个知识点
          </span>
        </div>
        <ProgressBar value={percent} />
        {progress?.lastPosition && (
          <p className="mt-2 text-xs text-muted-foreground">
            上次学到：{allSections.find(({ section }) => section.id === progress.lastPosition!.sectionId)?.section.name ?? ""}
          </p>
        )}
      </div>

      {/* 章节列表 */}
      <div className="space-y-4">
        {col.documents.map((doc, di) => (
          <div key={doc.id} className="rounded-lg border">
            <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2.5">
              <BookOpen className="size-4 text-primary" />
              <span className="font-medium">
                {di + 1}. {doc.name}
              </span>
              {doc.docType === "quiz" && <Badge variant="outline">测验</Badge>}
            </div>
            <div className="divide-y">
              {doc.sections.map((sec) => {
                const done = progress?.completedSections.includes(sec.id)
                return (
                  <Link
                    key={sec.id}
                    to={`/learn/${cid}/${sec.id}`}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent/50"
                  >
                    {done ? (
                      <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                    ) : (
                      <Circle className="size-4 shrink-0 text-muted-foreground/50" />
                    )}
                    <span className={done ? "text-muted-foreground" : ""}>{sec.name}</span>
                    <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                      {sec.blocks.length > 0 && <Sparkles className="size-3" />}
                      {sec.blocks.filter((b) => b.type === "interactive").length > 0 && (
                        <GraduationCap className="size-3 text-primary" />
                      )}
                    </span>
                  </Link>
                )
              })}
              {doc.sections.length === 0 && (
                <p className="px-4 py-3 text-sm text-muted-foreground">本章暂无小节</p>
              )}
            </div>
          </div>
        ))}
        {col.documents.length === 0 && (
          <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
            该课程还没有章节，点击右上角「编辑」开始创建。
          </div>
        )}
      </div>

      {/* 知识库入口 */}
      <PluginGate pluginId="knowledge_base" hint="AI 问答与文档溯源" compact>
        <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center gap-2 text-sm">
            <Rocket className="size-4 text-primary" />
            <span>
              个人知识库插件：对该课程建立向量索引后，可用 AI 提问并溯源到具体知识点。
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate(`/kb?cid=${cid}`)}>
            打开知识库
          </Button>
        </div>
      </PluginGate>
    </div>
  )
}
