const overlay = document.getElementById('gtag-overlay');
const chatInput = document.getElementById('chat-input');
const unityCanvas = document.getElementById('unity-canvas');

function toggleOverlay(forceOpen = null, tab = null) {
  const isHidden = overlay.classList.contains('gtag-hidden');
  const shouldOpen = forceOpen !== null ? forceOpen : isHidden;

  if (shouldOpen) {
    overlay.classList.remove('gtag-hidden');
    if (tab) switchTab(tab);
    if (tab === 'chat' || !tab) setTimeout(() => chatInput.focus(), 10);
  } else {
    overlay.classList.add('gtag-hidden');
    chatInput.blur();
    unityCanvas.focus();
  }
}

function switchTab(tabName) {
  document.getElementById('tab-chat').classList.toggle('gtag-hidden', tabName !== 'chat');
  document.getElementById('tab-music').classList.toggle('gtag-hidden', tabName !== 'music');
  document.getElementById('btn-tab-chat').classList.toggle('active', tabName === 'chat');
  document.getElementById('btn-tab-music').classList.toggle('active', tabName === 'music');
  if (tabName === 'chat') chatInput.focus();
}

['keydown', 'keyup', 'keypress'].forEach(evtName => {
  chatInput.addEventListener(evtName, (e) => {
    if (e.key !== 'Tab' && e.key !== 'Escape') e.stopPropagation();
  });
});

document.addEventListener('keydown', (e) => {
  const isTyping = document.activeElement === chatInput;
  if (e.key === 'Tab') {
    e.preventDefault();
    toggleOverlay();
  } else if (e.key === 'Escape' && !overlay.classList.contains('gtag-hidden')) {
    toggleOverlay(false);
  } else if (!isTyping) {
    if (e.key.toLowerCase() === 't') { e.preventDefault(); toggleOverlay(true, 'chat'); }
    else if (e.key.toLowerCase() === 'm') { e.preventDefault(); toggleOverlay(true, 'music'); }
    else if (!overlay.classList.contains('gtag-hidden')) {
      if (e.key === '1') switchTab('chat');
      if (e.key === '2') switchTab('music');
    }
  }
});
