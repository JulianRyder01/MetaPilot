import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"

import "./index.css"
import App from "./App"
import { Toaster } from "@/components/ui/sonner"
import { DialogProvider } from "@/components/ui/dialog-provider"

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
