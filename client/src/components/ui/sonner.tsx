import { useEffect, useRef } from "react"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { toast } from "@/lib/toast"

/** 复制文本到剪贴板，带兼容 fallback（非安全上下文时 clipboard API 不可用）。 */
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const textarea = document.createElement("textarea")
    textarea.value = text
    textarea.style.position = "fixed"
    textarea.style.opacity = "0"
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand("copy")
    document.body.removeChild(textarea)
  }
}

function Toaster({ ...props }: ToasterProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // 操作按钮（关闭/动作）交给 sonner 自己处理，避免点击按钮时重复触发“点击关闭”
    const isInteractive = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      Boolean(target.closest("[data-button], [data-close-button], [data-action], [data-cancel]"))

    // 左键点击 toast 主体 → 关闭该 toast
    const handleClick = (e: MouseEvent) => {
      const li = e.target instanceof HTMLElement ? e.target.closest("[data-sonner-toast]") : null
      if (!li || isInteractive(e.target)) return
      const id = li.getAttribute("data-testid")
      if (id) toast.dismiss(id)
    }

    // 右键点击 → 复制 toast 内容到剪贴板并提示
    const handleContextMenu = (e: MouseEvent) => {
      const li = e.target instanceof HTMLElement ? e.target.closest("[data-sonner-toast]") : null
      if (!li) return
      e.preventDefault()
      const title = li.querySelector("[data-title]")?.textContent?.trim() ?? ""
      const description = li.querySelector("[data-description]")?.textContent?.trim() ?? ""
      const text = description ? `${title}\n${description}` : title
      if (!text) return
      void copyText(text).then(() => toast.success("已复制到剪贴板"))
    }

    container.addEventListener("click", handleClick)
    container.addEventListener("contextmenu", handleContextMenu)
    return () => {
      container.removeEventListener("click", handleClick)
      container.removeEventListener("contextmenu", handleContextMenu)
    }
  }, [])

  return (
    <div ref={containerRef}>
      <Sonner
        theme="light"
        className="toaster group"
        position="top-right"
        toastOptions={{ duration: 4000 }}
        style={
          {
            "--normal-bg": "var(--popover)",
            "--normal-text": "var(--popover-foreground)",
            "--normal-border": "var(--border)",
          } as React.CSSProperties
        }
        {...props}
      />
    </div>
  )
}

export { Toaster }
