import { Languages, Palette, Settings2 } from "lucide-react"

import { LANGS, useI18nStore, useT } from "@/i18n"
import { useSettingsStore } from "@/stores/settings"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { ThemeSelector } from "@/components/theme/ThemeSelector"
import { AiProviderCard } from "@/components/settings/AiProviderCard"
import { LocalModelsCard } from "@/components/settings/LocalModelsCard"
import { cn } from "@/lib/utils"

export default function SettingsPage() {
  const t = useT()
  const lang = useI18nStore((s) => s.lang)
  const setLang = useI18nStore((s) => s.setLang)
  const {
    showPluginWarnings,
    showPluginErrors,
    showComponentSource,
    setShowPluginWarnings,
    setShowPluginErrors,
    setShowComponentSource,
  } = useSettingsStore()

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-6 py-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Settings2 className="size-6 text-primary" />
          {t("sys.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("sys.subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Languages className="size-4 text-primary" />
            {t("sys.language")}
          </CardTitle>
          <CardDescription>{t("sys.languageDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {LANGS.map((l) => (
              <button
                key={l.value}
                onClick={() => setLang(l.value)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm transition-colors",
                  lang === l.value
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {l.native}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* AI 统一网关：provider 配置（写回 .env）+ 内置本地模型 */}
      <AiProviderCard />
      <LocalModelsCard />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Palette className="size-4 text-primary" />
            {t("sys.appearance")}
          </CardTitle>
          <CardDescription>{t("sys.appearanceDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeSelector />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base">{t("sys.pluginWarnings")}</CardTitle>
            <CardDescription>{t("sys.pluginWarningsDesc")}</CardDescription>
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
            <CardTitle className="text-base">{t("sys.pluginErrors")}</CardTitle>
            <CardDescription>{t("sys.pluginErrorsDesc")}</CardDescription>
          </div>
          <Switch checked={showPluginErrors} onCheckedChange={setShowPluginErrors} />
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base">{t("sys.componentSource")}</CardTitle>
            <CardDescription>{t("sys.componentSourceDesc")}</CardDescription>
          </div>
          <Switch checked={showComponentSource} onCheckedChange={setShowComponentSource} />
        </CardHeader>
      </Card>

      <p className="text-xs text-muted-foreground">{t("sys.localOnly")}</p>
    </div>
  )
}
