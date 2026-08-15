import { useT } from "@/i18n"
import type { Block } from "@/lib/api"
import { usePluginsStore, ensurePluginsLoaded } from "@/stores/plugins"
import { MarkdownBlock } from "@/components/learn/blocks/MarkdownBlock"
import { PluginBlockPlaceholder } from "@/components/learn/blocks/PluginBlockPlaceholder"
import { builtinFrontends, usePluginRuntimeFrontends } from "@/plugins/registry"

/**
 * 组件流渲染器。
 *
 * - markdown 是文档库核心块类型，始终渲染；
 * - 其余块类型由插件经扩展点注册块渲染器（如课程插件注册题目/交互块），核心不写死插件 id；
 * - 无渲染器（插件未启用）时按插件声明的 content_types 反查所需插件，以原始数据占位展示。
 */
export function BlockRenderer({ block, collectionId }: { block: Block; collectionId: string }) {
  const t = useT()
  const plugins = usePluginsStore((s) => s.plugins)
  const dynamic = usePluginRuntimeFrontends()
  const frontends = [...builtinFrontends, ...Object.values(dynamic)]

  if (block.type === "markdown") {
    return <MarkdownBlock content={block.content as string | undefined} />
  }

  // 块渲染器：插件经扩展点（PluginFrontend.blockRenderers）注册，按块类型查
  const Renderer = frontends.map((p) => p.blockRenderers?.[block.type]).find(Boolean)
  if (Renderer) {
    return <Renderer block={block} collectionId={collectionId} />
  }

  // 无渲染器：按插件声明的 content_types 反查所需插件（不写死插件 id 映射）
  ensurePluginsLoaded()
  const provider = plugins.find((p) => p.contentTypes?.includes(block.type))
  return (
    <PluginBlockPlaceholder
      block={block}
      pluginId={provider?.id ?? ""}
      pluginName={provider ? provider.name : t("core.plugin.unknown")}
    />
  )
}
