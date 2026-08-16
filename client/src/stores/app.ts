import { create } from "zustand"

interface AppState {
  currentLibraryId: string | null
  setCurrentLibraryId: (id: string | null) => void
  /** 当前软链接挂载（软链接视为库：在「我的库」右侧直接浏览） */
  currentMountId: string | null
  setCurrentMountId: (id: string | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  currentLibraryId: null,
  setCurrentLibraryId: (id) => set({ currentLibraryId: id }),
  currentMountId: null,
  setCurrentMountId: (id) => set({ currentMountId: id }),
}))
