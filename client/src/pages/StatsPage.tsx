import { useEffect, useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Eye, EyeOff, GripVertical, Maximize2, Minimize2, Settings2 } from "lucide-react"

import { useT, useI18nStore, translate } from "@/i18n"
import {
  api,
  type StatsCoreSummary,
  type StatsSummary,
  type StatsWidget,
} from "@/lib/api"
import { statsSummary } from "@/plugins/course/api"
import { cn } from "@/lib/utils"
import { usePluginEnabled, usePluginsStore } from "@/stores/plugins"
import { useStatsLayoutStore, type WidgetSize } from "@/stores/statsLayout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip as UITooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { SourceBadge } from "@/components/stats/SourceBadge"
import { AiUsageWidget } from "@/components/stats/AiUsageWidget"

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
  if (m > 0) return `${m} ${translate("common.minutes")}`
  return `${sec} ${translate("common.seconds")}`
}

export default function StatsPage() {
  const [widgets, setWidgets] = useState<StatsWidget[]>([])
  const [core, setCore] = useState<StatsCoreSummary | null>(null)
  const [course, setCourse] = useState<StatsSummary | null>(null)
  const courseEnabled = usePluginEnabled("course")
  const plugins = usePluginsStore((s) => s.plugins)
  const layout = useStatsLayoutStore()
  const [dragId, setDragId] = useState<string | null>(null)
  const t = useT()

  useEffect(() => {
    api.statsWidgets().then(setWidgets).catch(() => {})
    api.statsCoreSummary().then(setCore).catch(() => {})
    if (courseEnabled) statsSummary("all").then(setCourse).catch(() => {})
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("nav.stats")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("core.stats.intro")}
          </p>
        </div>
        <WidgetManagerDialog widgets={available} />
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
                    {w.source === "core" ? t("core.widget." + w.id) : w.title}
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
                      title={t("core.stats.resize", { size })}
                    >
                      {size === "xl" ? <Minimize2 className="size-3" /> : <Maximize2 className="size-3" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      onClick={() => layout.setVisible(w.id, false)}
                      title={t("core.stats.hide")}
                    >
                      <EyeOff className="size-3" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {w.source === "core" ? (
                    w.id === "aiUsage" ? <AiUsageWidget /> : <CoreWidget id={w.id} data={core} />
                  ) : (
                    <CourseWidget id={w.id} data={course} enabled={courseEnabled} />
                  )}
                </CardContent>
              </Card>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------- 组件管理 ----------

/** 「管理组件」对话框：分区管理统计页组件，「已隐藏」有独立面板与恢复操作。 */
function WidgetManagerDialog({ widgets }: { widgets: StatsWidget[] }) {
  const [open, setOpen] = useState(false)
  const layout = useStatsLayoutStore()
  const t = useT()
  const visibleCount = widgets.filter((w) => layout.visible[w.id] !== false).length
  const hiddenCount = widgets.length - visibleCount
  const ordered = [...widgets].sort((a, b) => {
    const ia = layout.order.indexOf(a.id)
    const ib = layout.order.indexOf(b.id)
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
  })

  function resetLayout() {
    layout.reset()
    layout.syncWidgets(widgets)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="shrink-0 gap-1.5">
          <Settings2 className="size-4" />
          {t("core.stats.manage")}
          {hiddenCount > 0 && (
            <Badge variant="secondary" className="px-1.5">
              {t("core.stats.hiddenCount", { count: hiddenCount })}
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("core.stats.manage")}</DialogTitle>
          <DialogDescription>
            {t("core.stats.manageDesc")}
          </DialogDescription>
        </DialogHeader>
        {ordered.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("core.stats.none")}</p>
        ) : (
          <Tabs defaultValue="visible" className="gap-3">
            <TabsList className="w-full">
              <TabsTrigger value="visible" className="flex-1">
                {t("core.stats.visibleCount", { count: visibleCount })}
              </TabsTrigger>
              <TabsTrigger value="hidden" className="flex-1">
                {t("core.stats.hiddenTab", { count: hiddenCount })}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="visible">
              <ScrollArea className="max-h-80 pr-3">
                <div className="space-y-1.5">
                  {ordered
                    .filter((w) => layout.visible[w.id] !== false)
                    .map((w) => (
                      <WidgetRow
                        key={w.id}
                        w={w}
                        visible
                        onToggle={(v) => layout.setVisible(w.id, v)}
                      />
                    ))}
                </div>
              </ScrollArea>
            </TabsContent>
            <TabsContent value="hidden">
              <ScrollArea className="max-h-80 pr-3">
                {hiddenCount === 0 ? (
                  <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-8 text-center">
                    <Eye className="size-5 text-muted-foreground/60" />
                    <p className="text-sm text-muted-foreground">{t("core.stats.noHidden")}</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {ordered
                      .filter((w) => layout.visible[w.id] === false)
                      .map((w) => (
                        <WidgetRow
                          key={w.id}
                          w={w}
                          visible={false}
                          onToggle={(v) => layout.setVisible(w.id, v)}
                        />
                      ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        )}
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" size="sm" onClick={resetLayout} disabled={widgets.length === 0}>
            {t("core.stats.resetLayout")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => layout.showAll()} disabled={hiddenCount === 0}>
            {t("core.stats.showAll")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** 组件行：标题/来源/描述 + 显眼的「恢复显示」按钮（仅隐藏时）+ 开关。 */
function WidgetRow({
  w,
  visible,
  onToggle,
}: {
  w: StatsWidget
  visible: boolean
  onToggle: (v: boolean) => void
}) {
  const t = useT()
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
        !visible && "border-dashed bg-muted/40",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn("truncate text-sm font-medium", !visible && "text-muted-foreground")}>
            {w.source === "core" ? t("core.widget." + w.id) : w.title}
          </span>
          <SourceBadge source={w.source} />
        </div>
        {w.description && <p className="mt-0.5 truncate text-xs text-muted-foreground">{w.description}</p>}
      </div>
      {!visible && (
        <Button variant="secondary" size="sm" className="shrink-0 gap-1" onClick={() => onToggle(true)}>
          <Eye className="size-3.5" />
          {t("core.stats.restore")}
        </Button>
      )}
      <Switch checked={visible} onCheckedChange={onToggle} />
    </div>
  )
}

// ---------- core 组件 ----------

function CoreWidget({ id, data }: { id: string; data: StatsCoreSummary | null }) {
  const t = useT()
  const lang = useI18nStore((s) => s.lang)
  if (!data) return <Skeleton className="h-20 w-full" />
  switch (id) {
    case "topDocs":
      return (
        <div className="space-y-1.5">
          {data.topDocs.length === 0 && <p className="text-sm text-muted-foreground">{t("core.stats.noVisits")}</p>}
          {data.topDocs.map((d, i) => (
            <div key={d.docId} className="flex items-center gap-2 text-sm">
              <span className="w-5 shrink-0 text-muted-foreground">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">{d.name}</span>
              <Badge variant="secondary">{t("core.stats.visits", { count: d.visits })}</Badge>
            </div>
          ))}
        </div>
      )
    case "heatmap":
      return <Heatmap data={data.heatmap} />
    case "stayTime":
      return (
        <div className="space-y-1.5">
          {data.topDocs.length === 0 && <p className="text-sm text-muted-foreground">{t("core.stats.noStayTime")}</p>}
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
            {data.totalWords.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">{t("core.stats.wordUnit")}</span>
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
          {data.recentDocs.length === 0 && <p className="text-sm text-muted-foreground">{t("core.stats.noVisits")}</p>}
          {data.recentDocs.map((d, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{d.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {new Date(d.at).toLocaleString(lang, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          ))}
        </div>
      )
    default:
      return <p className="text-sm text-muted-foreground">{t("core.stats.unknownWidget")}</p>
  }
}

/** 热力图颜色分档：从「无访问」到「高频」，深浅逐级加深。 */
const HEAT_COLORS = [
  "rgba(79,70,229,0.12)",
  "rgba(79,70,229,0.3)",
  "rgba(79,70,229,0.5)",
  "rgba(79,70,229,0.72)",
  "rgba(79,70,229,0.92)",
]

/** 访问量 → 颜色档位（相对当日最大值分档）。 */
function heatLevel(count: number, max: number): number {
  if (count <= 0) return 0
  const r = count / max
  if (r > 0.75) return 4
  if (r > 0.5) return 3
  if (r > 0.25) return 2
  return 1
}

/** 以 end 所在周的周一为起点，往前 weeks 个完整周，返回 [周列][行] 的日期网格（GitHub 贡献图布局）。 */
function buildWeeks(end: Date, weeks: number): { date: Date; row: number }[][] {
  const mondayOffset = (end.getDay() + 6) % 7
  const monday = new Date(end)
  monday.setDate(end.getDate() - mondayOffset)
  const cols: { date: Date; row: number }[][] = []
  for (let w = weeks - 1; w >= 0; w--) {
    const col: { date: Date; row: number }[] = []
    for (let r = 0; r < 7; r++) {
      const d = new Date(monday)
      d.setDate(monday.getDate() - w * 7 + r)
      col.push({ date: d, row: r })
    }
    cols.push(col)
  }
  return cols
}

function Heatmap({
  data,
}: {
  data: { byWeekday: number[]; byHour: number[]; byDate: { date: string; count: number }[] }
}) {
  const t = useT()
  const weekdays = t("core.stats.weekdays").split(",")
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const d of data.byDate || []) m.set(d.date, d.count)
    return m
  }, [data])
  const weeks = useMemo(() => buildWeeks(new Date(), 13), [])
  const max = useMemo(() => Math.max(1, ...counts.values()), [counts])
  const hourMax = Math.max(...data.byHour, 1)
  const today = new Date()

  return (
    <div className="space-y-3">
      {/* 月度日历热力图：最近 3 个月，深浅表示访问量 */}
      <div>
        <p className="mb-1.5 text-xs text-muted-foreground">{t("core.stats.heatmap3m")}</p>
        <div className="flex">
          {/* 星期标签 */}
          <div className="flex flex-col gap-[3px] pr-1 pt-4 text-[9px] leading-4 text-muted-foreground">
            {[0, 2, 4].map((r) => (
              <div key={r} className="flex flex-col gap-[3px]">
                <span className="h-4">{weekdays[r]}</span>
                <span className="h-4" />
              </div>
            ))}
            <span className="h-4">{weekdays[6]}</span>
          </div>
          <div className="flex gap-[3px] overflow-x-auto pb-1">
            {weeks.map((col, wi) => {
              const first = col[0].date
              const prev = wi > 0 ? weeks[wi - 1][0].date : null
              const showMonth =
                !prev || first.getMonth() !== prev.getMonth() || first.getFullYear() !== prev.getFullYear()
              return (
                <div key={wi} className="flex flex-col gap-[3px]">
                  <div className="h-4 text-center text-[9px] leading-4 text-muted-foreground">
                    {showMonth ? t("core.stats.monthLabel", { month: first.getMonth() + 1 }) : ""}
                  </div>
                  {col.map(({ date }) => {
                    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
                    const count = counts.get(iso) ?? 0
                    const future = date.getTime() > today.getTime()
                    return (
                      <UITooltip key={iso}>
                        <TooltipTrigger asChild>
                          <div
                            className={cn(
                              "size-4 rounded-[3px] transition-colors",
                              future && "opacity-30",
                              count === 0 && "bg-muted",
                            )}
                            style={count > 0 ? { background: HEAT_COLORS[heatLevel(count, max)] } : undefined}
                          />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          {t("core.stats.heatmapTooltip", { month: date.getMonth() + 1, day: date.getDate(), count })}
                        </TooltipContent>
                      </UITooltip>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
        {/* 图例 */}
        <div className="mt-1.5 flex items-center gap-1 text-[9px] text-muted-foreground">
          <span>{t("core.stats.heatmapLess")}</span>
          {HEAT_COLORS.map((c, i) => (
            <span key={i} className="size-3 rounded-[2px]" style={{ background: c }} />
          ))}
          <span>{t("core.stats.heatmapMore")}</span>
        </div>
      </div>
      {/* 按小时分布 */}
      <div>
        <p className="mb-1 text-xs text-muted-foreground">{t("core.stats.hourly")}</p>
        <div className="grid grid-cols-24 gap-0.5">
          {data.byHour.map((v, h) => (
            <UITooltip key={h}>
              <TooltipTrigger asChild>
                <div
                  className="h-6 w-full rounded-sm"
                  style={{ background: `rgba(79,70,229,${0.08 + (v / hourMax) * 0.92})` }}
                />
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {t("core.stats.hourTooltip", { hour: h, count: v })}
              </TooltipContent>
            </UITooltip>
          ))}
        </div>
        <div className="mt-0.5 flex justify-between text-[9px] text-muted-foreground">
          <span>{t("core.stats.hourLabel", { hour: 0 })}</span>
          <span>{t("core.stats.hourLabel", { hour: 6 })}</span>
          <span>{t("core.stats.hourLabel", { hour: 12 })}</span>
          <span>{t("core.stats.hourLabel", { hour: 18 })}</span>
          <span>{t("core.stats.hourLabel", { hour: 23 })}</span>
        </div>
      </div>
    </div>
  )
}

// ---------- course 插件组件 ----------

function CourseWidget({ id, data, enabled }: { id: string; data: StatsSummary | null; enabled: boolean }) {
  const t = useT()
  if (!enabled) {
    return <p className="text-sm text-muted-foreground">{t("core.stats.courseDisabled")}</p>
  }
  if (!data) return <Skeleton className="h-20 w-full" />
  switch (id) {
    case "studyDuration": {
      const h = Math.floor(data.totalSeconds / 3600)
      const m = Math.floor((data.totalSeconds % 3600) / 60)
      return (
        <p className="text-2xl font-semibold">
          {h > 0 ? `${h}h ${m}m` : `${m} ${t("common.minutes")}`}
          <span className="ml-2 text-sm font-normal text-muted-foreground">{t("core.stats.totalStudy")}</span>
        </p>
      )
    }
    case "dailyStudy": {
      const minuteKey = t("core.stats.chartMinutes")
      const chart = data.daily.map((d) => ({ name: d.date.slice(5), [minuteKey]: Math.round(d.seconds / 60) }))
      return (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chart} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <Tooltip cursor={{ fill: "var(--muted)" }} />
            <Bar dataKey={minuteKey} fill="var(--primary)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )
    }
    case "perCourse": {
      const max = Math.max(...data.perCollection.map((p) => p.seconds), 1)
      return (
        <div className="space-y-2">
          {data.perCollection.length === 0 && <p className="text-sm text-muted-foreground">{t("core.stats.noStudyRecords")}</p>}
          {data.perCollection.map((p) => (
            <div key={p.collectionId} className="flex items-center gap-2 text-sm">
              <span className="w-28 truncate" title={p.name}>
                {p.name || `${p.collectionId.slice(0, 8)}…`}
              </span>
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
      return <p className="text-sm text-muted-foreground">{t("core.stats.unknownWidget")}</p>
  }
}
