const overlay = document.getElementById('gtag-overlay');
const chatInput = document.getElementById('chat-input');
const unityCanvas = document.getElementById('unity-canvas');

const DEFAULT_KEYBINDS = { toggle: 'Tab', chat: 't', sounds: 'b' };
let keybinds = { ...DEFAULT_KEYBINDS };
let listeningForBind = null;
let isEditingHud = false;

try {
  const savedBinds = localStorage.getItem('gtag_keybinds');
  if (savedBinds) keybinds = { ...DEFAULT_KEYBINDS, ...JSON.parse(savedBinds) };
} catch (_) {}

window.getGtagKeybinds = () => keybinds;

function updateKeybindUI() {
  ['toggle', 'chat', 'sounds'].forEach(action => {
    const btn = document.getElementById(`bind-btn-${action}`);
    if (btn) {
      btn.textContent = listeningForBind === action ? 'PRESS ANY KEY...' : `[${keybinds[action].toUpperCase()}]`;
      btn.classList.toggle('active', listeningForBind === action);
    }
  });
  if (typeof syncModUI === 'function') syncModUI();
}

window.startRebind = function(action) {
  listeningForBind = action;
  if (typeof playTerminalSfx === 'function') playTerminalSfx('click');
  updateKeybindUI();
};

window.resetKeybinds = function() {
  keybinds = { ...DEFAULT_KEYBINDS };
  listeningForBind = null;
  localStorage.removeItem('gtag_keybinds');
  updateKeybindUI();
  if (typeof triggerModToast === 'function') triggerModToast('KEYBINDS RESET', 'RESTORED [TAB], [T], AND [B].');
};

const DRAGGABLE_IDS = ['gtag-keystrokes', 'gtag-leaderboard', 'gtag-hud-hint'];

function loadSavedHudPositions() {
  try {
    const saved = JSON.parse(localStorage.getItem('gtag_hud_positions') || '{}');
    DRAGGABLE_IDS.forEach(id => {
      const el = document.getElementById(id);
      if (el && saved[id]) {
        el.style.left = saved[id].left;
        el.style.top = saved[id].top;
        el.style.right = 'auto';
        el.style.bottom = 'auto';
      }
    });
  } catch (_) {}
}

window.toggleHudEditMode = function(forceState = null) {
  isEditingHud = forceState !== null ? forceState : !isEditingHud;
  const editBanner = document.getElementById('gtag-hud-edit-banner');
  const toggleBtn = document.getElementById('btn-edit-hud');

  if (isEditingHud) {
    overlay.classList.add('gtag-hidden');
    editBanner?.classList.remove('gtag-hidden');
    if (document.pointerLockElement) document.exitPointerLock();
    DRAGGABLE_IDS.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.dataset.wasHidden = el.classList.contains('gtag-hidden') ? '1' : '0';
        el.classList.remove('gtag-hidden');
        el.classList.add('hud-draggable-active');
      }
    });
  } else {
    editBanner?.classList.add('gtag-hidden');
    DRAGGABLE_IDS.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.classList.remove('hud-draggable-active');
        if (el.dataset.wasHidden === '1') el.classList.add('gtag-hidden');
      }
    });
    if (typeof syncModUI === 'function') syncModUI();
    overlay.classList.remove('gtag-hidden');
  }
  if (toggleBtn) toggleBtn.textContent = isEditingHud ? 'DONE MOVING HUD' : 'MOVE HUD MODULES';
};

window.resetHudPositions = function() {
  localStorage.removeItem('gtag_hud_positions');
  DRAGGABLE_IDS.forEach(id => { const el = document.getElementById(id); if (el) el.style.cssText = ''; });
  if (typeof triggerModToast === 'function') triggerModToast('HUD RESET', 'ALL HUD MODULES RETURNED TO DEFAULT CORNERS.');
};
function initDraggableModules() {
  loadSavedHudPositions();
  DRAGGABLE_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    let dragging = false, startX = 0, startY = 0, origLeft = 0, origTop = 0;

    el.addEventListener('mousedown', e => {
      if (!isEditingHud) return;
      dragging = true;
      const rect = el.getBoundingClientRect();
      startX = e.clientX; startY = e.clientY;
      origLeft = rect.left; origTop = rect.top;
      el.style.right = 'auto'; el.style.bottom = 'auto';
      e.preventDefault();
    });

    window.addEventListener('mousemove', e => {
      if (!dragging) return;
      el.style.left = `${Math.max(0, Math.min(window.innerWidth - 60, origLeft + (e.clientX - startX)))}px`;
      el.style.top = `${Math.max(0, Math.min(window.innerHeight - 30, origTop + (e.clientY - startY)))}px`;
    });

    window.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      const saved = JSON.parse(localStorage.getItem('gtag_hud_positions') || '{}');
      saved[id] = { left: el.style.left, top: el.style.top };
      localStorage.setItem('gtag_hud_positions', JSON.stringify(saved));
    });
  });
}

