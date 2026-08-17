import { cn } from "@/lib/utils"

interface Props {
  /** 阅读进度 0~1；0 时仅显示灰色底圈。 */
  pct?: number
  /** 已完成：绿色圆 + 对勾。 */
  done?: boolean
  className?: string
}

/** 小节进度圆圈（自绘 SVG）：灰底圈 + 蓝色弧线（自顶点起顺时针，弧长=阅读进度）；完成时绿色带勾。 */
export function SectionRing({ pct = 0, done = false, className }: Props) {
  const r = 7
  const c = 2 * Math.PI * r
  const p = Math.max(0, Math.min(1, pct))
  return (
    <svg
      viewBox="0 0 16 16"
      className={cn("size-3.5 shrink-0 -rotate-90", className)}
      aria-hidden="true"
    >
      {done ? (
        <>
          <circle
            cx="8"
            cy="8"
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-emerald-600"
          />
          <path
            d="M5.1 8.3 L7.2 10.4 L10.9 5.7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-emerald-600"
          />
        </>
      ) : (
        <>
          <circle
            cx="8"
            cy="8"
            r={r}
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.25"
            strokeWidth="2"
          />
          {p > 0 && (
            <circle
              cx="8"
              cy="8"
              r={r}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={`${c * p} ${c}`}
            />
          )}
        </>
      )}
    </svg>
  )
}