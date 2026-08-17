import { useCallback, useEffect, useState } from "react"
import { Database, Loader2, MoveRight } from "lucide-react"

import { toast } from "@/lib/toast"
import { useT } from "@/i18n"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/** 数据目录（vault）：显示当前路径；迁移 = 整体复制到新目录后删除源文件（重启生效）。 */
export function VaultCard() {
  const t = useT()
  const [vault, setVault] = useState<{ path: string; configured: boolean } | null>(null)
  const [target, setTarget] = useState("")
  const [migrating, setMigrating] = useState(false)

  const load = useCallback(() => {
    api.getVault().then(setVault).catch(() => setVault(null))
  }, [])

  useEffect(load, [load])

  async function migrate() {
    if (!target.trim() || migrating) return
    setMigrating(true)
    try {
      const r = await api.migrateVault(target.trim())
      toast.success(t("sys.vault.migrated", { path: r.path }))
      setTarget("")
      setVault({ path: r.path, configured: true })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("sys.vault.migrateFailed"))
    } finally {
      setMigrating(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Database className="size-4 text-primary" />
          {t("sys.vault.title")}
        </CardTitle>
        <CardDescription>{t("sys.vault.desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border bg-muted/40 px-3 py-2">
          <Label className="text-xs text-muted-foreground">{t("sys.vault.current")}</Label>
          <p className="mt-0.5 break-all font-mono text-sm">{vault?.path ?? "…"}</p>
        </div>
        <div className="flex gap-2">
          <Input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder={t("sys.vault.placeholder")}
            className="flex-1"
          />
          <Button onClick={migrate} disabled={migrating || !target.trim()}>
            {migrating ? <Loader2 className="size-4 animate-spin" /> : <MoveRight className="size-4" />}
            {migrating ? t("sys.vault.migrating") : t("sys.vault.migrate")}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
