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
      setError(e instanceof Error ? e.message : "无法访问插件商店")
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

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
      toast.success(`已安装插件「${item.name}」`)
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "安装失败")
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
        toast.success("已本地安装插件")
        onChanged()
      } else {
        await api.storePublish(uploadFile)
        toast.success("已发布到插件商店")
        load()
      }
      setUploadFile(null)
      if (fileRef.current) fileRef.current.value = ""
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "上传失败")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          从插件商店浏览、筛选并安装插件（商店地址由后端 <code className="rounded bg-muted px-1">PLUGIN_STORE_URL</code> 配置）。
        </p>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={cn("size-4", loading && "animate-spin")} />
          检查更新
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
            <span className="mr-1 text-xs text-muted-foreground">按标签筛选：</span>
            <Button
              variant={tagFilter === null ? "secondary" : "outline"}
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={() => setTagFilter(null)}
            >
              全部
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
            <p className="text-sm text-muted-foreground">商店暂无匹配的插件。</p>
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
                            id: {item.id} · {fmtSize(item.size)}
                          </p>
                        </div>
                      </div>
                      <Button size="sm" disabled={installed || installing === item.id} onClick={() => install(item)}>
                        {installing === item.id ? (
                          <RefreshCw className="size-4 animate-spin" />
                        ) : (
                          <CloudDownload className="size-4" />
                        )}
                        {installed ? "已安装" : "安装"}
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
            <CardTitle className="text-base">上传插件</CardTitle>
            <p className="text-xs text-muted-foreground">
              选择按规范打包的插件 zip（含根目录 plugin.json，见插件开发规范 §3）：可本地安装，或发布到插件商店。
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
            本地安装
          </Button>
          <Button size="sm" disabled={!uploadFile || busy} onClick={() => upload("publish")}>
            <Send className="size-4" />
            发布到商店
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
