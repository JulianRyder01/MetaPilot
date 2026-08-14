import { useEffect, useState } from "react"

import { useT } from "@/i18n"
import type { Block } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"

export const BLOCK_TYPES = [
  { value: "markdown", label: "core.edit.block.markdown" },
  { value: "single_choice", label: "core.edit.block.single_choice" },
  { value: "multiple_choice", label: "core.edit.block.multiple_choice" },
  { value: "fill_blank", label: "core.edit.block.fill_blank" },
  { value: "short_answer", label: "core.edit.block.short_answer" },
  { value: "interactive", label: "core.edit.block.interactive" },
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
  const t = useT()
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
          <Label>{t("core.edit.markdownContent")}</Label>
          <Textarea
            rows={12}
            value={(form.content as string) ?? ""}
            onChange={(e) => set("content", e.target.value)}
            placeholder={t("core.edit.markdownPlaceholder")}
          />
        </div>
      )}

      {(type === "single_choice" || type === "multiple_choice" || type === "fill_blank" || type === "short_answer") && (
        <>
          <div className="space-y-1.5">
            <Label>{t("core.edit.question")}</Label>
            <Textarea
              rows={3}
              value={(form.question as string) ?? ""}
              onChange={(e) => set("question", e.target.value)}
            />
          </div>
          {(type === "single_choice" || type === "multiple_choice") && (
            <>
              <div className="space-y-1.5">
                <Label>{t("core.edit.options")}</Label>
                <Textarea
                  rows={4}
                  value={optionsText}
                  onChange={(e) => setOptionsText(e.target.value)}
                  placeholder={t("core.edit.optionsPlaceholder")}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{type === "single_choice" ? t("core.edit.correctIndex") : t("core.edit.correctIndexes")}</Label>
                <Input value={answersText} onChange={(e) => setAnswersText(e.target.value)} placeholder="0" />
              </div>
            </>
          )}
          {type === "fill_blank" && (
            <div className="space-y-1.5">
              <Label>{t("core.edit.blanksAnswers")}</Label>
              <Textarea rows={3} value={blanksText} onChange={(e) => setBlanksText(e.target.value)} placeholder={t("core.edit.blanksPlaceholder")} />
            </div>
          )}
          {type === "short_answer" && (
            <>
              <div className="space-y-1.5">
                <Label>{t("core.edit.reference")}</Label>
                <Textarea
                  rows={4}
                  value={(form.reference as string) ?? ""}
                  onChange={(e) => set("reference", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("core.edit.keywordsLabel")}</Label>
                <Input
                  value={((form.keywords as string[]) ?? []).join(",")}
                  onChange={(e) => set("keywords", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
                  placeholder={t("core.edit.keywordsPlaceholder")}
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
            <Label htmlFor="ai-graded">{t("core.edit.aiGraded")}</Label>
          </div>
        </>
      )}

      {type === "interactive" && (
        <>
          <div className="space-y-1.5">
            <Label>{t("core.edit.title")}</Label>
            <Input value={(form.title as string) ?? ""} onChange={(e) => set("title", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("core.edit.assetFile")}</Label>
            <Input
              value={(form.file as string) ?? ""}
              onChange={(e) => set("file", e.target.value)}
              placeholder="interactives/convolution.html"
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("core.edit.iframeHeight")}</Label>
            <Input
              type="number"
              value={Number(form.height ?? 480)}
              onChange={(e) => set("height", Number(e.target.value))}
            />
          </div>
        </>
      )}

      <div className="space-y-1.5">
        <Label>{t("core.edit.explanationLabel")}</Label>
        <Textarea rows={2} value={(form.explanation as string) ?? ""} onChange={(e) => set("explanation", e.target.value)} />
      </div>

      <div className="flex gap-2">
        <Button onClick={submit}>{t("common.save")}</Button>
        <Button variant="ghost" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
      </div>
    </div>
  )
}
