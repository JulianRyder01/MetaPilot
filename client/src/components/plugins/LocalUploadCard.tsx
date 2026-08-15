/** 本地插件页的上传卡片：选择插件 zip 直接本地安装（POST /api/plugins/upload，不经插件商店）。
 *
 * 与插件商店页的上传卡片（StorePanel）解耦：这里只提供「本地安装」，不出现任何商店相关入口；
 * 安装成功后由宿主刷新本地插件列表。
 */
import { useRef, useState } from "react"
import { FileUp, PackageCheck } from "lucide-react"
import { toast } from "@/lib/toast"

import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useT } from "@/i18n"

interface Props {
  /** 安装成功后刷新本地插件列表 */
  onInstalled: () => void
}

export function LocalUploadCard({ onInstalled }: Props) {
  const t = useT()
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function install() {
    if (!uploadFile) return
    setBusy(true)
    try {
      await api.uploadPlugin(uploadFile)
      toast.success(t("sys.plugins.uploadSuccess"))
      setUploadFile(null)
      if (fileRef.current) fileRef.current.value = ""
      onInstalled()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("sys.plugins.uploadFailed"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <FileUp className="size-5" />
        </span>
        <div>
          <CardTitle className="text-base">{t("sys.plugins.uploadTitle")}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {t("sys.plugins.uploadDescPrefix")}
            <code className="rounded bg-muted px-1">plugin.json</code>
            {t("sys.plugins.uploadDescSuffix")}
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
        <Button size="sm" disabled={!uploadFile || busy} onClick={install}>
          <PackageCheck className="size-4" />
          {t("sys.plugins.uploadInstall")}
        </Button>
      </CardContent>
    </Card>
  )
}
