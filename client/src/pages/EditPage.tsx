import { useCallback, useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import {
  BookOpen,
  FilePlus2,
  FileText,
  ListPlus,
  Pencil,
  Plus,
  SquareStack,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

import { api, type Collection } from "@/lib/api"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { BLOCK_TYPES, BlockForm } from "@/components/edit/BlockForm"

type Selection =
  | { kind: "collection" }
  | { kind: "doc"; id: string }
  | { kind: "section"; id: string }
  | { kind: "block"; id: string }

const BLOCK_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  BLOCK_TYPES.map((b) => [b.value, b.label]),
)

export default function EditPage() {
  const { cid } = useParams()
  const navigate = useNavigate()
  const [col, setCol] = useState<Collection | null>(null)
  const [sel, setSel] = useState<Selection>({ kind: "collection" })
  const [newBlockType, setNewBlockType] = useState("markdown")
  const [dirty, setDirty] = useState(false)

  const load = useCallback(async () => {
    if (cid) setCol(await api.getCollection(cid))
  }, [cid])

  useEffect(() => {
    load()
  }, [load])

  if (!col) {
    return <p className="px-6 py-10 text-sm text-muted-foreground">加载中...</p>
  }

  async function saveCollection(patch: Partial<Collection>) {
    if (!col) return
    await api.updateCollection(col.id, patch)
    setCol((c) => (c ? { ...c, ...patch } : c))
    setDirty(true)
  }

  async function addDocument() {
    if (!col) return
    const doc = await api.createDocument(col.id, { name: "新章节", docType: "study" })
    setCol((c) => (c ? { ...c, documents: [...c.documents, doc] } : c))
    setSel({ kind: "doc", id: doc.id })
    setDirty(true)
  }

  async function addSection(docId: string) {
    if (!col) return
    const sec = await api.createSection(docId, { name: "新知识点" })
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
    if (!window.confirm("删除该章节？其下所有小节与内容将被删除。")) return
    await api.deleteDocument(docId)
    setCol((c) => (c ? { ...c, documents: c.documents.filter((d) => d.id !== docId) } : c))
    setSel({ kind: "collection" })
    setDirty(true)
  }

  async function removeSection(sectionId: string) {
    if (!window.confirm("删除该小节？")) return
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
    setSel({ kind: "collection" })
    setDirty(true)
  }

  async function removeBlock(blockId: string) {
    if (!window.confirm("删除该组件？")) return
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
    setSel({ kind: "collection" })
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

  // 右侧编辑内容
  let editor: React.ReactNode = null
  if (sel.kind === "collection") {
    editor = (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">课程信息</h3>
        <div className="space-y-1.5">
          <Label>名称</Label>
          <Input value={col.name} onChange={(e) => saveCollection({ name: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>简介</Label>
          <Textarea rows={3} value={col.description ?? ""} onChange={(e) => saveCollection({ description: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>作者</Label>
            <Input value={col.author ?? ""} onChange={(e) => saveCollection({ author: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>版本</Label>
            <Input value={col.version ?? ""} onChange={(e) => saveCollection({ version: e.target.value })} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>类型</Label>
          <Select value={col.kind} onValueChange={(v) => saveCollection({ kind: v as Collection["kind"] })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="course">课程</SelectItem>
              <SelectItem value="note">笔记</SelectItem>
              <SelectItem value="kb">知识库</SelectItem>
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
          <h3 className="text-lg font-semibold">章节设置</h3>
          <div className="space-y-1.5">
            <Label>章节名</Label>
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
            <Label>类型</Label>
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
                <SelectItem value="study">学习章节</SelectItem>
                <SelectItem value="quiz">测验章节</SelectItem>
                <SelectItem value="note">笔记</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            学习章节与测验章节可以自由搭配，实现学习与考试分离。
          </p>
        </div>
      )
    }
  } else if (sel.kind === "section") {
    const found = findSection(sel.id)
    if (found) {
      editor = (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">知识点设置</h3>
          <div className="space-y-1.5">
            <Label>知识点名称</Label>
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
          <div>
            <Label className="mb-2 block">新增组件</Label>
            <div className="flex gap-2">
              <Select value={newBlockType} onValueChange={setNewBlockType}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BLOCK_TYPES.map((b) => (
                    <SelectItem key={b.value} value={b.value}>
                      {b.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={() => addBlock(found.section.id)}>
                <Plus className="size-4" />
                添加
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
            <h3 className="text-lg font-semibold">{BLOCK_TYPE_LABEL[found.block.type] ?? "组件"}</h3>
            <Button variant="ghost" size="sm" onClick={() => setSel({ kind: "section", id: found.section.id })}>
              回到小节
            </Button>
          </div>
          <BlockForm
            type={found.block.type}
            block={found.block}
            onCancel={() => setSel({ kind: "section", id: found.section.id })}
            onSave={async (data) => {
              await api.updateBlock(found.block.id, data)
              await load()
              toast.success("组件已保存")
              setDirty(true)
            }}
          />
        </div>
      )
    }
  }

  return (
    <div className="flex h-[calc(100vh-56px)]">
      {/* 左：树 */}
      <aside className="flex w-80 shrink-0 flex-col border-r bg-card/50">
        <div className="flex h-12 items-center justify-between border-b px-4">
          <div className="flex items-center gap-2">
            <Pencil className="size-4 text-primary" />
            <span className="text-sm font-medium">编辑模式</span>
          </div>
          <Badge variant={dirty ? "secondary" : "outline"}>{dirty ? "有改动" : "已保存"}</Badge>
        </div>
        <div className="flex h-10 items-center gap-2 border-b px-3">
          <Button variant="outline" size="sm" onClick={addDocument}>
            <FilePlus2 className="size-4" />
            章节
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => navigate(`/course/${cid}`)}
          >
            完成
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-3">
            <button
              onClick={() => setSel({ kind: "collection" })}
              className={cn(
                "mb-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm font-medium",
                sel.kind === "collection" ? "bg-primary/10 text-primary" : "hover:bg-accent",
              )}
            >
              <SquareStack className="size-4" />
              <span className="truncate">{col.name}</span>
            </button>
            <div className="space-y-1">
              {col.documents.map((doc) => (
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
                    <button onClick={() => addSection(doc.id)} className="text-muted-foreground hover:text-foreground" title="新增小节">
                      <ListPlus className="size-3.5" />
                    </button>
                    <button onClick={() => removeDoc(doc.id)} className="text-muted-foreground hover:text-destructive" title="删除章节">
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
                          <button onClick={() => removeSection(sec.id)} className="text-muted-foreground hover:text-destructive" title="删除小节">
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
                              <span className="truncate">{BLOCK_TYPE_LABEL[b.type] ?? b.type}</span>
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
                            <p className="px-2 py-0.5 text-[11px] text-muted-foreground/60">暂无组件</p>
                          )}
                        </div>
                      </div>
                    ))}
                    {doc.sections.length === 0 && (
                      <p className="px-2 py-0.5 text-[11px] text-muted-foreground/60">暂无小节</p>
                    )}
                  </div>
                </div>
              ))}
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
