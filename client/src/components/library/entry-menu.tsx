/**
 * 「我的库」集合/文档统一操作：右键菜单、批量选择模式与移动弹窗。
 *
 * 自然卡片视图（LibraryHome）与文件管理器视图（LibraryManagerView）共用：
 * - OpItem：可操作对象统一模型（顶层集合/嵌套文件夹/文档）
 * - buildBulkRefs()：按类型分组为后端 /api/bulk/* 的请求体
 * - EntryContextMenu：右键菜单（打开/重命名/创建副本/移动到/删除）
 * - MoveDialog：移动到弹窗（先选目标库，再选目标顶层文件夹；顶层集合整体换库）
 * - useBulkOps：复制/移动/删除/重命名/打开的公共逻辑
 */
import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Copy, ExternalLink, FolderInput, Pencil, Trash2 } from "lucide-react"
import { createPortal } from "react-dom"

import { useT } from "@/i18n"
import { toast } from "@/lib/toast"
import { api, type LibraryMeta } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useDialogs } from "@/components/ui/dialog-provider"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

/** 可操作对象（右键菜单 / 批量选择统一模型） */
export interface OpItem {
  id: string
  name: string
  type: "top" | "sub" | "doc"
  /** top 的 kind / doc 的 docType */
  kind?: string
  /** 打开链接（top=内容页、doc=所属顶层集合内容页；sub 无） */
  href?: string
  /** 所在库 id */
  libraryId: string
}

/** 把操作对象按类型分组为批量请求体（与后端 /api/bulk/* 对应） */
export function buildBulkRefs(items: OpItem[]): {
  topFolderIds: string[]
  subFolderIds: string[]
  documentIds: string[]
} {
  return {
    topFolderIds: items.filter((i) => i.type === "top").map((i) => i.id),
    subFolderIds: items.filter((i) => i.type === "sub").map((i) => i.id),
    documentIds: items.filter((i) => i.type === "doc").map((i) => i.id),
  }
}

// ---------------- 右键菜单 ----------------

export interface MenuItemEntry {
  label: string
  icon?: React.ReactNode
  danger?: boolean
  onClick: () => void
}

