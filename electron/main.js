const { app, BrowserWindow, ipcMain } = require("electron");
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

/* ==========================================================
    1. CONFIGURATION DYNAMIQUE & DOSSIERS
   ========================================================== */
const isDev = !app.isPackaged; 
// On utilise .arcend pour tout centraliser proprement
const folderName = ".arcend";
const gameDir = path.join(os.homedir(), "AppData", "Roaming", folderName);
const configDir = path.join(gameDir, "config");
const configPath = path.join(configDir, "app.json");

// Chemins pour Java et l'installeur NeoForge (téléchargé plus tard)
const javaPath = isDev 
    ? path.join(__dirname, "../runtime/java-21/bin/java.exe") 
    : path.join(process.resourcesPath, "runtime/java-21/bin/java.exe");

const localForgePath = path.join(gameDir, "neoforge-installer.jar");

// URL de ton fichier manifest sur le VPS
const VERSION_URL = "http://51.89.138.186/versions.json";

// INITIALISATION CRITIQUE : Création des dossiers si absents
if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
}

function sendLog(message) {
    console.log(message);
    if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send("log-message", message);
    }
}

/* ==========================================================
    2. GESTION DE LA FENÊTRE
   ========================================================== */
function createWindow() {
    mainWindow = new BrowserWindow({
        title: "Arcend Launcher",
        width: 1000,
        height: 650,
        resizable: false,
        backgroundColor: "#0E0E11",
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, "preload.js")
        }
    });

    mainWindow.once('ready-to-show', () => {
        sendLog(`[Système] Mode: ${isDev ? 'DEV' : 'PROD'}`);
        if (!isDev) autoUpdater.checkForUpdatesAndNotify();
    });

    mainWindow.loadFile(path.join(__dirname, "../app/index.html"));

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

        let appConfig = { ram: 8, version: "0.0.0" };
        if (fs.existsSync(configPath)) {
            appConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
        }
        
        // --- MISE À JOUR DU MODPACK (tirets du 6) ---
        if (appConfig.version !== remote["arcend-modpack-version"]) {
            sendLog(`[Arcend] MAJ détectée: ${remote["arcend-modpack-version"]}`);
            
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

        // --- TÉLÉCHARGEMENT NEOFORGE ---
        if (!fs.existsSync(localForgePath)) {
            sendLog("[Arcend] Téléchargement de NeoForge...");
            await downloadFile(remote["arcend-neoforge-url"], localForgePath, event, "NeoForge");
        }

    } catch (err) {
        sendLog(`[Erreur] Sync Impossible: ${err.message}`);
    }
}

/* ==========================================================
    4. LOGIQUE DE JEU
   ========================================================== */
ipcMain.on("launch-game", async (event) => {
    try {
        sendLog("[Arcend] Connexion Microsoft...");
        const authManager = new Auth("select_account");
        const xbox = await authManager.launch("electron");
        const mc = await xbox.getMinecraft();

        if (!mc || !mc.profile) return;

        await handleUpdates(event);

        let config = { ram: 8 };
        if (fs.existsSync(configPath)) config = JSON.parse(fs.readFileSync(configPath, "utf8"));

        const opts = {
            authorization: mc.mclc(),
            root: gameDir,
            javaPath: javaPath,
            version: { number: "1.21.1", type: "release" },
            forge: localForgePath,
            memory: { max: `${config.ram}G`, min: "2G" },
            overrides: { detached: false }
        };

        sendLog("[Arcend] Lancement...");
        launcher.launch(opts);

        launcher.on("data", (e) => sendLog(e));
        launcher.on("progress", (e) => event.sender.send("download-progress", e));
        launcher.on("close", () => { if (mainWindow) mainWindow.show(); });

    } catch (err) {
        sendLog(`[Erreur Fatale] ${err.message}`);
    }
});

/* ==========================================================
    5. PARAMÈTRES (RAM) - LE LIEN FIXÉ
   ========================================================== */
ipcMain.handle("get-config", () => {
    if (fs.existsSync(configPath)) return JSON.parse(fs.readFileSync(configPath, "utf8"));
    return { ram: 8, version: "0.0.0" };
});

ipcMain.on("set-ram", (_, value) => {
    let config = { ram: 8, version: "0.0.0" };
    if (fs.existsSync(configPath)) config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    
    config.ram = Number(value);
    
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
    sendLog(`[Config] RAM mise à jour : ${value} Go`);
});