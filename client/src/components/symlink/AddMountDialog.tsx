import { useState } from "react"
import { FolderOpen, HardDrive, Link2, Plus } from "lucide-react"
import { toast } from "@/lib/toast"

import { api } from "@/lib/api"
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
 */
export function AddMountDialog({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState("")
  const [root, setRoot] = useState("")
  const [pickerOpen, setPickerOpen] = useState(false)
  const [open, setOpen] = useState(false)

  async function add() {
    if (!name.trim() || !root.trim()) return
    try {
      await api.symlinkAddMount(name.trim(), root.trim())
      toast.success("挂载成功")
      setName("")
      setRoot("")
      setPickerOpen(false)
      setOpen(false)
      onAdded()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "挂载失败")
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="size-4" />
          添加
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="size-4 text-primary" />
            链接本地文档（软链接）
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            链接的是本机磁盘上的<strong>文件夹</strong>或<strong>单个文件</strong>，不会复制或移动原文件；
            链接后可在文件浏览器中像文档一样浏览、阅读与编辑。
          </p>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>显示名称</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：我的笔记" />
          </div>
          <div className="space-y-1.5">
            <Label>本地路径（文件夹或文件）</Label>
            <div className="flex gap-2">
              <Input
                value={root}
                onChange={(e) => setRoot(e.target.value)}
                placeholder="点击「浏览」选择，或手动输入（Windows/Linux 均支持）"
                className="flex-1"
              />
              <Button
                variant="outline"
                type="button"
                onClick={() => setPickerOpen((v) => !v)}
                className="shrink-0"
              >
                <FolderOpen className="size-4" />
                {pickerOpen ? "收起" : "浏览"}
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
            挂载后可在文件浏览器中浏览、阅读与编辑目录内的文本文件（权限限制在挂载根内）。
          </p>
        </div>
        <DialogFooter>
          <Button onClick={add} disabled={!name.trim() || !root.trim()}>
            挂载
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
