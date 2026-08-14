import { useT } from "@/i18n"
import type { Block } from "@/lib/api"
import { usePluginEnabled } from "@/stores/plugins"
import { MarkdownBlock } from "@/components/learn/blocks/MarkdownBlock"
import { ChoiceBlock } from "@/components/learn/blocks/ChoiceBlock"
import { FillBlankBlock } from "@/components/learn/blocks/FillBlankBlock"
import { ShortAnswerBlock } from "@/components/learn/blocks/ShortAnswerBlock"
import { InteractiveBlock } from "@/components/learn/blocks/InteractiveBlock"
import { PluginBlockPlaceholder } from "@/components/learn/blocks/PluginBlockPlaceholder"

/**
 * 组件流渲染器。
 *
 * 课程组件（题目/交互块）依赖「课程」插件：插件未启用时，
 * Markdown 仍正常渲染（文档库阅读），其余组件以原始数据占位展示。
 */
export function BlockRenderer({ block, collectionId }: { block: Block; collectionId: string }) {
  const t = useT()
  const courseEnabled = usePluginEnabled("course")
  const isMarkdown = block.type === "markdown"
  const renderable = isMarkdown || courseEnabled

  if (!renderable) {
    return <PluginBlockPlaceholder block={block} pluginId="course" pluginName={t("core.plugin.course")} />
  }

  switch (block.type) {
    case "markdown":
      return <MarkdownBlock content={block.content as string | undefined} />
    case "single_choice":
    case "multiple_choice":
      return <ChoiceBlock block={block as never} />
    case "fill_blank":
      return <FillBlankBlock block={block as never} />
    case "short_answer":
      return <ShortAnswerBlock block={block as never} />
    case "interactive":
      return <InteractiveBlock collectionId={collectionId} block={block as never} />
    default:
      return (
        <p className="text-sm text-muted-foreground">
          {t("core.learn.unsupportedBlock", { type: String(block.type) })}
        </p>
      )
  }
}
