import { registerWindowIpc } from './window.ipc'
import { registerStoreIpc } from './store.ipc'
import { registerAuthIpc } from './auth.ipc'
import { registerJavaIpc } from './java.ipc'
import { registerPackwizIpc } from './packwiz.ipc'
import { registerArcIpc } from './arc.ipc'
import { registerMapIpc } from './map.ipc'
import { registerArticleIpc } from './article.ipc'
import { registerServerIpc } from './server.ipc'
import { registerLauncherIpc } from './launcher.ipc'
import { registerShellIpc } from './shell.ipc'
import { registerAppIpc } from './app.ipc'
import { registerUpdaterIpc } from './updater.ipc'

export function registerAllIpcHandlers(): void {
  registerWindowIpc()
  registerStoreIpc()
  registerAuthIpc()
  registerJavaIpc()
  registerPackwizIpc()
  registerArcIpc()
  registerMapIpc()
  registerArticleIpc()
  registerServerIpc()
  registerLauncherIpc()
  registerShellIpc()
  registerAppIpc()
  registerUpdaterIpc()
}
