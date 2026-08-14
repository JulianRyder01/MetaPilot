import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

/**
 * 官方核心弹窗库（MetaPilot core v1.0.1）
 *
 * 统一提供三款美观弹窗，所有插件（course / symlink / knowledge_base / themes …）
 * 均可通过 `useDialogs()` 一行调用，无需各自拼 Dialog：
 *
 *   const { confirm, prompt, select } = useDialogs()
 *   if (await confirm({ title: "卸载软链接", ... })) { ... }
 *   const name = await prompt({ title: "新建文件夹", ... })
 *   const v = await select({ title: "选择视图", items: [...] })
 *
 * 样式全部使用 Tailwind 语义色类（bg-background / text-foreground / text-destructive …），
 * 由主题插件注入的 CSS 变量驱动，随 light/dark 与任意特色主题自动保持一致。
 */

/** 确认弹窗配置。 */
export interface ConfirmOptions {
  title: string
  description?: ReactNode
  confirmText?: string
  cancelText?: string
  /** 危险操作：确认按钮为红色（如删除 / 卸载）。 */
  destructive?: boolean
  /** 标题旁的自定义图标（如危险操作的警告图标）。 */
  icon?: ReactNode
}

/** 填空（输入）弹窗配置。 */
export interface PromptOptions {
  title: string
  description?: ReactNode
  initialValue?: string
  placeholder?: string
  confirmText?: string
  cancelText?: string
}

/** 单选弹窗配置。 */
export interface SelectOptions<T extends string = string> {
  title: string
  description?: ReactNode
  items: { value: T; label: string }[]
  initialValue?: T
  confirmText?: string
  cancelText?: string
}

export interface Dialogs {
  /** 确认弹窗：resolve 为 true=确认，false=取消。 */
  confirm: (options: ConfirmOptions) => Promise<boolean>
  /** 填空弹窗：resolve 为输入值（取消为 null）。 */
  prompt: (options: PromptOptions) => Promise<string | null>
  /** 单选弹窗：resolve 为选中值（取消为 null）。 */
  select: <T extends string = string>(options: SelectOptions<T>) => Promise<T | null>
}

type DialogState =
  | { id: number; kind: "confirm"; options: ConfirmOptions; resolve: (v: boolean) => void }
  | { id: number; kind: "prompt"; options: PromptOptions; resolve: (v: string | null) => void }
  | { id: number; kind: "select"; options: SelectOptions; resolve: (v: string | null) => void }

const DialogsContext = createContext<Dialogs | null>(null)

/** 在任意插件/页面中调用统一弹窗。必须在 <DialogProvider> 内使用。 */
export function useDialogs(): Dialogs {
  const ctx = useContext(DialogsContext)
  if (!ctx) throw new Error("useDialogs 必须在 <DialogProvider> 内使用")
  return ctx
}

function ConfirmBody({ options, onDone }: { options: ConfirmOptions; onDone: (v: boolean) => void }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          {options.icon}
          {options.title}
        </DialogTitle>
        {options.description != null && <DialogDescription>{options.description}</DialogDescription>}
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" onClick={() => onDone(false)}>
          {options.cancelText ?? "取消"}
        </Button>
        <Button variant={options.destructive ? "destructive" : "default"} onClick={() => onDone(true)}>
          {options.confirmText ?? "确定"}
        </Button>
      </DialogFooter>
    </>
  )
}

function PromptBody({ options, onDone }: { options: PromptOptions; onDone: (v: string | null) => void }) {
  const [value, setValue] = useState(options.initialValue ?? "")
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onDone(value)
      }}
      className="space-y-3"
    >
      <DialogHeader>
        <DialogTitle>{options.title}</DialogTitle>
        {options.description != null && <DialogDescription>{options.description}</DialogDescription>}
      </DialogHeader>
      <Input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={options.placeholder}
      />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onDone(null)}>
          {options.cancelText ?? "取消"}
        </Button>
        <Button type="submit">{options.confirmText ?? "确定"}</Button>
      </DialogFooter>
    </form>
  )
}

function SelectBody({ options, onDone }: { options: SelectOptions; onDone: (v: string | null) => void }) {
  const [value, setValue] = useState<string>(options.initialValue ?? options.items[0]?.value ?? "")
  return (
    <div className="space-y-3">
      <DialogHeader>
        <DialogTitle>{options.title}</DialogTitle>
        {options.description != null && <DialogDescription>{options.description}</DialogDescription>}
      </DialogHeader>
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger>
          <SelectValue placeholder="请选择…" />
        </SelectTrigger>
        <SelectContent>
          {options.items.map((it) => (
            <SelectItem key={it.value} value={it.value}>
              {it.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <DialogFooter>
        <Button variant="outline" onClick={() => onDone(null)}>
          {options.cancelText ?? "取消"}
        </Button>
        <Button disabled={!value} onClick={() => onDone(value)}>
          {options.confirmText ?? "确定"}
        </Button>
      </DialogFooter>
    </div>
  )
}

/** 全局弹窗 Provider：挂在应用根部（与 <Toaster /> 同级），全应用共享一套主题化弹窗。 */
export function DialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const seq = useRef(0)

  const finish = useCallback((value: unknown) => {
    setDialog((cur) => {
      cur?.resolve(value as never)
      return null
    })
  }, [])

  const api = useMemo<Dialogs>(
    () => ({
      confirm: (options) =>
        new Promise<boolean>((resolve) => setDialog({ id: ++seq.current, kind: "confirm", options, resolve })),
      prompt: (options) =>
        new Promise<string | null>((resolve) => setDialog({ id: ++seq.current, kind: "prompt", options, resolve })),
      select: <T extends string = string>(options: SelectOptions<T>) =>
        new Promise<T | null>((resolve) =>
          setDialog({
            id: ++seq.current,
            kind: "select",
            options: options as SelectOptions,
            resolve: resolve as (v: string | null) => void,
          }),
        ),
    }),
    [],
  )

  return (
    <DialogsContext.Provider value={api}>
      {children}
      {dialog?.kind === "confirm" && (
        <Dialog open onOpenChange={(o) => !o && finish(false)}>
          <DialogContent className="sm:max-w-md">
            <ConfirmBody key={dialog.id} options={dialog.options} onDone={finish} />
          </DialogContent>
        </Dialog>
      )}
      {dialog?.kind === "prompt" && (
        <Dialog open onOpenChange={(o) => !o && finish(null)}>
          <DialogContent className="sm:max-w-md">
            <PromptBody key={dialog.id} options={dialog.options} onDone={finish} />
          </DialogContent>
        </Dialog>
      )}
      {dialog?.kind === "select" && (
        <Dialog open onOpenChange={(o) => !o && finish(null)}>
          <DialogContent className="sm:max-w-md">
            <SelectBody key={dialog.id} options={dialog.options} onDone={finish} />
          </DialogContent>
        </Dialog>
      )}
    </DialogsContext.Provider>
  )
}
