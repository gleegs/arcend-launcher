// --- ÉLÉMENTS DU DOM ---
const ramSlider = document.getElementById("ramSlider");
const ramValueLabel = document.getElementById("ramValue");
const playBtn = document.getElementById("playBtn");
const loaderContainer = document.getElementById("loader-container");
const progressBar = document.getElementById("progress-bar");
const percentText = document.getElementById("percent-text");
const statusText = document.getElementById("status-text");
const consoleDiv = document.getElementById("debug-console");
const versionLabel = document.getElementById("launcher-version");

// --- INITIALISATION ---
async function init() {
    try {
        const config = await window.arcend.getConfig();
        const savedRam = (config && config.ram) ? config.ram : 8;

        ramSlider.value = savedRam;
        ramValueLabel.innerText = savedRam;
    } catch (err) {
        console.error("Erreur init RAM:", err);
        ramValueLabel.innerText = "8";
    }
}

// --- ÉVÉNEMENTS ---
ramSlider.addEventListener('input', (e) => {
    ramValueLabel.innerText = e.target.value;
});

ramSlider.addEventListener('change', (e) => {
    window.arcend.setRam(Number(e.target.value));
});

playBtn.addEventListener('click', () => {
    playBtn.style.visibility = "hidden"; // Plus propre que display none (évite le saut de layout)
    window.arcend.play();
});

// --- ÉCOUTEURS IPC (Bridge) ---
window.arcend.onProgress((data) => {
    if (loaderContainer.style.display === "none" || !loaderContainer.style.display) {
        loaderContainer.style.display = "block";
    }

    let percent = (data.type === "BASE") 
        ? data.total 
        : Math.round((data.task / data.total) * 100);
    
    progressBar.style.width = `${percent}%`;
    percentText.innerText = `${percent}%`;
    statusText.innerText = `Action : ${data.type}...`;

    if (percent >= 100) {
        statusText.innerText = "Lancement imminent...";
        progressBar.style.backgroundColor = "#2ecc71";
    }
});

window.arcend.onLog((message) => {
    const logLine = document.createElement("div");
    logLine.innerHTML = `<span style="color: #666;">></span> ${message}`;
    consoleDiv.appendChild(logLine);
    consoleDiv.scrollTop = consoleDiv.scrollHeight;
});

window.arcend.onVersion((version) => {
    versionLabel.innerText = `Version ${version}`;
});

// Lancer au chargement
init();