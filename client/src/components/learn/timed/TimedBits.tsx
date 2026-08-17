import { Eye, Lock, RotateCcw, Timer } from "lucide-react"

import { useT } from "@/i18n"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { formatTime, type TimedQuestion } from "./TimedQuizProvider"

/** 倒计时条：显示剩余时间，临近超时变红。 */
export function CountdownBanner({ q }: { q: TimedQuestion }) {
  const t = useT()
  if (!q.enabled || q.remainingSec == null || q.timeup) return null
  const urgent = q.remainingSec <= 10
  return (
    <div
      className={cn(
        "mb-3 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium",
        urgent
          ? "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400"
          : "bg-muted/70 text-muted-foreground",
      )}
    >
      <Timer className="size-3.5" />
      {t("core.learn.timeLeft", { time: formatTime(q.remainingSec) })}
    </div>
  )
}

/** 隐藏题遮罩（选择等无输入框的题）：显示「查看题目」按钮；设了计时则下方提示「点击将开始计时」。 */
export function HiddenRevealOverlay({ q }: { q: TimedQuestion }) {
  const t = useT()
  if (!q.hiddenBefore || q.revealed) return null
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-lg bg-card/90 backdrop-blur-[1px]">
      <Button size="sm" variant="outline" onClick={q.reveal} className="gap-1.5">
        <Eye className="size-4" />
        {t("core.learn.viewQuestion")}
      </Button>
      {q.timeLimitSec > 0 && (
        <p className="text-xs text-muted-foreground">{t("core.learn.startTimerHint")}</p>
      )}
    </div>
  )
}

/** 输入类隐藏题提示条：题干隐藏时显示，提示点击输入框显示题目。 */
export function HiddenRevealHint({ q }: { q: TimedQuestion }) {
  const t = useT()
  if (!q.hiddenBefore || q.revealed) return null
  return (
    <div className="mb-3 flex items-center gap-1.5 rounded-md border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      <Eye className="size-3.5" />
      {t("core.learn.revealHint")}
    </div>
  )
}

/** 超时未开启自动提交时的锁定提示。 */
export function TimedLockNotice({ q }: { q: TimedQuestion }) {
  const t = useT()
  if (!q.timeup || q.autoSubmitOnTimeout) return null
  return (
    <p className="mt-3 flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400">
      <Lock className="size-4" />
      {t("core.learn.timedLocked")}
    </p>
  )
}

/** 重试按钮：重新完整作答一轮并重新计时。 */
export function RetryButton({ q, onRetry }: { q: TimedQuestion; onRetry: () => void }) {
  const t = useT()
  if (!q.retryable || (!q.timeup && !q.completed)) return null
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={() => {
        onRetry()
        q.retry()
      }}
    >
      <RotateCcw className="size-3.5" />
      {t("core.learn.retry")}
    </Button>
  )
}