function isTerminalOpen() {
  return !overlay.classList.contains('gtag-hidden');
}

function toggleOverlay(forceOpen = null, tab = null) {
  if (isEditingHud) toggleHudEditMode(false);
  const shouldOpen = forceOpen !== null ? forceOpen : !isTerminalOpen();

  if (shouldOpen) {
    overlay.classList.remove('gtag-hidden');
    updateKeybindUI();
    if (typeof playTerminalSfx === 'function') playTerminalSfx('open');
    if (document.pointerLockElement) document.exitPointerLock();
    if (tab) switchTab(tab);
    else focusActiveChatField();
  } else {
    listeningForBind = null;
    overlay.classList.add('gtag-hidden');
    if (typeof playTerminalSfx === 'function') playTerminalSfx('close');
    document.activeElement?.blur();
    unityCanvas.focus();
    if (unityCanvas.requestPointerLock) unityCanvas.requestPointerLock();
  }
}

function focusActiveChatField() {
  const chatBox = document.getElementById('matrix-chat-box');
  if (chatBox && !chatBox.classList.contains('gtag-hidden')) {
    setTimeout(() => chatInput?.focus(), 15);
  } else if (chatBox) {
    setTimeout(() => document.getElementById('matrix-user-input')?.focus(), 15);
  }
}

function switchTab(tabName) {
  ['chat', 'sounds', 'mods', 'vip', 'settings', 'about'].forEach(t => {
    document.getElementById(`tab-${t}`)?.classList.toggle('gtag-hidden', tabName !== t);
    document.getElementById(`btn-tab-${t}`)?.classList.toggle('active', tabName === t);
  });
  updateKeybindUI();
  if (typeof playTerminalSfx === 'function') playTerminalSfx('tab');
  if (tabName === 'chat') focusActiveChatField();
  if (tabName === 'vip') setTimeout(() => document.getElementById('vip-flare-input')?.focus(), 15);
}

window.addEventListener('keydown', (e) => {
  if (listeningForBind) {
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.key !== 'Escape') {
      keybinds[listeningForBind] = e.key;
      localStorage.setItem('gtag_keybinds', JSON.stringify(keybinds));
    }
    listeningForBind = null;
    updateKeybindUI();
    return;
  }

  if (e.key.toLowerCase() === keybinds.toggle.toLowerCase()) {
    e.preventDefault(); e.stopImmediatePropagation();
    toggleOverlay();
    return;
  }

  if (isTerminalOpen()) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); toggleOverlay(false); return; }
    if (e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter') {
      if (document.activeElement === chatInput) {
        e.preventDefault(); e.stopImmediatePropagation();
        window.sendStumpChatInput?.();
        return;
      }
      if (document.activeElement?.id === 'vip-flare-input') {
        e.preventDefault(); e.stopImmediatePropagation();
        window.sendVipBroadcastFlare?.();
        return;
      }
      if (document.activeElement?.id === 'matrix-pass-input' || document.activeElement?.id === 'matrix-user-input') {
        e.preventDefault(); e.stopImmediatePropagation();
        window.loginElementAccount?.();
        return;
      }
    }
    e.stopImmediatePropagation();
    if (!document.getElementById('tab-sounds')?.classList.contains('gtag-hidden')) {
      const soundMap = { '1': 'tag', '2': 'roundstart', '3': 'monke', '4': 'lava', '5': 'computer', '6': 'win', '7': 'banshee', '8': 'airhorn', '9': 'shinyrock' };
      if (soundMap[e.key]) { e.preventDefault(); playMonkeSound(soundMap[e.key]); }
    }
  } else if (!isEditingHud) {
    if (e.key.toLowerCase() === keybinds.chat.toLowerCase()) { e.preventDefault(); e.stopImmediatePropagation(); toggleOverlay(true, 'chat'); }
    else if (e.key.toLowerCase() === keybinds.sounds.toLowerCase()) { e.preventDefault(); e.stopImmediatePropagation(); toggleOverlay(true, 'sounds'); }
  }
}, true);

['keyup', 'keypress'].forEach(evtName => {
  window.addEventListener(evtName, e => { if (isTerminalOpen()) e.stopImmediatePropagation(); }, true);
});

document.addEventListener('DOMContentLoaded', () => {
  initDraggableModules();
  updateKeybindUI();
});
