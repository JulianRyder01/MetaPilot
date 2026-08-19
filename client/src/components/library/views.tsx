import * as React from "react"
import { Check, CheckSquare, Folder, Grid3X3, List, Plus, RefreshCw, Search, X } from "lucide-react"

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
  /** 打开链接（顶层集合=其内容页，文档=所属顶层集合内容页；嵌套文件夹为空=进入内部浏览） */
  href?: string
  /** 顶层集合的类型 kind（嵌套文件夹/文档无） */
  kind?: string
  /** 嵌套文件夹的父文件夹 id */
  parentId?: string
  /** 文档类型（文档条目） */
  docType?: string
}

/** 自然卡片视图：与「我的库」文件夹卡片完全一致的网格（库与软链接共用）。 */
export function NaturalCardsView({
  entries,
  onOpen,
  onContextMenu,
  selectionMode = false,
  selected = new Set<string>(),
  onToggleSelect,
}: {
  entries: ContentEntry[]
  onOpen: (id: string) => void
  onContextMenu?: (e: React.MouseEvent, entry: ContentEntry) => void
  selectionMode?: boolean
  selected?: Set<string>
  onToggleSelect?: (id: string) => void
}) {
  if (entries.length === 0) return null
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map((e) => (
        <Card
          key={e.id}
          onContextMenu={onContextMenu ? (ev) => onContextMenu(ev, e) : undefined}
          className={cn(
            "group relative h-full transition-shadow hover:shadow-md",
            selectionMode && selected.has(e.id) && "border-primary ring-1 ring-primary",
          )}
        >
          {selectionMode && onToggleSelect && (
            <span
              role="checkbox"
              aria-checked={selected.has(e.id)}
              tabIndex={0}
              onClick={(ev) => {
                ev.preventDefault()
                ev.stopPropagation()
                onToggleSelect(e.id)
              }}
              onKeyDown={(ev) => {
                if (ev.key === " " || ev.key === "Enter") {
                  ev.preventDefault()
                  ev.stopPropagation()
                  onToggleSelect(e.id)
                }
              }}
              className={cn(
                "absolute left-2.5 top-2.5 z-20 flex size-5 cursor-pointer items-center justify-center rounded border bg-background/90 shadow-sm transition-colors",
                selected.has(e.id)
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-transparent group-hover:border-primary/60",
              )}
            >
              <Check className="size-3.5" />
            </span>
          )}
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              {e.icon}
              <span className="min-w-0 flex-1 break-words leading-snug line-clamp-2">{e.name}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between text-sm text-muted-foreground">
            {e.badge}
            {e.tail}
          </CardContent>
          <button
            type="button"
            onClick={() => (selectionMode ? onToggleSelect?.(e.id) : onOpen(e.id))}
            className="absolute inset-0"
            aria-label={e.name}
          />
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
  selectionMode = false,
  selected = new Set<string>(),
  onToggleSelect,
  onEnterSelection,
  onExitSelection,
  bulkBar,
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
  /** 多选模式：开启后条目显示勾选框，点击条目切换选中（不触发打开） */
  selectionMode?: boolean
  selected?: Set<string>
  onToggleSelect?: (id: string) => void
  onEnterSelection?: () => void
  onExitSelection?: () => void
  /** 多选模式下的批量操作栏（由调用方渲染：已选数量 + 删除/移动到/创建副本） */
  bulkBar?: React.ReactNode
}) {
  const t = useT()
  const filtered = search.trim()
    ? entries.filter((e) => e.name.toLowerCase().includes(search.trim().toLowerCase()))
    : entries

  /** 多选勾选框：点击切换选中并阻止打开/右键（悬停显示） */
  function SelectCheck({ entry }: { entry: ContentEntry }) {
    const checked = selected.has(entry.id)
    return (
      <span
        role="checkbox"
        aria-checked={checked}
        tabIndex={0}
        onClick={(ev) => {
          ev.preventDefault()
          ev.stopPropagation()
          onToggleSelect?.(entry.id)
        }}
        onContextMenu={(ev) => {
          ev.preventDefault()
          ev.stopPropagation()
          onToggleSelect?.(entry.id)
        }}
        onKeyDown={(ev) => {
          if (ev.key === " " || ev.key === "Enter") {
            ev.preventDefault()
            ev.stopPropagation()
            onToggleSelect?.(entry.id)
          }
        }}
        className={cn(
          "absolute left-1.5 top-1.5 z-10 flex size-5 cursor-pointer items-center justify-center rounded border bg-background/90 shadow-sm transition-colors",
          checked ? "border-primary bg-primary text-primary-foreground" : "border-border text-transparent group-hover:border-primary/60",
        )}
      >
        <Check className="size-3.5" />
      </span>
    )
  }

  return (
    <div className="min-h-[calc(100vh-240px)] overflow-hidden rounded-lg border">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* 工具栏：面包屑 + 搜索/视图切换/批量选择/刷新/新建文件夹 */}
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
            {onEnterSelection && !selectionMode && (
              <Button variant="outline" size="sm" className="h-8" onClick={onEnterSelection}>
                <CheckSquare className="size-3.5" />
                {t("core.library.bulkSelect")}
              </Button>
            )}
            {onExitSelection && selectionMode && (
              <Button variant="outline" size="sm" className="h-8" onClick={onExitSelection}>
                <X className="size-3.5" />
                {t("core.library.exitSelection")}
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onRefresh} title={t("common.refresh")}>
              <RefreshCw className="size-3.5" />
            </Button>
            {!selectionMode && createActions && createActions.length > 0 && (
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

        {/* 多选模式批量操作栏 */}
        {selectionMode && bulkBar}

        {/* 主体：自然卡片网格 / 网格 / 列表 */}
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">{emptyHint}</div>
          ) : natural ? (
            <NaturalCardsView
              entries={filtered}
              onOpen={onOpen}
              selectionMode={selectionMode}
              selected={selected}
              onToggleSelect={onToggleSelect}
            />
          ) : view === "grid" ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((e) => (
                <div
                  key={e.id}
                  onContextMenu={onContextMenu ? (ev) => onContextMenu(ev, e) : undefined}
                  className={cn(
                    "group relative rounded-lg border p-4 transition-shadow hover:shadow-md",
                    selectionMode && selected.has(e.id) && "border-primary ring-1 ring-primary",
                  )}
                >
                  {selectionMode && onToggleSelect && <SelectCheck entry={e} />}
                  <button
                    type="button"
                    onClick={() => (selectionMode ? onToggleSelect?.(e.id) : onOpen(e.id))}
                    className="flex w-full flex-col items-center gap-2 text-center"
                  >
                    <span className="flex h-8 items-center">{e.icon ?? (e.type === "folder" ? <Folder className="size-8 text-primary" /> : null)}</span>
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
                  className={cn(
                    "group flex items-center gap-3 rounded-lg border px-4 py-3 text-sm hover:bg-accent/40",
                    selectionMode && selected.has(e.id) && "border-primary bg-primary/5",
                  )}
                >
                  {selectionMode && onToggleSelect && <SelectCheck entry={e} />}
                  <button
                    type="button"
                    onClick={() => (selectionMode ? onToggleSelect?.(e.id) : onOpen(e.id))}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    {e.icon ?? (e.type === "folder" ? <Folder className="size-4 shrink-0 text-primary" /> : null)}
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
