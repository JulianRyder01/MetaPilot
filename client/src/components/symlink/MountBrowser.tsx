import { useCallback, useEffect, useState } from "react"
import { ChevronRight, FileText, Folder, Link2, Pencil, Plus, RefreshCw, Save, Trash2, X } from "lucide-react"
import { toast } from "@/lib/toast"

import type { SymlinkItem, SymlinkMount, SymlinkTree } from "@/lib/api"
import {
  symlinkDelete,
  symlinkMkdir,
  symlinkReadFile,
  symlinkTree,
  symlinkWriteFile,
} from "@/plugins/symlink/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { MarkdownBlock } from "@/components/learn/blocks/MarkdownBlock"

function joinPath(base: string, name: string) {
  return base ? `${base}/${name}` : name
}

/** 软链接来源的文档图标：文件图标带 Link2 角标，标识来自软链接插件。 */
function SoftLinkFileIcon() {
  return (
    <span className="relative inline-flex shrink-0">
      <FileText className="size-4 text-muted-foreground" />
      <Link2 className="absolute -bottom-1 -right-1.5 size-2.5 rounded-full bg-background text-primary" />
    </span>
  )
}

function fmtSize(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function baseName(p: string) {
  return p.split(/[\\/]/).filter(Boolean).pop() ?? p
}

/**
 * 软链接文件浏览器核心：面包屑 + 目录/文件列表 + 预览/编辑。
 * 内嵌于「我的库」右侧（选中挂载时）或独立文件浏览器页。
 */
export function MountBrowser({ mount }: { mount: SymlinkMount }) {
  const [path, setPath] = useState("")
  const [tree, setTree] = useState<SymlinkTree | null>(null)
  const [file, setFile] = useState<{ path: string; content: string } | null>(null)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState("")

  const loadTree = useCallback(
    async (p: string) => {
      if (!mount) return
      setFile(null)
      setEditing(false)
      setPath(p)
      setTree(await symlinkTree(mount.id, p))
    },
    [mount],
  )

  useEffect(() => {
    loadTree("")
  }, [loadTree])

  async function openItem(item: SymlinkItem) {
    // 挂载根是单个文件时：列表里只有该文件自身，读取用空路径（= 根文件）
    const p = mount.type === "file" ? "" : joinPath(path, item.name)
    if (item.type === "dir" && mount.type !== "file") {
      await loadTree(p)
    } else {
      try {
        const f = await symlinkReadFile(mount.id, p)
        setFile(f)
        setEditing(false)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "读取失败")
      }
    }
  }

  async function saveFile() {
    if (!file) return
    try {
      await symlinkWriteFile(mount.id, file.path, editContent)
      setFile({ ...file, content: editContent })
      setEditing(false)
      toast.success("已保存")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败")
    }
  }

  async function createFolder() {
    const name = window.prompt("新建文件夹名称：")
    if (!name?.trim()) return
    try {
      await symlinkMkdir(mount.id, joinPath(path, name.trim()))
      await loadTree(path)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "创建失败")
    }
  }

  async function removeItem(item: SymlinkItem) {
    const target = joinPath(path, item.name)
    if (!window.confirm(`删除「${target}」？${item.type === "dir" ? "文件夹将递归删除，不可恢复。" : ""}`)) return
    try {
      await symlinkDelete(mount.id, target)
      await loadTree(path)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败")
    }
  }

  const crumbs = path ? path.split("/").filter(Boolean) : []

  return (
    <div className="min-w-0">
      {/* 面包屑 + 操作 */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <button onClick={() => loadTree("")} className="flex items-center gap-1 font-medium text-primary hover:underline">
          <Link2 className="size-3.5" />
          {mount.name}
        </button>
        {mount.type === "file" && <Badge variant="outline">单文件</Badge>}
        {crumbs.map((c, i) => {
          const target = crumbs.slice(0, i + 1).join("/")
          return (
            <span key={i} className="flex items-center gap-1">
              <ChevronRight className="size-3.5 text-muted-foreground" />
              <button onClick={() => loadTree(target)} className="hover:underline">
                {c}
              </button>
            </span>
          )
        })}
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => loadTree(path)}>
            <RefreshCw className="size-3.5" />
          </Button>
          {mount.type !== "file" && (
            <Button variant="outline" size="sm" onClick={createFolder}>
              <Plus className="size-3.5" />
              新建文件夹
            </Button>
          )}
        </div>
      </div>

      {/* 文件列表 */}
      <ScrollArea className="h-[calc(100vh-300px)]">
        <div className="rounded-lg border">
          {(tree?.items ?? []).map((item) => (
            <div
              key={item.name}
              className="group flex items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0 hover:bg-accent/40"
            >
              <button onClick={() => openItem(item)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                {item.type === "dir" ? (
                  <Folder className="size-4 shrink-0 text-primary" />
                ) : (
                  <SoftLinkFileIcon />
                )}
                <span className="truncate">{item.name}</span>
                {item.type === "file" && (
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">{fmtSize(item.size)}</span>
                )}
              </button>
              {mount.type !== "file" && (
                <button
                  onClick={() => removeItem(item)}
                  className="text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                  title="删除"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          ))}
          {tree && tree.items.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              {mount.type === "file" ? "（单文件挂载）" : "空目录"}
            </p>
          )}
        </div>
      </ScrollArea>

      {/* 文件预览 / 编辑 */}
      {file && (
        <div className="mt-4 rounded-lg border">
          <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
            <span className="text-sm font-medium">
              {file.path || (mount.type === "file" ? baseName(mount.root) : "")}
            </span>
            <div className="flex items-center gap-1">
              {file.path.endsWith(".md") || file.path.endsWith(".markdown") ? (
                <Badge variant="outline">Markdown</Badge>
              ) : null}
              {editing ? (
                <>
                  <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
                    <X className="size-3.5" />
                    取消
                  </Button>
                  <Button size="sm" onClick={saveFile}>
                    <Save className="size-3.5" />
                    保存
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditContent(file.content)
                    setEditing(true)
                  }}
                >
                  <Pencil className="size-3.5" />
                  编辑
                </Button>
              )}
            </div>
          </div>
          {editing ? (
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="min-h-72 rounded-none border-0 font-mono text-sm focus-visible:ring-0"
            />
          ) : file.path.endsWith(".md") || file.path.endsWith(".markdown") ? (
            <div className="p-4">
              <MarkdownBlock content={file.content} />
            </div>
          ) : (
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap p-4 text-xs">{file.content}</pre>
          )}
        </div>
      )}
    </div>
  )
}
