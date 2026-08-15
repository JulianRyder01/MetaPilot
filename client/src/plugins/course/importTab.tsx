/** 课程插件贡献的「导入对话框」tab：课程包（zip）导入。
 *
 * 经 PluginFrontend.importTabs 扩展点注册，由核心 ImportDialog 渲染；
 * 插件被禁用时 ImportDialog 按启用状态过滤不显示本 tab。
 */
import { useState } from "react"
import { FolderUp } from "lucide-react"
import { toast } from "@/lib/toast"

import { useT } from "@/i18n"
import { importCourse as importCourseApi } from "@/plugins/course/api"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"

interface Props {
  libraryId?: string
  onImported?: () => void
}

export function CourseImportTab({ libraryId, onImported }: Props) {
  const t = useT()
  const [courseFile, setCourseFile] = useState<File | null>(null)
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

  return (
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
          {t("core.library.import")}
        </Button>
      </div>
    </div>
  )
}
