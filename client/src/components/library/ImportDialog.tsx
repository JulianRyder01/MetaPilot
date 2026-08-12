import { useState } from "react"
import { FileUp, FolderUp, Upload } from "lucide-react"
import { toast } from "sonner"

import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PluginGate } from "@/components/plugins/PluginGate"

interface Props {
  libraryId?: string
  onImported?: () => void
}

export function ImportDialog({ libraryId, onImported }: Props) {
  const [courseFile, setCourseFile] = useState<File | null>(null)
  const [noteFile, setNoteFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)

  async function importCourse() {
    if (!courseFile) return
    setBusy(true)
    try {
      const res = await api.importCourse(courseFile, libraryId || "")
      toast.success(`已导入课程「${res.imported.map((c) => c.name).join("、")}」`)
      setCourseFile(null)
      onImported?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导入失败")
    } finally {
      setBusy(false)
    }
  }

  async function importNote() {
    if (!noteFile) return
    setBusy(true)
    try {
      const res = await api.importNote(noteFile)
      toast.success(`已导入笔记（${res.sectionCount} 个小节）`)
      setNoteFile(null)
      onImported?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导入失败")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="size-4" />
          导入
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>导入内容</DialogTitle>
          <DialogDescription>支持课程包（zip）与 Markdown / Obsidian 笔记。</DialogDescription>
        </DialogHeader>
        <PluginGate pluginId="course" hint="导入课程包与笔记">
          <Tabs defaultValue="course">
            <TabsList className="w-full">
              <TabsTrigger value="course" className="flex-1">课程包</TabsTrigger>
              <TabsTrigger value="note" className="flex-1">Markdown 笔记</TabsTrigger>
            </TabsList>
            <TabsContent value="course" className="space-y-3">
              <Label htmlFor="course-file">课程包文件（.zip，含 manifest.json）</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="course-file"
                  type="file"
                  accept=".zip"
                  onChange={(e) => setCourseFile(e.target.files?.[0] ?? null)}
                />
                <Button onClick={importCourse} disabled={!courseFile || busy}>
                  <FolderUp className="size-4" />
                  导入
                </Button>
              </div>
            </TabsContent>
            <TabsContent value="note" className="space-y-3">
              <Label htmlFor="note-file">Markdown / Obsidian 文件（.md）</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="note-file"
                  type="file"
                  accept=".md,.markdown"
                  onChange={(e) => setNoteFile(e.target.files?.[0] ?? null)}
                />
                <Button onClick={importNote} disabled={!noteFile || busy}>
                  <FileUp className="size-4" />
                  导入
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </PluginGate>
        <DialogFooter />
      </DialogContent>
    </Dialog>
  )
}
