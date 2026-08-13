import { useState } from "react"
import { Loader2, Sparkles } from "lucide-react"
import { toast } from "@/lib/toast"

import { api, type GradeResult } from "@/lib/api"
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
        const r = await api.grade({
          blockType: "fill_blank",
          question: block.question ?? "",
          blanks,
          userAnswer,
        })
        setResult(r)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "判题失败")
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
          填空题{block.question && <span className="ml-2">{block.question}</span>}
        </p>
        {aiGraded && (
          <Badge variant="secondary" className="gap-1">
            <Sparkles className="size-3" />
            AI 判题
          </Badge>
        )}
      </div>
      <div className="space-y-2">
        {blanks.map((_, i) => (
          <Input
            key={i}
            placeholder={`第 ${i + 1} 空`}
            value={inputs[i] ?? ""}
            onChange={(e) => setInputs((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
            disabled={!!result}
          />
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Button size="sm" onClick={submit} disabled={grading || !!result || inputs.some((v) => !v.trim())}>
          {grading ? <Loader2 className="size-4 animate-spin" /> : null}
          提交
        </Button>
        {result && (
          <Badge variant={result.isCorrect ? "success" : "destructive"}>
            准确率 {result.score}%
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
            重做
          </Button>
        )}
      </div>
      {result?.feedback && <p className="mt-3 text-sm text-muted-foreground">{result.feedback}</p>}
      {block.explanation && <p className="mt-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">解析：{block.explanation}</p>}
    </div>
  )
}
