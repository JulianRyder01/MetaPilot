import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"

/**
 * 限时答题模块（交互式学习插件能力，随题目块渲染，核心组件库实现）。
 *
 * 题目块可选字段（兼容旧版本文档：缺省即不限时 / 不隐藏 / 不可重试）：
 * - timeLimitSec: 答题时间（秒），0 或缺省 = 不限时
 * - hiddenBefore: 隐藏题目。简答/填空点击输入框前题干隐藏，点击输入框即显示；
 *   选择等无输入框的题显示「查看题目」按钮（若设了计时，下方显示「点击将开始计时」）。
 *   隐藏题从「揭示」时刻开始计时。
 * - autoSubmitOnTimeout: 超过答题时间后按已填写内容自动提交
 * - retryable: 超时/提交后可重试（重试 = 清空作答、重新完整作答一轮并重新计时）
 * - continuePrev: 接续上一题限时（后台配置，前端不显示）：上一题答完 / 到时间，
 *   立即把页面焦点跳到本题，并延续上一题的剩余时间（共享截止时间）
 *
 * 本 Provider 提供跨题协调：按渲染顺序登记题目、统一计时心跳、隐藏揭示、
 * 超时触发（自动提交回调）、接续上一题（延续截止时间 + 滚动聚焦下一题）。
 */
export interface TimedQuestion {
  enabled: boolean
  timeLimitSec: number
  hiddenBefore: boolean
  autoSubmitOnTimeout: boolean
  retryable: boolean
  continuePrev: boolean
  revealed: boolean
  remainingSec: number | null
  timeup: boolean
  completed: boolean
  reveal: () => void
  notifyCompleted: () => void
  registerAutoSubmit: (fn: () => void) => void
  retry: () => void
  setEl: (el: HTMLElement | null) => void
}

interface Entry {
  id: string
  timeLimitSec: number
  hiddenBefore: boolean
  autoSubmitOnTimeout: boolean
  retryable: boolean
  continuePrev: boolean
  revealed: boolean
  deadline: number | null
  status: "pending" | "running" | "timeup" | "completed"
  autoSubmit: (() => void) | null
  el: HTMLElement | null
}

type RegisterOpts = Pick<Entry, "id" | "timeLimitSec" | "hiddenBefore" | "autoSubmitOnTimeout" | "retryable" | "continuePrev">

interface TimedQuizContextValue {
  /** tick 心跳版本号（500ms 递增），驱动倒计时重渲染 */
  tick: number
  entries: Entry[]
  register: (opts: RegisterOpts) => void
  unregister: (id: string) => void
  reveal: (id: string) => void
  notifyCompleted: (id: string) => void
  registerAutoSubmit: (id: string, fn: () => void) => void
  retry: (id: string) => void
  setEl: (id: string, el: HTMLElement | null) => void
}

const TimedQuizContext = createContext<TimedQuizContextValue | null>(null)

const EMPTY: TimedQuestion = {
  enabled: false,
  timeLimitSec: 0,
  hiddenBefore: false,
  autoSubmitOnTimeout: false,
  retryable: false,
  continuePrev: false,
  revealed: false,
  remainingSec: null,
  timeup: false,
  completed: false,
  reveal: () => {},
  notifyCompleted: () => {},
  registerAutoSubmit: () => {},
  retry: () => {},
  setEl: () => {},
}

