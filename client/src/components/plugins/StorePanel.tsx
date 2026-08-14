/** 插件商店面板：浏览商店清单（按 tag 筛选）、安装、上传（本地安装 / 发布商店）。 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CloudDownload, FileUp, RefreshCw, Send, Store } from "lucide-react"
import { toast } from "@/lib/toast"

import { api, type StorePluginItem } from "@/lib/api"
import { PLUGIN_TAGS } from "@/plugins/types"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { useT } from "@/i18n"

interface Props {
  /** 本地已安装的插件 id 集合（用于禁用「安装」按钮） */
  installedIds: string[]
  /** 安装/上传成功后刷新本地插件列表 */
  onChanged: () => void
}

function fmtSize(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export function StorePanel({ installedIds, onChanged }: Props) {
  const t = useT()
  const [items, setItems] = useState<StorePluginItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [installing, setInstalling] = useState<string | null>(null)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setItems(await api.storeCatalog())
    } catch (e) {
      setError(e instanceof Error ? e.message : t("sys.store.storeUnavailable"))
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(
    () => (tagFilter ? items.filter((i) => i.tags?.includes(tagFilter)) : items),
    [items, tagFilter],
  )

  async function install(item: StorePluginItem) {
    setInstalling(item.id)
    try {
      await api.storeInstall(item.id)
      toast.success(t("sys.store.installedToast", { name: item.name }))
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("sys.store.installFailed"))
    } finally {
      setInstalling(null)
    }
  }

  async function upload(mode: "local" | "publish") {
    if (!uploadFile) return
    setBusy(true)
    try {
      if (mode === "local") {
        await api.uploadPlugin(uploadFile)
        toast.success(t("sys.store.localInstalledToast"))
        onChanged()
      } else {
        await api.storePublish(uploadFile)
        toast.success(t("sys.store.publishedToast"))
        load()
      }
      setUploadFile(null)
      if (fileRef.current) fileRef.current.value = ""
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("sys.store.uploadFailed"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {t("sys.store.headerPrefix")}<code className="rounded bg-muted px-1">PLUGIN_STORE_URL</code>{t("sys.store.headerSuffix")}
        </p>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={cn("size-4", loading && "animate-spin")} />
          {t("sys.store.checkUpdates")}
        </Button>
      </div>

      {error ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/30">
          {error}
        </div>
      ) : loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <>
          {/* tag 筛选 */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-muted-foreground">{t("sys.plugins.filterByTag")}</span>
            <Button
              variant={tagFilter === null ? "secondary" : "outline"}
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={() => setTagFilter(null)}
            >
              {t("common.all")}
            </Button>
            {PLUGIN_TAGS.map((t) => (
              <Button
                key={t}
                variant={tagFilter === t ? "secondary" : "outline"}
                size="sm"
                className="h-7 px-2.5 text-xs"
                onClick={() => setTagFilter(tagFilter === t ? null : t)}
              >
                {t}
              </Button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("sys.store.emptyFiltered")}</p>
          ) : (
            <div className="space-y-3">
              {filtered.map((item) => {
                const installed = installedIds.includes(item.id)
                return (
                  <Card key={item.id}>
                    <CardHeader className="flex-row items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Store className="size-5" />
                        </span>
                        <div>
                          <CardTitle className="flex items-center gap-2 text-base">
                            {item.name}
                            <Badge variant="outline">v{item.version}</Badge>
                            <span className="text-xs font-normal text-muted-foreground">{item.author}</span>
                          </CardTitle>
                          <p className="text-xs text-muted-foreground">
                            {t("sys.plugins.idLabel")} {item.id} · {fmtSize(item.size)}
                          </p>
                        </div>
                      </div>
                      <Button size="sm" disabled={installed || installing === item.id} onClick={() => install(item)}>
                        {installing === item.id ? (
                          <RefreshCw className="size-4 animate-spin" />
                        ) : (
                          <CloudDownload className="size-4" />
                        )}
                        {installed ? t("sys.store.installed") : t("sys.store.install")}
                      </Button>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                      {item.tags && item.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {item.tags.map((t) => (
                            <button
                              key={t}
                              className={cn(
                                "rounded-full border px-2 py-0.5 text-xs transition-colors",
                                tagFilter === t
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-border text-muted-foreground hover:border-primary/50 hover:text-primary",
                              )}
                              onClick={() => setTagFilter(tagFilter === t ? null : t)}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* 上传：本地安装 / 发布到商店 */}
      <Card>
        <CardHeader className="flex-row items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileUp className="size-5" />
          </span>
          <div>
            <CardTitle className="text-base">{t("sys.store.uploadTitle")}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {t("sys.store.uploadDescPrefix")}<code className="rounded bg-muted px-1">plugin.json</code>{t("sys.store.uploadDescSuffix")}
            </p>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Input
            ref={fileRef}
            type="file"
            accept=".zip"
            className="max-w-xs"
            onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
          />
          <Button variant="outline" size="sm" disabled={!uploadFile || busy} onClick={() => upload("local")}>
            <CloudDownload className="size-4" />
            {t("sys.store.uploadLocal")}
          </Button>
          <Button size="sm" disabled={!uploadFile || busy} onClick={() => upload("publish")}>
            <Send className="size-4" />
            {t("sys.store.uploadPublish")}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
