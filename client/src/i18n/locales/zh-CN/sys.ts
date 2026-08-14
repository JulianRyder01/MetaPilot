/** 域词典：sys（系统设置/插件管理/主题等）。key 前缀 sys. */
export const sysZhCN: Record<string, string> = {
  "sys.title": "设置",
  "sys.subtitle": "控制插件相关的提示行为。MetaPilot 是文档库：文档始终可以打开查看，未渲染的部分会以原始数据展示；提示仅作提醒，不会打断操作。",
  "sys.language": "语言",
  "sys.languageDesc": "界面显示语言，切换后立即生效并保存在本地（localStorage）。",
  "sys.appearance": "外观",
  "sys.appearanceDesc": "黑夜 / 白天模式随时可切换；特色主题由「主题」插件提供（在插件管理页启用后选装）。",
  "sys.pluginWarnings": "插件警告提示",
  "sys.pluginWarningsDesc": "打开依赖已禁用插件的文档（如课程、知识库）时，在顶部弹出警告气泡，提示“此内容依赖 xx 插件，部分组件可能无法渲染”。",
  "sys.pluginErrors": "插件错误提示",
  "sys.pluginErrorsDesc": "操作时若因插件未启用而失败（例如 AI 判题、知识库问答），在顶部弹出错误气泡；关闭后此类错误将被静默忽略。",
  "sys.componentSource": "标记组件来源",
  "sys.componentSourceDesc": "开启后，在库、统计等页面中，由插件提供的组件/内容会标出该插件的图标（悬停可见插件名）；官方核心（MetaPilot 本身）不标记。关闭后不显示来源标记。",
  "sys.localOnly": "提示仅在浏览器本地保存（localStorage），不影响其他设备。",
}
