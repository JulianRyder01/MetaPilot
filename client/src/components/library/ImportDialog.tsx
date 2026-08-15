import { useState } from "react"
import { FileUp, Upload } from "lucide-react"
import { toast } from "@/lib/toast"

import { useT } from "@/i18n"
import { api } from "@/lib/api"
import { usePluginsStore } from "@/stores/plugins"
import { useSettingsStore } from "@/stores/settings"
import { builtinFrontends, usePluginRuntimeFrontends } from "@/plugins/registry"
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

interface Props {
  libraryId?: string
  onImported?: () => void
}

export function ImportDialog({ libraryId, onImported }: Props) {
  const t = useT()
  const plugins = usePluginsStore((s) => s.plugins)
  const dynamic = usePluginRuntimeFrontends()
  const [noteFile, setNoteFile] = useState<File | null>(null)
  const [mpfFile, setMpfFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)

  // 插件贡献的导入 tab（如课程插件的课程包导入）：仅渲染已启用插件的扩展点
  const importTabs = [...builtinFrontends, ...Object.values(dynamic)].flatMap((p) => {
    const enabled = plugins.find((x) => x.id === p.id)?.enabled ?? true
    return enabled ? (p.importTabs ?? []) : []
  })

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
            <TabsTrigger value="note" className="flex-1">Markdown</TabsTrigger>
            {importTabs.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id} className="flex-1">
                {t(tab.label)}
              </TabsTrigger>
            ))}
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
          {/* Markdown 笔记导入是文档库核心能力，不依赖任何插件 */}
          <TabsContent value="note" className="space-y-3">
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
                {t("core.library.import")}
              </Button>
            </div>
          </TabsContent>
          {/* 插件贡献的导入 tab（课程包等），由插件注册 importTabs 扩展点 */}
          {importTabs.map((tab) => (
            <TabsContent key={tab.id} value={tab.id}>
              <tab.Component libraryId={libraryId} onImported={onImported} />
            </TabsContent>
          ))}
        </Tabs>
        <DialogFooter />
      </DialogContent>
    </Dialog>
  )
}
