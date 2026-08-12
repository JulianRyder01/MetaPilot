import { useState } from "react"
import { Loader2, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { api, type GradeResult } from "@/lib/api"
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
  const [answer, setAnswer] = useState("")
  const [result, setResult] = useState<GradeResult | null>(null)
  const [grading, setGrading] = useState(false)
  const aiGraded = block.aiGraded !== false

  async function submit() {
    setGrading(true)
    try {
      const r = await api.grade({
        blockType: "short_answer",
        question: block.question ?? "",
        reference: block.reference ?? "",
        keywords: block.keywords ?? [],
        userAnswer: answer,
      })
      setResult(r)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "判题失败")
    } finally {
      setGrading(false)
    }
  }

  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-medium">
          简答题{block.question && <span className="ml-2">{block.question}</span>}
        </p>
        {aiGraded && (
          <Badge variant="secondary" className="gap-1">
            <Sparkles className="size-3" />
            AI 判题
          </Badge>
        )}
      </div>
      <Textarea
        placeholder="输入你的回答..."
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        disabled={!!result}
        className="min-h-28"
      />
      {block.keywords && block.keywords.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          要点关键词：{block.keywords.join("、")}
        </p>
      )}
      <div className="mt-3 flex items-center gap-3">
        <Button size="sm" onClick={submit} disabled={grading || !answer.trim() || !!result}>
          {grading ? <Loader2 className="size-4 animate-spin" /> : null}
          提交判题
        </Button>
        {result && (
          <Badge variant={result.isCorrect ? "success" : "destructive"}>
            准确率 {result.score}%
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
            重做
          </Button>
        )}
      </div>
      {result?.feedback && (
        <div className="mt-3 rounded-md bg-muted px-3 py-2 text-sm">
          <span className="font-medium">AI 评语：</span>
          {result.feedback}
        </div>
      )}
      {block.explanation && !result && (
        <p className="mt-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">提示：{block.explanation}</p>
      )}
    </div>
  )
}
