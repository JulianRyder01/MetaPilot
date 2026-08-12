import { useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { BookOpen, ChevronRight, FileText, GraduationCap } from "lucide-react"

import { api, type Library } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"

export default function LibraryDetail() {
  const { lid } = useParams()
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
          {lib.collections.map((col) => (
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
                <Badge variant="secondary">{col.kind === "course" ? "课程" : "笔记"}</Badge>
              </div>
              <div className="space-y-1">
                {col.documents.map((doc) => (
                  <div key={doc.id} className="rounded-md bg-muted/50 px-3 py-2">
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      <BookOpen className="size-3.5 text-muted-foreground" />
                      {doc.name}
                      {doc.docType === "quiz" && <Badge variant="outline" className="ml-1">测验</Badge>}
                    </div>
                    <div className="mt-1 grid gap-0.5 pl-6">
                      {doc.sections.map((sec) => (
                        <Link
                          key={sec.id}
                          to={`/learn/${col.id}/${sec.id}`}
                          className="flex items-center gap-1 rounded px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                          <ChevronRight className="size-3" />
                          {sec.name}
                        </Link>
                      ))}
                      {doc.sections.length === 0 && (
                        <span className="px-2 text-xs text-muted-foreground">暂无小节</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {lib.collections.length === 0 && (
            <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
              此库为空，去主页导入课程包或新建文档集。
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
