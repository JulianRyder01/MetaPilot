import { useCallback, useEffect, useState } from "react"
import { ArrowUp, FileText, Folder, Loader2 } from "lucide-react"
import { toast } from "@/lib/toast"

import { useT } from "@/i18n"
import { type SymlinkFsItem } from "@/lib/api"
import { symlinkFsList, symlinkFsRoots } from "@/plugins/symlink/api"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

function fmtSize(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

/**
 * 本机文件系统选择器：从盘符/根目录（「我的电脑」）逐级浏览，
 * 单击选中、双击打开文件夹，最终把文件夹或文件的绝对路径交还给调用方。
 */
export function FsPicker({ onPick }: { onPick: (path: string) => void }) {
  const t = useT()
  const [current, setCurrent] = useState<string | null>(null) // null = 我的电脑（盘符/根目录）
  const [parentPath, setParentPath] = useState<string | null>(null)
  const [items, setItems] = useState<SymlinkFsItem[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<SymlinkFsItem | null>(null)

  const load = useCallback(async (path: string | null) => {
    setLoading(true)
    setSelected(null)
    try {
      if (path === null) {
        const roots = await symlinkFsRoots()
        setItems(roots.map((r) => ({ name: r, type: "dir", size: 0, mtime: 0, path: r })))
        setParentPath(null)
        setCurrent(null)
      } else {
        const lst = await symlinkFsList(path)
        setItems(lst.items)
        setParentPath(lst.parent)
        setCurrent(lst.path)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("symlink.readFailed"))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    load(null)
  }, [load])

  async function goUp() {
    if (current === null) return
    // 在盘符/根目录（parent 等于自身）时返回「我的电脑」
    await load(parentPath && parentPath !== current ? parentPath : null)
  }

  return (
    <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
      {/* 顶部：当前路径 + 上一级 */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={goUp} disabled={current === null}>
          <ArrowUp className="size-3.5" />
          {t("symlink.goUp")}
        </Button>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground" title={current ?? ""}>
          {current ?? t("symlink.myComputer")}
        </span>
      </div>

      {/* 文件列表 */}
      <ScrollArea className="h-52">
        {loading ? (
          <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            {t("symlink.reading")}
          </div>
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">{t("symlink.emptyFolder")}</p>
        ) : (
          <div className="space-y-0.5">
            {items.map((item) => (
              <button
                key={item.path}
                onClick={() => setSelected(item)}
                onDoubleClick={() => item.type === "dir" && load(item.path)}
                className={cn(
                  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent/60",
                  selected?.path === item.path && "bg-accent",
                )}
                title={item.path}
              >
                {item.type === "dir" ? (
                  <Folder className="size-4 shrink-0 text-primary" />
                ) : (
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span className="truncate">{item.name}</span>
                {item.type === "file" && (
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">{fmtSize(item.size)}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* 底部：选中项 + 确认 */}
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={selected?.path}>
          {selected
            ? t(selected.type === "dir" ? "symlink.selectedFolder" : "symlink.selectedFile", { path: selected.path })
            : t("symlink.selectHint")}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {selected?.type === "dir" && (
            <Button size="sm" variant="outline" onClick={() => load(selected.path)}>
              {t("common.open")}
            </Button>
          )}
          <Button size="sm" disabled={!selected} onClick={() => selected && onPick(selected.path)}>
            {selected?.type === "dir" ? t("symlink.selectThisFolder") : t("symlink.selectThisFile")}
          </Button>
        </div>
      </div>
    </div>
  )
}