/** 固定定位右键菜单（样式与软链接浏览器菜单一致）。 */
export function EntryContextMenu({
  x,
  y,
  title,
  items,
  onClose,
}: {
  x: number
  y: number
  title?: string
  items: MenuItemEntry[]
  onClose: () => void
}) {
  useEffect(() => {
    if (!items || items.length === 0) return
    const close = () => onClose()
    window.addEventListener("click", close)
    window.addEventListener("blur", close)
    window.addEventListener("keydown", close)
    window.addEventListener("resize", close)
    return () => {
      window.removeEventListener("click", close)
      window.removeEventListener("blur", close)
      window.removeEventListener("keydown", close)
      window.removeEventListener("resize", close)
    }
  }, [items, onClose])

  if (items.length === 0) return null
  return createPortal(
    <div
      className="bg-popover text-popover-foreground z-50 min-w-[13rem] rounded-md border p-1 shadow-md"
      style={{
        position: "fixed",
        left: Math.min(x, window.innerWidth - 220),
        top: Math.min(y, window.innerHeight - 200),
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {title && <p className="px-2 py-1.5 text-xs text-muted-foreground">{title}</p>}
      {items.map((it, idx) => (
        <button
          key={idx}
          className={cn(
            "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground",
            it.danger && "text-destructive hover:bg-destructive/10 hover:text-destructive",
          )}
          onClick={it.onClick}
        >
          {it.icon}
          {it.label}
        </button>
      ))}
    </div>,
    document.body,
  )
}

// ---------------- 移动到弹窗 ----------------

const ROOT_VALUE = "__root__"

/**
 * 移动到弹窗：目标库 + 目标顶层文件夹（根 / 任意顶层集合）。
 * requireFolder=false（纯顶层集合）时只选目标库（整体换库）；否则需选目标文件夹（文档/嵌套文件夹）。
 */
export function MoveDialog({
  open,
  onClose,
  excludeLibraryIds = [],
  requireFolder,
  onSubmit,
}: {
  open: boolean
  onClose: () => void
  /** 需要排除的源库 id（纯顶层集合移动时禁止选回源库） */
  excludeLibraryIds?: string[]
  /** 文档/嵌套文件夹移动时需选择目标顶层文件夹 */
  requireFolder: boolean
  onSubmit: (target: { libraryId: string; folderId: string }) => void | Promise<void>
}) {
  const t = useT()
  const [libraries, setLibraries] = useState<LibraryMeta[]>([])
  const [libId, setLibId] = useState("")
  const [folderId, setFolderId] = useState(ROOT_VALUE)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setLibId("")
    setFolderId(ROOT_VALUE)
    api
      .listLibraries()
      .then(setLibraries)
      .catch(() => {})
  }, [open])

  const candidates = useMemo(
    () => libraries.filter((l) => !excludeLibraryIds.includes(l.id)),
    [libraries, excludeLibraryIds],
  )
  const targetFolders = useMemo(
    () => libraries.find((l) => l.id === libId)?.folders ?? [],
    [libraries, libId],
  )
  const canSubmit = Boolean(libId) && (!requireFolder || folderId !== "")

  async function submit() {
    if (!libId || !canSubmit) return
    setBusy(true)
    try {
      await onSubmit({ libraryId: libId, folderId: folderId === ROOT_VALUE ? "" : folderId })
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("core.library.moveTitle")}</DialogTitle>
          <DialogDescription>{t("core.library.moveDesc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t("core.library.targetLibrary")}</Label>
            <Select value={libId} onValueChange={(v) => { setLibId(v); setFolderId(ROOT_VALUE) }}>
              <SelectTrigger>
                <SelectValue placeholder={t("core.dialog.selectPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {candidates.length === 0 && (
                  <SelectItem value="__none__" disabled>
                    {t("core.library.nothingSelected")}
                  </SelectItem>
                )}
                {candidates.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {requireFolder && (
            <div className="space-y-1.5">
              <Label>{t("core.library.targetFolder")}</Label>
              <Select value={folderId} onValueChange={setFolderId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ROOT_VALUE}>{t("core.library.libRoot")}</SelectItem>
                  {targetFolders.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void submit()} disabled={!canSubmit || busy}>
            {t("common.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------- 公共操作逻辑 ----------------

export interface BulkOpsDeps {
  onDone: () => void | Promise<void>
}

/** 打开 / 重命名 / 创建副本 / 移动到 / 删除 的公共实现（右键菜单与批量选择共用）。 */
export function useBulkOps(deps: BulkOpsDeps) {
  const t = useT()
  const navigate = useNavigate()
  const { confirm, prompt } = useDialogs()
  const [moveTarget, setMoveTarget] = useState<{
    items: OpItem[]
    excludeLibraryIds: string[]
    requireFolder: boolean
  } | null>(null)

  const open = (item: OpItem) => {
    if (item.href) navigate(item.href)
  }

  /** 重命名：顶层集合/嵌套文件夹走 updateFolder；文档走 updateDocument（保留 docType） */
  const rename = async (item: OpItem) => {
    const name = await prompt({
      title: t("core.library.renameTitle"),
      initialValue: item.name,
      placeholder: t("core.library.namePlaceholder"),
    })
    if (name == null || !name.trim() || name.trim() === item.name) return
    if (item.type === "doc") {
      await api.updateDocument(item.id, { name: name.trim(), docType: item.kind ?? "study" })
    } else {
      await api.updateFolder(item.id, { name: name.trim() })
    }
    toast.success(t("core.library.renamed"))
    await deps.onDone()
  }

  const duplicate = async (items: OpItem[]) => {
    const res = await api.bulkDuplicate(buildBulkRefs(items), t("core.library.suffix"))
    if (res.copied > 0) {
      toast.success(t("core.library.duplicated"))
      await deps.onDone()
    }
  }

  const remove = async (items: OpItem[]) => {
    const ok = await confirm({
      title: t("core.library.deleteItemTitle"),
      description: t("core.library.deleteItemDesc", { count: items.length }),
      confirmText: t("common.delete"),
      destructive: true,
    })
    if (!ok) return
    const res = await api.bulkDelete(buildBulkRefs(items))
    if (res.deleted > 0) {
      toast.success(t("core.library.deletedLib"))
      await deps.onDone()
    }
  }

  const move = (items: OpItem[]) => {
    const requireFolder = items.some((i) => i.type !== "top")
    const excludeLibraryIds = [...new Set(items.filter((i) => i.type === "top").map((i) => i.libraryId))]
    setMoveTarget({ items, requireFolder, excludeLibraryIds })
  }

  const submitMove = async (target: { libraryId: string; folderId: string }) => {
    if (!moveTarget) return
    await api.bulkMove(buildBulkRefs(moveTarget.items), {
      targetLibraryId: target.libraryId,
      targetFolderId: target.folderId || undefined,
      targetParentId: "",
    })
    toast.success(t("core.library.moved"))
    setMoveTarget(null)
    await deps.onDone()
  }

  return { open, rename, duplicate, remove, move, moveTarget, setMoveTarget, submitMove }
}

/** 右键菜单项（按对象类型组装；sub 无「打开」项） */
export function contextMenuItems(item: OpItem, ops: ReturnType<typeof useBulkOps>, t: ReturnType<typeof useT>): MenuItemEntry[] {
  const items: MenuItemEntry[] = []
  if (item.href && item.type !== "sub") {
    items.push({ label: t("core.library.openItem"), icon: <ExternalLink className="size-3.5" />, onClick: () => ops.open(item) })
  }
  items.push({ label: t("core.library.renameTitle"), icon: <Pencil className="size-3.5" />, onClick: () => void ops.rename(item) })
  items.push({ label: t("core.library.duplicate"), icon: <Copy className="size-3.5" />, onClick: () => void ops.duplicate([item]) })
  items.push({ label: t("core.library.move"), icon: <FolderInput className="size-3.5" />, onClick: () => ops.move([item]) })
  items.push({ label: t("common.delete"), icon: <Trash2 className="size-3.5" />, danger: true, onClick: () => void ops.remove([item]) })
  return items
}