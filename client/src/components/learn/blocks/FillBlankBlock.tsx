import { useState } from "react"
import { Loader2, Sparkles } from "lucide-react"
import { toast } from "@/lib/toast"

import { useT } from "@/i18n"
import { type GradeResult } from "@/lib/api"
import { grade } from "@/plugins/course/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"

interface Props {
  block: {
    question?: string
    blanks?: string[]
    explanation?: string
    aiGraded?: boolean
  }
}

export function FillBlankBlock({ block }: Props) {
  const t = useT()
  const blanks = block.blanks ?? []
  const [inputs, setInputs] = useState<string[]>(blanks.map(() => ""))
  const [result, setResult] = useState<GradeResult | null>(null)
  const [grading, setGrading] = useState(false)
  const aiGraded = block.aiGraded !== false && blanks.length > 0

  async function submit() {
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
    }
  }

  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-medium">
          {t("core.learn.fillBlank")}{block.question && <span className="ml-2">{block.question}</span>}
        </p>
        {aiGraded && (
          <Badge variant="secondary" className="gap-1">
            <Sparkles className="size-3" />
            {t("core.learn.aiGraded")}
          </Badge>
        )}
      </div>
      <div className="space-y-2">
        {blanks.map((_, i) => (
          <Input
            key={i}
            placeholder={t("core.learn.blankN", { n: i + 1 })}
            value={inputs[i] ?? ""}
            onChange={(e) => setInputs((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
            disabled={!!result}
          />
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Button size="sm" onClick={submit} disabled={grading || !!result || inputs.some((v) => !v.trim())}>
          {grading ? <Loader2 className="size-4 animate-spin" /> : null}
          {t("core.learn.submit")}
        </Button>
        {result && (
          <Badge variant={result.isCorrect ? "success" : "destructive"}>
            {t("core.learn.accuracy", { score: result.score })}
          </Badge>
        )}
        {result && !result.feedback && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setResult(null)
              setInputs(blanks.map(() => ""))
            }}
          >
            {t("core.learn.redo")}
          </Button>
        )}
      </div>
      {result?.feedback && <p className="mt-3 text-sm text-muted-foreground">{result.feedback}</p>}
      {block.explanation && <p className="mt-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">{t("core.learn.explanation", { text: block.explanation })}</p>}
    </div>
  )
}
