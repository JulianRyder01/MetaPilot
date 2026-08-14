import { useState } from "react"
import { FileUp, FolderUp, Upload } from "lucide-react"
import { toast } from "@/lib/toast"

import { useT } from "@/i18n"
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
  const t = useT()
  const [courseFile, setCourseFile] = useState<File | null>(null)
  const [noteFile, setNoteFile] = useState<File | null>(null)
  const [mpfFile, setMpfFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)

  async function importCourse() {
    if (!courseFile) return
    setBusy(true)
    try {
      const res = await importCourseApi(courseFile, libraryId || "")
      toast.success(t("core.library.importedCourse", { names: res.imported.map((c) => c.name).join("、") }))
      setCourseFile(null)
      onImported?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("core.library.importFailed"))
    } finally {
      setBusy(false)
    }
  }

  async function importNote() {
    if (!noteFile) return
    setBusy(true)
    try {
      const res = await api.importNote(noteFile)
      toast.success(t("core.library.importedNote", { count: res.sectionCount }))
      setNoteFile(null)
      onImported?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("core.library.importFailed"))
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
        toast.warning(t("core.library.importWarning", { names }))
      }
      toast.success(res.type === "canvas" ? t("core.library.importedCanvas", { name: res.name ?? "" }) : t("core.library.importedContent"))
      setMpfFile(null)
      onImported?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("core.library.importFailed"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="size-4" />
          {t("core.library.import")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("core.library.importTitle")}</DialogTitle>
          <DialogDescription>
            {t("core.library.importDesc")}
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="mpf">
          <TabsList className="w-full">
            <TabsTrigger value="mpf" className="flex-1">{t("core.library.tabMpf")}</TabsTrigger>
            <TabsTrigger value="course" className="flex-1">{t("core.library.tabCourse")}</TabsTrigger>
            <TabsTrigger value="note" className="flex-1">Markdown</TabsTrigger>
          </TabsList>
          {/* .mpf / .canvas 是系统底层格式（官方核心能力），无需任何插件门禁 */}
          <TabsContent value="mpf" className="space-y-3">
            <Label htmlFor="mpf-file">{t("core.library.mpfLabel")}</Label>
            <div className="flex items-center gap-2">
              <Input
                id="mpf-file"
                type="file"
                accept=".mpf,.canvas,.json"
                onChange={(e) => setMpfFile(e.target.files?.[0] ?? null)}
              />
              <Button onClick={importMpf} disabled={!mpfFile || busy}>
                <FileUp className="size-4" />
                {t("core.library.import")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("core.library.mpfHint")}
            </p>
          </TabsContent>
          {/* 课程包与笔记导入依赖「课程」插件 */}
          <TabsContent value="course">
            <PluginGate pluginId="course" hint={t("core.library.courseGateHint")}>
              <div className="space-y-3">
                <Label htmlFor="course-file">{t("core.library.courseFileLabel")}</Label>
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
            <PluginGate pluginId="course" hint={t("core.library.noteGateHint")}>
              <div className="space-y-3">
                <Label htmlFor="note-file">{t("core.library.noteFileLabel")}</Label>
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
