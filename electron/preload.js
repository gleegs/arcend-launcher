const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("arcend", {
  // Déclenche le lancement (aligné sur ipcMain.on("launch-game") du main.js)
  play: () => ipcRenderer.send("launch-game"),

  // Envoie la valeur de la RAM pour sauvegarde
  setRam: (value) => ipcRenderer.send("set-ram", value),

  // Récupère la config au démarrage (RAM enregistrée, etc.)
  getConfig: () => ipcRenderer.invoke("get-config"),

  // Écoute la progression du téléchargement (ZIP + Minecraft)
  onProgress: (callback) => {
    ipcRenderer.removeAllListeners("download-progress");
    ipcRenderer.on("download-progress", (event, data) => callback(data));
  },

  // Récupère la version logicielle envoyée par le main
  onVersion: (callback) => {
    // Pas besoin de removeAllListeners ici car c'est envoyé une seule fois au load
    ipcRenderer.on("app-version", (event, version) => callback(version));
  },

  // Reçoit les logs système et Minecraft pour les afficher dans ta console UI
  onLog: (callback) => {
    ipcRenderer.removeAllListeners("log-message");
    ipcRenderer.on("log-message", (event, message) => callback(message));
  }
});