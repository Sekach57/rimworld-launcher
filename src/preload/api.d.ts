import type { LauncherApi } from '../shared/api.ts'

declare global {
  interface Window {
    api: LauncherApi
  }
}

export {}
