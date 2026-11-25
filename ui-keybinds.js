(function initGorillaKeybinds() {
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
  window.toggleHudEditMode = function(forceState = null) {
    const overlay = document.getElementById('gtag-overlay');
    isEditingHud = forceState !== null ? forceState : !isEditingHud;
    const editBanner = document.getElementById('gtag-hud-edit-banner');
    const toggleBtn = document.getElementById('btn-edit-hud');

    if (isEditingHud) {
      overlay?.classList.add('gtag-hidden');
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
      overlay?.classList.remove('gtag-hidden');
    }
    if (toggleBtn) toggleBtn.textContent = isEditingHud ? 'DONE MOVING HUD' : 'MOVE HUD MODULES';
  };

  window.resetHudPositions = function() {
    localStorage.removeItem('gtag_hud_positions');
    DRAGGABLE_IDS.forEach(id => { const el = document.getElementById(id); if (el) el.style.cssText = ''; });
    if (typeof triggerModToast === 'function') triggerModToast('HUD RESET', 'ALL HUD MODULES RETURNED TO DEFAULT CORNERS.');
  };

  function isTerminalOpen() {
    const overlay = document.getElementById('gtag-overlay');
    return Boolean(overlay && !overlay.classList.contains('gtag-hidden'));
  }

  window.switchTab = function(tabName) {
    ['chat', 'sounds', 'mods', 'vip', 'hack', 'settings', 'about'].forEach(t => {
      document.getElementById(`tab-${t}`)?.classList.toggle('gtag-hidden', tabName !== t);
      document.getElementById(`btn-tab-${t}`)?.classList.toggle('active', tabName === t);
    });
    updateKeybindUI();
    if (typeof playTerminalSfx === 'function') playTerminalSfx('tab');
    if (tabName === 'chat') focusActiveChatField();
    if (tabName === 'vip') setTimeout(() => document.getElementById('vip-flare-input')?.focus(), 15);
    if (tabName === 'hack') {
      window.renderHackTargetList?.();
      setTimeout(() => document.getElementById('hack-code-input')?.focus(), 15);
    }
  };

  function focusActiveChatField() {
    const chatBox = document.getElementById('matrix-chat-box');
    if (chatBox && !chatBox.classList.contains('gtag-hidden')) {
      setTimeout(() => document.getElementById('chat-input')?.focus(), 15);
    } else {
      setTimeout(() => document.getElementById('matrix-user-input')?.focus(), 15);
    }
  }

  window.toggleOverlay = function(forceOpen = null, tab = null) {
    const overlay = document.getElementById('gtag-overlay');
    const unityCanvas = document.getElementById('unity-canvas');
    if (!overlay) return;
    if (isEditingHud) window.toggleHudEditMode(false);
    const shouldOpen = forceOpen !== null ? forceOpen : !isTerminalOpen();

    if (shouldOpen) {
      overlay.classList.remove('gtag-hidden');
      updateKeybindUI();
      if (typeof playTerminalSfx === 'function') playTerminalSfx('open');
      if (document.pointerLockElement) document.exitPointerLock();
      if (tab) window.switchTab(tab);
      else focusActiveChatField();
    } else {
      const isSignedIn = Boolean(
        localStorage.getItem('gtag_mx_token') ||
        window.isMatrixConnected ||
        sessionStorage.getItem('gtag_guest_active') === '1'
      );
      if (!isSignedIn) {
        if (typeof triggerModToast === 'function') {
          triggerModToast('SIGN IN REQUIRED', 'LOG IN WITH ELEMENT OR ENTER A GUEST NAME TO PLAY!');
        }
        return;
      }

      listeningForBind = null;
      overlay.classList.add('gtag-hidden');
      if (typeof playTerminalSfx === 'function') playTerminalSfx('close');
      document.activeElement?.blur();
      unityCanvas?.focus();
      if (unityCanvas?.requestPointerLock) unityCanvas.requestPointerLock();
    }
  };

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
      window.toggleOverlay();
      return;
    }

    if (isTerminalOpen()) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); window.toggleOverlay(false); return; }
      if (e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter') {
        const activeId = document.activeElement?.id;
        if (activeId === 'chat-input') { e.preventDefault(); e.stopImmediatePropagation(); window.sendStumpChatInput?.(); return; }
        if (activeId === 'vip-flare-input') { e.preventDefault(); e.stopImmediatePropagation(); window.sendVipBroadcastFlare?.(); return; }
        if (activeId === 'hack-code-input') { e.preventDefault(); e.stopImmediatePropagation(); window.unlockHackTerminal?.(); return; }
        if (activeId === 'matrix-pass-input' || activeId === 'matrix-user-input') { e.preventDefault(); e.stopImmediatePropagation(); window.loginElementAccount?.(); return; }
      }
      e.stopImmediatePropagation();
      if (!document.getElementById('tab-sounds')?.classList.contains('gtag-hidden')) {
        const soundMap = { '1': 'tag', '2': 'roundstart', '3': 'monke', '4': 'lava', '5': 'computer', '6': 'win', '7': 'banshee', '8': 'airhorn', '9': 'shinyrock' };
        if (soundMap[e.key] && typeof playMonkeSound === 'function') { e.preventDefault(); playMonkeSound(soundMap[e.key]); }
      }
    } else if (!isEditingHud) {
      if (e.key.toLowerCase() === keybinds.chat.toLowerCase()) { e.preventDefault(); e.stopImmediatePropagation(); window.toggleOverlay(true, 'chat'); }
      else if (e.key.toLowerCase() === keybinds.sounds.toLowerCase()) { e.preventDefault(); e.stopImmediatePropagation(); window.toggleOverlay(true, 'sounds'); }
    }
  }, true);

  ['keyup', 'keypress'].forEach(evtName => {
    window.addEventListener(evtName, e => { if (isTerminalOpen()) e.stopImmediatePropagation(); }, true);
  });

  document.addEventListener('DOMContentLoaded', () => {
    initDraggableModules();
    updateKeybindUI();
  });
})();
