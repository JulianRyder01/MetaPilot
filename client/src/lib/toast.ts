import { toast as sonnerToast, type ExternalToast } from "sonner"

let idCounter = 1

/**
 * 统一为每个 toast 注入稳定的 id 与 testId：
 * - id 用于 `toast.dismiss(id)` 精确关闭
 * - testId 会渲染成 DOM 上的 `data-testid`，供 Toaster 的事件委托映射回该 toast
 */
function withMeta<T extends ExternalToast | undefined>(
  data: T,
): ExternalToast & { id: number | string; testId: string } {
  const id = data?.id ?? idCounter++
  return { ...data, id, testId: String(id) }
}

/** 项目内统一的 toast 入口：所有提示走这里，行为保持一致（点击关闭 / 右键复制等由 Toaster 统一处理）。 */
export const toast = {
  success: (message: Parameters<typeof sonnerToast.success>[0], data?: ExternalToast) =>
    sonnerToast.success(message, withMeta(data)),
  error: (message: Parameters<typeof sonnerToast.error>[0], data?: ExternalToast) =>
    sonnerToast.error(message, withMeta(data)),
  warning: (message: Parameters<typeof sonnerToast.warning>[0], data?: ExternalToast) =>
    sonnerToast.warning(message, withMeta(data)),
  info: (message: Parameters<typeof sonnerToast.info>[0], data?: ExternalToast) =>
    sonnerToast.info(message, withMeta(data)),
  loading: (message: Parameters<typeof sonnerToast.loading>[0], data?: ExternalToast) =>
    sonnerToast.loading(message, withMeta(data)),
  message: (message: Parameters<typeof sonnerToast.message>[0], data?: ExternalToast) =>
    sonnerToast.message(message, withMeta(data)),
  custom: (jsx: Parameters<typeof sonnerToast.custom>[0], data?: ExternalToast) =>
    sonnerToast.custom(jsx, withMeta(data)),
  promise: <ToastData,>(
    promise: Parameters<typeof sonnerToast.promise<ToastData>>[0],
    data?: Parameters<typeof sonnerToast.promise<ToastData>>[1],
  ) =>
    sonnerToast.promise(
      promise,
      withMeta(data as ExternalToast) as Parameters<typeof sonnerToast.promise<ToastData>>[1],
    ),
  dismiss: (id?: number | string) => sonnerToast.dismiss(id),
}

export type { ExternalToast }
