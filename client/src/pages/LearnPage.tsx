import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  Circle,
  ListTree,
} from "lucide-react"
import { toast } from "sonner"

import { api, type Collection, type Progress } from "@/lib/api"
import { cn } from "@/lib/utils"
import { usePluginEnabled } from "@/stores/plugins"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { OutlineNav } from "@/components/learn/OutlineNav"
import { BlockRenderer } from "@/components/learn/BlockRenderer"
import { PluginGate } from "@/components/plugins/PluginGate"

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

  if (!col || currentIndex === -1) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-6 py-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  // 课程类型（含题目/交互块/进度）依赖课程插件；笔记类型是纯文档阅读
  const isCourse = col.kind === "course"
  if (isCourse && !courseEnabled) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <PluginGate pluginId="course" hint="学习课程（知识点组件流 / 进度 / 题目判题 / 交互块）" />
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
          {isCourse ? (
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
            <Badge variant="secondary">笔记阅读</Badge>
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
                {currentIndex + 1} / {flat.length} 个知识点
              </p>
            </header>
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
          {isCourse ? (
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
