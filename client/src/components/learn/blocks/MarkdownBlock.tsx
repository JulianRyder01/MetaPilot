import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

export function MarkdownBlock({ content }: { content?: string }) {
  return (
    <div className="markdown-body rounded-lg border bg-card p-5">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content ?? ""}</ReactMarkdown>
    </div>
  )
}
