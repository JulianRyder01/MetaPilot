/** 域词典覆盖层：sys（繁体中文）。缺失回退 zh-CN。 */
export const sysZhTW: Record<string, string> = {
  "sys.title": "設定",
  "sys.subtitle": "控制外掛相關的提示行為。MetaPilot 是文件庫：文件隨時可以開啟檢視，未渲染的部分會以原始資料展示；提示僅作提醒，不會打斷操作。",
  "sys.language": "語言",
  "sys.languageDesc": "介面顯示語言，切換後立即生效並保存在本機（localStorage）。",
  "sys.appearance": "外觀",
  "sys.appearanceDesc": "黑夜 / 白天模式隨時可切換；特色主題由「主題」外掛提供（在外掛管理頁啟用後選裝）。",
  "sys.pluginWarnings": "外掛警告提示",
  "sys.pluginWarningsDesc": "開啟依賴已停用外掛的文件（如課程、知識庫）時，在頂部彈出警告氣泡，提示「此內容依賴 xx 外掛，部分元件可能無法渲染」。",
  "sys.pluginErrors": "外掛錯誤提示",
  "sys.pluginErrorsDesc": "操作時若因外掛未啟用而失敗（例如 AI 判題、知識庫問答），在頂部彈出錯誤氣泡；關閉後此類錯誤將被靜默忽略。",
  "sys.componentSource": "標記元件來源",
  "sys.componentSourceDesc": "開啟後，在庫、統計等頁面中，由外掛提供的元件/內容會標出該外掛的圖示（懸停可見外掛名）；官方核心（MetaPilot 本身）不標記。關閉後不顯示來源標記。",
  "sys.localOnly": "提示僅在瀏覽器本機儲存（localStorage），不影響其他裝置。",
}
