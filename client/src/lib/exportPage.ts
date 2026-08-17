/** 页面导出工具：把当前页面主体（<main>）完整复制为 HTML 或 Markdown，供 AI 快速理解查看。
 *
 * - collectPageHtml()：克隆 main，剔除脚本/样式/svg 等噪音，包装为完整 HTML 文档；
 * - collectPageMarkdown()：轻量 DOM → Markdown 转换（标题/段落/列表/表格/代码/引用/任务清单/链接/图片）；
 * - copyText()：复制到剪贴板（navigator.clipboard，失败回退 execCommand）。
 *
 * 与具体页面/插件解耦：不感知任何插件内容，仅做通用 DOM 序列化。
 */

const SKIP_TAGS = new Set([
  "SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG", "IFRAME",
  "SELECT", "OPTION", "TEXTAREA", "INPUT",
])

const HEADING_LEVELS: Record<string, number> = { H1: 1, H2: 2, H3: 3, H4: 4, H5: 5, H6: 6 }

/** 取元素可见文本（跳过 SKIP_TAGS） */
function textOf(node: Node): string {
  let out = ""
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      out += child.textContent ?? ""
      return
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return
    const el = child as HTMLElement
    if (SKIP_TAGS.has(el.tagName)) return
    if (el.tagName === "BR") {
      out += "\n"
      return
    }
    if (el.tagName === "IMG") {
      const alt = (el as HTMLImageElement).alt?.trim()
      const src = (el as HTMLImageElement).src?.trim()
      if (src) out += alt ? `![${alt}](${src})` : `![](${src})`
      return
    }
    out += textOf(el)
  })
  return out
}

/** 行内内容 → 行内 Markdown（链接/加粗/斜体/行内代码/图片/文本） */
function inlineToMd(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ""
  if (node.nodeType !== Node.ELEMENT_NODE) return ""
  const el = node as HTMLElement
  if (SKIP_TAGS.has(el.tagName)) return ""
  const tag = el.tagName
  const children = Array.from(el.childNodes).map(inlineToMd).join("")
  const inner = children.trim()
  if (tag === "BR") return "\n"
  if (tag === "IMG") {
    const img = el as HTMLImageElement
    const alt = img.alt?.trim()
    return img.src ? (alt ? `![${alt}](${img.src})` : `![](${img.src})`) : ""
  }
  if (tag === "A") {
    const href = (el as HTMLAnchorElement).getAttribute("href") ?? ""
    return href && inner ? `[${inner}](${href})` : inner
  }
  if (tag === "STRONG" || tag === "B") return inner ? `**${inner}**` : ""
  if (tag === "EM" || tag === "I") return inner ? `*${inner}*` : ""
  if (tag === "CODE") return inner ? `\`${inner.replace(/`/g, "\\`")}\`` : ""
  if (tag === "DEL" || tag === "S") return inner ? `~~${inner}~~` : ""
  if (tag === "SUB") return inner ? `<sub>${inner}</sub>` : ""
  if (tag === "SUP") return inner ? `<sup>${inner}</sup>` : ""
  // 行内包含块级元素（罕见）：直接取文本
  if (el.tagName.match(/^(DIV|P|H[1-6]|UL|OL|LI|PRE|TABLE|BLOCKQUOTE)$/)) return textOf(el).trim()
  return children
}

function escapeTableCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, "<br>").trim()
}

function tableToMd(el: HTMLElement): string {
  const rows: string[][] = []
  el.querySelectorAll("tr").forEach((tr) => {
    const cells = Array.from(tr.children).map((c) => escapeTableCell(textOf(c)))
    if (cells.length) rows.push(cells)
  })
  if (!rows.length) return ""
  const width = Math.max(...rows.map((r) => r.length))
  const lines = rows.map((r) => `| ${Array.from({ length: width }, (_, i) => r[i] ?? "").join(" | ")} |`)
  const sep = `| ${Array.from({ length: width }, () => "---").join(" | ")} |`
  return [lines[0], sep, ...lines.slice(1)].join("\n")
}

