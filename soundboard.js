const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const originalGainConnect = GainNode.prototype.connect;
const gameGainNodes = new WeakSet();

GainNode.prototype.connect = function(...args) {
  if (!this._isGorillaOS && this.context !== audioCtx) gameGainNodes.add(this);
  return originalGainConnect.apply(this, args);
};

function applyAudioVolumes() {
  const menuVol = (modConfig.menuVol ?? 100) / 100;
  const gameVol = (modConfig.gameVol ?? 100) / 100;
  document.querySelectorAll('audio, video').forEach(el => {
    el.volume = Math.min(1, Math.max(0, gameVol));
  });
  window.gtagGameVolumeMultiplier = gameVol;
  window.gtagMenuVolumeMultiplier = menuVol;
}

function playTone(freq, type, duration, delay = 0, slideTo = null, vol = 0.22) {
  const menuVol = (modConfig.menuVol ?? 100) / 100;
  if (menuVol <= 0.01) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  gain._isGorillaOS = true;
  const finalVol = Math.max(0.001, vol * menuVol);

  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime + delay);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, audioCtx.currentTime + delay + duration);

  gain.gain.setValueAtTime(finalVol, audioCtx.currentTime + delay);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + delay + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(audioCtx.currentTime + delay);
  osc.stop(audioCtx.currentTime + delay + duration);
}

window.playTerminalSfx = function(sfx) {
  if (!modConfig.termsfx) return;
  if (sfx === 'open') { playTone(320, 'square', 0.06, 0, 640, 0.14); playTone(640, 'square', 0.08, 0.06, 960, 0.14); }
  else if (sfx === 'close') { playTone(720, 'square', 0.06, 0, 360, 0.14); playTone(360, 'square', 0.08, 0.06, 180, 0.14); }
  else if (sfx === 'tab') { playTone(880, 'square', 0.045, 0, 1100, 0.12); }
  else if (sfx === 'click') { playTone(1050, 'square', 0.035, 0, null, 0.12); }
  else if (sfx === 'send') { playTone(580, 'triangle', 0.05, 0, 880, 0.15); playTone(880, 'triangle', 0.07, 0.05, 1180, 0.15); }
  else if (sfx === 'receive') { playTone(740, 'square', 0.05, 0, null, 0.14); playTone(980, 'square', 0.08, 0.06, null, 0.14); }
  else if (sfx === 'error') { playTone(220, 'sawtooth', 0.12, 0, 140, 0.16); }
  else if (sfx === 'vip') { playTone(523.25, 'triangle', 0.08, 0, 783.99, 0.18); playTone(1046.5, 'triangle', 0.14, 0.08, 1318.5, 0.18); }
};

const VIP_ONLY_SOUNDS = new Set(['banshee', 'airhorn', 'shinyrock']);

function playMonkeSound(sound, isRemote = false) {
  if (!isRemote && VIP_ONLY_SOUNDS.has(sound) && !isElementLoggedIn()) {
    return triggerModToast("VIP LOCKED", "SIGN IN WITH ELEMENT OR RENT BANANA VIP!");
  }
  if (!isRemote && localStorage.getItem("gtag_mx_token") && typeof window.broadcastGlobalSound === "function") {
    window.broadcastGlobalSound(sound);
    return;
  }
  if (sound === 'tag') { playTone(180, 'sawtooth', 0.12, 0, 60); playTone(520, 'square', 0.18, 0.08, 380); }
  else if (sound === 'roundstart') { playTone(440, 'square', 0.15, 0); playTone(440, 'square', 0.15, 0.25); playTone(440, 'square', 0.15, 0.5); playTone(880, 'sawtooth', 0.4, 0.75); }
  else if (sound === 'monke') { playTone(320, 'triangle', 0.14, 0, 480); playTone(340, 'triangle', 0.14, 0.18, 500); playTone(620, 'sawtooth', 0.28, 0.36, 260); }
  else if (sound === 'lava') { playTone(95, 'sawtooth', 0.5, 0, 45); playTone(1200, 'square', 0.25, 0.1, 300); }
  else if (sound === 'computer') { playTone(950, 'square', 0.06, 0); playTone(1250, 'square', 0.08, 0.07); }
  else if (sound === 'win') { playTone(523.25, 'square', 0.12, 0); playTone(659.25, 'square', 0.12, 0.12); playTone(783.99, 'square', 0.12, 0.24); playTone(1046.5, 'square', 0.35, 0.36); }
  else if (sound === 'banshee') { playTone(900, 'sawtooth', 0.4, 0, 1450, 0.25); playTone(1450, 'sawtooth', 0.4, 0.4, 300, 0.25); }
  else if (sound === 'airhorn') { playTone(480, 'sawtooth', 0.12, 0, null, 0.26); playTone(480, 'sawtooth', 0.12, 0.16, null, 0.26); playTone(480, 'sawtooth', 0.45, 0.32, 465, 0.26); }
  else if (sound === 'shinyrock') { playTone(1174.66, 'sine', 0.15, 0, null, 0.24); playTone(1567.98, 'sine', 0.35, 0.12, null, 0.24); }
}

