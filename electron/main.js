const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const os = require("os");
const fs = require("fs");
const axios = require("axios");
const AdmZip = require("adm-zip");
const { Client } = require("minecraft-launcher-core");
const { Auth } = require("msmc");
const { autoUpdater } = require("electron-updater");

const launcher = new Client();
let mainWindow;
let activeAuth = null;
let isGameRunning = false;

/* ==========================================================
    1. CONFIGURATION DYNAMIQUE & DOSSIERS
   ========================================================== */
const isDev = !app.isPackaged; 
const folderName = isDev ? ".arcend_dev" : ".arcend";
const gameDir = path.join(os.homedir(), "AppData", "Roaming", folderName);
const configDir = path.join(gameDir, "config");
const configPath = path.join(configDir, "app.json");

const javaPath = isDev 
    ? path.join(__dirname, "../runtime/java-21/bin/java.exe") 
    : path.join(process.resourcesPath, "runtime/java-21/bin/java.exe");

const localForgePath = path.join(gameDir, "neoforge-installer.jar");
const VERSION_URL = "http://51.89.138.186/versions.json";

if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
}

function sendLog(message) {
    console.log(message);
    if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send("log-message", message);
    }
}

// --- SYSTÈME DE SECOURS POUR SAUVEGARDER LA SESSION & CONFIG ---
function saveAuthConfig(auth) {
    let config = { ram: 8, version: "0.0.0", showConsole: false };
    if (fs.existsSync(configPath)) config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    config.savedAuth = auth;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
}

function getSavedAuth() {
    if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
        return config.savedAuth || null;
    }
    return null;
}

/* ==========================================================
    2. GESTION DE LA FENÊTRE
   ========================================================== */
function createWindow() {
    mainWindow = new BrowserWindow({
        title: "Arcend Launcher",
        width: 1280,
        height: 720,
        frame: false,
        transparent: true,
        resizable: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, "preload.js")
        }
    });

    mainWindow.once('ready-to-show', () => {
        sendLog(`[Système] Mode: ${isDev ? 'DEV' : 'PROD'}`);
        // Log de vérification de version au démarrage
        sendLog(`[Système] Version Launcher: ${app.getVersion()}`);
        if (!isDev) autoUpdater.checkForUpdatesAndNotify();
    });

    mainWindow.loadFile(path.join(__dirname, "../app/index.html"));

    if (isDev) {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }

    mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.send('app-version', app.getVersion());
    });
}

app.whenReady().then(createWindow);

/* ==========================================================
    3. SYNCHRONISATION (MODPACK & NEOFORGE)
   ========================================================== */
