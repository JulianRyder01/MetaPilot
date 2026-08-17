import { create } from "zustand"

export interface AskAiMessage {
  role: "user" | "assistant"
  content: string
}

interface AskAiState {
  /** 面板是否展开 */
  open: boolean
  /** 对话历史（全局存活：切换页面再回来不丢失） */
  messages: AskAiMessage[]
  /** 是否正在等待回答 */
  asking: boolean
  toggle: () => void
  openPanel: () => void
  closePanel: () => void
  setAsking: (v: boolean) => void
  /** 追加一轮问答（发送用户消息 / 写入 AI 回答） */
  append: (m: AskAiMessage) => void
  /** 清空上下文 */
  clear: () => void
}

/** 阅读页「问 AI」面板的全局状态：跨页面/跨小节切换保持，切换窗口再切回来不会刷新。 */
export const useAskAiStore = create<AskAiState>((set) => ({
  open: false,
  messages: [],
  asking: false,
  toggle: () => set((s) => ({ open: !s.open })),
  openPanel: () => set({ open: true }),
  closePanel: () => set({ open: false }),
  setAsking: (v) => set({ asking: v }),
  append: (m) =>
    set((s) => ({
      messages: [...s.messages, m].slice(-100),
    })),
  clear: () => set({ messages: [], asking: false }),
}))