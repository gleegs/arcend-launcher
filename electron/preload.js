const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("arcend", {
  play: () => ipcRenderer.send("launch-game"),
  setRam: (value) => ipcRenderer.send("set-ram", value),
  getConfig: () => ipcRenderer.invoke("get-config"),

  onProgress: (callback) => {
    ipcRenderer.removeAllListeners("download-progress");
    ipcRenderer.on("download-progress", (event, data) => callback(data));
  },

  onVersion: (callback) => {
    ipcRenderer.on("app-version", (event, version) => callback(version));
  },

  onLog: (callback) => {
    ipcRenderer.removeAllListeners("log-message");
    ipcRenderer.on("log-message", (event, message) => callback(message));
  },
  
  // --- ÉVÉNEMENT : LE JEU EST FERMÉ ---
  onGameClosed: (callback) => {
    ipcRenderer.removeAllListeners("game-closed");
    ipcRenderer.on("game-closed", () => callback());
  },

  minimizeWindow: () => ipcRenderer.send("window-minimize"),
  closeWindow: () => ipcRenderer.send("window-close"),
  openFolder: (type) => ipcRenderer.send("open-folder", type),

  checkAuth: () => ipcRenderer.invoke("check-auth"),
  login: () => ipcRenderer.invoke("login-request"),
  logout: () => ipcRenderer.invoke("logout-request")
});