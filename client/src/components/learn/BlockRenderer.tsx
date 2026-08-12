import type { Block } from "@/lib/api"
import { MarkdownBlock } from "@/components/learn/blocks/MarkdownBlock"
import { ChoiceBlock } from "@/components/learn/blocks/ChoiceBlock"
import { FillBlankBlock } from "@/components/learn/blocks/FillBlankBlock"
import { ShortAnswerBlock } from "@/components/learn/blocks/ShortAnswerBlock"
import { InteractiveBlock } from "@/components/learn/blocks/InteractiveBlock"

export function BlockRenderer({ block, collectionId }: { block: Block; collectionId: string }) {
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
          暂不支持的组件类型：{String(block.type)}
        </p>
      )
  }
}
