import { useState } from "react"
import { BookOpen, CheckCircle2, ChevronDown, Circle } from "lucide-react"

import type { Collection } from "@/lib/api"
import { cn } from "@/lib/utils"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Badge } from "@/components/ui/badge"

interface Props {
  collection: Collection
  currentSectionId: string
  completedSet: Set<string>
  onNavigate: (sectionId: string) => void
}

export function OutlineNav({ collection, currentSectionId, completedSet, onNavigate }: Props) {
  const [openDocs, setOpenDocs] = useState<Set<string>>(() => {
    // 默认展开包含当前小节的章节
    const set = new Set<string>()
    for (const doc of collection.documents) {
      if (doc.sections.some((s) => s.id === currentSectionId)) set.add(doc.id)
      if (doc.sections.length === 0) set.add(doc.id)
    }
    return set
  })

  function toggleDoc(id: string) {
    setOpenDocs((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <nav className="space-y-1">
      {collection.documents.map((doc) => {
        const open = openDocs.has(doc.id)
        const docDone = doc.sections.length > 0 && doc.sections.every((s) => completedSet.has(s.id))
        return (
          <Collapsible key={doc.id} open={open} onOpenChange={() => toggleDoc(doc.id)}>
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
                  </button>
                )
              })}
              {doc.sections.length === 0 && (
                <p className="px-2 py-1 text-xs text-muted-foreground">暂无小节</p>
              )}
            </CollapsibleContent>
          </Collapsible>
        )
      })}
    </nav>
  )
}
