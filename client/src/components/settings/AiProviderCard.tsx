import { useEffect, useMemo, useState } from "react"
import { Bot, CircleDollarSign, KeyRound, Plus, Save, Trash2, Zap } from "lucide-react"
import { toast } from "@/lib/toast"

import { useT } from "@/i18n"
import { aiGetConfig, aiPutConfig, aiTest, type AIConfigPublic } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"

interface PriceRow {
  model: string
  input: string
  cachedInput: string
  output: string
  currency: string
}

const NUM = /^-?\d*\.?\d*$/

export function AiProviderCard() {
  const t = useT()
  const [config, setConfig] = useState<AIConfigPublic | null>(null)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null)

  // 表单字段（初始化自 config；config 变更时同步）
  const [provider, setProvider] = useState("")
  const [baseUrl, setBaseUrl] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [chatModel, setChatModel] = useState("")
  const [embeddingProvider, setEmbeddingProvider] = useState("")
  const [embeddingUrl, setEmbeddingUrl] = useState("")
  const [embeddingModel, setEmbeddingModel] = useState("")
  const [currency, setCurrency] = useState("$")
  const [prices, setPrices] = useState<PriceRow[]>([])

  useEffect(() => {
    aiGetConfig()
      .then((c) => {
        setConfig(c)
        setProvider(c.provider)
        setBaseUrl(c.baseUrl)
        setChatModel(c.chatModel)
        setEmbeddingProvider(c.embeddingProvider)
        setEmbeddingUrl(c.embeddingUrl)
        setEmbeddingModel(c.embeddingModel)
        setCurrency(c.currency || c.defaultCurrency)
        setPrices(
          Object.entries(c.prices ?? {}).map(([model, p]) => ({
            model,
            input: String(p.input),
            cachedInput: String(p.cachedInput),
            output: String(p.output),
            currency: p.currency,
          })),
        )
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : t("sys.ai.loadFailed")))
  }, [t])

  const providerLabel = useMemo(() => {
    const map: Record<string, string> = {
      openai: t("sys.ai.providerOpenai"),
      anthropic: t("sys.ai.providerAnthropic"),
      local: t("sys.ai.providerLocal"),
      none: t("sys.ai.providerNone"),
    }
    return map[provider] ?? provider
  }, [provider, t])

  function setPrice(i: number, field: keyof PriceRow, value: string) {
    if (field !== "model" && field !== "currency" && !NUM.test(value)) return
    setPrices((rows) => rows.map((r, j) => (j === i ? { ...r, [field]: value } : r)))
  }

  async function save() {
    setSaving(true)
    setTestResult(null)
    try {
      const priceMap: Record<string, { input: number; cachedInput: number; output: number; currency: string }> = {}
      for (const r of prices) {
        if (!r.model.trim()) continue
        priceMap[r.model.trim()] = {
          input: Number(r.input) || 0,
          cachedInput: Number(r.cachedInput) || 0,
          output: Number(r.output) || 0,
          currency: r.currency || currency,
        }
      }
      const updated = await aiPutConfig({
        provider,
        baseUrl,
        apiKey: apiKey.trim(),
        chatModel: chatModel.trim(),
        embeddingProvider,
        embeddingUrl: embeddingUrl.trim(),
        embeddingModel: embeddingModel.trim(),
        currency,
        prices: priceMap,
      })
      setConfig(updated)
      setApiKey("")
      toast.success(t("sys.ai.saved"))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("sys.ai.saveFailed"))
    } finally {
      setSaving(false)
    }
  }

  async function test() {
    setTesting(true)
    setTestResult(null)
    try {
      const r = await aiTest()
      setTestResult({ ok: true, text: t("sys.ai.testOk", { model: r.model, in: r.inputTokens, out: r.outputTokens }) })
    } catch (e) {
      setTestResult({ ok: false, text: t("sys.ai.testFailed") + "：" + (e instanceof Error ? e.message : "") })
    } finally {
      setTesting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Bot className="size-4 text-primary" />
          {t("sys.ai.title")}
        </CardTitle>
        <CardDescription>{t("sys.ai.desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!config ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">{t("sys.ai.provider")}</label>
                <Select value={provider} onValueChange={setProvider}>
                  <SelectTrigger>
                    <SelectValue placeholder={providerLabel} />
                  </SelectTrigger>
                  <SelectContent>
                    {config.providers.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p === "openai" && t("sys.ai.providerOpenai")}
                        {p === "anthropic" && t("sys.ai.providerAnthropic")}
                        {p === "local" && t("sys.ai.providerLocal")}
                        {p === "none" && t("sys.ai.providerNone")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">{t("sys.ai.chatModel")}</label>
                <Input value={chatModel} onChange={(e) => setChatModel(e.target.value)} placeholder="MiniMax-M3" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">{t("sys.ai.baseUrl")}</label>
                <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.openai.com/v1" />
              </div>
              <div className="space-y-1.5">
                <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  <KeyRound className="size-3" />
                  {t("sys.ai.apiKey")}
                </label>
                <Input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={config.apiKeyConfigured ? t("sys.ai.apiKeyPlaceholder") : "sk-..."}
                />
              </div>
            </div>

            <div className="rounded-lg border p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">{t("sys.ai.embeddingTitle")}</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t("sys.ai.embeddingProvider")}</label>
                  <Select value={embeddingProvider} onValueChange={setEmbeddingProvider}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="local_transformers">{t("sys.ai.embeddingLocal")}</SelectItem>
                      <SelectItem value="openai">{t("sys.ai.embeddingOpenai")}</SelectItem>
                      <SelectItem value="none">{t("sys.ai.embeddingNone")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t("sys.ai.embeddingModel")}</label>
                  <Input value={embeddingModel} onChange={(e) => setEmbeddingModel(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t("sys.ai.embeddingUrl")}</label>
                  <Input value={embeddingUrl} onChange={(e) => setEmbeddingUrl(e.target.value)} />
                </div>
              </div>
            </div>

            {/* 价格表 */}
            <div className="rounded-lg border p-3">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <CircleDollarSign className="size-3.5" />
                {t("sys.ai.prices")}
              </p>
              <p className="mb-2 text-xs text-muted-foreground">{t("sys.ai.pricesHint")}</p>
              <div className="space-y-1.5">
                {prices.map((r, i) => (
                  <div key={i} className="grid grid-cols-2 items-center gap-2 sm:grid-cols-[1fr_90px_90px_90px_80px_36px]">
                    <Input value={r.model} onChange={(e) => setPrice(i, "model", e.target.value)} placeholder={t("sys.ai.priceModel")} className="h-8 text-xs" />
                    <Input value={r.input} onChange={(e) => setPrice(i, "input", e.target.value)} placeholder={t("sys.ai.priceInput")} className="h-8 text-xs" />
                    <Input value={r.cachedInput} onChange={(e) => setPrice(i, "cachedInput", e.target.value)} placeholder={t("sys.ai.priceCached")} className="h-8 text-xs" />
                    <Input value={r.output} onChange={(e) => setPrice(i, "output", e.target.value)} placeholder={t("sys.ai.priceOutput")} className="h-8 text-xs" />
                    <Select value={r.currency} onValueChange={(v) => setPrice(i, "currency", v)}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="$">$</SelectItem>
                        <SelectItem value="¥">¥</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPrices((rows) => rows.filter((_, j) => j !== i))}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" className="mt-2" onClick={() =>
                setPrices((rows) => [...rows, { model: "", input: "0", cachedInput: "0", output: "0", currency }])}
              >
                <Plus className="size-3.5" />
                {t("sys.ai.addPrice")}
              </Button>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {t("sys.ai.currency")}
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className="h-7 w-20 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {config.currencies.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={save} disabled={saving}>
                <Save className="size-4" />
                {t("sys.ai.save")}
              </Button>
              <Button variant="outline" onClick={test} disabled={testing}>
                <Zap className="size-4" />
                {testing ? t("sys.ai.testing") : t("sys.ai.test")}
              </Button>
              {testResult && (
                <Badge variant={testResult.ok ? "success" : "destructive"}>{testResult.text}</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{t("sys.ai.localOnlyHint")}</p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