function listToMd(el: HTMLElement, depth: number): string {
  const ordered = el.tagName === "OL"
  const indent = "  ".repeat(depth)
  let out = ""
  let index = 0
  el.childNodes.forEach((child) => {
    if (child.nodeType !== Node.ELEMENT_NODE || (child as HTMLElement).tagName !== "LI") return
    const li = child as HTMLElement
    index += 1
    const marker = ordered ? `${index}. ` : "- "
    // li 内容：行内部分 + 可能的嵌套列表/附加块
    const parts: string[] = []
    let firstLine = ""
    const cb = li.querySelector('input[type="checkbox"]') as HTMLInputElement | null
    let pending: HTMLElement[] = []
    li.childNodes.forEach((c) => {
      if (c.nodeType === Node.ELEMENT_NODE) {
        const tag = (c as HTMLElement).tagName
        if (tag === "UL" || tag === "OL") {
          pending.push(c as HTMLElement)
          return
        }
      }
      const inline = inlineToMd(c)
      if (inline.trim()) firstLine += inline.trim()
    })
    if (cb) firstLine = (cb.checked ? "[x] " : "[ ] ") + firstLine
    parts.push(`${indent}${marker}${firstLine}`)
    pending.forEach((sub) => parts.push(listToMd(sub, depth + 1)))
    // li 中其它块级内容（如段落）追加为缩进行
    Array.from(li.children).forEach((c) => {
      const tag = c.tagName
      if (tag === "UL" || tag === "OL") return
      if (tag.match(/^(P|DIV|PRE|BLOCKQUOTE|TABLE)$/)) {
        const block = blockToMd(c as HTMLElement).trim()
        if (block) parts.push(indent + "  " + block.replace(/\n/g, "\n" + indent + "  "))
      }
    })
    out += parts.join("\n") + "\n"
  })
  return out.trimEnd()
}

/** 块级元素 → Markdown（多行） */
function blockToMd(el: HTMLElement): string {
  const tag = el.tagName
  if (HEADING_LEVELS[tag]) {
    const level = HEADING_LEVELS[tag]
    const text = inlineToMd(el).trim()
    return text ? `${"#".repeat(level)} ${text}` : ""
  }
  if (tag === "P") {
    const text = inlineToMd(el).trim()
    return text
  }
  if (tag === "UL" || tag === "OL") return listToMd(el, 0)
  if (tag === "PRE") {
    const codeEl = el.querySelector("code")
    const code = (codeEl ?? el).textContent ?? ""
    const cls = codeEl?.className ?? ""
    const lang = (cls.match(/(?:language|lang)-([\w+-]+)/) ?? [])[1] ?? ""
    return `\`\`\`${lang}\n${code.replace(/\n$/, "")}\n\`\`\``
  }
  if (tag === "BLOCKQUOTE") {
    const inner = blockToMd(el).trim()
    if (!inner) return ""
    return inner
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n")
  }
  if (tag === "TABLE") return tableToMd(el)
  if (tag === "HR") return "---"
  if (tag === "LI") return listToMd(el.parentElement as HTMLElement, 0)
  // 通用容器：递归块级子元素
  return childrenToMd(el)
}

/** 容器内所有块级子节点 → Markdown（块间空行分隔） */
function childrenToMd(el: HTMLElement): string {
  const lines: string[] = []
  let pendingInline = ""
  el.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = (child.textContent ?? "").trim()
      if (text) pendingInline += text
      return
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return
    const c = child as HTMLElement
    if (SKIP_TAGS.has(c.tagName)) return
    const isBlock = !!(
      c.tagName.match(/^(H[1-6]|P|UL|OL|LI|PRE|TABLE|BLOCKQUOTE|HR|DIV|SECTION|ARTICLE|MAIN|HEADER|FOOTER|FORM|FIELDSET|DL|DT|DD)$/) ||
      c.tagName === "TR"
    )
    if (isBlock) {
      if (pendingInline) {
        lines.push(pendingInline.trim())
        pendingInline = ""
      }
      const md = blockToMd(c)
      if (md) lines.push(md)
    } else {
      const inline = inlineToMd(c).trim()
      if (inline) pendingInline += pendingInline ? " " + inline : inline
    }
  })
  if (pendingInline) lines.push(pendingInline.trim())
  return lines.filter((l) => l).join("\n\n")
}

/** 当前页面主体（<main>）→ Markdown 文本 */
export function collectPageMarkdown(): string {
  const main = document.querySelector("main") ?? document.body
  return childrenToMd(main as HTMLElement).trim() + "\n"
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

/** 当前页面主体（<main>）→ 完整 HTML 文档字符串（剔除脚本/样式/svg 等噪音） */
export function collectPageHtml(): string {
  const main = document.querySelector("main") ?? document.body
  const clone = main.cloneNode(true) as HTMLElement
  clone.querySelectorAll("script,style,noscript,template,svg,iframe,input,select,textarea").forEach((n) => n.remove())
  const lang = document.documentElement.lang || "zh-CN"
  const title = escapeHtml(document.title || "MetaPilot")
  const body = clone.outerHTML
  return `<!DOCTYPE html>\n<html lang="${lang}">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${title}</title>\n</head>\n<body>\n${body}\n</body>\n</html>\n`
}

/** 复制文本到剪贴板：优先 navigator.clipboard，失败回退 execCommand */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 回退到 execCommand
  }
  try {
    const ta = document.createElement("textarea")
    ta.value = text
    ta.style.position = "fixed"
    ta.style.opacity = "0"
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand("copy")
    ta.remove()
    return ok
  } catch {
    return false
  }
}