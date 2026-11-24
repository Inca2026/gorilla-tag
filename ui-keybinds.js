const overlay = document.getElementById('gtag-overlay');
const chatInput = document.getElementById('chat-input');
const unityCanvas = document.getElementById('unity-canvas');

function isTerminalOpen() {
  return !overlay.classList.contains('gtag-hidden');
}

function toggleOverlay(forceOpen = null, tab = null) {
  const shouldOpen = forceOpen !== null ? forceOpen : !isTerminalOpen();

  if (shouldOpen) {
    overlay.classList.remove('gtag-hidden');
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
    if (tab) switchTab(tab);
    else focusActiveChatField();
  } else {
    overlay.classList.add('gtag-hidden');
    document.activeElement?.blur();
    unityCanvas.focus();
    if (unityCanvas.requestPointerLock) {
      unityCanvas.requestPointerLock();
    }
  }
}

function focusActiveChatField() {
  const chatBox = document.getElementById('matrix-chat-box');
  if (!chatBox.classList.contains('gtag-hidden')) {
    setTimeout(() => chatInput.focus(), 15);
  } else {
    setTimeout(() => document.getElementById('matrix-user-input').focus(), 15);
  }
}

function switchTab(tabName) {
  ['chat', 'sounds', 'mods'].forEach(t => {
    document.getElementById(`tab-${t}`).classList.toggle('gtag-hidden', tabName !== t);
    document.getElementById(`btn-tab-${t}`).classList.toggle('active', tabName === t);
  });
  if (tabName === 'chat') focusActiveChatField();
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    e.stopImmediatePropagation();
    toggleOverlay();
    return;
  }

  if (isTerminalOpen()) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      toggleOverlay(false);
      return;
    }

    // Handle Enter key inside chat or login BEFORE stopping propagation
    if (e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter') {
      if (document.activeElement === chatInput) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (typeof window.sendStumpChatInput === 'function') {
          window.sendStumpChatInput();
        }
        return;
      }
      if (document.activeElement?.id === 'matrix-pass-input' || document.activeElement?.id === 'matrix-user-input') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (typeof window.loginElementAccount === 'function') {
          window.loginElementAccount();
        }
        return;
      }
    }

    // Prevent Unity from capturing other keys while terminal is open
    e.stopImmediatePropagation();

    // If Soundboard tab is open, keys 1-6 trigger sounds
    if (!document.getElementById('tab-sounds').classList.contains('gtag-hidden')) {
      const soundMap = { '1': 'tag', '2': 'roundstart', '3': 'monke', '4': 'lava', '5': 'computer', '6': 'win' };
      if (soundMap[e.key]) {
        e.preventDefault();
        playMonkeSound(soundMap[e.key]);
      }
    }
  } else {
    if (e.key.toLowerCase() === 't') {
      e.preventDefault();
      e.stopImmediatePropagation();
      toggleOverlay(true, 'chat');
    } else if (e.key.toLowerCase() === 'b') {
      e.preventDefault();
      e.stopImmediatePropagation();
      toggleOverlay(true, 'sounds');
    }
  }
}, true);

['keyup', 'keypress'].forEach(evtName => {
  window.addEventListener(evtName, (e) => {
    if (isTerminalOpen()) e.stopImmediatePropagation();
  }, true);
});
