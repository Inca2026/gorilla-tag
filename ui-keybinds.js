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
    // Unlock the mouse cursor from Unity
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
    if (tab) switchTab(tab);
    if (tab === 'chat' || !tab) {
      setTimeout(() => chatInput.focus(), 20);
    }
  } else {
    overlay.classList.add('gtag-hidden');
    chatInput.blur();
    unityCanvas.focus();
    // Re-lock cursor back into Unity
    if (unityCanvas.requestPointerLock) {
      unityCanvas.requestPointerLock();
    }
  }
}

function switchTab(tabName) {
  document.getElementById('tab-chat').classList.toggle('gtag-hidden', tabName !== 'chat');
  document.getElementById('tab-music').classList.toggle('gtag-hidden', tabName !== 'music');
  document.getElementById('btn-tab-chat').classList.toggle('active', tabName === 'chat');
  document.getElementById('btn-tab-music').classList.toggle('active', tabName === 'music');
  if (tabName === 'chat') {
    setTimeout(() => chatInput.focus(), 10);
  }
}

// Intercept ALL keyboard events in the CAPTURE phase (before Unity WebGL steals them)
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

    // Stop Unity from receiving any keys while terminal is open
    e.stopImmediatePropagation();

    // If chat tab is active, ensure input stays focused and works even if Unity blocked default typing
    if (!document.getElementById('tab-chat').classList.contains('gtag-hidden')) {
      if (document.activeElement !== chatInput) {
        chatInput.focus();
      }
    }
  } else {
    // Terminal is closed: check hotkeys T (Chat) and M (Music)
    if (e.key.toLowerCase() === 't') {
      e.preventDefault();
      e.stopImmediatePropagation();
      toggleOverlay(true, 'chat');
    } else if (e.key.toLowerCase() === 'm') {
      e.preventDefault();
      e.stopImmediatePropagation();
      toggleOverlay(true, 'music');
    }
  }
}, true); // <-- 'true' enables capture phase so this runs BEFORE Unity!

// Also block keyup/keypress from reaching Unity while typing
['keyup', 'keypress'].forEach(evtName => {
  window.addEventListener(evtName, (e) => {
    if (isTerminalOpen()) {
      e.stopImmediatePropagation();
    }
  }, true);
});