window.playMonkeSound = playMonkeSound;
window.STUMP_RANDOM_ROOM = "#stump-network-random:matrix.org";

function isElementLoggedIn() {
  const hasBananaVip = Date.now() < parseInt(localStorage.getItem("gtag_banana_vip_exp") || "0", 10);
  return Boolean(localStorage.getItem("gtag_mx_token") || window.isMatrixConnected || hasBananaVip);
}
const DEFAULT_MOD_CONFIG = {
  fov: 1.0, sat: 100, bright: 100, contrast: 100, gameVol: 100, menuVol: 100,
  leaderboard: true, monkestats: true, termsfx: true, nightvision: false, crt: false, crosshair: false,
  fps: false, rainbow: false, deepfried: false, invert: false, retro: false,
  vignette: false, cinematic: false, lavavision: false, blueprint: false,
  speedlines: false, sessionclock: false, keystrokes: false, mirrorview: false,
  rgbcrosshair: false, goldenui: false, chatnotify: false, vhsglitch: false,
  ultrafov: false, stumpbeacon: false, rgbhud: false, vipreticle: false,
  autohop: false, matrixrain: false
};

const MOD_LABELS = {
  leaderboard: "LEADERBOARD", monkestats: "MONKE STATS", termsfx: "TERMINAL SFX", nightvision: "NIGHT VISION",
  crt: "CRT SCANLINES", crosshair: "CROSSHAIR", fps: "FPS COUNTER",
  rainbow: "RGB MONKE", deepfried: "DEEP FRIED", invert: "X-RAY INVERT",
  retro: "GAMEBOY MODE", vignette: "TUNNEL VISION", cinematic: "CINEMATIC BARS",
  lavavision: "LAVA VISION", blueprint: "BLUEPRINT WIRE", speedlines: "SPEED LINES",
  sessionclock: "SESSION CLOCK", keystrokes: "KEYSTROKE HUD", mirrorview: "MIRROR WORLD",
  rgbcrosshair: "RGB RETICLE", goldenui: "GOLD TERMINAL", chatnotify: "CHAT PING SFX",
  vhsglitch: "VHS TRACKING", ultrafov: "QUAKE PRO FOV", stumpbeacon: "ONLINE RADAR PING",
  rgbhud: "RAINBOW HUD BORDERS", vipreticle: "DIAMOND RETICLE",
  autohop: "SPACEBAR AUTO-HOP", matrixrain: "MATRIX TINT OVERLAY"
};

const ELEMENT_EXCLUSIVE_MODS = new Set([
  "rgbcrosshair", "goldenui", "chatnotify", "vhsglitch", "ultrafov",
  "stumpbeacon", "rgbhud", "vipreticle", "autohop", "matrixrain"
]);

let modConfig = { ...DEFAULT_MOD_CONFIG };
let fpsInterval = null, rainbowInterval = null, autoHopInterval = null;
let rainbowHue = 0, frameCount = 0, sessionStartTime = Date.now();

