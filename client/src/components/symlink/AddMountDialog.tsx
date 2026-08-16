import { useState } from "react"
import { FolderOpen, HardDrive, Link2, Plus } from "lucide-react"
import { toast } from "@/lib/toast"

import { useT } from "@/i18n"
import { symlinkAddMount } from "@/plugins/symlink/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { FsPicker } from "@/components/symlink/FsPicker"

/** 添加软链接挂载对话框（我的库 / 文件浏览器共用）。
 *
 * 链接的是本机磁盘上的文件夹或单个文件（不复制原文件），
 * 链接后可在文件浏览器中像文档一样浏览、阅读与编辑。
 * trigger 可自定义触发元素（默认「添加」按钮）。
 */
export function AddMountDialog({ onAdded, trigger }: { onAdded: () => void; trigger?: React.ReactNode }) {
  const t = useT()
  const [name, setName] = useState("")
  const [root, setRoot] = useState("")
  const [pickerOpen, setPickerOpen] = useState(false)
  const [open, setOpen] = useState(false)

  async function add() {
    if (!name.trim() || !root.trim()) return
    try {
      await symlinkAddMount(name.trim(), root.trim())
      toast.success(t("symlink.mountSuccess"))
      setName("")
      setRoot("")
      setPickerOpen(false)
      setOpen(false)
      onAdded()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("symlink.mountFailed"))
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <Plus className="size-4" />
            {t("common.add")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="size-4 text-primary" />
            {t("symlink.linkLocalDoc")}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            {t("symlink.addMountDesc1")}
            <strong>{t("symlink.folder")}</strong>
            {t("symlink.addMountDesc2")}
            <strong>{t("symlink.singleFile")}</strong>
            {t("symlink.addMountDesc3")}
          </p>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t("symlink.displayName")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("symlink.namePlaceholder")} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("symlink.localPathLabel")}</Label>
            <div className="flex gap-2">
              <Input
                value={root}
                onChange={(e) => setRoot(e.target.value)}
                placeholder={t("symlink.pathPlaceholder")}
                className="flex-1"
              />
              <Button
                variant="outline"
                type="button"
                onClick={() => setPickerOpen((v) => !v)}
                className="shrink-0"
              >
                <FolderOpen className="size-4" />
                {pickerOpen ? t("symlink.collapse") : t("symlink.browse")}
              </Button>
            </div>
            {pickerOpen && (
              <FsPicker
                onPick={(p) => {
                  setRoot(p)
                  setPickerOpen(false)
                }}
              />
            )}
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <HardDrive className="size-3.5" />
            {t("symlink.afterMountHint")}
          </p>
        </div>
        <DialogFooter>
          <Button onClick={add} disabled={!name.trim() || !root.trim()}>
            {t("symlink.mount")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
