import { useEffect, useState } from "react"
import { Coins, Hash, ReceiptText } from "lucide-react"

import { useT } from "@/i18n"
import { aiUsage, type AIUsageSummary } from "@/lib/api"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

const RANGES = ["today", "week", "month", "all"] as const

/** 范围 key → i18n key（词典为驼峰 rangeToday/rangeWeek/rangeMonth/rangeAll，不可字符串拼接小写值） */
const RANGE_LABEL_KEY: Record<(typeof RANGES)[number], string> = {
  today: "core.stats.rangeToday",
  week: "core.stats.rangeWeek",
  month: "core.stats.rangeMonth",
  all: "core.stats.rangeAll",
}

/** AI 用量统计组件（核心提供）：调用次数 / token 使用量 / 成本，按模型分组。 */
export function AiUsageWidget() {
  const t = useT()
  const [range, setRange] = useState<(typeof RANGES)[number]>("all")
  const [data, setData] = useState<AIUsageSummary | null>(null)

  useEffect(() => {
    let alive = true
    aiUsage(range)
      .then((d) => alive && setData(d))
      .catch(() => alive && setData({ range, totalCalls: 0, totalTokens: 0, inputTokens: 0, cachedTokens: 0, outputTokens: 0, totalCost: 0, currency: "", byModel: [] }))
    return () => {
      alive = false
    }
  }, [range])

  if (!data) return <Skeleton className="h-24 w-full" />

  const cur = data.currency ? data.currency : ""
  const fmtCost = (c: number) => (cur ? `${cur}${c.toFixed(6)}` : "-")

  return (
    <div className="space-y-3">
      {/* 范围切换 */}
      <div className="flex flex-wrap items-center gap-1">
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            className={cn(
              "rounded-md px-2 py-0.5 text-xs transition-colors",
              range === r ? "bg-primary/15 font-medium text-primary" : "text-muted-foreground hover:bg-accent",
            )}
          >
            {t(RANGE_LABEL_KEY[r])}
          </button>
        ))}
      </div>

      {/* 总览三卡片 */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border p-2.5">
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Hash className="size-3" />
            {t("core.stats.aiCalls")}
          </p>
          <p className="mt-0.5 text-lg font-semibold">{data.totalCalls.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border p-2.5">
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <ReceiptText className="size-3" />
            {t("core.stats.aiTokens")}
          </p>
          <p className="mt-0.5 text-lg font-semibold">{data.totalTokens.toLocaleString()}</p>
          <p className="text-[10px] text-muted-foreground">
            {t("core.stats.aiTokensDetail", { in: data.inputTokens.toLocaleString(), cached: data.cachedTokens.toLocaleString(), out: data.outputTokens.toLocaleString() })}
          </p>
        </div>
        <div className="rounded-lg border p-2.5">
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Coins className="size-3" />
            {t("core.stats.aiCost")}
          </p>
          <p className="mt-0.5 text-lg font-semibold">{fmtCost(data.totalCost)}</p>
        </div>
      </div>

      {/* 按模型分组 */}
      {data.byModel.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("core.stats.aiUsageEmpty")}</p>
      ) : (
        <div className="space-y-1">
          {data.byModel.map((m) => (
            <div key={m.model} className="flex flex-wrap items-center gap-2 text-xs">
              <span className="w-40 truncate font-medium" title={m.model}>{m.model}</span>
              <span className="text-muted-foreground">{t("core.stats.aiCallsShort", { n: m.calls })}</span>
              <span className="text-muted-foreground">{t("core.stats.aiTokensShort", { n: m.inputTokens + m.outputTokens })}</span>
              <span className="ml-auto shrink-0">{fmtCost(m.cost)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
