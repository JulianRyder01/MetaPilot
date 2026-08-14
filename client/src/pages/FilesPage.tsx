import { useCallback, useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { FolderOpen, HardDrive, Link2, Trash2 } from "lucide-react"

import { useT } from "@/i18n"
import type { SymlinkMount } from "@/lib/api"
import { symlinkMounts, symlinkRemoveMount } from "@/plugins/symlink/api"
import { Badge } from "@/components/ui/badge"
import { PluginGate } from "@/components/plugins/PluginGate"
import { AddMountDialog } from "@/components/symlink/AddMountDialog"
import { MountBrowser } from "@/components/symlink/MountBrowser"
import { useDialogs } from "@/components/ui/dialog-provider"

export default function FilesPage() {
  const t = useT()
  const { confirm } = useDialogs()
  const [params] = useSearchParams()
  const [mounts, setMounts] = useState<SymlinkMount[]>([])
  const [mid, setMid] = useState(params.get("mount") ?? "")

  const loadMounts = useCallback(async () => {
    const ms = await symlinkMounts()
    setMounts(ms)
    if (!mid && ms.length > 0) setMid(ms[0].id)
  }, [mid])

  useEffect(() => {
    loadMounts()
  }, [loadMounts])

  async function removeMount(id: string) {
    const name = mounts.find((m) => m.id === id)?.name ?? t("symlink.thatMount")
    const ok = await confirm({
      title: t("symlink.unmountSymlink"),
      description: t("symlink.unmountConfirmDesc", { name }),
      confirmText: t("symlink.unmount"),
    })
    if (!ok) return
    await symlinkRemoveMount(id)
    setMid("")
    loadMounts()
  }

  const currentMount = mounts.find((m) => m.id === mid)

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-4 flex items-center gap-2">
        <FolderOpen className="size-6 text-primary" />
        <h1 className="text-2xl font-semibold">{t("symlink.fileBrowser")}</h1>
        <Badge variant="outline" className="gap-1">
          <Link2 className="size-3" />
          {t("symlink.symlinkPlugin")}
        </Badge>
      </div>

      <PluginGate pluginId="symlink" hint={t("symlink.pluginHint")}>
        <div className="flex gap-5">
          {/* 左：挂载列表 */}
          <aside className="w-64 shrink-0 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground">{t("symlink.mounts")}</h2>
              <AddMountDialog onAdded={loadMounts} />
            </div>
            <div className="space-y-1">
              {mounts.map((m) => (
                <div
                  key={m.id}
                  className={`group flex items-center gap-2 rounded-md px-2 py-2 text-sm ${
                    mid === m.id ? "bg-accent font-medium" : "hover:bg-accent/60"
                  }`}
                >
                  <button
                    onClick={() => setMid(m.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <HardDrive className="size-4 shrink-0 text-primary" />
                    <Link2 className="size-3 shrink-0 text-muted-foreground/60" />
                    <span className="truncate">{m.name}</span>
                  </button>
                  <button
                    onClick={() => removeMount(m.id)}
                    className="text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                    title={t("symlink.unmount")}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
              {mounts.length === 0 && (
                <p className="px-2 text-xs text-muted-foreground">{t("symlink.noMounts")}</p>
              )}
            </div>
            {currentMount && (
              <p className="px-2 text-[11px] text-muted-foreground">
                {t("symlink.currentMountRoot", { root: currentMount.root })}
                {currentMount.type === "file" ? t("symlink.singleFileNote") : ""}
              </p>
            )}
          </aside>

          {/* 右：目录浏览 */}
          <section className="min-w-0 flex-1">
            {!currentMount ? (
              <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
                {t("symlink.pleaseMount")}
              </div>
            ) : (
              <MountBrowser mount={currentMount} />
            )}
          </section>
        </div>
      </PluginGate>
    </div>
  )
}
