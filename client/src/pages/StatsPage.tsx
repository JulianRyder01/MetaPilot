import { useEffect, useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Eye, EyeOff, GripVertical, Maximize2, Minimize2 } from "lucide-react"

import {
  api,
  type StatsCoreSummary,
  type StatsSummary,
  type StatsWidget,
} from "@/lib/api"
import { cn } from "@/lib/utils"
import { usePluginEnabled, usePluginsStore } from "@/stores/plugins"
import { useStatsLayoutStore, type WidgetSize } from "@/stores/statsLayout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { SourceBadge } from "@/components/stats/SourceBadge"

const SIZE_CLASS: Record<WidgetSize, string> = {
  sm: "col-span-2",
  md: "col-span-3",
  lg: "col-span-6",
  xl: "col-span-6",
}
const SIZE_MIN_H: Record<WidgetSize, string> = {
  sm: "min-h-32",
  md: "min-h-40",
  lg: "min-h-48",
  xl: "min-h-72",
}
const SIZES: WidgetSize[] = ["sm", "md", "lg", "xl"]

function fmtTime(sec: number) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m} 分钟`
  return `${sec} 秒`
}

const WEEKDAY = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]

export default function StatsPage() {
  const [widgets, setWidgets] = useState<StatsWidget[]>([])
  const [core, setCore] = useState<StatsCoreSummary | null>(null)
  const [course, setCourse] = useState<StatsSummary | null>(null)
  const courseEnabled = usePluginEnabled("course")
  const plugins = usePluginsStore((s) => s.plugins)
  const layout = useStatsLayoutStore()
  const [dragId, setDragId] = useState<string | null>(null)

  useEffect(() => {
    api.statsWidgets().then(setWidgets).catch(() => {})
    api.statsCoreSummary().then(setCore).catch(() => {})
    if (courseEnabled) api.statsSummary("all").then(setCourse).catch(() => {})
  }, [courseEnabled])

  // 可用组件 = core（恒可用）+ 来源插件已启用的
  const available = useMemo(
    () =>
      widgets.filter((w) => {
        if (w.source === "core") return true
        const p = plugins.find((x) => x.id === w.source)
        return p ? p.enabled : false
      }),
    [widgets, plugins],
  )

  // 同步默认布局（新组件默认可见并追加到末尾）
  useEffect(() => {
    if (available.length > 0) layout.syncWidgets(available)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available])

  const visibleWidgets = available
    .filter((w) => layout.visible[w.id] !== false)
    .sort((a, b) => {
      const ia = layout.order.indexOf(a.id)
      const ib = layout.order.indexOf(b.id)
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
    })
  const hiddenWidgets = available.filter((w) => layout.visible[w.id] === false)

  function onDrop(targetId: string) {
    if (!dragId || dragId === targetId) return
    const order = [...layout.order]
    const from = order.indexOf(dragId)
    const to = order.indexOf(targetId)
    if (from === -1 || to === -1) return
    order.splice(from, 1)
    order.splice(to, 0, dragId)
    layout.setOrder(order)
    setDragId(null)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold">统计</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          官方核心提供基础统计组件，课程等插件可贡献更多组件；拖动卡片调整位置，右上角调整大小，可在设置页开关「标记组件来源」。
        </p>
      </div>

      {/* 网格 */}
      <div className="grid grid-cols-6 gap-4 auto-rows-min">
        {visibleWidgets.map((w) => {
          const size = layout.size[w.id] || (w.defaultSize as WidgetSize) || "md"
          return (
            <div
              key={w.id}
              draggable
              onDragStart={() => setDragId(w.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(w.id)}
              className={cn(SIZE_CLASS[size], "cursor-grab active:cursor-grabbing")}
            >
              <Card className={cn("h-full", SIZE_MIN_H[size])}>
                <CardHeader className="flex-row items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <GripVertical className="size-3.5 text-muted-foreground/60" />
                    {w.title}
                    <SourceBadge source={w.source} />
                  </CardTitle>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      onClick={() => {
                        const idx = SIZES.indexOf(size)
                        layout.setSize(w.id, SIZES[(idx + 1) % SIZES.length])
                      }}
                      title={`调整大小（当前 ${size}）`}
                    >
                      {size === "xl" ? <Minimize2 className="size-3" /> : <Maximize2 className="size-3" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      onClick={() => layout.setVisible(w.id, false)}
                      title="隐藏组件"
                    >
                      <EyeOff className="size-3" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {w.source === "course" ? (
                    <CourseWidget id={w.id} data={course} enabled={courseEnabled} />
                  ) : (
                    <CoreWidget id={w.id} data={core} />
                  )}
                </CardContent>
              </Card>
            </div>
          )
        })}
      </div>

      {/* 已隐藏组件 */}
      {hiddenWidgets.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed px-4 py-3">
          <span className="text-sm text-muted-foreground">已隐藏组件：</span>
          {hiddenWidgets.map((w) => (
            <Badge key={w.id} variant="outline" className="gap-1.5">
              {w.title}
              <SourceBadge source={w.source} />
              <button onClick={() => layout.setVisible(w.id, true)} className="text-muted-foreground hover:text-foreground">
                <Eye className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------- core 组件 ----------

function CoreWidget({ id, data }: { id: string; data: StatsCoreSummary | null }) {
  if (!data) return <Skeleton className="h-20 w-full" />
  switch (id) {
    case "topDocs":
      return (
        <div className="space-y-1.5">
          {data.topDocs.length === 0 && <p className="text-sm text-muted-foreground">暂无访问记录</p>}
          {data.topDocs.map((d, i) => (
            <div key={d.docId} className="flex items-center gap-2 text-sm">
              <span className="w-5 shrink-0 text-muted-foreground">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">{d.name}</span>
              <Badge variant="secondary">{d.visits} 次</Badge>
            </div>
          ))}
        </div>
      )
    case "heatmap":
      return <Heatmap data={data.heatmap} />
    case "stayTime":
      return (
        <div className="space-y-1.5">
          {data.topDocs.length === 0 && <p className="text-sm text-muted-foreground">暂无停留记录</p>}
          {data.topDocs.map((d) => (
            <div key={d.docId} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{d.name}</span>
              <span className="shrink-0 text-muted-foreground">{fmtTime(d.totalDurationSec)}</span>
            </div>
          ))}
        </div>
      )
    case "wordCount":
      return (
        <div className="space-y-2">
          <p className="text-2xl font-semibold">
            {data.totalWords.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">字</span>
          </p>
          <div className="space-y-1">
            {data.wordsPerCollection.slice(0, 5).map((c) => (
              <div key={c.id} className="flex items-center gap-2 text-xs">
                <span className="w-24 truncate text-muted-foreground">{c.name}</span>
                <div className="h-2 flex-1 rounded bg-muted">
                  <div
                    className="h-full rounded bg-primary/70"
                    style={{ width: `${data.totalWords ? (c.words / data.totalWords) * 100 : 0}%` }}
                  />
                </div>
                <span className="shrink-0">{c.words.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )
    case "recentDocs":
      return (
        <div className="space-y-1.5">
          {data.recentDocs.length === 0 && <p className="text-sm text-muted-foreground">暂无访问记录</p>}
          {data.recentDocs.map((d, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{d.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {new Date(d.at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          ))}
        </div>
      )
    default:
      return <p className="text-sm text-muted-foreground">未知组件</p>
  }
}

function Heatmap({ data }: { data: { byWeekday: number[]; byHour: number[] } }) {
  const max = Math.max(...data.byHour, 1)
  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1 text-xs text-muted-foreground">按小时访问分布</p>
        <div className="grid grid-cols-24 gap-0.5">
          {data.byHour.map((v, h) => (
            <div key={h} title={`${h} 时：${v} 次`} className="group relative">
              <div
                className="h-16 w-full rounded-sm"
                style={{ background: `rgba(79,70,229,${0.08 + (v / max) * 0.92})` }}
              />
              {h % 4 === 0 && <p className="mt-0.5 text-center text-[9px] text-muted-foreground">{h}</p>}
            </div>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1 text-xs text-muted-foreground">按星期分布</p>
        <div className="grid grid-cols-7 gap-0.5">
          {data.byWeekday.map((v, d) => (
            <div key={d} title={`${WEEKDAY[d]}：${v} 次`}>
              <div
                className="h-10 w-full rounded-sm"
                style={{ background: `rgba(79,70,229,${0.08 + (v / max) * 0.92})` }}
              />
              <p className="mt-0.5 text-center text-[9px] text-muted-foreground">{WEEKDAY[d].slice(1)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------- course 插件组件 ----------

function CourseWidget({ id, data, enabled }: { id: string; data: StatsSummary | null; enabled: boolean }) {
  if (!enabled) {
    return <p className="text-sm text-muted-foreground">依赖「课程」插件，未启用</p>
  }
  if (!data) return <Skeleton className="h-20 w-full" />
  switch (id) {
    case "studyDuration": {
      const h = Math.floor(data.totalSeconds / 3600)
      const m = Math.floor((data.totalSeconds % 3600) / 60)
      return (
        <p className="text-2xl font-semibold">
          {h > 0 ? `${h}h ${m}m` : `${m} 分钟`}
          <span className="ml-2 text-sm font-normal text-muted-foreground">累计学习</span>
        </p>
      )
    }
    case "dailyStudy": {
      const chart = data.daily.map((d) => ({ name: d.date.slice(5), 分钟: Math.round(d.seconds / 60) }))
      return (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chart} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <Tooltip cursor={{ fill: "var(--muted)" }} />
            <Bar dataKey="分钟" fill="var(--primary)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )
    }
    case "perCourse": {
      const max = Math.max(...data.perCollection.map((p) => p.seconds), 1)
      return (
        <div className="space-y-2">
          {data.perCollection.length === 0 && <p className="text-sm text-muted-foreground">暂无学习记录</p>}
          {data.perCollection.map((p) => (
            <div key={p.collectionId} className="flex items-center gap-2 text-sm">
              <span className="w-28 truncate">{p.collectionId.slice(0, 8)}…</span>
              <div className="h-2 flex-1 rounded bg-muted">
                <div className="h-full rounded bg-primary/70" style={{ width: `${(p.seconds / max) * 100}%` }} />
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{fmtTime(p.seconds)}</span>
            </div>
          ))}
        </div>
      )
    }
    default:
      return <p className="text-sm text-muted-foreground">未知组件</p>
  }
}
