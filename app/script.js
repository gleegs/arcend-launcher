// --- ÉLÉMENTS DU DOM ---
const wrapper = document.querySelector(".launcherWrapper");
const playBtn = document.getElementById("playBtn");
const logsContainer = document.querySelector(".logsText");
const versionBadge = document.querySelector(".versionBadge");
const logsPanel = document.querySelector(".logsPanel");
const loaderContainer = document.getElementById("loaderContainer");
const progressBar = document.getElementById("progressBar");
const btnClose = document.querySelector(".btnClose");
const btnMinus = document.querySelector(".btnMinus");
const btnParams = document.querySelector(".btnParams");
const btnAuth = document.getElementById("btnAuth");
const playerName = document.getElementById("playerName");
const playerHead = document.getElementById("playerHead");
const settingsPanel = document.querySelector(".settingsPanel");
const settingsCloseBtn = document.querySelector(".settingsCloseBtn");
const ramSlider = document.getElementById("ramSlider");
const ramHint = document.getElementById("ramHint");
const consoleToggle = document.getElementById("consoleToggle");
const btnOpenGame = document.getElementById("btnOpenGame");
const btnOpenLauncher = document.getElementById("btnOpenLauncher");
const logoContainer = document.querySelector(".logoContainer");

// --- GESTION DU THÈME ---
const themes = ["day", "sunset", "night"];
let currentThemeIndex = 1;
let isManualTheme = false;
let isTransitioning = false;

function applyTheme(themeName) {
    if (isTransitioning) return;
    isTransitioning = true;
    const mainContent = document.querySelector(".mainContent");
    const logoImg = document.querySelector(".logoImg");
    if (mainContent) mainContent.classList.add("theme-switching");
    if (logoImg) logoImg.classList.add("theme-switching");
    setTimeout(() => {
        if (mainContent) mainContent.style.backgroundImage = `url('./assets/images/${themeName}-background.png')`;
        if (logoImg) logoImg.src = `assets/images/${themeName}-logo.png`;
        setTimeout(() => {
            if (mainContent) mainContent.classList.remove("theme-switching");
            if (logoImg) logoImg.classList.remove("theme-switching");
            setTimeout(() => { isTransitioning = false; }, 400);
        }, 50);
    }, 400); 
}

function updateThemeAuto() {
    if (isManualTheme) return;
    const hour = new Date().getHours();
    let theme = (hour >= 9 && hour < 16) ? "day" : ((hour >= 16 && hour < 19) || (hour >= 6 && hour < 9)) ? "sunset" : "night";
    if (themes[currentThemeIndex] !== theme) {
        currentThemeIndex = themes.indexOf(theme);
        applyTheme(theme);
    }
}

logoContainer.addEventListener("click", () => {
    isManualTheme = true;
    currentThemeIndex = (currentThemeIndex + 1) % themes.length;
    applyTheme(themes[currentThemeIndex]);
});

// --- AUTHENTIFICATION ---
btnAuth.addEventListener("click", async () => {
    const currentState = btnAuth.getAttribute("data-state");
    if (currentState === "logged-out") {
        btnAuth.style.opacity = "0.5";
        const user = await window.arcend.login();
        if (user) {
            playerName.innerText = user.name.toUpperCase();
            playerHead.src = `https://minotar.net/helm/${user.uuid}/16.png`;
            btnAuth.setAttribute("data-state", "logged-in");
            playBtn.classList.remove("disabled"); 
        }
        btnAuth.style.opacity = "1";
    } else if (currentState === "logged-in") {
        btnAuth.setAttribute("data-state", "confirm-logout");
    } else if (currentState === "confirm-logout") {
        btnAuth.style.opacity = "0.5";
        await window.arcend.logout();
        btnAuth.setAttribute("data-state", "logged-out");
        playBtn.classList.add("disabled"); 
        btnAuth.style.opacity = "1";
    }
});

btnAuth.addEventListener("mouseleave", () => {
    if (btnAuth.getAttribute("data-state") === "confirm-logout") btnAuth.setAttribute("data-state", "logged-in");
});

