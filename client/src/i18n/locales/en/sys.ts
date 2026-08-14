/** System domain dictionary (English overlay). */
export const sysEn: Record<string, string> = {
  "sys.title": "Settings",
  "sys.subtitle": "Control plugin-related notifications. MetaPilot is a document library: documents always open for viewing, and parts that can't render are shown as raw data; notifications are reminders only and never interrupt your work.",
  "sys.language": "Language",
  "sys.languageDesc": "UI language. Applies immediately and is saved locally (localStorage).",
  "sys.appearance": "Appearance",
  "sys.appearanceDesc": "Switch light / dark mode anytime; featured themes are provided by the Themes plugin (enable it in the plugin manager first).",
  "sys.pluginWarnings": "Plugin warnings",
  "sys.pluginWarningsDesc": "When opening a document that depends on a disabled plugin (e.g. Course, Knowledge Base), show a warning bubble: “This content depends on the xx plugin; some components may not render.”",
  "sys.pluginErrors": "Plugin errors",
  "sys.pluginErrorsDesc": "When an action fails because a plugin is disabled (e.g. AI grading, KB Q&A), show an error bubble; when off, such errors are silently ignored.",
  "sys.componentSource": "Mark component sources",
  "sys.componentSourceDesc": "When on, components provided by plugins are marked with the plugin's icon (hover to see the name) in library/stats pages; the official core (MetaPilot itself) is never marked.",
  "sys.localOnly": "These preferences are saved only in your browser (localStorage) and don't affect other devices.",
}
