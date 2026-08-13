import { useState } from "react"
import { HardDrive, Plus } from "lucide-react"
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

/** 添加软链接挂载对话框（我的库 / 文件浏览器共用）。 */
export function AddMountDialog({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState("")
  const [root, setRoot] = useState("")
  const [open, setOpen] = useState(false)

  async function add() {
    if (!name.trim() || !root.trim()) return
    try {
      await api.symlinkAddMount(name.trim(), root.trim())
      toast.success("挂载成功")
      setName("")
      setRoot("")
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
          <DialogTitle>挂载本机目录（软链接）</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>显示名称</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：我的笔记" />
          </div>
          <div className="space-y-1.5">
            <Label>目录路径（Windows/Linux 均支持）</Label>
            <Input
              value={root}
              onChange={(e) => setRoot(e.target.value)}
              placeholder={'例如：D:/Documents/notes 或 /home/user/notes'}
            />
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
