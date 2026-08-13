import { useCallback, useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { BookOpen, FileText, GraduationCap, HardDrive, Link2, Plus, Trash2 } from "lucide-react"
import { toast } from "@/lib/toast"

import { api, type LibraryMeta, type SymlinkMount } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useAppStore } from "@/stores/app"
import { usePluginEnabled } from "@/stores/plugins"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { ImportDialog } from "@/components/library/ImportDialog"
import { AddMountDialog } from "@/components/symlink/AddMountDialog"

const KIND_META: Record<string, { label: string; icon: typeof BookOpen }> = {
  course: { label: "课程", icon: GraduationCap },
  note: { label: "笔记", icon: FileText },
  kb: { label: "知识库", icon: BookOpen },
}

export default function LibraryHome() {
  const navigate = useNavigate()
  const [libraries, setLibraries] = useState<LibraryMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [mounts, setMounts] = useState<SymlinkMount[]>([])
  const { currentLibraryId, setCurrentLibraryId } = useAppStore()
  const symlinkEnabled = usePluginEnabled("symlink")

  const refresh = useCallback(async () => {
    const list = await api.listLibraries()
    setLibraries(list)
    const { currentLibraryId: cur } = useAppStore.getState()
    if (!cur) setCurrentLibraryId(list[0]?.id ?? null)
  }, [setCurrentLibraryId])

  const loadMounts = useCallback(async () => {
    if (!symlinkEnabled) {
      setMounts([])
      return
    }
    try {
      setMounts(await api.symlinkMounts())
    } catch {
      setMounts([])
    }
  }, [symlinkEnabled])

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [refresh])

  useEffect(() => {
    loadMounts()
  }, [loadMounts])

  async function handleDelete(id: string) {
    if (!window.confirm("确定删除该库？其下所有内容将一并删除。")) return
    await api.deleteLibrary(id)
    toast.success("已删除库")
    refresh()
  }

  async function removeMount(id: string) {
    if (!window.confirm("卸载该软链接？不会删除磁盘上的文件。")) return
    await api.symlinkRemoveMount(id)
    toast.success("已卸载")
    loadMounts()
  }

  const current = libraries.find((l) => l.id === currentLibraryId)

  return (
    <div className="mx-auto flex max-w-6xl gap-6 px-4 py-6 sm:px-6">
      {/* 左侧：库列表 */}
      <aside className="w-56 shrink-0">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">库</h2>
          <div className="flex items-center gap-1">
            <ImportDialog onImported={refresh} />
            <NewLibraryDialog onCreated={refresh} />
          </div>
        </div>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : (
          <div className="space-y-1">
            {libraries.map((lib) => (
              <button
                key={lib.id}
                onClick={() => setCurrentLibraryId(lib.id)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors",
                  lib.id === currentLibraryId
                    ? "bg-accent font-medium text-accent-foreground"
                    : "hover:bg-accent/60",
                )}
              >
                <span className="truncate">{lib.name}</span>
                <span className="text-xs text-muted-foreground">{lib.collectionCount}</span>
              </button>
            ))}
            {libraries.length === 0 && (
              <p className="px-2 text-sm text-muted-foreground">
                暂无库。点击右上角导入课程包，或新建一个库。
              </p>
            )}
          </div>
        )}

        {/* 软链接分区：集成自「软链接」插件；插件禁用时整区隐藏 */}
        {symlinkEnabled && (
          <div className="mt-6 border-t pt-3">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                <Link2 className="size-3.5" />
                软链接
                <Badge variant="outline" className="text-[10px]">插件</Badge>
              </h2>
              <AddMountDialog onAdded={loadMounts} />
            </div>
            <div className="space-y-1">
              {mounts.map((m) => (
                <div key={m.id} className="group flex items-center gap-1.5 rounded-md px-2 py-1.5 hover:bg-accent/60">
                  <button
                    onClick={() => navigate(`/files?mount=${m.id}`)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
                    title={`${m.name} → ${m.root}`}
                  >
                    <HardDrive className="size-3.5 shrink-0 text-primary" />
                    <Link2 className="size-3 shrink-0 text-muted-foreground/60" />
                    <span className="truncate">{m.name}</span>
                  </button>
                  <button
                    onClick={() => removeMount(m.id)}
                    className="text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                    title="卸载软链接"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
              {mounts.length === 0 && (
                <p className="px-2 text-xs text-muted-foreground">
                  暂无软链接，点击右侧添加本机目录
                </p>
              )}
            </div>
          </div>
        )}
      </aside>

      {/* 右侧：文档集列表 */}
      <section className="min-w-0 flex-1">
        <div className="mb-4 flex items-baseline justify-between">
          <div>
            <h1 className="text-xl font-semibold">{current?.name ?? "我的库"}</h1>
            <p className="text-sm text-muted-foreground">{current?.description}</p>
          </div>
          {current && (
            <div className="flex items-center gap-2">
              <Badge variant="outline">{current.collectionCount} 个文档集</Badge>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDelete(current.id)}
                className="text-muted-foreground"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          )}
        </div>

        {current ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {current.collections.map((col) => {
              const meta = KIND_META[col.kind] ?? KIND_META.course
              const Icon = meta.icon
              return (
                <Link key={col.id} to={`/course/${col.id}`}>
                  <Card className="h-full transition-shadow hover:shadow-md">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Icon className="size-4 text-primary" />
                        <span className="truncate">{col.name}</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex items-center justify-between text-sm text-muted-foreground">
                      <Badge variant="secondary">{meta.label}</Badge>
                      <span>{col.kind === "course" ? "章节" : "文档"}</span>
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
            {current.collections.length === 0 && (
              <p className="text-sm text-muted-foreground">
                此库还没有文档集，可以导入课程包或新建。
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">选择一个库查看内容。</p>
        )}
      </section>
    </div>
  )
}

function NewLibraryDialog({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [open, setOpen] = useState(false)

  async function create() {
    if (!name.trim()) return
    await api.createLibrary(name.trim(), description.trim())
    toast.success("已创建库")
    setName("")
    setDescription("")
    setOpen(false)
    onCreated()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="size-4" />
          新建
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建库</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>名称</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：专业课" />
          </div>
          <div className="space-y-1.5">
            <Label>描述（可选）</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="这个库里放什么" />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={create} disabled={!name.trim()}>创建</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
