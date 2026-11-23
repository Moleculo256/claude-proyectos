export type Chat = { id: string; title: string; cwd: string; date: number }
export type Project = {
  name: string
  instructions: string
  notes: string[]
  chats: Chat[]
  updated: number
}
export type Db = {
  projects: Record<string, Project>
  byCwd: Record<string, string>
}
export type View = { db: Db; active: string | null; isAskHidden: boolean }

declare module 'claude-code' {
  interface PluginState {
    proyectos: { view: Shaped<View> }
  }
}
