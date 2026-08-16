import type { Document, Folder, FolderItem, Section } from "@/lib/api"

export interface FolderNode {
  id: string
  name: string
  children: FolderNode[]
  documents: Document[]
}

export interface FolderTree {
  roots: FolderNode[]
  rootDocuments: Document[]
}

/** 把顶层文件夹的 folders + documents 构造成 文件夹树 + 根级文档。 */
export function buildFolderTree(col: Folder): FolderTree {
  const folders: FolderItem[] = col.folders ?? []
  const docs: Document[] = col.documents ?? []
  const nodeMap = new Map<string, FolderNode>()
  for (const f of folders) {
    nodeMap.set(f.id, { id: f.id, name: f.name, children: [], documents: [] })
  }
  const roots: FolderNode[] = []
  for (const f of folders) {
    const node = nodeMap.get(f.id)!
    if (f.parentId && nodeMap.has(f.parentId)) {
      nodeMap.get(f.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }
  const rootDocuments: Document[] = []
  for (const d of docs) {
    if (d.folderId && nodeMap.has(d.folderId)) {
      nodeMap.get(d.folderId)!.documents.push(d)
    } else {
      rootDocuments.push(d)
    }
  }
  return { roots, rootDocuments }
}

/** 递归收集树中全部文档（文件夹内 + 根级），保持顺序。 */
export function collectAllDocuments(tree: FolderTree): Document[] {
  const out: Document[] = []
  const walk = (nodes: FolderNode[]) => {
    for (const n of nodes) {
      out.push(...n.documents)
      walk(n.children)
    }
  }
  walk(tree.roots)
  out.push(...tree.rootDocuments)
  return out
}

/** 解析小节引用：返回目标文档及其第一个小节（供跳转）。 */
export function resolveRefTarget(col: Folder, refDocId?: string): { doc: Document; section: Section } | null {
  if (!refDocId) return null
  const tree = buildFolderTree(col)
  for (const doc of collectAllDocuments(tree)) {
    if (doc.id === refDocId) {
      if (doc.sections.length === 0) return { doc, section: { id: "", name: "", blocks: [] } }
      return { doc, section: doc.sections[0] }
    }
  }
  return null
}

/** 获取文件夹的完整路径（用于面包屑/提示），例如 根/子/孙。 */
export function folderPath(col: Folder, folderId: string): string {
  const folders = col.folders ?? []
  const byId = new Map(folders.map((f) => [f.id, f]))
  const parts: string[] = []
  let cur = byId.get(folderId)
  while (cur) {
    parts.unshift(cur.name)
    cur = cur.parentId ? byId.get(cur.parentId) : undefined
  }
  return parts.join(" / ")
}
