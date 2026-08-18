/** AI 洞察 — 本机 ollama 配置面板。
 *
 * 把 AI 洞察的 AI 后端挂到本机 ollama：全新 / 复用现有 ollama 服务，支持用户自行填写地址与
 * 模型名、一键拉取模型、一键应用（让对话与向量都走本地 ollama）。后端端点为核心
 * /api/ai/ollama/*（详见 backend/app/api/ollama.py），模型名、地址均不写死，由配置提供。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Bot, Download, Loader2, Plug, ShieldCheck } from "lucide-react"

import { useT } from "@/i18n"
import { toast } from "@/lib/toast"
import { BASE } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

interface OllamaStatus {
  healthy: boolean
  url: string
  installed: string[]
  llmModel: string
  embeddingModel: string
  llmReady: boolean
  embeddingReady: boolean
  chatOnOllama: boolean
  embedOnOllama: boolean
  chatProvider: string
  embedProvider: string
}

async function getStatus(): Promise<OllamaStatus> {
  const r = await fetch(`${BASE}/ai/ollama/status`)
  if (!r.ok) throw new Error("status")
  return r.json()
}

async function pull(model: string) {
  const r = await fetch(`${BASE}/ai/ollama/pull`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model }),
  })
  if (!r.ok) throw new Error((await r.json()).detail ?? "pull")
  return r.json()
}

function waitPullDone(model: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const key = model.includes(":") ? model : `${model}:latest`
    const tick = async () => {
      try {
        const r = await fetch(`${BASE}/ai/ollama/pull/${encodeURIComponent(key)}/status`)
        const s = await r.json()
        if (s.status === "done") return resolve()
        if (s.status === "error") return reject(new Error(s.error ?? "拉取失败"))
        setTimeout(tick, 1200)
      } catch (e) {
        reject(e as Error)
      }
    }
    tick()
  })
}

interface Props {
  onApplied?: () => void
}

export default function OllamaPanel({ onApplied }: Props) {
  const t = useT()
  const [st, setSt] = useState<OllamaStatus | null>(null)
  const [llm, setLlm] = useState("")
  const [emb, setEmb] = useState("")
  const [busy, setBusy] = useState<string>("") // '' | 'llm' | 'emb' | 'apply'
  const timer = useRef<number | null>(null)

  const refresh = useCallback(async () => {
    try {
      const s = await getStatus()
      setSt(s)
      setLlm((prev) => prev || s.llmModel)
      setEmb((prev) => prev || s.embeddingModel)
    } catch {
      /* 忽略：状态面板保持上次/空 */
    }
  }, [])

  useEffect(() => {
    refresh()
    timer.current = window.setInterval(refresh, 5000)
    return () => {
      if (timer.current) window.clearInterval(timer.current)
    }
  }, [refresh])

  async function doPull(kind: "llm" | "emb") {
    const model = kind === "llm" ? llm : emb
    if (!model.trim()) return toast.error(t("insight.ollamaModelEmpty"))
    setBusy(kind)
    try {
      await pull(model.trim())
      toast.info(t("insight.ollamaPulling"))
      await waitPullDone(model.trim())
      await refresh()
      toast.success(t("insight.ollamaReady"))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("insight.ollamaPullFailed"))
    } finally {
      setBusy("")
    }
  }

  async function doApply() {
    if (!st?.healthy) return toast.error(t("insight.ollamaNotRunning"))
    if (!llm.trim() || !emb.trim()) return toast.error(t("insight.ollamaModelEmpty"))
    setBusy("apply")
    try {
      const r = await fetch(`${BASE}/ai/ollama/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ llmModel: llm.trim(), embeddingModel: emb.trim() }),
      })
      if (!r.ok) throw new Error((await r.json()).detail ?? t("insight.ollamaApplyFailed"))
      await refresh()
      toast.success(t("insight.ollamaApplied"))
      onApplied?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("insight.ollamaApplyFailed"))
    } finally {
      setBusy("")
    }
  }

  if (!st) {
    return (
      <Card className="border-dashed">
        <CardHeader className="flex-row items-center gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="size-4 text-primary" /> {t("insight.ollamaTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <Loader2 className="mr-1 inline size-3.5 animate-spin" /> {t("insight.ollamaLoading")}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={st.chatOnOllama && st.embedOnOllama ? "border-green-600/40" : "border-dashed"}>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bot className="size-4 text-primary" />
          {t("insight.ollamaTitle")}
        </CardTitle>
        <Badge variant={st.healthy ? "success" : "destructive"}>
          {st.healthy ? t("insight.ollamaOnline") : t("insight.ollamaOffline")}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-xs text-muted-foreground">
          {st.healthy
            ? t("insight.ollamaOnlineHint", { url: st.url })
            : t("insight.ollamaOfflineHint")}
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">{t("insight.ollamaLlmModel")}</span>
            <div className="flex gap-1.5">
              <Input value={llm} onChange={(e) => setLlm(e.target.value)} placeholder="qwen3.5:4b" />
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== "" || !st.healthy}
                onClick={() => doPull("llm")}
              >
                {busy === "llm" ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
              </Button>
            </div>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">{t("insight.ollamaEmbedModel")}</span>
            <div className="flex gap-1.5">
              <Input value={emb} onChange={(e) => setEmb(e.target.value)} placeholder="nomic-embed-text" />
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== "" || !st.healthy}
                onClick={() => doPull("emb")}
              >
                {busy === "emb" ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
              </Button>
            </div>
          </label>
        </div>

        {(st.installed.length > 0 || st.llmReady || st.embeddingReady) && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">{t("insight.ollamaInstalled")}</span>
            {st.installed.map((m) => (
              <Badge key={m} variant="outline" className="text-[11px]">
                {m}
              </Badge>
            ))}
            {st.llmReady && <Badge variant="success" className="text-[11px]">{t("insight.ollamaLlmOk")}</Badge>}
            {st.embeddingReady && <Badge variant="success" className="text-[11px]">{t("insight.ollamaEmbOk")}</Badge>}
          </div>
        )}
        {!st.llmReady && (
          <p className="text-xs text-amber-600">{t("insight.ollamaLlmNotReady")}</p>
        )}
        {!st.embeddingReady && (
          <p className="text-xs text-amber-600">{t("insight.ollamaEmbNotReady")}</p>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <Button size="sm" disabled={busy !== "" || !st.healthy} onClick={doApply}>
            {busy === "apply" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plug className="size-4" />
            )}
            {t("insight.ollamaApply")}
          </Button>
          {st.chatOnOllama && st.embedOnOllama && (
            <Badge variant="success" className="gap-1">
              <ShieldCheck className="size-3.5" />
              {t("insight.ollamaActive")}
            </Badge>
          )}
          {st.chatOnOllama && (
            <p className="text-xs text-muted-foreground">
              {t("insight.ollamaChatOn", { provider: st.chatProvider })}
            </p>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{t("insight.ollamaHint")}</p>
      </CardContent>
    </Card>
  )
}
