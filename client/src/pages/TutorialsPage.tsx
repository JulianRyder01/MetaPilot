/** 使用教程页（官方核心）：聚合展示核心自带教程 + 各已启用插件声明的 tutorials。
 *
 * 解耦约定：
 * - 教程来源全部为插件清单（/api/plugins）的 `tutorials` 字段：核心教程来自 core 条目，
 *   插件教程来自各插件 plugin.json 声明，本页不写死任何插件的内容；
 * - 仅展示「已启用」插件的教程（核心始终启用、始终展示）；
 * - 支持 URL 锚点定位：`/tutorials#<tutorialId>` 展开并滚动到对应教程，供其它页面跳转。
 */
import { useEffect, useMemo, useRef, useState } from "react"
import { BookOpenText, ChevronDown, Puzzle } from "lucide-react"
import * as Lucide from "lucide-react"

import { useT } from "@/i18n"
import { ensurePluginsLoaded, usePluginsStore } from "@/stores/plugins"
import type { PluginInfo, TutorialItem } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { MarkdownBlock } from "@/components/learn/blocks/MarkdownBlock"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

/** 一篇教程及其所属插件（用于分组展示与锚点定位） */
interface TutorialEntry {
  plugin: PluginInfo
  item: TutorialItem
}

/** 插件图标：icon 名为 lucide 图标名，动态解析；未知回退 Puzzle（与插件页一致） */
function pluginIcon(name?: string) {
  if (!name) return Puzzle
  const Cmp = (Lucide as unknown as Record<string, unknown>)[name]
  return typeof Cmp === "function" ? (Cmp as typeof Puzzle) : Puzzle
}

/** 教程 DOM id（插件内唯一 + 插件前缀，跨插件重名也不冲突） */
function domId(entry: TutorialEntry) {
  return `${entry.plugin.id}__${entry.item.id}`
}

export default function TutorialsPage() {
  const t = useT()
  const plugins = usePluginsStore((s) => s.plugins)
  const loaded = usePluginsStore((s) => s.loaded)
  // 展开的教程（DOM id 集合），首个核心教程默认展开
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [highlight, setHighlight] = useState<string | null>(null)
  const elRefs = useRef<Map<string, HTMLDivElement | null>>(new Map())
  const initialized = useRef(false)

  useEffect(() => {
    ensurePluginsLoaded()
  }, [])

  // 聚合全部已启用插件的教程（核心插件始终启用，始终可见）
  const entries: TutorialEntry[] = useMemo(() => {
    const out: TutorialEntry[] = []
    for (const p of plugins) {
      if (!p.enabled) continue
      for (const item of p.tutorials ?? []) {
        out.push({ plugin: p, item })
      }
    }
    return out
  }, [plugins])

  // 首次有数据时默认展开第一篇核心教程（仅初始化一次，之后由用户自由展开/收起）
  useEffect(() => {
    if (initialized.current || !entries.length) return
    initialized.current = true
    setExpanded(new Set([domId(entries[0])]))
  }, [entries])

  // 锚点定位：/tutorials#<tutorialId> → 展开并滚动到对应教程，短暂高亮
  useEffect(() => {
    if (!entries.length) return
    const scrollToHash = (hash: string) => {
      const id = decodeURIComponent(hash.replace(/^#/, ""))
      if (!id) return
      const hit = entries.find((e) => e.item.id === id) ?? entries.find((e) => domId(e) === id)
      if (!hit) return
      const did = domId(hit)
      setExpanded((prev) => {
        const next = new Set(prev)
        next.add(did)
        return next
      })
      // 等展开渲染后滚动（需要多拍，先 scrollIntoView 再微调）
      setTimeout(() => {
        elRefs.current.get(did)?.scrollIntoView({ behavior: "smooth", block: "start" })
        setHighlight(did)
        setTimeout(() => setHighlight(null), 2200)
      }, 80)
    }
    scrollToHash(window.location.hash)
    const onHash = () => scrollToHash(window.location.hash)
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [entries])

  const coreEntries = entries.filter((e) => e.plugin.source === "core")
  const pluginEntries = entries.filter((e) => e.plugin.source !== "core")

  // 插件教程按插件分组（保持清单顺序：官方插件在前）
  const pluginGroups = useMemo(() => {
    const map = new Map<string, TutorialEntry[]>()
    for (const e of pluginEntries) {
      const arr = map.get(e.plugin.id) ?? []
      arr.push(e)
      map.set(e.plugin.id, arr)
    }
    return [...map.entries()]
  }, [pluginEntries])

  const toggle = (did: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(did)) next.delete(did)
      else next.add(did)
      return next
    })
  }

  const renderGroup = (titleKey: string | null, groupEntries: TutorialEntry[]) => (
    <div className="space-y-2">
      {titleKey && (
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <BookOpenText className="size-5 text-primary" />
          {t(titleKey)}
        </h2>
      )}
      <div className="space-y-2">
        {groupEntries.map((e) => {
          const did = domId(e)
          const isOpen = expanded.has(did)
          const Icon = pluginIcon(e.plugin.icon)
          return (
            <div
              key={did}
              ref={(el) => {
                elRefs.current.set(did, el)
              }}
              id={did}
              className={cn(
                "scroll-mt-20 rounded-lg transition-shadow",
                highlight === did && "ring-2 ring-primary/60",
              )}
            >
              <Card className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggle(did)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50"
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1">
                    <span className="block text-sm font-medium">{e.item.title}</span>
                    {e.item.summary && (
                      <span className="mt-0.5 block text-xs text-muted-foreground">{e.item.summary}</span>
                    )}
                  </span>
                  <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                </button>
                {isOpen && (
                  <div className="px-4 pb-4">
                    <MarkdownBlock content={e.item.content} />
                  </div>
                )}
              </Card>
            </div>
          )
        })}
      </div>
    </div>
  )

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-6 py-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <BookOpenText className="size-6 text-primary" />
          {t("tutorial.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("tutorial.subtitle")}</p>
      </div>

      {!loaded && entries.length === 0 ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <>
          {coreEntries.length > 0 && renderGroup("tutorial.coreSection", coreEntries)}
          <div className="space-y-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Puzzle className="size-5 text-primary" />
              {t("tutorial.pluginSection")}
            </h2>
            {pluginGroups.length === 0 ? (
              <Card>
                <CardContent className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
                  {t("tutorial.noPluginTutorials")}
                </CardContent>
              </Card>
            ) : (
              pluginGroups.map(([pid, list]) => {
                const p = list[0].plugin
                const Icon = pluginIcon(p.icon)
                return (
                  <div key={pid} className="space-y-2">
                    <div className="flex items-center gap-2 px-1">
                      <Icon className="size-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{p.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        {list.length}
                      </Badge>
                    </div>
                    {renderGroup(null, list)}
                  </div>
                )
              })
            )}
          </div>
        </>
      )}
    </div>
  )
}