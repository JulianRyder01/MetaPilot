import { useEffect, useRef, useState } from "react"
import { Loader2, Sparkles } from "lucide-react"
import { toast } from "@/lib/toast"

import { useT } from "@/i18n"
import { type GradeResult } from "@/lib/api"
import { grade } from "@/plugins/course/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useTimedQuestion } from "@/components/learn/timed/TimedQuizProvider"
import { CountdownBanner, HiddenRevealHint, RetryButton, TimedLockNotice } from "@/components/learn/timed/TimedBits"

interface Props {
  block: {
    id?: string
    question?: string
    blanks?: string[]
    explanation?: string
    aiGraded?: boolean
    // 限时答题字段（可选，兼容旧文档）
    timeLimitSec?: number
    hiddenBefore?: boolean
    autoSubmitOnTimeout?: boolean
    retryable?: boolean
    continuePrev?: boolean
  }
}

export function FillBlankBlock({ block }: Props) {
  const t = useT()
  const blanks = block.blanks ?? []
  const [inputs, setInputs] = useState<string[]>(blanks.map(() => ""))
  const [result, setResult] = useState<GradeResult | null>(null)
  const [grading, setGrading] = useState(false)
  const aiGraded = block.aiGraded !== false && blanks.length > 0
  const q = useTimedQuestion(block.id ?? "", block as Record<string, unknown>)

  async function submit() {
    if (grading) return
    const userAnswer = inputs.join("|||")
    if (aiGraded) {
      setGrading(true)
      try {
        const r = await grade({
          blockType: "fill_blank",
          question: block.question ?? "",
          blanks,
          userAnswer,
        })
        setResult(r)
        q.notifyCompleted()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("core.learn.gradeFailed"))
      } finally {
        setGrading(false)
      }
    } else {
      // 本地比对
      const correct = blanks.map((b, i) => (inputs[i] ?? "").trim() === b.trim())
      const score = Math.round((correct.filter(Boolean).length / blanks.length) * 100)
      setResult({ score, feedback: "", isCorrect: score >= 60 })
      q.notifyCompleted()
    }
  }

  const submitRef = useRef(submit)
  submitRef.current = submit
  // 超时按已填写内容自动提交
  useEffect(() => {
    q.registerAutoSubmit(() => {
      submitRef.current()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const hidden = q.hiddenBefore && !q.revealed
  const locked = !!result || q.timeup

  return (
    <div
      ref={q.setEl}
      tabIndex={-1}
      className="relative rounded-lg border bg-card p-5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <CountdownBanner q={q} />
      <div className="mb-3 flex items-center justify-between">
        <p className="font-medium">
          {t("core.learn.fillBlank")}
          {block.question && !hidden && <span className="ml-2">{block.question}</span>}
        </p>
        {aiGraded && (
          <Badge variant="secondary" className="gap-1">
            <Sparkles className="size-3" />
            {t("core.learn.aiGraded")}
          </Badge>
        )}
      </div>
      {hidden && <HiddenRevealHint q={q} />}
      <div className="space-y-2">
        {blanks.map((_, i) => (
          <Input
            key={i}
            placeholder={t("core.learn.blankN", { n: i + 1 })}
            value={inputs[i] ?? ""}
            onFocus={() => q.reveal()}
            onChange={(e) => setInputs((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
            disabled={locked}
          />
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Button size="sm" onClick={submit} disabled={grading || locked || inputs.some((v) => !v.trim())}>
          {grading ? <Loader2 className="size-4 animate-spin" /> : null}
          {t("core.learn.submit")}
        </Button>
        {result && (
          <Badge variant={result.isCorrect ? "success" : "destructive"}>
            {t("core.learn.accuracy", { score: result.score })}
          </Badge>
        )}
        <RetryButton
          q={q}
          onRetry={() => {
            setResult(null)
            setInputs(blanks.map(() => ""))
          }}
        />
      </div>
      <TimedLockNotice q={q} />
      {result?.feedback && <p className="mt-3 text-sm text-muted-foreground">{result.feedback}</p>}
      {block.explanation && !hidden && (
        <p className="mt-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">{t("core.learn.explanation", { text: block.explanation })}</p>
      )}
    </div>
  )
}
