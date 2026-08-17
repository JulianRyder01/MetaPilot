/** 软链接插件贡献的「我的库」页分区：挂载列表（软链接与库平级展示）。
 *
 * 经 PluginFrontend.librarySections 扩展点注册，由核心 LibraryHome 渲染插槽；
 * 软链接视作库：行样式与库行一致（名称旁有软链接图标、右侧三点管理菜单），
 * 支持置顶 / 设为默认（全局唯一）/ 重命名挂载名 / 卸载。
 * 本组件自包含（挂载数据/添加/卸载），插件被禁用时 LibraryHome 按启用状态过滤不渲染。
 */
import { useCallback, useEffect, useState } from "react"
import { ExternalLink, HardDrive, Link2, MoreHorizontal, Pin, Plus, Star, Trash2 } from "lucide-react"

import { useT } from "@/i18n"
import { toast } from "@/lib/toast"
import { useAppStore } from "@/stores/app"
import {
  symlinkMounts,
  symlinkOpen,
  symlinkPinMount,
  symlinkRemoveMount,
  symlinkRenameMount,
  symlinkSetDefaultMount,
  symlinkClearDefaultMount,
} from "@/plugins/symlink/api"
import type { SymlinkMount } from "@/lib/api"
import { AddMountDialog } from "@/components/symlink/AddMountDialog"
import { useDialogs } from "@/components/ui/dialog-provider"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

export function SymlinkLibrarySection() {
  const t = useT()
  const { confirm, prompt } = useDialogs()
  const [mounts, setMounts] = useState<SymlinkMount[]>([])
  // 行菜单打开状态：打开期间强制三点按钮可见（Radix modal 会令 :hover 失效，display:none 的 trigger 会被定位到视口左上角）
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const { setCurrentLibraryId, currentMountId, setCurrentMountId } = useAppStore()

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

  /** 打开软链接：软链接视为库，直接在「我的库」右侧浏览（不跳独立文件浏览器页） */
  function openMount(m: SymlinkMount) {
    setCurrentLibraryId(null)
    setCurrentMountId(m.id)
  }

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

  /** 置顶 / 取消置顶（可多个，与库一致） */
  async function togglePin(m: SymlinkMount) {
    await symlinkPinMount(m.id, !m.pinned)
    toast.success(t(m.pinned ? "core.library.unpinnedLib" : "core.library.pinnedLib"))
    loadMounts()
  }

  /** 设为默认保存目标（全局唯一，与库统一） */
  async function setDefault(m: SymlinkMount) {
    await symlinkSetDefaultMount(m.id)
    toast.success(t("core.library.defaultSet"))
    loadMounts()
  }

  /** 取消默认保存目标（与置顶相互独立，可单独取消） */
  async function clearDefault(m: SymlinkMount) {
    await symlinkClearDefaultMount(m.id)
    toast.success(t("core.library.defaultCleared"))
    loadMounts()
  }

  /** 重命名挂载名 */
  async function renameMount(m: SymlinkMount) {
    const name = await prompt({
      title: t("core.library.renameLibTitle"),
      placeholder: t("core.library.namePlaceholder"),
      initialValue: m.name,
    })
    if (name == null || !name.trim() || name.trim() === m.name) return
    await symlinkRenameMount(m.id, name.trim())
    toast.success(t("core.library.renamedLib"))
    loadMounts()
  }

  /** 在用户本机系统文件管理器中显示挂载根目录 */
  async function revealMount(m: SymlinkMount) {
    try {
      await symlinkOpen(m.id, "", "reveal")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("core.library.revealFailed"))
    }
  }

  return (
    <div className="space-y-1">
      {mounts.map((m) => (
        <div
          key={m.id}
          className={cn(
            "group flex items-center gap-1 rounded-md px-2 py-1.5 transition-colors",
            currentMountId === m.id ? "bg-accent font-medium text-accent-foreground" : "hover:bg-accent/60",
          )}
        >
          <button
            onClick={() => openMount(m)}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm"
            title={`${m.name} → ${m.root}${m.type === "file" ? t("core.library.singleFile") : ""}`}
          >
            <Link2 className="size-3.5 shrink-0 text-primary" />
            <span className="truncate">{m.name}</span>
            {m.pinned && <Pin className="size-3 shrink-0 text-primary" aria-label={t("core.library.pinned")} />}
            {m.isDefault && (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-primary/15 px-1 py-px text-[10px] font-medium text-primary">
                <Star className="size-2.5 fill-current" />
                {t("core.library.defaultLib")}
              </span>
            )}
          </button>
          <span className="shrink-0 text-xs text-muted-foreground group-hover:hidden">
            <HardDrive className="size-3.5" />
          </span>
          <DropdownMenu open={openMenuId === m.id} onOpenChange={(o) => setOpenMenuId(o ? m.id : null)}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent",
                  openMenuId === m.id ? "block" : "hidden group-hover:block",
                )}
                aria-label={t("core.library.menuMore")}
              >
                <MoreHorizontal className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => togglePin(m)}>
                <Pin className="text-muted-foreground" />
                {t(m.pinned ? "core.library.unpin" : "core.library.pin")}
              </DropdownMenuItem>
              {m.isDefault ? (
                <DropdownMenuItem onClick={() => clearDefault(m)}>
                  <Star className="fill-current text-muted-foreground" />
                  {t("core.library.unsetDefault")}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => setDefault(m)}>
                  <Star className="text-muted-foreground" />
                  {t("core.library.setDefault")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => renameMount(m)}>
                <HardDrive className="text-muted-foreground" />
                {t("core.library.renameLib")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => revealMount(m)}>
                <ExternalLink className="text-muted-foreground" />
                {t("core.library.revealInExplorer")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => removeMount(m.id)}>
                <Trash2 />
                {t("core.library.unmount")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ))}
      {mounts.length === 0 && (
        <div className="flex items-center justify-between px-2 py-1">
          <p className="text-xs text-muted-foreground">{t("core.library.noSymlinks")}</p>
          <AddMountDialog onAdded={loadMounts} />
        </div>
      )}
      {mounts.length > 0 && (
        <div className="px-2 pt-0.5">
          <AddMountDialog
            onAdded={loadMounts}
            trigger={
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <Plus className="size-3.5" />
                {t("core.library.addSymlink")}
              </button>
            }
          />
        </div>
      )}
    </div>
  )
}
