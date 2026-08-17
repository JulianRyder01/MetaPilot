import { useEffect, useRef, useState } from "react"
import { Loader2, Send, Sparkles } from "lucide-react"
import { toast } from "@/lib/toast"

import { useT } from "@/i18n"
import { type GradeResult } from "@/lib/api"
import { grade } from "@/plugins/course/api"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { useTimedQuestion } from "@/components/learn/timed/TimedQuizProvider"
import { CountdownBanner, HiddenRevealHint, RetryButton, TimedLockNotice } from "@/components/learn/timed/TimedBits"

interface Props {
  block: {
    id?: string
    question?: string
    reference?: string
    keywords?: string[]
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

export function ShortAnswerBlock({ block }: Props) {
  const t = useT()
  const [answer, setAnswer] = useState("")
  const [result, setResult] = useState<GradeResult | null>(null)
  const [grading, setGrading] = useState(false)
  const aiGraded = block.aiGraded !== false
  const q = useTimedQuestion(block.id ?? "", block as Record<string, unknown>)

  async function submit() {
    if (grading) return
    setGrading(true)
    try {
      const r = await grade({
        blockType: "short_answer",
        question: block.question ?? "",
        reference: block.reference ?? "",
        keywords: block.keywords ?? [],
        userAnswer: answer,
      })
      setResult(r)
      q.notifyCompleted()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("core.learn.gradeFailed"))
    } finally {
      setGrading(false)
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
          {t("core.learn.shortAnswer")}
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
      <Textarea
        placeholder={t("core.learn.answerPlaceholder")}
        value={answer}
        onFocus={() => q.reveal()}
        onChange={(e) => setAnswer(e.target.value)}
        onKeyDown={(e) => {
          // 回车提交（排除输入法组词确认与换行修饰键）；Ctrl/⌘/Shift+回车为换行
          if (
            e.key === "Enter" &&
            !e.shiftKey &&
            !e.ctrlKey &&
            !e.metaKey &&
            !e.nativeEvent.isComposing &&
            answer.trim()
          ) {
            e.preventDefault()
            submit()
          }
        }}
        disabled={locked}
        className="min-h-28"
      />
      {block.keywords && block.keywords.length > 0 && !hidden && (
        <p className="mt-2 text-xs text-muted-foreground">
          {t("core.learn.keywords", { text: block.keywords.join("、") })}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {result && (
            <Badge variant={result.isCorrect ? "success" : "destructive"}>
              {t("core.learn.accuracy", { score: result.score })}
            </Badge>
          )}
          {!result && <p className="text-xs text-muted-foreground">{t("core.learn.enterSubmitNewline")}</p>}
          <RetryButton
            q={q}
            onRetry={() => {
              setResult(null)
              setAnswer("")
            }}
          />
        </div>
        <Button
          onClick={submit}
          disabled={grading || locked || !answer.trim()}
          className="gap-2 px-8 font-medium"
        >
          {grading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          {t("core.learn.submitGrade")}
        </Button>
      </div>
      <TimedLockNotice q={q} />
      {result?.feedback && (
        <div className="mt-3 rounded-md bg-muted px-3 py-2 text-sm">
          <span className="font-medium">{t("core.learn.aiFeedback")}</span>
          {result.feedback}
        </div>
      )}
      {block.explanation && !result && !hidden && (
        <p className="mt-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">{t("core.learn.hint", { text: block.explanation })}</p>
      )}
    </div>
  )
}