function triggerModToast(title, text) {
  const toast = document.getElementById("gtag-toast");
  const toastTitle = document.getElementById("gtag-toast-title");
  const toastBody = document.getElementById("gtag-toast-body");
  if (!toast || !toastTitle || !toastBody) return;
  toastTitle.textContent = title;
  toastBody.textContent = text;
  toast.classList.remove("gtag-hidden");
  playTerminalSfx("click");
  clearTimeout(window.gtagModToastTimer);
  window.gtagModToastTimer = setTimeout(() => toast.classList.add("gtag-hidden"), 3000);
}

function applyVisualFilters() {
  const canvas = document.getElementById("unity-canvas");
  if (!canvas) return;
  const bMods = window.bananaActiveMods || {};
  let activeFov = modConfig.ultrafov ? Math.max(modConfig.fov, 1.38) : modConfig.fov;
  if (bMods.hyperFov) activeFov = Math.max(activeFov, 1.48);
  const scaleX = modConfig.mirrorview ? -activeFov : activeFov;
  canvas.style.transform = `scale(${scaleX}, ${activeFov})`;
  canvas.style.transformOrigin = "center center";

  const filters = [`brightness(${modConfig.bright}%)`, `saturate(${modConfig.sat}%)`, `contrast(${modConfig.contrast}%)`];
  if (modConfig.nightvision) filters.push("brightness(1.6) contrast(1.3) sepia(1) hue-rotate(70deg) saturate(3)");
  if (modConfig.lavavision) filters.push("sepia(1) hue-rotate(-35deg) saturate(450%) contrast(140%)");
  if (modConfig.blueprint) filters.push("invert(1) sepia(1) hue-rotate(180deg) saturate(400%) contrast(150%)");
  if (modConfig.deepfried) filters.push("contrast(260%) saturate(350%) brightness(115%)");
  if (modConfig.invert) filters.push("invert(100%)");
  if (modConfig.retro) filters.push("grayscale(100%) sepia(100%) hue-rotate(55deg) contrast(160%)");
  if (modConfig.vhsglitch) filters.push("contrast(135%) saturate(160%) drop-shadow(3px 0px 0px rgba(255,0,80,0.6))");
  if (modConfig.matrixrain) filters.push("hue-rotate(85deg) contrast(130%) saturate(180%)");
  if (bMods.bananaVision) filters.push("sepia(1) hue-rotate(12deg) saturate(420%) contrast(125%)");
  if (bMods.hologram) filters.push("sepia(1) hue-rotate(140deg) saturate(350%) brightness(120%) opacity(0.85)");
  if (bMods.thermal) filters.push("invert(1) hue-rotate(180deg) saturate(300%)");
  if (bMods.crtOverdrive) filters.push("contrast(165%) brightness(115%) saturate(150%)");
  if (modConfig.rainbow || bMods.disco) filters.push(`hue-rotate(${rainbowHue}deg)`);
  canvas.style.filter = filters.join(" ");

  const crosshair = document.getElementById("gtag-crosshair");
  if (crosshair) {
    crosshair.textContent = modConfig.vipreticle ? "<>" : "+";
    crosshair.style.color = modConfig.rgbcrosshair ? `hsl(${rainbowHue}, 100%, 55%)` : "#33ff33";
  }

  const rgbColor = `hsl(${rainbowHue}, 100%, 55%)`;
  ['gtag-hud-hint', 'gtag-leaderboard', 'gtag-keystrokes', 'gtag-stats-hud'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.borderColor = modConfig.rgbhud ? rgbColor : "";
  });
}
window.applyVisualFilters = applyVisualFilters;
window.activeHackEffects = { screen: false, movement: false, invert: false, hud: false };

const KEY_CODE_NUMS = { KeyW: 87, KeyA: 65, KeyS: 83, KeyD: 68, Space: 32, ShiftLeft: 16, ShiftRight: 16, ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39 };
const KEY_CHAR_MAP = { KeyW: "w", KeyA: "a", KeyS: "s", KeyD: "d", Space: " ", ShiftLeft: "Shift", ShiftRight: "Shift", ArrowUp: "ArrowUp", ArrowDown: "ArrowDown", ArrowLeft: "ArrowLeft", ArrowRight: "ArrowRight" };

