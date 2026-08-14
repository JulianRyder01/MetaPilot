import { useState } from "react"
import { FileUp, FolderUp, Upload } from "lucide-react"
import { toast } from "@/lib/toast"

import { api } from "@/lib/api"
import { usePluginsStore } from "@/stores/plugins"
import { useSettingsStore } from "@/stores/settings"
import { importCourse as importCourseApi } from "@/plugins/course/api"
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
  const [mpfFile, setMpfFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)

  async function importCourse() {
    if (!courseFile) return
    setBusy(true)
    try {
      const res = await importCourseApi(courseFile, libraryId || "")
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

  async function importMpf() {
    if (!mpfFile) return
    setBusy(true)
    try {
      const res = await api.importMpf(mpfFile, libraryId || "")
      const plugins = usePluginsStore.getState().plugins
      const missing = res.unresolved.filter((u) => {
        const p = plugins.find((x) => x.id === u.requiredPlugin)
        return p ? !p.enabled : false
      })
      if (missing.length > 0 && useSettingsStore.getState().showPluginWarnings) {
        const names = [...new Set(missing.map((u) => u.requiredPlugin))].join("、")
        toast.warning(`导入内容中的部分组件依赖「${names}」插件，未启用时将显示为原始数据。`)
      }
      toast.success(res.type === "canvas" ? `已导入图表「${res.name ?? ""}」` : "已导入内容")
      setMpfFile(null)
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
          <DialogDescription>
            支持 MetaPilot 文件（.mpf/.canvas，统一格式：doc=课程内容、canvas=图表）、课程包（zip）与 Markdown 笔记。
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="mpf">
          <TabsList className="w-full">
            <TabsTrigger value="mpf" className="flex-1">MetaPilot 文件</TabsTrigger>
            <TabsTrigger value="course" className="flex-1">课程包</TabsTrigger>
            <TabsTrigger value="note" className="flex-1">Markdown</TabsTrigger>
          </TabsList>
          {/* .mpf / .canvas 是系统底层格式（官方核心能力），无需任何插件门禁 */}
          <TabsContent value="mpf" className="space-y-3">
            <Label htmlFor="mpf-file">MetaPilot 文件（.mpf / .canvas）</Label>
            <div className="flex items-center gap-2">
              <Input
                id="mpf-file"
                type="file"
                accept=".mpf,.canvas,.json"
                onChange={(e) => setMpfFile(e.target.files?.[0] ?? null)}
              />
              <Button onClick={importMpf} disabled={!mpfFile || busy}>
                <FileUp className="size-4" />
                导入
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              doc 类型解析为课程/文档；.canvas 文件（Obsidian Canvas）自动转换为图表。
            </p>
          </TabsContent>
          {/* 课程包与笔记导入依赖「课程」插件 */}
          <TabsContent value="course">
            <PluginGate pluginId="course" hint="导入课程包（zip）">
              <div className="space-y-3">
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
              </div>
            </PluginGate>
          </TabsContent>
          <TabsContent value="note">
            <PluginGate pluginId="course" hint="导入 Markdown 笔记">
              <div className="space-y-3">
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
              </div>
            </PluginGate>
          </TabsContent>
        </Tabs>
        <DialogFooter />
      </DialogContent>
    </Dialog>
  )
}