export function TimedQuizProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [tick, setTick] = useState(0)
  const entriesRef = useRef(entries)
  entriesRef.current = entries

  // 统一计时心跳
  useEffect(() => {
    const iv = window.setInterval(() => setTick((t) => t + 1), 500)
    return () => window.clearInterval(iv)
  }, [])

  /** 开始/延续计时：接续题沿用最近一个已激活限时题的截止时间，否则新建 */
  const startTimer = useCallback((e: Entry, list: Entry[]): Entry => {
    if (e.deadline != null || e.timeLimitSec <= 0) return e
    const idx = list.indexOf(e)
    let prev: Entry | undefined
    for (let i = idx - 1; i >= 0; i--) {
      if (list[i].deadline != null) {
        prev = list[i]
        break
      }
    }
    return {
      ...e,
      deadline: e.continuePrev && prev ? prev.deadline : Date.now() + e.timeLimitSec * 1000,
      status: "running",
    }
  }, [])

  // 到期检测：标记 timeup
  useEffect(() => {
    const now = Date.now()
    setEntries((list) => {
      let changed = false
      const next = list.map((e) => {
        if (e.status === "running" && e.deadline != null && now >= e.deadline) {
          changed = true
          return { ...e, status: "timeup" as const }
        }
        return e
      })
      return changed ? next : list
    })
  }, [tick])

  /** 激活下一题（若下一题配置了「接续上一题限时」）：延续截止时间 + 滚动聚焦 */
  const advance = useCallback(
    (id: string) => {
      setEntries((list) => {
        const idx = list.findIndex((e) => e.id === id)
        if (idx < 0) return list
        const next = list[idx + 1]
        if (!next || !next.continuePrev) return list
        const n = next.deadline != null ? next : startTimer(next, list)
        const el = n.el
        if (el) {
          requestAnimationFrame(() => {
            el.scrollIntoView({ behavior: "smooth", block: "center" })
            el.focus({ preventScroll: true })
          })
        }
        return list.map((e) => (e.id === n.id ? n : e))
      })
    },
    [startTimer],
  )

  // 超时副作用：自动提交（按已填写内容）+ 接续跳转
  useEffect(() => {
    const now = Date.now()
    const due = entriesRef.current.filter(
      (e) => e.status === "running" && e.deadline != null && now >= e.deadline,
    )
    for (const e of due) {
      e.autoSubmit?.()
      advance(e.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick])

  const register = useCallback(
    (opts: RegisterOpts) => {
      setEntries((list) => {
        if (list.some((e) => e.id === opts.id)) return list
        const e: Entry = { ...opts, revealed: false, deadline: null, status: "pending", autoSubmit: null, el: null }
        // 非隐藏、非接续的限时题：题目渲染即可见，挂载即开始计时
        if (e.timeLimitSec > 0 && !e.hiddenBefore && !e.continuePrev) {
          return [...list, startTimer(e, list)]
        }
        return [...list, e]
      })
    },
    [startTimer],
  )

  const unregister = useCallback((id: string) => {
    setEntries((list) => list.filter((e) => e.id !== id))
  }, [])

  const reveal = useCallback(
    (id: string) => {
      setEntries((list) =>
        list.map((e) => {
          if (e.id !== id || e.revealed) return e
          const n = { ...e, revealed: true }
          if (n.timeLimitSec > 0 && n.deadline == null) return startTimer(n, list)
          return n
        }),
      )
    },
    [startTimer],
  )

  const notifyCompleted = useCallback(
    (id: string) => {
      setEntries((list) =>
        list.map((e) => (e.id === id && e.status !== "completed" ? { ...e, status: "completed" as const } : e)),
      )
      advance(id)
    },
    [advance],
  )

  const registerAutoSubmit = useCallback((id: string, fn: () => void) => {
    setEntries((list) => {
      const e = list.find((x) => x.id === id)
      if (!e || e.autoSubmit === fn) return list
      return list.map((x) => (x.id === id ? { ...x, autoSubmit: fn } : x))
    })
  }, [])

  const retry = useCallback((id: string) => {
    setEntries((list) =>
      list.map((e) => {
        if (e.id !== id) return e
        // 重试 = 重新完整作答一轮：隐藏题回到隐藏态（再次点击查看才开始计时），
        // 非隐藏题重新计时（不沿用前序截止时间）
        const n = {
          ...e,
          status: "pending" as const,
          deadline: null,
          revealed: e.hiddenBefore ? false : e.revealed,
        }
        if (n.timeLimitSec > 0 && !n.hiddenBefore) {
          return { ...n, status: "running" as const, deadline: Date.now() + n.timeLimitSec * 1000 }
        }
        return n
      }),
    )
  }, [])

  const setEl = useCallback((id: string, el: HTMLElement | null) => {
    setEntries((list) => {
      const e = list.find((x) => x.id === id)
      if (!e || e.el === el) return list
      return list.map((x) => (x.id === id ? { ...x, el } : x))
    })
  }, [])

  const value = useMemo<TimedQuizContextValue>(
    () => ({ tick, entries, register, unregister, reveal, notifyCompleted, registerAutoSubmit, retry, setEl }),
    [tick, entries, register, unregister, reveal, notifyCompleted, registerAutoSubmit, retry, setEl],
  )

  return <TimedQuizContext.Provider value={value}>{children}</TimedQuizContext.Provider>
}

/** 题目块接入限时模块的 hook。enabled=false 时返回空实现（不限时/不隐藏等）。 */
export function useTimedQuestion(blockId: string, block: Record<string, unknown>): TimedQuestion {
  const ctx = useContext(TimedQuizContext)
  const ctxRef = useRef(ctx)
  ctxRef.current = ctx
  const timeLimitSec = Math.max(0, Number(block.timeLimitSec ?? 0))
  const hiddenBefore = Boolean(block.hiddenBefore)
  const autoSubmitOnTimeout = Boolean(block.autoSubmitOnTimeout)
  const retryable = Boolean(block.retryable)
  const continuePrev = Boolean(block.continuePrev)
  const enabled = timeLimitSec > 0 || hiddenBefore || continuePrev || retryable || autoSubmitOnTimeout

  useEffect(() => {
    const c = ctxRef.current
    if (!c || !enabled) return
    c.register({ id: blockId, timeLimitSec, hiddenBefore, autoSubmitOnTimeout, retryable, continuePrev })
    return () => c.unregister(blockId)
    // ctx 引用随 entries 变化，不能进依赖（否则会卸载重注册导致计时状态丢失）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockId, enabled, timeLimitSec, hiddenBefore, autoSubmitOnTimeout, retryable, continuePrev])

  if (!ctx || !enabled) return EMPTY

  const entry = ctx.entries.find((e) => e.id === blockId)
  const remainingSec =
    entry?.deadline != null ? Math.max(0, Math.ceil((entry.deadline - Date.now()) / 1000)) : null

  return {
    enabled: true,
    timeLimitSec,
    hiddenBefore,
    autoSubmitOnTimeout,
    retryable,
    continuePrev,
    revealed: entry?.revealed ?? false,
    remainingSec,
    timeup: entry?.status === "timeup",
    completed: entry?.status === "completed",
    reveal: () => ctx.reveal(blockId),
    notifyCompleted: () => ctx.notifyCompleted(blockId),
    registerAutoSubmit: (fn) => ctx.registerAutoSubmit(blockId, fn),
    retry: () => ctx.retry(blockId),
    setEl: (el) => ctx.setEl(blockId, el),
  }
}

/** 秒 → mm:ss 显示 */
export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`
}