async function downloadFile(url, destPath, event, taskName) {
    const response = await axios({ method: 'get', url: url, responseType: 'stream' });
    const totalLength = response.headers['content-length'];

    return new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(destPath);
        let downloadedLength = 0;

        response.data.on('data', (chunk) => {
            downloadedLength += chunk.length;
            const progress = Math.round((downloadedLength / totalLength) * 100);
            event.sender.send("download-progress", { type: "BASE", task: taskName, total: progress });
        });

        response.data.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

function smartClean(excludedFiles) {
    if (!fs.existsSync(gameDir)) return;
    const items = fs.readdirSync(gameDir);
    items.forEach(item => {
        if (!excludedFiles.includes(item) && !item.startsWith('.')) {
            const fullPath = path.join(gameDir, item);
            try {
                fs.rmSync(fullPath, { recursive: true, force: true });
            } catch (e) { sendLog(`[Erreur] Nettoyage: ${item}`); }
        }
    });
}

async function handleUpdates(event) {
    try {
        sendLog("[Arcend] Vérification du serveur...");
        const response = await axios.get(VERSION_URL);
        const remote = response.data;

        let appConfig = { ram: 8, version: "0.0.0", showConsole: false };
        if (fs.existsSync(configPath)) {
            appConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
        }
        
        if (appConfig.version !== remote["arcend-modpack-version"]) {
            sendLog(`[Arcend] MAJ détectée: ${remote["arcend-modpack-version"]}`);
            
            if (!fs.existsSync(gameDir)) {
                fs.mkdirSync(gameDir, { recursive: true });
            }

            smartClean(['options.txt', 'servers.dat', 'saves', 'screenshots', 'resourcepacks', 'shaderpacks', 'config', 'neoforge-installer.jar']);
            
            const zipPath = path.join(gameDir, "update_temp.zip");
            await downloadFile(remote["arcend-modpack-url"], zipPath, event, "Modpack");
            
            const zip = new AdmZip(zipPath);
            zip.extractAllTo(gameDir, true);
            fs.unlinkSync(zipPath);
            
            appConfig.version = remote["arcend-modpack-version"];
            fs.writeFileSync(configPath, JSON.stringify(appConfig, null, 2));
            sendLog("[Arcend] Mods installés !");
        }

        if (!fs.existsSync(localForgePath)) {
            sendLog("[Arcend] Téléchargement de NeoForge...");
            await downloadFile(remote["arcend-neoforge-url"], localForgePath, event, "NeoForge");
        }

    } catch (err) {
        sendLog(`[Erreur] Sync Impossible: ${err.message}`);
    }
}

/* ==========================================================
    4. AUTHENTIFICATION MICROSOFT (MSMC)
   ========================================================== */

ipcMain.handle("check-auth", async () => {
    sendLog("[Système] Vérification de la session en arrière-plan...");
    try {
        const authManager = new Auth("select_account");
        const xbox = await authManager.refresh(); 
        const mc = await xbox.getMinecraft();
        if (mc && mc.profile) {
            activeAuth = mc.mclc();
            saveAuthConfig(activeAuth);
            sendLog(`[Système] Connecté automatiquement (MSMC) : ${mc.profile.name}`);
            return { name: mc.profile.name, uuid: mc.profile.id };
        }
    } catch (err) {}

    const saved = getSavedAuth();
    if (saved && saved.name) {
        activeAuth = saved;
        sendLog(`[Système] Connecté via session sauvegardée : ${saved.name}`);
        return { name: saved.name, uuid: saved.uuid };
    }
    return null;
});

ipcMain.handle("login-request", async () => {
    try {
        sendLog("[Arcend] Ouverture de la page de connexion Microsoft...");
        const authManager = new Auth("select_account"); 
        const xbox = await authManager.launch("electron");
        const mc = await xbox.getMinecraft();
        if (mc && mc.profile) {
            activeAuth = mc.mclc();
            saveAuthConfig(activeAuth);
            sendLog(`[Système] Connecté avec succès : ${mc.profile.name}`);
            return { name: mc.profile.name, uuid: mc.profile.id };
        }
    } catch (err) {
        sendLog(`[Erreur] Connexion annulée ou échouée.`);
        return null;
    }
    return null;
});

ipcMain.handle("logout-request", () => {
    activeAuth = null;
    saveAuthConfig(null);
    sendLog(`[Système] Déconnexion réussie.`);
    return true;
});

/* ==========================================================
    5. LOGIQUE DE JEU
   ========================================================== */
ipcMain.on("launch-game", async (event) => {
    try {
        if (!activeAuth) {
            sendLog("[Erreur] Vous devez être connecté pour jouer.");
            return;
        }

        await handleUpdates(event);

        let config = { ram: 8 };
        if (fs.existsSync(configPath)) config = JSON.parse(fs.readFileSync(configPath, "utf8"));

        const opts = {
            authorization: activeAuth,
            root: gameDir,
            javaPath: javaPath,
            version: { number: "1.21.1", type: "release" },
            forge: localForgePath,
            memory: { max: `${config.ram}G`, min: "2G" },
            overrides: { detached: false }
        };

        sendLog("[Arcend] Lancement de Minecraft...");
        launcher.removeAllListeners("data");
        launcher.removeAllListeners("progress");
        launcher.removeAllListeners("close");

        isGameRunning = false;
        launcher.launch(opts);

        launcher.on("data", (e) => {
            if (!isGameRunning) {
                isGameRunning = true;
                if (mainWindow) mainWindow.hide(); 
            }
            sendLog(e);
        });

        launcher.on("progress", (e) => event.sender.send("download-progress", e));
        
        launcher.on("close", () => { 
            isGameRunning = false;
            if (mainWindow) {
                mainWindow.show(); 
                mainWindow.webContents.send("game-closed"); 
            }
        });

    } catch (err) {
        sendLog(`[Erreur Fatale] ${err.message}`);
    }
});

/* ==========================================================
    6. PARAMÈTRES ET DOSSIERS
   ========================================================== */
ipcMain.handle("get-config", () => {
    if (fs.existsSync(configPath)) return JSON.parse(fs.readFileSync(configPath, "utf8"));
    return { ram: 8, version: "0.0.0", showConsole: false };
});

ipcMain.on("set-ram", (_, value) => {
    let config = { ram: 8, version: "0.0.0", showConsole: false };
    if (fs.existsSync(configPath)) config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    config.ram = Number(value);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
    sendLog(`[Config] RAM mise à jour : ${value} Go`);
});

// SAUVEGARDE L'ÉTAT DE LA CONSOLE
ipcMain.on("set-console", (_, value) => {
    let config = { ram: 8, version: "0.0.0", showConsole: false };
    if (fs.existsSync(configPath)) config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    config.showConsole = value;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
    sendLog(`[Config] Console ${value ? 'activée' : 'désactivée'} par défaut`);
});

ipcMain.on("window-minimize", () => { if (mainWindow) mainWindow.minimize(); });
ipcMain.on("window-close", () => { app.quit(); });

ipcMain.on("open-folder", (_, type) => {
    if (type === "game") {
        if (fs.existsSync(gameDir)) shell.openPath(gameDir);
        else sendLog("[Erreur] Le dossier du jeu n'existe pas encore.");
    } else if (type === "launcher") {
        shell.openPath(process.cwd()); 
    }
});