window.releaseAllMovementKeys = function() {
  const canvas = document.getElementById("unity-canvas");
  if (!canvas) return;
  Object.keys(KEY_CODE_NUMS).forEach(code => {
    const num = KEY_CODE_NUMS[code], key = KEY_CHAR_MAP[code];
    canvas.dispatchEvent(new KeyboardEvent("keyup", { key, code, keyCode: num, which: num, bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keyup", { key, code, keyCode: num, which: num, bubbles: true }));
  });
};

window.applyIncomingHack = function(effect, state, attackerName) {
  if (!(effect in window.activeHackEffects)) return;
  window.activeHackEffects[effect] = Boolean(state);
  if ((effect === "movement" || effect === "invert") && state) window.releaseAllMovementKeys();

  const labels = {
    screen: "SCREEN DISABLED",
    movement: "MOVEMENT HACKED",
    invert: "CONTROLS INVERTED",
    hud: "HUD MODS HIJACKED"
  };

  if (effect === "hud") {
    modConfig.mirrorview = Boolean(state);
    modConfig.invert = Boolean(state);
    modConfig.crt = Boolean(state);
    syncModUI();
  }

  updateHackOverlayIndicators();
  playTerminalSfx(state ? "error" : "vip");
  triggerModToast(
    state ? "[ALERT] SYSTEM BREACH" : "SYSTEM RESTORED",
    state ? `${labels[effect]} BY ${attackerName.toUpperCase()}` : `${labels[effect]} CLEARED`
  );
};

window.clearAllIncomingHacks = function() {
  window.activeHackEffects = { screen: false, movement: false, invert: false, hud: false };
  window.releaseAllMovementKeys();
  modConfig.mirrorview = false;
  modConfig.invert = false;
  syncModUI();
  updateHackOverlayIndicators();
};

function updateHackOverlayIndicators() {
  const fx = window.activeHackEffects;
  document.getElementById("gtag-hack-blackout")?.classList.toggle("gtag-hidden", !fx.screen);
  const badgeWrap = document.getElementById("gtag-hack-indicators");
  if (!badgeWrap) return;
  const activeList = [];
  if (fx.screen) activeList.push("[!] SCREEN DISABLED");
  if (fx.movement) activeList.push("[!] MOVEMENT HACKED");
  if (fx.invert) activeList.push("[!] CONTROLS INVERTED");
  if (fx.hud) activeList.push("[!] HUD MODS HIJACKED");

  if (activeList.length === 0) {
    badgeWrap.classList.add("gtag-hidden");
    badgeWrap.innerHTML = "";
  } else {
    badgeWrap.classList.remove("gtag-hidden");
    badgeWrap.innerHTML = activeList.map(txt => `<div class="gtag-hack-pill">${txt}</div>`).join("");
  }
}

const MOVEMENT_CODES = new Set(Object.keys(KEY_CODE_NUMS));
const INVERT_MAP = { KeyW: "KeyS", KeyS: "KeyW", KeyA: "KeyD", KeyD: "KeyA", ArrowUp: "ArrowDown", ArrowDown: "ArrowUp", ArrowLeft: "ArrowRight", ArrowRight: "ArrowLeft" };
const INVERT_KEY = { w: "s", s: "w", a: "d", d: "a", W: "S", S: "W", A: "D", D: "A", ArrowUp: "ArrowDown", ArrowDown: "ArrowUp", ArrowLeft: "ArrowRight", ArrowRight: "ArrowLeft" };

["keydown", "keyup"].forEach(evtType => {
  window.addEventListener(evtType, e => {
    if (!e.isTrusted) return;
    if (!document.getElementById("gtag-overlay")?.classList.contains("gtag-hidden")) return;
    const fx = window.activeHackEffects;
    if (fx.movement && MOVEMENT_CODES.has(e.code)) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (fx.invert && INVERT_MAP[e.code]) {
      e.preventDefault(); e.stopImmediatePropagation();
      const swappedCode = INVERT_MAP[e.code], swappedKey = INVERT_KEY[e.key] || e.key;
      const num = KEY_CODE_NUMS[swappedCode] || 0;
      document.getElementById("unity-canvas")?.dispatchEvent(new KeyboardEvent(evtType, { key: swappedKey, code: swappedCode, keyCode: num, which: num, bubbles: true }));
    }
  }, true);
});
function syncModUI() {
  const sliders = [
    { id: "slider-fov", valId: "val-fov", key: "fov", fmt: v => `${Number(v).toFixed(2)}x` },
    { id: "slider-sat", valId: "val-sat", key: "sat", fmt: v => `${v}%` },
    { id: "slider-bright", valId: "val-bright", key: "bright", fmt: v => `${v}%` },
    { id: "slider-contrast", valId: "val-contrast", key: "contrast", fmt: v => `${v}%` },
    { id: "slider-gamevol", valId: "val-gamevol", key: "gameVol", fmt: v => `${v}%` },
    { id: "slider-menuvol", valId: "val-menuvol", key: "menuVol", fmt: v => `${v}%` }
  ];
  sliders.forEach(s => {
    const el = document.getElementById(s.id), lbl = document.getElementById(s.valId);
    if (el) el.value = modConfig[s.key];
    if (lbl) lbl.textContent = s.fmt(modConfig[s.key]);
  });

  const loggedIn = isElementLoggedIn();
  document.getElementById("vip-locked-view")?.classList.toggle("gtag-hidden", loggedIn);
  document.getElementById("vip-unlocked-view")?.classList.toggle("gtag-hidden", !loggedIn);

  Object.keys(MOD_LABELS).forEach(key => {
    const btn = document.getElementById(`mod-${key}`);
    if (btn) {
      const isLocked = ELEMENT_EXCLUSIVE_MODS.has(key) && !loggedIn;
      if (isLocked && modConfig[key]) modConfig[key] = false;
      btn.textContent = `${MOD_LABELS[key]}: ${modConfig[key] && !isLocked ? "ON" : "OFF"}`;
      btn.classList.toggle("active", modConfig[key] && !isLocked);
    }
  });

  document.getElementById("gtag-leaderboard")?.classList.toggle("gtag-hidden", !modConfig.leaderboard);
  document.getElementById("gtag-stats-hud")?.classList.toggle("gtag-hidden", !modConfig.monkestats);
  document.getElementById("crt-overlay")?.classList.toggle("gtag-hidden", !modConfig.crt);
  document.getElementById("gtag-crosshair")?.classList.toggle("gtag-hidden", !(modConfig.crosshair || modConfig.rgbcrosshair || modConfig.vipreticle));
  document.getElementById("gtag-vignette")?.classList.toggle("gtag-hidden", !modConfig.vignette);
  document.getElementById("gtag-cinematic")?.classList.toggle("gtag-hidden", !modConfig.cinematic);
  document.getElementById("gtag-speedlines")?.classList.toggle("gtag-hidden", !modConfig.speedlines);
  document.getElementById("gtag-keystrokes")?.classList.toggle("gtag-hidden", !modConfig.keystrokes);
  document.querySelector(".gtag-terminal")?.classList.toggle("golden-theme", Boolean(modConfig.goldenui && loggedIn));

  clearInterval(rainbowInterval);
  const bMods = window.bananaActiveMods || {};
  if (modConfig.rainbow || modConfig.rgbcrosshair || modConfig.rgbhud || bMods.disco) {
    rainbowInterval = setInterval(() => { rainbowHue = (rainbowHue + 10) % 360; applyVisualFilters(); }, 60);
  }

  clearInterval(autoHopInterval);
  if (modConfig.autohop && loggedIn) {
    autoHopInterval = setInterval(() => {
      const canvas = document.getElementById("unity-canvas");
      if (!canvas || !document.getElementById("gtag-overlay")?.classList.contains("gtag-hidden")) return;
      canvas.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", keyCode: 32, bubbles: true }));
      setTimeout(() => canvas.dispatchEvent(new KeyboardEvent("keyup", { key: " ", code: "Space", keyCode: 32, bubbles: true })), 60);
    }, 380);
  }

  clearInterval(fpsInterval);
  const hud = document.getElementById("gtag-hud-hint");
  const binds = window.getGtagKeybinds ? window.getGtagKeybinds() : { toggle: "Tab", chat: "t", sounds: "b" };
  const bindHint = `[${binds.toggle.toUpperCase()}] TERM | [${binds.chat.toUpperCase()}] CHAT | [${binds.sounds.toUpperCase()}] SFX`;

  if ((modConfig.fps || modConfig.sessionclock) && hud) {
    if (modConfig.fps) {
      const countFrames = () => { frameCount++; if (modConfig.fps) requestAnimationFrame(countFrames); };
      requestAnimationFrame(countFrames);
    }
    fpsInterval = setInterval(() => {
      const parts = [];
      if (modConfig.fps) { parts.push(`FPS: ${frameCount}`); frameCount = 0; }
      if (modConfig.sessionclock) {
        const secs = Math.floor((Date.now() - sessionStartTime) / 1000);
        parts.push(`TIME: ${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`);
      }
      parts.push(bindHint);
      hud.textContent = parts.join(" | ");
    }, 1000);
  } else if (hud) { hud.textContent = bindHint; }

  applyAudioVolumes();
  applyVisualFilters();
}

window.updateSliderMod = (type, val) => { modConfig[type] = parseFloat(val); syncModUI(); };
window.toggleMod = (mod) => {
  if (ELEMENT_EXCLUSIVE_MODS.has(mod) && !isElementLoggedIn()) {
    playTerminalSfx("error");
    return triggerModToast("VIP ONLY", "SIGN IN WITH ELEMENT OR RENT BANANA VIP!");
  }
  modConfig[mod] = !modConfig[mod];
  syncModUI();
  if (ELEMENT_EXCLUSIVE_MODS.has(mod) && modConfig[mod]) playTerminalSfx("vip");
  triggerModToast("GORILLA OS MOD", `${MOD_LABELS[mod]}: ${modConfig[mod] ? "ENABLED" : "DISABLED"}`);
};

window.saveModConfig = () => { localStorage.setItem("gtag_saved_mods", JSON.stringify(modConfig)); triggerModToast("CONFIG SAVED", "SETTINGS & VOLUMES SAVED!"); };
window.resetAllMods = () => { modConfig = { ...DEFAULT_MOD_CONFIG }; localStorage.removeItem("gtag_saved_mods"); syncModUI(); triggerModToast("MODS RESET", "ALL MODS RESTORED."); };
window.clearUnityCosmetics = () => {
  Object.keys(localStorage).forEach(k => { if (!k.startsWith("gtag_")) localStorage.removeItem(k); });
  if (window.indexedDB?.databases) indexedDB.databases().then(dbs => dbs.forEach(db => { if (db.name?.includes("idbfs")) indexedDB.deleteDatabase(db.name); }));
  else indexedDB.deleteDatabase("/idbfs");
  triggerModToast("COSMETICS WIPED", "RELOADING GAME...");
  setTimeout(() => window.location.reload(), 1200);
};

window.addEventListener("keydown", e => document.querySelector(`#gtag-keystrokes [data-key="${e.key.toUpperCase()}"]`)?.classList.add("pressed"));
window.addEventListener("keyup", e => document.querySelector(`#gtag-keystrokes [data-key="${e.key.toUpperCase()}"]`)?.classList.remove("pressed"));
document.addEventListener("DOMContentLoaded", () => {
  const saved = localStorage.getItem("gtag_saved_mods");
  if (saved) { try { modConfig = { ...DEFAULT_MOD_CONFIG, ...JSON.parse(saved) }; } catch (_) {} }
  syncModUI();
});
