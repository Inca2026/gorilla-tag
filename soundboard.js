// BUILT-IN WEB AUDIO MONKE SOUNDBOARD & SAVABLE CLIENT MODS
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playTone(freq, type, duration, delay = 0, slideTo = null) {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime + delay);
  if (slideTo) {
    osc.frequency.exponentialRampToValueAtTime(slideTo, audioCtx.currentTime + delay + duration);
  }

  gain.gain.setValueAtTime(0.25, audioCtx.currentTime + delay);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + delay + duration);

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start(audioCtx.currentTime + delay);
  osc.stop(audioCtx.currentTime + delay + duration);
}

function playMonkeSound(sound) {
  if (sound === 'tag') {
    playTone(180, 'sawtooth', 0.12, 0, 60);
    playTone(520, 'square', 0.18, 0.08, 380);
  } else if (sound === 'roundstart') {
    playTone(440, 'square', 0.15, 0);
    playTone(440, 'square', 0.15, 0.25);
    playTone(440, 'square', 0.15, 0.5);
    playTone(880, 'sawtooth', 0.4, 0.75);
  } else if (sound === 'monke') {
    playTone(320, 'triangle', 0.14, 0, 480);
    playTone(340, 'triangle', 0.14, 0.18, 500);
    playTone(620, 'sawtooth', 0.28, 0.36, 260);
  } else if (sound === 'lava') {
    playTone(95, 'sawtooth', 0.5, 0, 45);
    playTone(1200, 'square', 0.25, 0.1, 300);
  } else if (sound === 'computer') {
    playTone(950, 'square', 0.06, 0);
    playTone(1250, 'square', 0.08, 0.07);
  } else if (sound === 'win') {
    playTone(523.25, 'square', 0.12, 0);
    playTone(659.25, 'square', 0.12, 0.12);
    playTone(783.99, 'square', 0.12, 0.24);
    playTone(1046.5, 'square', 0.35, 0.36);
  }
}

// --- MOD STATE & LABELS ---
const DEFAULT_MOD_CONFIG = {
  fov: 1.0,
  sat: 100,
  bright: 100,
  radar: false,
  nightvision: false,
  crt: false,
  crosshair: false,
  fps: false,
  rainbow: false,
  deepfried: false,
  invert: false,
  retro: false,
  vignette: false,
  cinematic: false
};

const MOD_LABELS = {
  radar: "HIDE/SEEK RADAR",
  nightvision: "NIGHT VISION",
  crt: "CRT SCANLINES",
  crosshair: "CROSSHAIR",
  fps: "FPS COUNTER",
  rainbow: "RGB MONKE",
  deepfried: "DEEP FRIED",
  invert: "X-RAY INVERT",
  retro: "GAMEBOY MODE",
  vignette: "TUNNEL VISION",
  cinematic: "CINEMATIC BARS"
};

let modConfig = { ...DEFAULT_MOD_CONFIG };
let fpsInterval = null;
let rainbowInterval = null;
let rainbowHue = 0;
let frameCount = 0;

function triggerModToast(title, text) {
  const toast = document.getElementById("gtag-toast");
  const toastTitle = document.getElementById("gtag-toast-title");
  const toastBody = document.getElementById("gtag-toast-body");
  if (!toast || !toastTitle || !toastBody) return;

  toastTitle.textContent = title;
  toastBody.textContent = text;
  toast.classList.remove("gtag-hidden");
  playMonkeSound("computer");

  clearTimeout(window.gtagModToastTimer);
  window.gtagModToastTimer = setTimeout(() => {
    toast.classList.add("gtag-hidden");
  }, 3000);
}

function applyVisualFilters() {
  const canvas = document.getElementById("unity-canvas");
  if (!canvas) return;

  canvas.style.transform = `scale(${modConfig.fov})`;
  canvas.style.transformOrigin = "center center";

  const filters = [];
  filters.push(`brightness(${modConfig.bright}%)`);
  filters.push(`saturate(${modConfig.sat}%)`);

  if (modConfig.nightvision) {
    filters.push("brightness(1.6) contrast(1.3) sepia(1) hue-rotate(70deg) saturate(3)");
  }
  if (modConfig.deepfried) {
    filters.push("contrast(260%) saturate(350%) brightness(115%)");
  }
  if (modConfig.invert) {
    filters.push("invert(100%)");
  }
  if (modConfig.retro) {
    filters.push("grayscale(100%) sepia(100%) hue-rotate(55deg) contrast(160%)");
  }
  if (modConfig.rainbow) {
    filters.push(`hue-rotate(${rainbowHue}deg)`);
  }

  canvas.style.filter = filters.join(" ");
}

