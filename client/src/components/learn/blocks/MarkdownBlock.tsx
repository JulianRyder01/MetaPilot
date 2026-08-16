import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { useLightbox } from "@/components/ui/lightbox"

export function MarkdownBlock({ content }: { content?: string }) {
  const { open, node } = useLightbox()
  return (
    <div className="markdown-body rounded-lg border bg-card p-5">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          img: (props) => (
            // 点击图片全屏查看（滚轮缩放），与软链接媒体预览行为一致
            <img
              {...props}
              className="max-h-96 cursor-zoom-in rounded-md border object-contain transition-shadow hover:shadow-md"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (props.src) open({ src: props.src, alt: props.alt ?? undefined })
              }}
            />
          ),
        }}
      >
        {content ?? ""}
      </ReactMarkdown>
      {node}
    </div>
  )
}
