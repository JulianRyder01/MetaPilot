import { useCallback, useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import {
  BookOpen,
  ChevronDown,
  FilePlus2,
  FileText,
  Folder as FolderIcon,
  FolderPlus,
  ListPlus,
  Pencil,
  Plus,
  SquareStack,
  Trash2,
} from "lucide-react"
import { toast } from "@/lib/toast"

import { useT } from "@/i18n"
import { api, type Document, type Folder, type FolderKindMeta } from "@/lib/api"
import { cn } from "@/lib/utils"
import { buildFolderTree, folderPath, type FolderNode } from "@/lib/tree"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { BLOCK_TYPES, BlockForm } from "@/components/edit/BlockForm"
import { useDialogs } from "@/components/ui/dialog-provider"

type Selection =
  | { kind: "folder" }
  | { kind: "doc"; id: string }
  | { kind: "section"; id: string }
  | { kind: "block"; id: string }

const BLOCK_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  BLOCK_TYPES.map((b) => [b.value, b.label]),
)

export default function EditPage() {
  const { confirm, prompt } = useDialogs()
  const t = useT()
  const { cid } = useParams()
  const navigate = useNavigate()
  const [col, setCol] = useState<Folder | null>(null)
  const [sel, setSel] = useState<Selection>({ kind: "folder" })
  const [newBlockType, setNewBlockType] = useState("markdown")
  const [dirty, setDirty] = useState(false)
  // 文件夹类型元数据（核心 + 插件声明）：kind 下拉动态渲染，不写死插件 kind
  const [kindMeta, setKindMeta] = useState<Record<string, FolderKindMeta>>({})

  const load = useCallback(async () => {
    if (cid) setCol(await api.getFolder(cid))
  }, [cid])

  useEffect(() => {
    load()
    api.listFolderKinds().then(setKindMeta).catch(() => {})
  }, [load])

  if (!col) {
    return <p className="px-6 py-10 text-sm text-muted-foreground">{t("common.loading")}</p>
  }

  async function saveCollection(patch: Partial<Folder>) {
    if (!col) return
    await api.updateFolder(col.id, patch)
    setCol((c) => (c ? { ...c, ...patch } : c))
    setDirty(true)
  }

  async function addDocument() {
    if (!col) return
    const doc = await api.createDocument(col.id, { name: t("core.edit.newDocName"), docType: "study" })
    setCol((c) => (c ? { ...c, documents: [...c.documents, doc] } : c))
    setSel({ kind: "doc", id: doc.id })
    setDirty(true)
  }

  async function addSection(docId: string) {
    if (!col) return
    const sec = await api.createSection(docId, { name: t("core.edit.newSectionName") })
    setCol((c) =>
      c
        ? {
            ...c,
            documents: c.documents.map((d) =>
              d.id === docId ? { ...d, sections: [...d.sections, sec] } : d,
            ),
          }
        : c,
    )
    setSel({ kind: "section", id: sec.id })
    setDirty(true)
  }

  async function addBlock(sectionId: string) {
    const block = await api.addBlock(sectionId, { type: newBlockType } as Record<string, unknown>)
    setCol((c) =>
      c
        ? {
            ...c,
            documents: c.documents.map((d) => ({
              ...d,
              sections: d.sections.map((s) =>
                s.id === sectionId ? { ...s, blocks: [...s.blocks, block] } : s,
              ),
            })),
          }
        : c,
    )
    setSel({ kind: "block", id: block.id })
    setDirty(true)
  }

  async function removeDoc(docId: string) {
    const ok = await confirm({
      title: t("core.edit.deleteDocTitle"),
      description: t("core.edit.deleteDocDesc"),
      confirmText: t("common.delete"),
      destructive: true,
    })
    if (!ok) return
    await api.deleteDocument(docId)
    setCol((c) => (c ? { ...c, documents: c.documents.filter((d) => d.id !== docId) } : c))
    setSel({ kind: "folder" })
    setDirty(true)
  }

  async function removeSection(sectionId: string) {
    const ok = await confirm({
      title: t("core.edit.deleteSectionTitle"),
      description: t("core.edit.deleteSectionDesc"),
      confirmText: t("common.delete"),
      destructive: true,
    })
    if (!ok) return
    await api.deleteSection(sectionId)
    setCol((c) =>
      c
        ? {
            ...c,
            documents: c.documents.map((d) => ({
              ...d,
              sections: d.sections.filter((s) => s.id !== sectionId),
            })),
          }
        : c,
    )
    setSel({ kind: "folder" })
    setDirty(true)
  }

  async function removeBlock(blockId: string) {
    const ok = await confirm({
      title: t("core.edit.deleteBlockTitle"),
      description: t("core.edit.deleteBlockDesc"),
      confirmText: t("common.delete"),
      destructive: true,
    })
    if (!ok) return
    await api.deleteBlock(blockId)
    setCol((c) =>
      c
        ? {
            ...c,
            documents: c.documents.map((d) => ({
              ...d,
              sections: d.sections.map((s) => ({
                ...s,
                blocks: s.blocks.filter((b) => b.id !== blockId),
              })),
            })),
          }
        : c,
    )
    setSel({ kind: "folder" })
    setDirty(true)
  }

  function findSection(sectionId: string) {
    if (!col) return null
    for (const d of col.documents) {
      const s = d.sections.find((x) => x.id === sectionId)
      if (s) return { doc: d, section: s }
    }
    return null
  }

  function findBlock(blockId: string) {
    if (!col) return null
    for (const d of col.documents) {
      for (const s of d.sections) {
        const b = s.blocks.find((x) => x.id === blockId)
        if (b) return { doc: d, section: s, block: b }
      }
    }
    return null
  }

  // ---- 文件夹操作 ----

  async function createFolderIn(parentId: string) {
    if (!col) return
    const name = await prompt({
      title: t("core.edit.newFolderTitle"),
      description: t("core.edit.newFolderDesc"),
      placeholder: t("core.edit.newFolderPlaceholder"),
      confirmText: t("common.create"),
    })
    if (!name?.trim()) return
    try {
      await api.createSubFolder(col.id, { name: name.trim(), parentId: parentId || undefined })
      await load()
      setDirty(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("core.edit.createFailed"))
    }
  }

  async function renameFolder(fid: string) {
    const folder = col?.folders.find((f) => f.id === fid)
    if (!folder) return
    const name = await prompt({
      title: t("core.edit.renameFolderTitle"),
      initialValue: folder.name,
      confirmText: t("common.rename"),
    })
    if (!name?.trim() || name.trim() === folder.name) return
    try {
      await api.updateFolder(fid, { name: name.trim() })
      await load()
      setDirty(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("core.edit.renameFailed"))
    }
  }

  async function removeFolder(fid: string) {
    const ok = await confirm({
      title: t("core.edit.deleteFolderTitle"),
      description: t("core.edit.deleteFolderDesc"),
      confirmText: t("common.delete"),
      destructive: true,
    })
    if (!ok) return
    try {
      await api.deleteFolder(fid)
      await load()
      setSel({ kind: "folder" })
      setDirty(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("core.edit.deleteFailed"))
    }
  }

  async function moveDoc(docId: string, folderId: string) {
    const doc = col?.documents.find((d) => d.id === docId)
    if (!col || !doc) return
    try {
      await api.updateDocument(docId, { name: doc.name, docType: doc.docType, folderId })
      await load()
      setDirty(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("core.edit.moveFailed"))
    }
  }

  // 右侧编辑内容
  let editor: React.ReactNode = null
  if (sel.kind === "folder") {
    editor = (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">{t("core.edit.collectionInfo")}</h3>
        <div className="space-y-1.5">
          <Label>{t("common.name")}</Label>
          <Input value={col.name} onChange={(e) => saveCollection({ name: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("core.edit.summary")}</Label>
          <Textarea rows={3} value={col.description ?? ""} onChange={(e) => saveCollection({ description: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>{t("common.author")}</Label>
            <Input value={col.author ?? ""} onChange={(e) => saveCollection({ author: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("common.version")}</Label>
            <Input value={col.version ?? ""} onChange={(e) => saveCollection({ version: e.target.value })} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>{t("common.type")}</Label>
          <Select value={col.kind} onValueChange={(v) => saveCollection({ kind: v })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {/* 文档类类型动态渲染（kind 注册表，排除画布）：核心类型 + 插件声明的类型，不写死 */}
              {Object.entries(kindMeta)
                .filter(([k]) => k !== "canvas")
                .map(([k, meta]) => (
                  <SelectItem key={k} value={k}>
                    {t(meta.labelKey ?? k)}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    )
  } else if (sel.kind === "doc") {
    const doc = col.documents.find((d) => d.id === sel.id)
    if (doc) {
      editor = (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">{t("core.edit.docSettings")}</h3>
          <div className="space-y-1.5">
            <Label>{t("core.edit.docNameLabel")}</Label>
            <Input
              value={doc.name}
              onChange={async (e) => {
                await api.updateDocument(doc.id, { name: e.target.value, docType: doc.docType })
                setCol((c) =>
                  c
                    ? {
                        ...c,
                        documents: c.documents.map((d) => (d.id === doc.id ? { ...d, name: e.target.value } : d)),
                      }
                    : c,
                )
                setDirty(true)
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("common.type")}</Label>
            <Select
              value={doc.docType}
              onValueChange={async (v) => {
                await api.updateDocument(doc.id, { name: doc.name, docType: v })
                setCol((c) =>
                  c
                    ? {
                        ...c,
                        documents: c.documents.map((d) => (d.id === doc.id ? { ...d, docType: v } : d)),
                      }
                    : c,
                )
                setDirty(true)
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="study">{t("core.edit.docTypeStudy")}</SelectItem>
                <SelectItem value="quiz">{t("core.edit.docTypeQuiz")}</SelectItem>
                <SelectItem value="note">{t("core.library.kindNote")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("core.edit.moveDocLabel")}</Label>
            <Select
              value={doc.folderId ?? ""}
              onValueChange={(v) => moveDoc(doc.id, v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("core.edit.rootFolder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">{t("core.edit.rootFolder")}</SelectItem>
                {(col.folders ?? []).map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {folderPath(col, f.id)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("core.edit.docTypeHint")}
          </p>
        </div>
      )
    }
  } else if (sel.kind === "section") {
    const found = findSection(sel.id)
    if (found) {
      editor = (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">{t("core.edit.sectionSettings")}</h3>
          <div className="space-y-1.5">
            <Label>{t("core.edit.sectionNameLabel")}</Label>
            <Input
              value={found.section.name}
              onChange={async (e) => {
                await api.updateSection(found.section.id, { name: e.target.value })
                setCol((c) =>
                  c
                    ? {
                        ...c,
                        documents: c.documents.map((d) => ({
                          ...d,
                          sections: d.sections.map((s) => (s.id === found.section.id ? { ...s, name: e.target.value } : s)),
                        })),
                      }
                    : c,
                )
                setDirty(true)
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("core.edit.refDocLabel")}</Label>
            <Select
              value={found.section.refDocId ?? ""}
              onValueChange={async (v) => {
                await api.updateSection(found.section.id, { name: found.section.name, refDocId: v })
                await load()
                setDirty(true)
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("core.edit.noRef")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">{t("core.edit.noRef")}</SelectItem>
                {col.documents
                  .filter((d) => d.id !== found.doc.id)
                  .map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t("core.edit.refDocHint")}
            </p>
          </div>
          <div>
            <Label className="mb-2 block">{t("core.edit.addBlockLabel")}</Label>
            <div className="flex gap-2">
              <Select value={newBlockType} onValueChange={setNewBlockType}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BLOCK_TYPES.map((b) => (
                    <SelectItem key={b.value} value={b.value}>
                      {t(b.label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={() => addBlock(found.section.id)}>
                <Plus className="size-4" />
                {t("common.add")}
              </Button>
            </div>
          </div>
        </div>
      )
    }
  } else if (sel.kind === "block") {
    const found = findBlock(sel.id)
    if (found) {
      editor = (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">{t(BLOCK_TYPE_LABEL[found.block.type] ?? "core.edit.block")}</h3>
            <Button variant="ghost" size="sm" onClick={() => setSel({ kind: "section", id: found.section.id })}>
              {t("core.edit.backToSection")}
            </Button>
          </div>
          <BlockForm
            type={found.block.type}
            block={found.block}
            onCancel={() => setSel({ kind: "section", id: found.section.id })}
            onSave={async (data) => {
              await api.updateBlock(found.block.id, data)
              await load()
              toast.success(t("core.edit.blockSaved"))
              setDirty(true)
            }}
          />
        </div>
      )
    }
  }

  // 文件夹树渲染（递归）
  const editTree = buildFolderTree(col)
  const renderDocRow = (doc: Document): React.ReactNode => (
    <div key={doc.id} className="space-y-0.5">
      <div className="group flex items-center gap-1 rounded-md px-2 py-1.5 hover:bg-accent/60">
        <button
          onClick={() => setSel({ kind: "doc", id: doc.id })}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm",
            sel.kind === "doc" && sel.id === doc.id
              ? "font-medium text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <BookOpen className="size-3.5 shrink-0" />
          <span className="truncate">{doc.name}</span>
        </button>
        <button onClick={() => addSection(doc.id)} className="text-muted-foreground hover:text-foreground" title={t("core.edit.addSectionTitle")}>
          <ListPlus className="size-3.5" />
        </button>
        <button onClick={() => removeDoc(doc.id)} className="text-muted-foreground hover:text-destructive" title={t("core.edit.deleteDocTitle")}>
          <Trash2 className="size-3.5" />
        </button>
      </div>
      <div className="ml-4 space-y-0.5 border-l pl-2">
        {doc.sections.map((sec) => (
          <div key={sec.id} className="group">
            <div className="flex items-center gap-1 rounded px-2 py-1 hover:bg-accent/60">
              <button
                onClick={() => setSel({ kind: "section", id: sec.id })}
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-1.5 text-left text-[13px]",
                  sel.kind === "section" && sel.id === sec.id
                    ? "font-medium text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <FileText className="size-3.5 shrink-0" />
                <span className="truncate">{sec.name}</span>
                <span className="text-[10px] text-muted-foreground">{sec.blocks.length}</span>
              </button>
              <button onClick={() => removeSection(sec.id)} className="text-muted-foreground hover:text-destructive" title={t("core.edit.deleteSectionTitle")}>
                <Trash2 className="size-3.5" />
              </button>
            </div>
            <div className="ml-4 space-y-0.5 border-l pl-2">
              {sec.blocks.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setSel({ kind: "block", id: b.id })}
                  className={cn(
                    "flex w-full items-center gap-1.5 rounded px-2 py-0.5 text-left text-xs",
                    sel.kind === "block" && sel.id === b.id
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  )}
                >
                  <span className="truncate">{t(BLOCK_TYPE_LABEL[b.type] ?? "core.edit.block")}</span>
                  <Trash2
                    className="ml-auto size-3 shrink-0 opacity-0 hover:text-destructive group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeBlock(b.id)
                    }}
                  />
                </button>
              ))}
              {sec.blocks.length === 0 && (
                <p className="px-2 py-0.5 text-[11px] text-muted-foreground/60">{t("core.edit.noBlocks")}</p>
              )}
            </div>
          </div>
        ))}
        {doc.sections.length === 0 && (
          <p className="px-2 py-0.5 text-[11px] text-muted-foreground/60">{t("core.edit.noSections")}</p>
        )}
      </div>
    </div>
  )
  const renderFolderNode = (node: FolderNode): React.ReactNode => (
    <Collapsible key={node.id}>
      <CollapsibleTrigger className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm font-medium hover:bg-accent/60">
        <ChevronDown className="size-3.5 text-muted-foreground transition-transform [&[data-state=closed]]:-rotate-90" />
        <FolderIcon className="size-3.5 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-3 space-y-0.5 border-l pl-2">
          <div className="flex items-center gap-1 px-1 py-0.5">
            <button
              onClick={() => createFolderIn(node.id)}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <FolderPlus className="size-3" />
              {t("core.edit.subFolder")}
            </button>
            <button
              onClick={() => renameFolder(node.id)}
              className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {t("common.rename")}
            </button>
            <button
              onClick={() => removeFolder(node.id)}
              className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-destructive"
            >
              {t("common.delete")}
            </button>
          </div>
          {node.children.map(renderFolderNode)}
          {node.documents.map(renderDocRow)}
          {node.children.length === 0 && node.documents.length === 0 && (
            <p className="px-2 py-0.5 text-[11px] text-muted-foreground/60">{t("core.edit.emptyFolder")}</p>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )

  return (
    <div className="flex h-[calc(100vh-56px)]">
      {/* 左：树 */}
      <aside className="flex w-80 shrink-0 flex-col border-r bg-card/50">
        <div className="flex h-12 items-center justify-between border-b px-4">
          <div className="flex items-center gap-2">
            <Pencil className="size-4 text-primary" />
            <span className="text-sm font-medium">{t("core.edit.mode")}</span>
          </div>
          <Badge variant={dirty ? "secondary" : "outline"}>{dirty ? t("core.edit.dirty") : t("core.edit.saved")}</Badge>
        </div>
        <div className="flex h-10 items-center gap-2 border-b px-3">
          <Button variant="outline" size="sm" onClick={addDocument}>
            <FilePlus2 className="size-4" />
            {t("core.edit.newDoc")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => createFolderIn("")}>
            <FolderPlus className="size-4" />
            {t("core.edit.newFolder")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => navigate(col.kind === "course" ? `/course/${cid}` : "/")}
          >
            {t("core.edit.done")}
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-3">
            <button
              onClick={() => setSel({ kind: "folder" })}
              className={cn(
                "mb-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm font-medium",
                sel.kind === "folder" ? "bg-primary/10 text-primary" : "hover:bg-accent",
              )}
            >
              <SquareStack className="size-4" />
              <span className="truncate">{col.name}</span>
            </button>
            <div className="space-y-1">
              {editTree.roots.map(renderFolderNode)}
              {editTree.rootDocuments.map(renderDocRow)}
            </div>
          </div>
        </ScrollArea>
      </aside>

      {/* 右：编辑区 */}
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl p-6">{editor}</div>
      </div>
    </div>
  )
}
