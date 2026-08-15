/** 课程插件块渲染适配器（JSX 必须放 .tsx 文件）。 */
import { ChoiceBlock } from "@/components/learn/blocks/ChoiceBlock"
import { FillBlankBlock } from "@/components/learn/blocks/FillBlankBlock"
import { ShortAnswerBlock } from "@/components/learn/blocks/ShortAnswerBlock"
import { InteractiveBlock } from "@/components/learn/blocks/InteractiveBlock"

import type { PluginBlockRendererProps } from "../types"

export function renderChoice({ block }: PluginBlockRendererProps) {
  return <ChoiceBlock block={block} />
}

export function renderFillBlank({ block }: PluginBlockRendererProps) {
  return <FillBlankBlock block={block} />
}

export function renderShortAnswer({ block }: PluginBlockRendererProps) {
  return <ShortAnswerBlock block={block} />
}

export function renderInteractive({ block, collectionId }: PluginBlockRendererProps) {
  return <InteractiveBlock collectionId={collectionId} block={block} />
}
