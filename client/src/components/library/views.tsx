import * as React from "react"
import { Folder, Grid3X3, List, Plus, RefreshCw, Search } from "lucide-react"

import { useT } from "@/i18n"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/** 统一内容条目：库与软链接的文件夹/文档条目（图标与徽标由调用方提供，组件只负责布局） */
export interface ContentEntry {
  id: string
  name: string
  type: "folder" | "file"
  icon: React.ReactNode
  /** 左侧徽标（卡片底部 / 列表行，如 kind 徽标、「文件夹」徽标、文件类型） */
  badge?: React.ReactNode
  /** 右侧徽标（列表行尾部，如文件大小、单位） */
  tail?: React.ReactNode
}

/** 自然卡片视图：与「我的库」文件夹卡片完全一致的网格（库与软链接共用）。 */
export function NaturalCardsView({
  entries,
  onOpen,
}: {
  entries: ContentEntry[]
  onOpen: (id: string) => void
}) {
  if (entries.length === 0) return null
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map((e) => (
        <Card key={e.id} className="relative h-full transition-shadow hover:shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              {e.icon}
              <span className="truncate">{e.name}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between text-sm text-muted-foreground">
            {e.badge}
            {e.tail}
          </CardContent>
          <button type="button" onClick={() => onOpen(e.id)} className="absolute inset-0" aria-label={e.name} />
        </Card>
      ))}
    </div>
  )
}

/** 文件管理器视图：面包屑工具栏（搜索/视图切换/刷新/新建菜单）+ 网格/列表（库与软链接共用）。
 *  natural=true 时隐藏网格/列表切换，主体渲染自然卡片网格（NaturalCardsView）。 */
export function FileManagerView({
  breadcrumbs,
  entries,
  onOpen,
  onContextMenu,
  search,
  onSearch,
  view,
  onViewChange,
  onRefresh,
  createActions,
  emptyHint,
  natural = false,
}: {
  breadcrumbs: React.ReactNode[]
  entries: ContentEntry[]
  onOpen: (id: string) => void
  onContextMenu?: (e: React.MouseEvent, entry: ContentEntry) => void
  search: string
  onSearch: (v: string) => void
  view: "grid" | "list"
  onViewChange: (v: "grid" | "list") => void
  onRefresh: () => void
  /** 新建菜单项（新建文件夹/文档/图表等） */
  createActions?: { label: string; icon?: React.ReactNode; action: () => void }[]
  emptyHint: React.ReactNode
  natural?: boolean
}) {
  const t = useT()
  const filtered = search.trim()
    ? entries.filter((e) => e.name.toLowerCase().includes(search.trim().toLowerCase()))
    : entries

  return (
    <div className="min-h-[calc(100vh-240px)] overflow-hidden rounded-lg border">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* 工具栏：面包屑 + 搜索/视图切换/刷新/新建文件夹 */}
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
          <div className="flex min-w-0 items-center gap-0.5 text-sm">{breadcrumbs}</div>
          <div className="ml-auto flex items-center gap-1.5">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => onSearch(e.target.value)}
                placeholder={t("symlink.searchPlaceholder")}
                className="h-8 w-40 pl-7 text-xs"
              />
            </div>
            {!natural && (
              <div className="flex items-center rounded-md border">
                <button
                  type="button"
                  onClick={() => onViewChange("grid")}
                  className={cn(
                    "rounded-l-md p-1.5",
                    view === "grid" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                  title={t("symlink.gridView")}
                >
                  <Grid3X3 className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onViewChange("list")}
                  className={cn(
                    "rounded-r-md p-1.5",
                    view === "list" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                  title={t("symlink.listView")}
                >
                  <List className="size-3.5" />
                </button>
              </div>
            )}
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onRefresh} title={t("common.refresh")}>
              <RefreshCw className="size-3.5" />
            </Button>
            {createActions && createActions.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8">
                    <Plus className="size-3.5" />
                    {t("common.create")}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {createActions.map((a) => (
                    <DropdownMenuItem key={a.label} onClick={a.action}>
                      {a.icon}
                      {a.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {/* 主体：自然卡片网格 / 网格 / 列表 */}
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">{emptyHint}</div>
          ) : natural ? (
            <NaturalCardsView entries={filtered} onOpen={onOpen} />
          ) : view === "grid" ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((e) => (
                <div
                  key={e.id}
                  onContextMenu={onContextMenu ? (ev) => onContextMenu(ev, e) : undefined}
                  className="group relative rounded-lg border p-4 transition-shadow hover:shadow-md"
                >
                  <button type="button" onClick={() => onOpen(e.id)} className="flex w-full flex-col items-center gap-2 text-center">
                    <span className="flex h-8 items-center">{e.type === "folder" ? <Folder className="size-8 text-primary" /> : e.icon}</span>
                    <span className="line-clamp-2 w-full break-all text-xs font-medium">{e.name}</span>
                    {e.badge}
                    {e.type === "file" && e.tail}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((e) => (
                <div
                  key={e.id}
                  onContextMenu={onContextMenu ? (ev) => onContextMenu(ev, e) : undefined}
                  className="group flex items-center gap-3 rounded-lg border px-4 py-3 text-sm hover:bg-accent/40"
                >
                  <button type="button" onClick={() => onOpen(e.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    {e.type === "folder" ? <Folder className="size-4 shrink-0 text-primary" /> : e.icon}
                    <span className="truncate font-medium">{e.name}</span>
                    {e.badge && <span className="ml-auto shrink-0">{e.badge}</span>}
                    {e.type === "file" && e.tail}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** 统一的「文件夹」徽标 */
export function FolderBadge({ label }: { label: string }) {
  return (
    <Badge variant="secondary" className="gap-1">
      <Folder className="size-2.5" />
      {label}
    </Badge>
  )
}
