import { useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { BookOpen, ChevronDown, FileText, Folder, GraduationCap } from "lucide-react"

import { useT } from "@/i18n"
import { api, type Library } from "@/lib/api"
import { buildCollectionTree, type FolderNode } from "@/lib/tree"
import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"

function FolderBranch({ colId, node, depth }: { colId: string; node: FolderNode; depth: number }) {
  return (
    <Collapsible defaultOpen={depth < 1}>
      <CollapsibleTrigger className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-sm font-medium hover:bg-accent/60">
        <ChevronDown className="size-3.5 text-muted-foreground transition-transform [&[data-state=closed]]:-rotate-90" />
        <Folder className="size-4 text-primary" />
        <span className="truncate">{node.name}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-3 space-y-0.5 border-l pl-2">
          {node.children.map((child) => (
            <FolderBranch key={child.id} colId={colId} node={child} depth={depth + 1} />
          ))}
          {node.documents.map((doc) => (
            <DocRow key={doc.id} colId={colId} name={doc.name} docType={doc.docType} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function DocRow({ colId, name, docType }: { colId: string; name: string; docType: string }) {
  const t = useT()
  return (
    <Link
      to={`/course/${colId}`}
      className="flex items-center gap-1.5 rounded px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent/60 hover:text-foreground"
    >
      <BookOpen className="size-3.5 shrink-0 text-muted-foreground/70" />
      <span className="truncate">{name}</span>
      {docType === "quiz" && <Badge variant="outline" className="ml-1 text-[10px]">{t("core.library.quiz")}</Badge>}
    </Link>
  )
}

export default function LibraryDetail() {
  const { lid } = useParams()
  const t = useT()
  const [lib, setLib] = useState<Library | null>(null)

  useEffect(() => {
    if (lid) api.getLibrary(lid).then(setLib)
  }, [lid])

  if (!lib) {
    return (
      <div className="mx-auto max-w-4xl space-y-3 px-6 py-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{lib.name}</h1>
        <p className="text-sm text-muted-foreground">{lib.description}</p>
      </div>
      <ScrollArea className="h-[calc(100vh-220px)]">
        <div className="space-y-4 pr-4">
          {lib.collections.map((col) => {
            const tree = buildCollectionTree(col)
            return (
              <div key={col.id} className="rounded-lg border p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 font-medium">
                    {col.kind === "course" ? (
                      <GraduationCap className="size-4 text-primary" />
                    ) : (
                      <FileText className="size-4 text-primary" />
                    )}
                    <Link to={`/course/${col.id}`} className="hover:underline">
                      {col.name}
                    </Link>
                  </div>
                  <Badge variant="secondary">{t(col.kind === "course" ? "core.library.kindCourse" : "core.library.kindNote")}</Badge>
                </div>
                <div className="space-y-0.5">
                  {tree.roots.map((node) => (
                    <FolderBranch key={node.id} colId={col.id} node={node} depth={0} />
                  ))}
                  {tree.rootDocuments.map((doc) => (
                    <DocRow
                      key={doc.id}
                      colId={col.id}
                      name={doc.name}
                      docType={doc.docType}
                    />
                  ))}
                  {tree.roots.length === 0 && tree.rootDocuments.length === 0 && (
                    <p className="px-2 py-1 text-xs text-muted-foreground">{t("core.library.empty")}</p>
                  )}
                </div>
              </div>
            )
          })}
          {lib.collections.length === 0 && (
            <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
              {t("core.library.emptyLibrary")}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
