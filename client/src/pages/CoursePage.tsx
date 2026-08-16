import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
  Sparkles,
} from "lucide-react"
import { toast } from "@/lib/toast"

import { useT } from "@/i18n"
import { api, type Collection, type Progress } from "@/lib/api"
import { exportCourseUrl, getProgress } from "@/plugins/course/api"
import { usePluginEnabled } from "@/stores/plugins"
import { useSettingsStore } from "@/stores/settings"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress as ProgressBar } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"

export default function CoursePage() {
  const t = useT()
  const { cid } = useParams()
  const navigate = useNavigate()
  const [col, setCol] = useState<Collection | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const courseEnabled = usePluginEnabled("course")

  const load = useCallback(async () => {
    if (!cid) return
    const c = await api.getCollection(cid)
    setCol(c)
    // 学习进度是课程插件能力：仅课程类型加载
    if (c.kind === "course" && courseEnabled) {
      getProgress(cid).then(setProgress).catch(() => {})
    } else {
      setProgress(null)
    }
  }, [cid, courseEnabled])

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
      a.href = exportCourseUrl(cid)
      a.download = "course.zip"
      a.click()
    } catch {
      toast.error(t("course.exportFailed"))
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

  // 课程视图依赖课程插件：禁用时仍可浏览文档结构（章节/小节），
  // 仅进度、导出、继续学习等课程能力不可用。
  const isCourse = col?.kind === "course"
  const canTrack = isCourse && courseEnabled && col !== null
  const warnedRef = useRef(false)
  useEffect(() => {
    if (isCourse && !courseEnabled && !warnedRef.current) {
      warnedRef.current = true
      if (useSettingsStore.getState().showPluginWarnings) {
        toast.warning(t("course.pluginDisabledWarning"), { duration: 6000 })
      }
    }
  }, [t, isCourse, courseEnabled])

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
        {t("course.backToLibrary")}
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{col.name}</h1>
            <Badge variant="secondary">v{col.version}</Badge>
            {col.packageId && <Badge variant="outline">{col.packageId}</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {col.description || t("course.noDescription")}
            {col.author && <span className="ml-2">{t("course.authorLabel", { author: col.author })}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canTrack && (
            <>
              <Button variant="outline" size="sm" onClick={exportCourse}>
                <Download className="size-4" />
                {t("course.export")}
              </Button>
              <Button size="sm" onClick={continueLearning}>
                <Play className="size-4" />
                {t("course.continueLearning")}
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={() => navigate(`/edit/${cid}`)}>
            <Pencil className="size-4" />
            {t("common.edit")}
          </Button>
        </div>
      </div>

      {/* 进度（课程能力） */}
      {canTrack ? (
        <div className="mb-6 rounded-lg border p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium">{t("course.learningProgress")}</span>
            <span className="text-muted-foreground">
              {t("course.progressCount", { completed: completedCount, total })}
            </span>
          </div>
          <ProgressBar value={percent} />
          {progress?.lastPosition && (
            <p className="mt-2 text-xs text-muted-foreground">
              {t("course.lastLearned", { name: allSections.find(({ section }) => section.id === progress.lastPosition!.sectionId)?.section.name ?? "" })}
            </p>
          )}
        </div>
      ) : (
        <div className="mb-6 rounded-lg border border-dashed border-amber-300 bg-amber-50/40 px-4 py-3 text-sm dark:border-amber-700/50 dark:bg-amber-950/20">
          {t("course.progressRequiresPlugin")}
        </div>
      )}

      {/* 章节列表 */}
      <div className="space-y-4">
        {col.documents.map((doc, di) => (
          <div key={doc.id} className="rounded-lg border">
            <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2.5">
              <BookOpen className="size-4 text-primary" />
              <span className="font-medium">
                {di + 1}. {doc.name}
              </span>
              {doc.docType === "quiz" && <Badge variant="outline">{t("course.quiz")}</Badge>}
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
                <p className="px-4 py-3 text-sm text-muted-foreground">{t("course.noSectionsInChapter")}</p>
              )}
            </div>
          </div>
        ))}
        {col.documents.length === 0 && (
          <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
            {t("course.noChapters")}
          </div>
        )}
      </div>
    </div>
  )
}
