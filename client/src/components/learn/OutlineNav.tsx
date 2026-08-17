import { useState } from "react"
import { BookOpen, ChevronDown, Folder as FolderIcon, Trash2 } from "lucide-react"

import { useT } from "@/i18n"
import type { Document, Folder } from "@/lib/api"
import { cn } from "@/lib/utils"
import { buildFolderTree, type FolderNode } from "@/lib/tree"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { SectionRing } from "@/components/learn/SectionRing"

interface Props {
  folder: Folder
  currentSectionId: string
  completedSet: Set<string>
  onNavigate: (sectionId: string) => void
  /** 当前小节的实时阅读进度（页面滑动比例 0~1），仅对当前小节生效。 */
  readingProgress?: { pct: number }
  /** 点击圆圈二次确认后清空某一小节的完成进度。 */
  onClearSection?: (sectionId: string) => void
}

function DocBlock({
  doc,
  currentSectionId,
  completedSet,
  onNavigate,
  readingProgress,
  onClearSection,
}: {
  doc: Document
  currentSectionId: string
  completedSet: Set<string>
  onNavigate: (sectionId: string) => void
  readingProgress?: { pct: number }
  onClearSection?: (sectionId: string) => void
}) {
  const [open, setOpen] = useState(() => doc.sections.some((s) => s.id === currentSectionId))
  const [armedSid, setArmedSid] = useState<string | null>(null)
  const docDone = doc.sections.length > 0 && doc.sections.every((s) => completedSet.has(s.id))
  const t = useT()

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium hover:bg-accent/60">
        <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", !open && "-rotate-90")} />
        {docDone ? (
          <SectionRing done />
        ) : (
          <BookOpen className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate">{doc.name}</span>
        {doc.docType === "quiz" && <Badge variant="outline">{t("core.library.quiz")}</Badge>}
      </CollapsibleTrigger>
      <CollapsibleContent className="ml-4 space-y-0.5 border-l pl-2">
        {doc.sections.map((sec) => {
          const active = sec.id === currentSectionId
          const done = completedSet.has(sec.id)
          const isCurrent = sec.id === currentSectionId
          const prog =
            isCurrent && readingProgress && readingProgress.pct > 0
              ? Math.max(0, Math.min(1, readingProgress.pct))
              : 0
          const hasProgress = !done && isCurrent && prog > 0
          const canClear = done || hasProgress
          const armed = armedSid === sec.id && canClear
          const tooltipText = armed
            ? t("core.learn.clearProgressHint")
            : hasProgress
              ? t("core.learn.progressTooltip", { pct: Math.round(prog * 100) })
              : ""
          return (
            <div
              key={sec.id}
              onMouseLeave={() => setArmedSid((v) => (v === sec.id ? null : v))}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors",
                active
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              <Tooltip
                open={armed || undefined}
                onOpenChange={(o) => {
                  if (!o) setArmedSid((v) => (v === sec.id ? null : v))
                }}
              >
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={sec.name}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (!canClear) return
                      if (armed) {
                        setArmedSid(null)
                        onClearSection?.(sec.id)
                      } else {
                        setArmedSid(sec.id)
                      }
                    }}
                    className="shrink-0 rounded-full p-0.5 transition-colors hover:bg-accent focus-visible:outline-none"
                  >
                    {done ? (
                      <SectionRing done />
                    ) : armed ? (
                      <span className="relative inline-flex size-3.5 shrink-0 items-center justify-center">
                        <SectionRing pct={1} className="text-red-500" />
                        <Trash2 className="absolute size-2.5 text-red-500" />
                      </span>
                    ) : (
                      <SectionRing pct={prog} className="text-primary" />
                    )}
                  </button>
                </TooltipTrigger>
                {tooltipText && <TooltipContent side="right">{tooltipText}</TooltipContent>}
              </Tooltip>
              <button
                type="button"
                onClick={() => onNavigate(sec.id)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <span className="min-w-0 flex-1 truncate">{sec.name}</span>
                {sec.refDocId && <Badge variant="outline" className="text-[10px]">{t("core.learn.ref")}</Badge>}
              </button>
            </div>
          )
        })}
        {doc.sections.length === 0 && (
          <p className="px-2 py-1 text-xs text-muted-foreground">{t("core.edit.noSections")}</p>
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
  readingProgress,
  onClearSection,
}: {
  node: FolderNode
  currentSectionId: string
  completedSet: Set<string>
  onNavigate: (sectionId: string) => void
  readingProgress?: { pct: number }
  onClearSection?: (sectionId: string) => void
}) {
  const t = useT()
  return (
    <Collapsible>
      <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium hover:bg-accent/60">
        <ChevronDown className="size-3.5 text-muted-foreground transition-transform [&[data-state=closed]]:-rotate-90" />
        <FolderIcon className="size-3.5 shrink-0 text-primary" />
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
            readingProgress={readingProgress}
            onClearSection={onClearSection}
          />
        ))}
        {node.documents.map((doc) => (
          <DocBlock
            key={doc.id}
            doc={doc}
            currentSectionId={currentSectionId}
            completedSet={completedSet}
            onNavigate={onNavigate}
            readingProgress={readingProgress}
            onClearSection={onClearSection}
          />
        ))}
        {node.children.length === 0 && node.documents.length === 0 && (
          <p className="px-2 py-1 text-xs text-muted-foreground">{t("core.edit.emptyFolder")}</p>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}

export function OutlineNav({
  folder,
  currentSectionId,
  completedSet,
  onNavigate,
  readingProgress,
  onClearSection,
}: Props) {
  const tree = buildFolderTree(folder)
  return (
    <TooltipProvider>
      <nav className="space-y-1">
        {tree.roots.map((node) => (
          <FolderBlock
            key={node.id}
            node={node}
            currentSectionId={currentSectionId}
            completedSet={completedSet}
            onNavigate={onNavigate}
            readingProgress={readingProgress}
            onClearSection={onClearSection}
          />
        ))}
        {tree.rootDocuments.map((doc) => (
          <DocBlock
            key={doc.id}
            doc={doc}
            currentSectionId={currentSectionId}
            completedSet={completedSet}
            onNavigate={onNavigate}
            readingProgress={readingProgress}
            onClearSection={onClearSection}
          />
        ))}
      </nav>
    </TooltipProvider>
  )
}