function syncModUI() {
  const fovSlider = document.getElementById("slider-fov");
  const satSlider = document.getElementById("slider-sat");
  const brightSlider = document.getElementById("slider-bright");

  if (fovSlider) {
    fovSlider.value = modConfig.fov;
    document.getElementById("val-fov").textContent = `${Number(modConfig.fov).toFixed(2)}x`;
  }
  if (satSlider) {
    satSlider.value = modConfig.sat;
    document.getElementById("val-sat").textContent = `${modConfig.sat}%`;
  }
  if (brightSlider) {
    brightSlider.value = modConfig.bright;
    document.getElementById("val-bright").textContent = `${modConfig.bright}%`;
  }

  Object.keys(MOD_LABELS).forEach(key => {
    const btn = document.getElementById(`mod-${key}`);
    if (btn) {
      btn.textContent = `${MOD_LABELS[key]}: ${modConfig[key] ? "ON" : "OFF"}`;
      btn.classList.toggle("active", modConfig[key]);
    }
  });

  document.getElementById("gtag-radar")?.classList.toggle("gtag-hidden", !modConfig.radar);
  document.getElementById("crt-overlay")?.classList.toggle("gtag-hidden", !modConfig.crt);
  document.getElementById("gtag-crosshair")?.classList.toggle("gtag-hidden", !modConfig.crosshair);
  document.getElementById("gtag-vignette")?.classList.toggle("gtag-hidden", !modConfig.vignette);
  document.getElementById("gtag-cinematic")?.classList.toggle("gtag-hidden", !modConfig.cinematic);

  clearInterval(rainbowInterval);
  if (modConfig.rainbow) {
    rainbowInterval = setInterval(() => {
      rainbowHue = (rainbowHue + 10) % 360;
      applyVisualFilters();
    }, 60);
  }

  clearInterval(fpsInterval);
  const hud = document.getElementById("gtag-hud-hint");
  if (modConfig.fps && hud) {
    const countFrames = () => {
      frameCount++;
      if (modConfig.fps) requestAnimationFrame(countFrames);
    };
    requestAnimationFrame(countFrames);
    fpsInterval = setInterval(() => {
      hud.textContent = `FPS: ${frameCount} | [TAB] TERMINAL | [T] CHAT | [B] SOUNDS | [R] SYNC`;
      frameCount = 0;
    }, 1000);
  } else if (hud) {
    hud.textContent = `[TAB] TERMINAL | [T] CHAT | [B] SOUNDS | [R] SPAWN SYNC`;
  }

  applyVisualFilters();
}

window.updateSliderMod = function(type, val) {
  modConfig[type] = parseFloat(val);
  syncModUI();
};

window.toggleMod = function(mod) {
  modConfig[mod] = !modConfig[mod];
  syncModUI();
  triggerModToast("GORILLA OS MOD", `${MOD_LABELS[mod]}: ${modConfig[mod] ? "ENABLED" : "DISABLED"}`);
};

window.saveModConfig = function() {
  localStorage.setItem("gtag_saved_mods", JSON.stringify(modConfig));
  triggerModToast("CONFIG SAVED", "YOUR MODS & SLIDERS WILL AUTO-LOAD NEXT SESSION!");
};

window.resetAllMods = function() {
  modConfig = { ...DEFAULT_MOD_CONFIG };
  localStorage.removeItem("gtag_saved_mods");
  syncModUI();
  triggerModToast("MODS RESET", "ALL MODS & SLIDERS RESTORED TO DEFAULT.");
};

window.clearUnityCosmetics = function() {
  Object.keys(localStorage).forEach(key => {
    if (!key.startsWith("gtag_")) {
      localStorage.removeItem(key);
    }
  });

  if (window.indexedDB && indexedDB.databases) {
    indexedDB.databases().then(dbs => {
      dbs.forEach(db => {
        if (db.name && db.name.includes("idbfs")) {
          indexedDB.deleteDatabase(db.name);
        }
      });
    });
  } else {
    indexedDB.deleteDatabase("/idbfs");
  }

  triggerModToast("COSMETICS WIPED", "RELOADING GAME...");
  setTimeout(() => window.location.reload(), 1200);
};

document.addEventListener("DOMContentLoaded", () => {
  const saved = localStorage.getItem("gtag_saved_mods");
  if (saved) {
    try {
      modConfig = { ...DEFAULT_MOD_CONFIG, ...JSON.parse(saved) };
    } catch (_) {}
  }
  syncModUI();
});
