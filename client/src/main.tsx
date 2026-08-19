import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import React from "react"

import "./index.css"
import App from "./App"
import { Toaster } from "@/components/ui/sonner"
import { DialogProvider } from "@/components/ui/dialog-provider"

// 注入全局 React：供第三方插件 frontend.js（运行时动态加载）使用宿主 React 编写 UI
;(window as unknown as { React?: unknown }).React = React
// 注入 createRoot：供第三方插件 frontend.js 自建弹窗/挂载到 body（如库内"脱敏上传"弹窗）
;(window as unknown as { createRoot?: typeof createRoot }).createRoot = createRoot

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <DialogProvider>
        <App />
      </DialogProvider>
      <Toaster richColors />
    </BrowserRouter>
  </StrictMode>,
)
