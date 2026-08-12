import { useCallback, useEffect, useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Clock, Layers, Timer } from "lucide-react"

import { api, type StatsSummary } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { Progress } from "@/components/ui/progress"
import { PluginGate } from "@/components/plugins/PluginGate"

const RANGES = [
  { value: "all", label: "全部" },
  { value: "today", label: "今天" },
  { value: "week", label: "本周" },
  { value: "month", label: "本月" },
]

function fmt(d: number) {
  const h = Math.floor(d / 3600)
  const m = Math.floor((d % 3600) / 60)
  if (h > 0) return `${h} 小时 ${m} 分`
  if (m > 0) return `${m} 分钟`
  return `${d} 秒`
}

export default function StatsPage() {
  const [range, setRange] = useState("all")
  const [data, setData] = useState<StatsSummary | null>(null)
  const [courseNames, setCourseNames] = useState<Map<string, string>>(new Map())

  const load = useCallback(async (r: string) => {
    setData(await api.statsSummary(r))
  }, [])

  useEffect(() => {
    load(range)
  }, [range, load])

  // 课程 id → 名称 映射（用于统计页展示）
  useEffect(() => {
    api.listLibraries().then((libs) => {
      const map = new Map<string, string>()
      for (const lib of libs) {
        for (const c of lib.collections) map.set(c.id, c.name)
      }
      setCourseNames(map)
    })
  }, [])

  const chartData = useMemo(
    () =>
      (data?.daily ?? []).map((d) => ({
        name: d.date.slice(5),
        学习时长分钟: Math.round(d.seconds / 60),
      })),
    [data],
  )

  const maxSeconds = Math.max(...(data?.perCollection.map((p) => p.seconds) ?? [0]), 1)

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">学习统计</h1>
      </div>
      <PluginGate pluginId="course" hint="学习时长统计">
        <Tabs value={range} onValueChange={setRange} className="mb-4">
          <TabsList>
            {RANGES.map((r) => (
              <TabsTrigger key={r.value} value={r.value}>
                {r.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

      {!data ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Timer className="size-4" />
                  累计学习时长
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{fmt(data.totalSeconds)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="size-4" />
                  学习会话
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{data.sessionCount} 次</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Layers className="size-4" />
                  学习课程
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{data.perCollection.length} 门</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">每日学习时长（分钟）</CardTitle>
            </CardHeader>
            <CardContent>
              {chartData.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">该时段暂无学习记录</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                    <Tooltip cursor={{ fill: "var(--muted)" }} />
                    <Bar dataKey="学习时长分钟" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">各课程学习时长</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {data.perCollection.map((p) => (
                <div key={p.collectionId}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span>{courseNames.get(p.collectionId) ?? p.collectionId}</span>
                    <span className="text-muted-foreground">{fmt(p.seconds)}</span>
                  </div>
                  <Progress value={(p.seconds / maxSeconds) * 100} />
                </div>
              ))}
              {data.perCollection.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">暂无数据</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
      </PluginGate>
    </div>
  )
}
