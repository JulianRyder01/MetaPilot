import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  Circle,
  Link2,
  ListTree,
} from "lucide-react"
import { toast } from "@/lib/toast"

import { api, type Collection, type Progress } from "@/lib/api"
import { cn } from "@/lib/utils"
import { resolveRefTarget } from "@/lib/tree"
import { usePluginEnabled } from "@/stores/plugins"
import { useSettingsStore } from "@/stores/settings"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { OutlineNav } from "@/components/learn/OutlineNav"
import { BlockRenderer } from "@/components/learn/BlockRenderer"

export default function LearnPage() {
  const { cid, sid } = useParams()
  const navigate = useNavigate()
  const [col, setCol] = useState<Collection | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const startRef = useRef(Date.now())
  const courseEnabled = usePluginEnabled("course")

  const load = useCallback(async () => {
    if (!cid) return
    const c = await api.getCollection(cid)
    setCol(c)
    // 学习进度是课程插件能力：课程类型才加载
    if (c.kind === "course" && courseEnabled) {
      api.getProgress(cid).then(setProgress).catch(() => {})
    } else {
      setProgress(null)
    }
  }, [cid, courseEnabled])

  useEffect(() => {
    load()
  }, [load])

  // 学习时长统计（课程插件能力）：进入小节开始计时，离开时上报
  useEffect(() => {
    startRef.current = Date.now()
    return () => {
      const dur = Math.round((Date.now() - startRef.current) / 1000)
      if (dur >= 2 && cid && sid && col?.kind === "course" && courseEnabled) {
        api.addSession({ collectionId: cid, sectionId: sid, durationSec: dur }).catch(() => {})
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sid, cid, col?.kind, courseEnabled])

  // 官方核心统计：文档访问（core 能力，与课程插件无关，始终上报）
  const visitRef = useRef<string>("")
  useEffect(() => {
    if (!cid || !sid || !col) return
    const doc = col.documents.find((d) => d.sections.some((s) => s.id === sid))
    if (!doc) return
    const visitKey = `${cid}:${doc.id}`
    if (visitRef.current === visitKey) return
    visitRef.current = visitKey
    api
      .statsCoreVisit({ collectionId: cid, documentId: doc.id, documentName: doc.name })
      .catch(() => {})
  }, [sid, cid, col])

  // 记录上次学习位置（课程插件能力）
  useEffect(() => {
    if (cid && sid && col?.kind === "course" && courseEnabled) {
      api.setPosition(cid, currentDocId(sid) ?? "", sid).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid, sid, col?.kind, courseEnabled])

  const flat = useMemo(() => {
    if (!col) return []
    return col.documents.flatMap((d) => d.sections.map((s) => ({ doc: d, section: s })))
  }, [col])

  const currentIndex = useMemo(
    () => flat.findIndex(({ section }) => section.id === sid),
    [flat, sid],
  )

  function currentDocId(targetSid: string): string | null {
    return flat.find(({ section }) => section.id === targetSid)?.doc.id ?? null
  }

  const current = flat[currentIndex]
  const prev = flat[currentIndex - 1]
  const next = flat[currentIndex + 1]

  // 小节引用其他文档：显示引用卡片并跳转
  const refTarget = useMemo(
    () => (col && current ? resolveRefTarget(col, current.section.refDocId) : null),
    [col, current],
  )

  const completedSet = useMemo(
    () => new Set(progress?.completedSections ?? []),
    [progress],
  )
  const isCompleted = sid ? completedSet.has(sid) : false

  async function toggleDone() {
    if (!cid || !sid) return
    const r = await api.toggleCompleted(cid, sid)
    setProgress((p) =>
      p
        ? {
            ...p,
            completedSections: r.completed
              ? [...p.completedSections, sid]
              : p.completedSections.filter((x) => x !== sid),
          }
        : p,
    )
    toast.success(r.completed ? "已标记学完" : "已取消标记")
  }

  function go(sectionId: string) {
    if (cid) navigate(`/learn/${cid}/${sectionId}`)
  }

  // 课程类型依赖课程插件：禁用时仍可阅读（markdown 正常、题目/交互块显示原始数据），
  // 仅提示依赖，不拦截浏览。
  const isCourse = col?.kind === "course"
  const canTrack = isCourse && courseEnabled
  const warnedRef = useRef(false)
  useEffect(() => {
    if (isCourse && !courseEnabled && !warnedRef.current) {
      warnedRef.current = true
      if (useSettingsStore.getState().showPluginWarnings) {
        toast.warning(
          "此文档依赖「课程」插件，题目与交互块将以原始数据展示，可前往「插件」页启用。",
          { duration: 6000 },
        )
      }
    }
  }, [isCourse, courseEnabled])

  if (!col || currentIndex === -1) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-6 py-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-56px)]">
      {/* 左栏大纲 */}
      <aside className="hidden w-72 shrink-0 border-r bg-card/50 lg:block">
        <div className="flex h-12 items-center gap-2 border-b px-4">
          <ListTree className="size-4 text-muted-foreground" />
          <span className="truncate text-sm font-medium">{col.name}</span>
        </div>
        <ScrollArea className="h-[calc(100%-48px)]">
          <div className="p-3">
            <OutlineNav
              collection={col}
              currentSectionId={sid!}
              completedSet={completedSet}
              onNavigate={go}
            />
          </div>
        </ScrollArea>
      </aside>

      {/* 主内容 */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden">
                  <ListTree className="size-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <SheetHeader className="border-b">
                  <SheetTitle className="text-sm">{col.name}</SheetTitle>
                </SheetHeader>
                <ScrollArea className="h-[calc(100%-60px)]">
                  <div className="p-3">
                    <OutlineNav
                      collection={col}
                      currentSectionId={sid!}
                      completedSet={completedSet}
                      onNavigate={go}
                    />
                  </div>
                </ScrollArea>
              </SheetContent>
            </Sheet>
            <Link
              to={`/course/${cid}`}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="size-4" />
              {current.doc.name}
            </Link>
          </div>
          {canTrack ? (
            <Button
              variant={isCompleted ? "outline" : "default"}
              size="sm"
              onClick={toggleDone}
              className="gap-1.5"
            >
              {isCompleted ? <CheckCircle2 className="size-4" /> : <Circle className="size-4" />}
              {isCompleted ? "已学完" : "标记学完"}
            </Button>
          ) : (
            <Badge variant="secondary">文档阅读</Badge>
          )}
        </div>

        {/* 组件流 */}
        <ScrollArea className="flex-1">
          <article className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
            <header>
              <p className="text-xs font-medium uppercase tracking-wide text-primary">
                {current.doc.name}
              </p>
              <h1 className="mt-1 text-2xl font-semibold">{current.section.name}</h1>
              <p className="mt-1 text-xs text-muted-foreground">
                {currentIndex + 1} / {flat.length} {isCourse ? "个知识点" : "篇"}
              </p>
            </header>

            {/* 小节引用其他文档：引用卡片 */}
            {refTarget && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
                <div className="flex items-center gap-2 text-sm">
                  <Link2 className="size-4 text-primary" />
                  <span>
                    本小节引用文档「{refTarget.doc.name}」
                    {refTarget.section.name && <span className="text-muted-foreground">（{refTarget.section.name}）</span>}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!refTarget.section.id}
                  onClick={() => refTarget.section.id && navigate(`/learn/${cid}/${refTarget.section.id}`)}
                >
                  前往引用文档
                </Button>
              </div>
            )}
            <div className="space-y-6">
              {current.section.blocks.map((block) => (
                <BlockRenderer key={block.id} block={block} collectionId={cid!} />
              ))}
              {current.section.blocks.length === 0 && (
                <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  这个知识点还没有内容
                </p>
              )}
            </div>
          </article>
        </ScrollArea>

        {/* 底部导航 */}
        <div className="flex items-center justify-between border-t px-4 py-3">
          <Button
            variant="outline"
            size="sm"
            disabled={!prev}
            onClick={() => prev && go(prev.section.id)}
            className={cn(!prev && "invisible")}
          >
            <ArrowLeft className="size-4" />
            上一个知识点
          </Button>
          {canTrack ? (
            <Button variant="ghost" size="sm" onClick={toggleDone}>
              {isCompleted ? "取消学完标记" : "标记本知识点学完"}
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">
              {currentIndex + 1} / {flat.length}
            </span>
          )}
          <Button
            size="sm"
            disabled={!next}
            onClick={() => next && go(next.section.id)}
            className={cn(!next && "invisible")}
          >
            下一个知识点
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
