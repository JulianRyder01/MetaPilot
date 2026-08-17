/** 顶栏「复制整页」按钮：把当前页面主体完整复制为 HTML 或 Markdown，供 AI 快速理解查看。
 *
 * 挂载在 AppLayout（全局），因此覆盖核心页面与所有插件页面，且不感知任何插件内容（解耦）。
 */
import { ClipboardCopy, FileCode2, FileText } from "lucide-react"

import { toast } from "@/lib/toast"
import { useT } from "@/i18n"
import { collectPageHtml, collectPageMarkdown, copyText } from "@/lib/exportPage"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export default function CopyPageButton() {
  const t = useT()

  async function copy(kind: "html" | "markdown") {
    const text = kind === "html" ? collectPageHtml() : collectPageMarkdown()
    const ok = await copyText(text)
    if (ok) {
      toast.success(t(kind === "html" ? "core.copiedHtml" : "core.copiedMarkdown"))
    } else {
      toast.error(t("core.copyPageFailed"))
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-9" title={t("core.copyPage")}>
          <ClipboardCopy className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => copy("html")}>
          <FileCode2 className="size-4" />
          {t("core.copyPageHtml")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => copy("markdown")}>
          <FileText className="size-4" />
          {t("core.copyPageMarkdown")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}