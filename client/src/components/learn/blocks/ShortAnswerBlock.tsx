import { useState } from "react"
import { Loader2, Sparkles } from "lucide-react"
import { toast } from "@/lib/toast"

import { useT } from "@/i18n"
import { type GradeResult } from "@/lib/api"
import { grade } from "@/plugins/course/api"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"

interface Props {
  block: {
    question?: string
    reference?: string
    keywords?: string[]
    explanation?: string
    aiGraded?: boolean
  }
}

export function ShortAnswerBlock({ block }: Props) {
  const t = useT()
  const [answer, setAnswer] = useState("")
  const [result, setResult] = useState<GradeResult | null>(null)
  const [grading, setGrading] = useState(false)
  const aiGraded = block.aiGraded !== false

  async function submit() {
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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("core.learn.gradeFailed"))
    } finally {
      setGrading(false)
    }
  }

  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-medium">
          {t("core.learn.shortAnswer")}{block.question && <span className="ml-2">{block.question}</span>}
        </p>
        {aiGraded && (
          <Badge variant="secondary" className="gap-1">
            <Sparkles className="size-3" />
            {t("core.learn.aiGraded")}
          </Badge>
        )}
      </div>
      <Textarea
        placeholder={t("core.learn.answerPlaceholder")}
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        disabled={!!result}
        className="min-h-28"
      />
      {block.keywords && block.keywords.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          {t("core.learn.keywords", { text: block.keywords.join("、") })}
        </p>
      )}
      <div className="mt-3 flex items-center gap-3">
        <Button size="sm" onClick={submit} disabled={grading || !answer.trim() || !!result}>
          {grading ? <Loader2 className="size-4 animate-spin" /> : null}
          {t("core.learn.submitGrade")}
        </Button>
        {result && (
          <Badge variant={result.isCorrect ? "success" : "destructive"}>
            {t("core.learn.accuracy", { score: result.score })}
          </Badge>
        )}
        {result && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setResult(null)
              setAnswer("")
            }}
          >
            {t("core.learn.redo")}
          </Button>
        )}
      </div>
      {result?.feedback && (
        <div className="mt-3 rounded-md bg-muted px-3 py-2 text-sm">
          <span className="font-medium">{t("core.learn.aiFeedback")}</span>
          {result.feedback}
        </div>
      )}
      {block.explanation && !result && (
        <p className="mt-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">{t("core.learn.hint", { text: block.explanation })}</p>
      )}
    </div>
  )
}
