import { useEffect, useState } from "react"

import type { Block } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"

export const BLOCK_TYPES = [
  { value: "markdown", label: "展示（Markdown）" },
  { value: "single_choice", label: "单选题" },
  { value: "multiple_choice", label: "多选题" },
  { value: "fill_blank", label: "填空题" },
  { value: "short_answer", label: "简答题" },
  { value: "interactive", label: "动态交互块" },
]

export function BlockForm({
  type,
  block,
  onSave,
  onCancel,
}: {
  type: string
  block: Block | null
  onSave: (data: Record<string, unknown>) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<Record<string, unknown>>({})
  const [optionsText, setOptionsText] = useState("")
  const [answersText, setAnswersText] = useState("")
  const [blanksText, setBlanksText] = useState("")

  useEffect(() => {
    const b = (block ?? {}) as Record<string, unknown>
    setForm({ ...b })
    setOptionsText(Array.isArray(b.options) ? (b.options as string[]).join("\n") : "")
    setAnswersText(
      Array.isArray(b.answers)
        ? (b.answers as number[]).join(",")
        : typeof b.answer === "number"
          ? String(b.answer)
          : "",
    )
    setBlanksText(Array.isArray(b.blanks) ? (b.blanks as string[]).join("\n") : "")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block?.id, type])

  function set(key: string, value: unknown) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function submit() {
    const data: Record<string, unknown> = { ...form }
    data.type = type
    if (type === "single_choice") {
      data.options = optionsText.split("\n").map((s) => s.trim()).filter(Boolean)
      data.answer = Number(answersText.trim())
    } else if (type === "multiple_choice") {
      data.options = optionsText.split("\n").map((s) => s.trim()).filter(Boolean)
      data.answers = answersText.split(",").map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n))
    } else if (type === "fill_blank") {
      data.blanks = blanksText.split("\n").map((s) => s.trim()).filter(Boolean)
    }
    onSave(data)
  }

  return (
    <div className="space-y-4">
      {type === "markdown" && (
        <div className="space-y-1.5">
          <Label>Markdown 内容</Label>
          <Textarea
            rows={12}
            value={(form.content as string) ?? ""}
            onChange={(e) => set("content", e.target.value)}
            placeholder={"# 标题\n\n正文内容，支持 Markdown 与 GFM 表格/任务列表"}
          />
        </div>
      )}

      {(type === "single_choice" || type === "multiple_choice" || type === "fill_blank" || type === "short_answer") && (
        <>
          <div className="space-y-1.5">
            <Label>题目</Label>
            <Textarea
              rows={3}
              value={(form.question as string) ?? ""}
              onChange={(e) => set("question", e.target.value)}
            />
          </div>
          {(type === "single_choice" || type === "multiple_choice") && (
            <>
              <div className="space-y-1.5">
                <Label>选项（每行一个）</Label>
                <Textarea
                  rows={4}
                  value={optionsText}
                  onChange={(e) => setOptionsText(e.target.value)}
                  placeholder={"选项 A\n选项 B\n选项 C"}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{type === "single_choice" ? "正确项索引（从 0 开始）" : "正确项索引（逗号分隔）"}</Label>
                <Input value={answersText} onChange={(e) => setAnswersText(e.target.value)} placeholder="0" />
              </div>
            </>
          )}
          {type === "fill_blank" && (
            <div className="space-y-1.5">
              <Label>各空参考答案（每行一个空）</Label>
              <Textarea rows={3} value={blanksText} onChange={(e) => setBlanksText(e.target.value)} placeholder={"答案一\n答案二"} />
            </div>
          )}
          {type === "short_answer" && (
            <>
              <div className="space-y-1.5">
                <Label>参考答案</Label>
                <Textarea
                  rows={4}
                  value={(form.reference as string) ?? ""}
                  onChange={(e) => set("reference", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>要点关键词（逗号分隔，供 AI 参考）</Label>
                <Input
                  value={((form.keywords as string[]) ?? []).join(",")}
                  onChange={(e) => set("keywords", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
                  placeholder="关键词1,关键词2"
                />
              </div>
            </>
          )}
          <div className="flex items-center gap-2">
            <Checkbox
              id="ai-graded"
              checked={(form.aiGraded as boolean) ?? true}
              onCheckedChange={(v) => set("aiGraded", v === true)}
            />
            <Label htmlFor="ai-graded">使用 AI 判题（主观题）</Label>
          </div>
        </>
      )}

      {type === "interactive" && (
        <>
          <div className="space-y-1.5">
            <Label>标题</Label>
            <Input value={(form.title as string) ?? ""} onChange={(e) => set("title", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>资产文件（相对课程包 interactives/ 的路径）</Label>
            <Input
              value={(form.file as string) ?? ""}
              onChange={(e) => set("file", e.target.value)}
              placeholder="interactives/convolution.html"
            />
          </div>
          <div className="space-y-1.5">
            <Label>iframe 高度（px）</Label>
            <Input
              type="number"
              value={Number(form.height ?? 480)}
              onChange={(e) => set("height", Number(e.target.value))}
            />
          </div>
        </>
      )}

      <div className="space-y-1.5">
        <Label>解析 / 提示（可选）</Label>
        <Textarea rows={2} value={(form.explanation as string) ?? ""} onChange={(e) => set("explanation", e.target.value)} />
      </div>

      <div className="flex gap-2">
        <Button onClick={submit}>保存</Button>
        <Button variant="ghost" onClick={onCancel}>
          取消
        </Button>
      </div>
    </div>
  )
}
