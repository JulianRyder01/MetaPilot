import { useCallback, useEffect, useState } from "react"
import { Cpu, Download, Play, Square } from "lucide-react"
import { toast } from "@/lib/toast"

import { useT } from "@/i18n"
import {
  aiLocalModels,
  aiLocalModelDownload,
  aiLocalModelStart,
  aiLocalModelStop,
  type LocalModelStatus,
} from "@/lib/api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Progress as ProgressBar } from "@/components/ui/progress"

const KIND_LABEL: Record<string, string> = {
  embedding: "sys.ai.modelKindEmbedding",
  llm: "sys.ai.modelKindLlm",
  rerank: "sys.ai.modelKindRerank",
}

export function LocalModelsCard() {
  const t = useT()
  const [models, setModels] = useState<LocalModelStatus[] | null>(null)

  const load = useCallback(async () => {
    try {
      const list = await aiLocalModels()
      setModels(list)
      return list
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("sys.ai.loadFailed"))
      return null
    }
  }, [t])

  useEffect(() => {
    load()
  }, [load])

  // 下载中/启动中的模型轮询刷新状态
  useEffect(() => {
    const busy = models?.some((m) => m.downloading || (m.downloaded && !m.running && m.downloading))
    if (!busy) return
    const timer = setInterval(load, 3000)
    return () => clearInterval(timer)
  }, [models, load])

  async function download(m: LocalModelStatus) {
    const r = await aiLocalModelDownload(m.kind, m.model)
    toast.success(r.message ?? t("sys.ai.download"))
    load()
  }

  async function start(m: LocalModelStatus) {
    const r = await aiLocalModelStart(m.kind, m.model)
    if (r.started) toast.success(r.message ?? t("sys.ai.start"))
    else toast.error(r.error ?? t("sys.ai.startFailed"))
    load()
  }

  async function stop(m: LocalModelStatus) {
    await aiLocalModelStop(m.kind)
    load()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Cpu className="size-4 text-primary" />
          {t("sys.ai.localTitle")}
        </CardTitle>
        <CardDescription>{t("sys.ai.localDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {!models ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          models.map((m) => (
            <div key={m.kind} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <span className="text-xs text-muted-foreground">{t(KIND_LABEL[m.kind] ?? m.kind)}</span>
                  <span className="truncate">{m.model}</span>
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {m.downloading ? (
                    <Badge variant="secondary">
                      <Download className="mr-1 size-3 animate-pulse" />
                      {t("sys.ai.downloading")}
                    </Badge>
                  ) : m.downloaded ? (
                    <Badge variant="success">{t("sys.ai.downloaded")}</Badge>
                  ) : (
                    <Badge variant="secondary">{t("sys.ai.notDownloaded")}</Badge>
                  )}
                  <Badge variant={m.running ? "success" : "outline"}>
                    {m.running ? t("sys.ai.running") : t("sys.ai.notRunning")}
                  </Badge>
                  {m.downloadError && (
                    <span className="text-xs text-destructive">{m.downloadError}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!m.downloaded && !m.downloading && (
                  <Button size="sm" variant="outline" onClick={() => download(m)}>
                    <Download className="size-3.5" />
                    {t("sys.ai.download")}
                  </Button>
                )}
                {m.downloaded && !m.running && (
                  <Button size="sm" variant="outline" onClick={() => start(m)}>
                    <Play className="size-3.5" />
                    {t("sys.ai.start")}
                  </Button>
                )}
                {m.running && (
                  <Button size="sm" variant="outline" onClick={() => stop(m)}>
                    <Square className="size-3.5" />
                    {t("sys.ai.stop")}
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
        {models?.some((m) => m.downloading) && (
          <ProgressBar className="h-1.5" value={100} />
        )}
      </CardContent>
    </Card>
  )
}
