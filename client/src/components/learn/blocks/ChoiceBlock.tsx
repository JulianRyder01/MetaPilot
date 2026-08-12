import { useMemo, useState } from "react"
import { CheckCircle2, XCircle } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

interface Props {
  block: {
    type?: string
    question?: string
    options?: string[]
    answer?: number
    answers?: number[]
    explanation?: string
  }
}

const LETTERS = ["A", "B", "C", "D", "E", "F"]

export function ChoiceBlock({ block }: Props) {
  const multiple = block.type === "multiple_choice" || Array.isArray(block.answers)
  const [selected, setSelected] = useState<number[]>([])
  const [submitted, setSubmitted] = useState(false)

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

  function toggle(i: number) {
    if (submitted) return
    setSelected((prev) => (multiple ? (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]) : [i]))
  }

  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="mb-3 flex items-start justify-between gap-2">
        <p className="font-medium">
          {multiple ? "多选题" : "单选题"}
          {block.question && <span className="ml-2">{block.question}</span>}
        </p>
        <Badge variant="secondary">{multiple ? "可多选" : "单选"}</Badge>
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
              className={cn(
                "flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left text-sm transition-colors",
                cls,
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
        <Button size="sm" onClick={() => setSubmitted(true)} disabled={submitted || selected.length === 0}>
          提交
        </Button>
        {submitted && (
          <Badge variant={isCorrect ? "success" : "destructive"}>
            {isCorrect ? "回答正确" : "回答错误"}
          </Badge>
        )}
      </div>
      {submitted && block.explanation && (
        <p className="mt-3 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">解析：{block.explanation}</p>
      )}
    </div>
  )
}
