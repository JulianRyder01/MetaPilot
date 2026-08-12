import { create } from "zustand"

interface AppState {
  currentLibraryId: string | null
  setCurrentLibraryId: (id: string | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  currentLibraryId: null,
  setCurrentLibraryId: (id) => set({ currentLibraryId: id }),
}))
