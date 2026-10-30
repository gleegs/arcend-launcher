import { IpcChannels } from '../types/ipc'
import { fetchLatestYoutubeVideo } from '../services/youtube'
import { safeHandle } from './utils'

export function registerYoutubeIpc(): void {
  safeHandle(IpcChannels.YOUTUBE_FETCH_LATEST, () => fetchLatestYoutubeVideo())
}
