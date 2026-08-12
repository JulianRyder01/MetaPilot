import { Settings2 } from "lucide-react"

import { useSettingsStore } from "@/stores/settings"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"

export default function SettingsPage() {
  const {
    showPluginWarnings,
    showPluginErrors,
    setShowPluginWarnings,
    setShowPluginErrors,
  } = useSettingsStore()

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-6 py-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Settings2 className="size-6 text-primary" />
          设置
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          控制插件相关的提示行为。MetaPilot 是文档库：文档始终可以打开查看，未渲染的部分会以原始数据展示；
          提示仅作提醒，不会打断操作。
        </p>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base">插件警告提示</CardTitle>
            <CardDescription>
              打开依赖已禁用插件的文档（如课程、知识库）时，在顶部弹出警告气泡，
              提示"此内容依赖 xx 插件，部分组件可能无法渲染"。
            </CardDescription>
          </div>
          <Switch
            checked={showPluginWarnings}
            onCheckedChange={setShowPluginWarnings}
          />
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base">插件错误提示</CardTitle>
            <CardDescription>
              操作时若因插件未启用而失败（例如 AI 判题、知识库问答），在顶部弹出错误气泡；
              关闭后此类错误将被静默忽略。
            </CardDescription>
          </div>
          <Switch checked={showPluginErrors} onCheckedChange={setShowPluginErrors} />
        </CardHeader>
      </Card>

      <p className="text-xs text-muted-foreground">
        提示仅在浏览器本地保存（localStorage），不影响其他设备。
      </p>
    </div>
  )
}
