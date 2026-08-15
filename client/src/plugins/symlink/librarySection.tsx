/** 软链接插件贡献的「我的库」页分区：挂载列表（点击跳转文件浏览器 /files?mount=）。
 *
 * 经 PluginFrontend.librarySections 扩展点注册，由核心 LibraryHome 渲染插槽；
 * 本组件自包含（挂载数据/添加/卸载），插件被禁用时 LibraryHome 按启用状态过滤不渲染。
 */
import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { HardDrive, Link2, Trash2 } from "lucide-react"

import { useT } from "@/i18n"
import { toast } from "@/lib/toast"
import { symlinkMounts, symlinkRemoveMount } from "@/plugins/symlink/api"
import type { SymlinkMount } from "@/lib/api"
import { AddMountDialog } from "@/components/symlink/AddMountDialog"
import { useDialogs } from "@/components/ui/dialog-provider"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export function SymlinkLibrarySection() {
  const t = useT()
  const navigate = useNavigate()
  const { confirm } = useDialogs()
  const [mounts, setMounts] = useState<SymlinkMount[]>([])

  const loadMounts = useCallback(async () => {
    try {
      setMounts(await symlinkMounts())
    } catch {
      setMounts([]) // 插件被禁用/服务不可用时静默（分区已按启用状态过滤，这里兜底）
    }
  }, [])

  useEffect(() => {
    loadMounts()
  }, [loadMounts])

  async function removeMount(id: string) {
    const name = mounts.find((m) => m.id === id)?.name ?? t("core.library.unmountNameFallback")
    const ok = await confirm({
      title: t("core.library.unmountTitle"),
      description: t("core.library.unmountDesc", { name }),
      confirmText: t("core.library.unmount"),
    })
    if (!ok) return
    await symlinkRemoveMount(id)
    toast.success(t("core.library.unmounted"))
    loadMounts()
  }

  return (
    <div className="mt-6 border-t pt-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
          <Link2 className="size-3.5" />
          {t("core.library.symlink")}
          <Badge variant="outline" className="text-[10px]">{t("core.library.pluginBadge")}</Badge>
        </h2>
        <AddMountDialog onAdded={loadMounts} />
      </div>
      <div className="space-y-1">
        {mounts.map((m) => (
          <div key={m.id} className="group flex items-center gap-1.5 rounded-md px-2 py-1.5 hover:bg-accent/60">
            <button
              onClick={() => navigate(`/files?mount=${m.id}`)}
              className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
              title={`${m.name} → ${m.root}${m.type === "file" ? t("core.library.singleFile") : ""}`}
            >
              <HardDrive className="size-3.5 shrink-0 text-primary" />
              <Link2 className="size-3 shrink-0 text-muted-foreground/60" />
              <span className="truncate">{m.name}</span>
            </button>
            <button
              onClick={() => removeMount(m.id)}
              className={cn("text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100")}
              title={t("core.library.unmountTitle")}
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
        {mounts.length === 0 && (
          <p className="px-2 text-xs text-muted-foreground">{t("core.library.noSymlinks")}</p>
        )}
      </div>
    </div>
  )
}
