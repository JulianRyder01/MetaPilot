import { useEffect, useMemo, useRef, useState } from "react"
import { CheckCircle2, XCircle } from "lucide-react"

import { useT } from "@/i18n"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useTimedQuestion } from "@/components/learn/timed/TimedQuizProvider"
import {
  CountdownBanner,
  HiddenRevealOverlay,
  RetryButton,
  TimedLockNotice,
} from "@/components/learn/timed/TimedBits"

interface Props {
  block: {
    id?: string
    type?: string
    question?: string
    options?: string[]
    answer?: number
    answers?: number[]
    explanation?: string
    // 限时答题字段（可选，兼容旧文档）
    timeLimitSec?: number
    hiddenBefore?: boolean
    autoSubmitOnTimeout?: boolean
    retryable?: boolean
    continuePrev?: boolean
  }
}

const LETTERS = ["A", "B", "C", "D", "E", "F"]

export function ChoiceBlock({ block }: Props) {
  const t = useT()
  const multiple = block.type === "multiple_choice" || Array.isArray(block.answers)
  const [selected, setSelected] = useState<number[]>([])
  const [submitted, setSubmitted] = useState(false)
  const q = useTimedQuestion(block.id ?? "", block as Record<string, unknown>)

  const correctSet = useMemo(() => {
    if (multiple) return new Set(block.answers ?? [])
    return block.answer !== undefined ? new Set([block.answer]) : new Set<number>()
  }, [block, multiple])

  const isCorrect = useMemo(() => {
    if (submitted && selected.length > 0) {
      const sel = new Set(selected)
      return sel.size === correctSet.size && [...sel].every((i) => correctSet.has(i))
    }
    return false
  }, [submitted, selected, correctSet])

  const submittedRef = useRef(submitted)
  submittedRef.current = submitted

  function toggle(i: number) {
    if (submitted || q.timeup) return
    setSelected((prev) => (multiple ? (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]) : [i]))
  }

  function submit() {
    if (submittedRef.current) return
    setSubmitted(true)
    q.notifyCompleted()
  }

  // 超时按已填写内容自动提交（选择题：未选则视为空提交）
  const autoSubmitRef = useRef<() => void>(() => {})
  autoSubmitRef.current = () => {
    if (!submittedRef.current) {
      setSubmitted(true)
      q.notifyCompleted()
    }
  }
  useEffect(() => {
    q.registerAutoSubmit(() => autoSubmitRef.current())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const hidden = q.hiddenBefore && !q.revealed
  const locked = q.timeup && !q.autoSubmitOnTimeout

  return (
    <div
      ref={q.setEl}
      tabIndex={-1}
      className="relative rounded-lg border bg-card p-5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <CountdownBanner q={q} />
      <div className="mb-3 flex items-start justify-between gap-2">
        <p className="font-medium">
          {multiple ? t("core.learn.choiceMultiple") : t("core.learn.choiceSingle")}
          {block.question && !hidden && <span className="ml-2">{block.question}</span>}
        </p>
        <Badge variant="secondary">{multiple ? t("core.learn.multiSelect") : t("core.learn.singleSelect")}</Badge>
      </div>
      <div className="space-y-2">
        {(block.options ?? []).map((opt, i) => {
          const isSel = selected.includes(i)
          const isCorrectOpt = correctSet.has(i)
          let cls = "border hover:bg-accent/60"
          if (submitted) {
            if (isCorrectOpt) cls = "border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40"
            else if (isSel) cls = "border-red-400 bg-red-50 text-red-900 dark:bg-red-950/40"
            else cls = "border opacity-60"
          } else if (isSel) {
            cls = "border-primary bg-primary/5"
          }
          return (
            <button
              key={i}
              onClick={() => toggle(i)}
              disabled={submitted || locked}
              className={cn(
                "flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left text-sm transition-colors",
                cls,
                (submitted || locked) && "cursor-default",
              )}
            >
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                  submitted && isCorrectOpt
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : submitted && isSel
                      ? "border-red-400 bg-red-400 text-white"
                      : isSel
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/40",
                )}
              >
                {submitted && isCorrectOpt ? <CheckCircle2 className="size-4" /> : submitted && isSel ? <XCircle className="size-4" /> : LETTERS[i]}
              </span>
              {opt}
            </button>
          )
        })}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Button size="sm" onClick={submit} disabled={submitted || locked || selected.length === 0}>
          {t("core.learn.submit")}
        </Button>
        {submitted && (
          <Badge variant={isCorrect ? "success" : "destructive"}>
            {isCorrect ? t("core.learn.correct") : t("core.learn.incorrect")}
          </Badge>
        )}
        <RetryButton
          q={q}
          onRetry={() => {
            setSelected([])
            setSubmitted(false)
          }}
        />
      </div>
      <TimedLockNotice q={q} />
      {submitted && block.explanation && (
        <p className="mt-3 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">{t("core.learn.explanation", { text: block.explanation })}</p>
      )}
      {hidden && <HiddenRevealOverlay q={q} />}
    </div>
  )
}