// --- FENÊTRE ---
btnClose.addEventListener('click', () => {
    wrapper.classList.remove("show-app");
    wrapper.classList.add("hide-app");
    setTimeout(() => { window.arcend.closeWindow(); }, 300);
});

btnMinus.addEventListener('click', () => {
    wrapper.classList.remove("show-app");
    wrapper.classList.add("hide-app");
    setTimeout(() => {
        window.arcend.minimizeWindow();
        setTimeout(() => { wrapper.classList.remove("hide-app"); wrapper.classList.add("show-app"); }, 100);
    }, 300);
});

// --- OPTIONS ---
btnParams.addEventListener('click', () => { settingsPanel.classList.add("open"); });
settingsCloseBtn.addEventListener('click', () => { settingsPanel.classList.remove("open"); });
consoleToggle.addEventListener('change', (e) => { logsPanel.style.display = e.target.checked ? "flex" : "none"; });
btnOpenGame.addEventListener('click', () => { window.arcend.openFolder("game"); });
btnOpenLauncher.addEventListener('click', () => { window.arcend.openFolder("launcher"); });

// --- SLIDER RAM ---
function updateSliderFill(slider) {
    const percentage = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
    slider.style.background = `linear-gradient(90deg, var(--color-green) ${percentage}%, var(--color-white-50) ${percentage}%)`;
    ramHint.innerText = `SÉLECTIONNÉ : ${slider.value}GO (CONSEILLÉ : 8GO)`;
}
ramSlider.addEventListener('input', (e) => { updateSliderFill(e.target); });
ramSlider.addEventListener('change', (e) => { window.arcend.setRam(Number(e.target.value)); });

// --- INITIALISATION ---
async function init() {
    try {
        setTimeout(() => { wrapper.classList.add("show-app"); }, 100);
        updateThemeAuto();
        setInterval(updateThemeAuto, 60000); 
        const config = await window.arcend.getConfig();
        ramSlider.value = config.ram || 8;
        updateSliderFill(ramSlider);
        const user = await window.arcend.checkAuth();
        if (user) {
            playerName.innerText = user.name.toUpperCase();
            playerHead.src = `https://minotar.net/helm/${user.uuid}/16.png`;
            btnAuth.setAttribute("data-state", "logged-in");
            playBtn.classList.remove("disabled");
        } else {
            btnAuth.setAttribute("data-state", "logged-out");
            playBtn.classList.add("disabled");
        }
    } catch (err) { console.error(err); }
}

playBtn.addEventListener('click', () => {
    if (btnAuth.getAttribute("data-state") === "logged-out") {
        const logLine = document.createElement("p");
        logLine.style.color = "#E14444";
        logLine.innerText = `> [Erreur] Veuillez vous connecter avant de jouer.`;
        logsContainer.appendChild(logLine);
        logsContainer.scrollTop = logsContainer.scrollHeight;
        if (!consoleToggle.checked) { consoleToggle.checked = true; logsPanel.style.display = "flex"; }
        return; 
    }
    playBtn.style.opacity = "0";
    playBtn.style.pointerEvents = "none";
    loaderContainer.classList.add("show");
    window.arcend.play();
});

window.arcend.onLog((message) => {
    const logLine = document.createElement("p");
    logLine.innerText = `> ${message}`;
    logsContainer.appendChild(logLine);
    logsContainer.scrollTop = logsContainer.scrollHeight;
});

window.arcend.onVersion((version) => { versionBadge.innerText = `v${version}`; });
window.arcend.onProgress((data) => {
    let percent = (data.type === "BASE") ? data.total : Math.round((data.task / data.total) * 100);
    progressBar.style.width = `${percent}%`;
});
window.arcend.onGameClosed(() => {
    loaderContainer.classList.remove("show");
    playBtn.style.opacity = "1";
    playBtn.style.pointerEvents = "auto";
    wrapper.classList.add("show-app");
});

init();