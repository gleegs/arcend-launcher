import { create } from 'zustand'
import { useLogStore } from './log'

interface CachedProfile {
  id: string
  name: string
}

export type AuthState =
  | { status: 'online'; profile: CachedProfile }
  | { status: 'offline'; profile: CachedProfile }
  | { status: 'unauthenticated' }

interface AuthStore {
  state: AuthState
  isLoading: boolean
  /** Message d'échec de la dernière tentative de connexion, `null` si aucune. */
  error: string | null
  init: () => Promise<void>
  login: () => Promise<void>
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthStore>((set) => ({
  state: { status: 'unauthenticated' },
  isLoading: false,
  error: null,

  init: async () => {
    const result = await window.electronAPI.authGetState()
    if (result.ok && result.data) {
      set({ state: result.data })
    }
  },

  login: async () => {
    set({ isLoading: true, error: null })
    const result = await window.electronAPI.authLogin()
    if (result.ok && result.data) {
      set({ state: result.data, isLoading: false })
    } else {
      // Un échec de login était jusqu'ici totalement silencieux : le joueur
      // cliquait, la popup se fermait, et rien ne se passait.
      const error = result.error ?? 'Erreur inconnue'
      useLogStore.getState().add(`Connexion échouée : ${error}`, 'error')
      set({ isLoading: false, error })
    }
  },

  logout: async () => {
    await window.electronAPI.authLogout()
    set({ state: { status: 'unauthenticated' }, error: null })
  },
}))
