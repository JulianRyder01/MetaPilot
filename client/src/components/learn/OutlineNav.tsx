import { useState } from "react"
import { BookOpen, CheckCircle2, ChevronDown, Circle, Folder } from "lucide-react"

import type { Collection, Document } from "@/lib/api"
import { cn } from "@/lib/utils"
import { buildCollectionTree, type FolderNode } from "@/lib/tree"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Badge } from "@/components/ui/badge"

interface Props {
  collection: Collection
  currentSectionId: string
  completedSet: Set<string>
  onNavigate: (sectionId: string) => void
}

function DocBlock({
  doc,
  currentSectionId,
  completedSet,
  onNavigate,
}: {
  doc: Document
  currentSectionId: string
  completedSet: Set<string>
  onNavigate: (sectionId: string) => void
}) {
  const [open, setOpen] = useState(() => doc.sections.some((s) => s.id === currentSectionId))
  const docDone = doc.sections.length > 0 && doc.sections.every((s) => completedSet.has(s.id))

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium hover:bg-accent/60">
        <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", !open && "-rotate-90")} />
        {docDone ? (
          <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600" />
        ) : (
          <BookOpen className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate">{doc.name}</span>
        {doc.docType === "quiz" && <Badge variant="outline">测验</Badge>}
      </CollapsibleTrigger>
      <CollapsibleContent className="ml-4 space-y-0.5 border-l pl-2">
        {doc.sections.map((sec) => {
          const active = sec.id === currentSectionId
          const done = completedSet.has(sec.id)
          return (
            <button
              key={sec.id}
              onClick={() => onNavigate(sec.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors",
                active
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              {done ? (
                <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600" />
              ) : (
                <Circle className="size-3.5 shrink-0 text-muted-foreground/40" />
              )}
              <span className="min-w-0 flex-1 truncate">{sec.name}</span>
              {sec.refDocId && <Badge variant="outline" className="text-[10px]">引用</Badge>}
            </button>
          )
        })}
        {doc.sections.length === 0 && (
          <p className="px-2 py-1 text-xs text-muted-foreground">暂无小节</p>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}

function FolderBlock({
  node,
  currentSectionId,
  completedSet,
  onNavigate,
}: {
  node: FolderNode
  currentSectionId: string
  completedSet: Set<string>
  onNavigate: (sectionId: string) => void
}) {
  return (
    <Collapsible>
      <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium hover:bg-accent/60">
        <ChevronDown className="size-3.5 text-muted-foreground transition-transform [&[data-state=closed]]:-rotate-90" />
        <Folder className="size-3.5 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="ml-4 space-y-0.5 border-l pl-2">
        {node.children.map((child) => (
          <FolderBlock
            key={child.id}
            node={child}
            currentSectionId={currentSectionId}
            completedSet={completedSet}
            onNavigate={onNavigate}
          />
        ))}
        {node.documents.map((doc) => (
          <DocBlock
            key={doc.id}
            doc={doc}
            currentSectionId={currentSectionId}
            completedSet={completedSet}
            onNavigate={onNavigate}
          />
        ))}
        {node.children.length === 0 && node.documents.length === 0 && (
          <p className="px-2 py-1 text-xs text-muted-foreground">空文件夹</p>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}

export function OutlineNav({ collection, currentSectionId, completedSet, onNavigate }: Props) {
  const tree = buildCollectionTree(collection)
  return (
    <nav className="space-y-1">
      {tree.roots.map((node) => (
        <FolderBlock
          key={node.id}
          node={node}
          currentSectionId={currentSectionId}
          completedSet={completedSet}
          onNavigate={onNavigate}
        />
      ))}
      {tree.rootDocuments.map((doc) => (
        <DocBlock
          key={doc.id}
          doc={doc}
          currentSectionId={currentSectionId}
          completedSet={completedSet}
          onNavigate={onNavigate}
        />
      ))}
    </nav>
  )
}
