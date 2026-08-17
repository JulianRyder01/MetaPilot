import { useEffect, useRef, useState } from "react"
import { Bot, Eraser, Send, Sparkles, User, X } from "lucide-react"

import { useT } from "@/i18n"
import { aiChat } from "@/lib/api"
import { toast } from "@/lib/toast"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useAskAiStore } from "@/stores/ask-ai"
import { cn } from "@/lib/utils"

/** 阅读页左下角「问 AI」：按钮 + 弹出式问答面板（全局状态，切换页面不丢失对话）。 */
export function AskAiPanel() {
  const t = useT()
  const {
    open,
    messages,
    asking,
    toggle,
    closePanel,
    setAsking,
    append,
    clear,
  } = useAskAiStore()
  const [input, setInput] = useState("")
  const listRef = useRef<HTMLDivElement>(null)

  // 新消息或面板展开时滚动到底部
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, open])

  async function send() {
    const text = input.trim()
    if (!text || asking) return
    const history = useAskAiStore.getState().messages
    const userMsg = { role: "user" as const, content: text }
    append(userMsg)
    setInput("")
    setAsking(true)
    try {
      const r = await aiChat([...history, userMsg].map((m) => ({ role: m.role, content: m.content })))
      append({ role: "assistant", content: r.content })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("core.learn.askFailed"))
    } finally {
      setAsking(false)
    }
  }

  return (
    <div className="fixed bottom-4 left-4 z-40 flex flex-col items-start gap-2">
      {open && (
        <div className="flex h-[min(520px,60vh)] w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border bg-card shadow-2xl">
          {/* 标题栏 + 清空上下文 */}
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Sparkles className="size-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{t("core.learn.askAiTitle")}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={clear}
              disabled={messages.length === 0}
              title={t("core.learn.clearContext")}
            >
              <Eraser className="size-3.5" />
              {t("core.learn.clearContext")}
            </Button>
            <Button variant="ghost" size="icon" className="size-7" onClick={closePanel} title={t("common.close")}>
              <X className="size-4" />
            </Button>
          </div>

          {/* 消息列表 */}
          <ScrollArea className="flex-1">
            <div ref={listRef} className="space-y-3 overflow-y-auto p-3">
              {messages.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  {t("core.learn.askInputPlaceholder")}
                </p>
              ) : (
                messages.map((m, i) => (
                  <div
                    key={i}
                    className={cn("flex gap-2", m.role === "user" ? "justify-end" : "justify-start")}
                  >
                    {m.role === "assistant" && (
                      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Bot className="size-3.5" />
                      </span>
                    )}
                    <div
                      className={cn(
                        "max-w-[80%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm",
                        m.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground",
                      )}
                    >
                      {m.content}
                    </div>
                    {m.role === "user" && (
                      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <User className="size-3.5" />
                      </span>
                    )}
                  </div>
                ))
              )}
              {asking && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Bot className="size-3.5" />
                  <span className="animate-pulse">…</span>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* 输入区：回车发送，Shift+Enter 换行 */}
          <div className="flex items-end gap-2 border-t p-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  send()
                }
              }}
              rows={2}
              placeholder={t("core.learn.askInputPlaceholder")}
              className="max-h-32 min-h-[2.25rem] flex-1 resize-none rounded-md border bg-background px-3 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button size="icon" className="size-9 shrink-0" onClick={send} disabled={asking || !input.trim()}>
              <Send className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* 左下角按钮 */}
      <Button variant="outline" size="sm" className="gap-1.5 shadow-md" onClick={toggle}>
        <Sparkles className="size-4 text-primary" />
        {t("core.learn.askAi")}
      </Button>
    </div>
  )
}