// BUILT-IN WEB AUDIO MONKE SOUNDBOARD & CLIENT MODS
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
    // Classic Gorilla Tag slap + horn
    playTone(180, 'sawtooth', 0.12, 0, 60);
    playTone(520, 'square', 0.18, 0.08, 380);
  } else if (sound === 'roundstart') {
    // 3-2-1-GO Stump Horn
    playTone(440, 'square', 0.15, 0);
    playTone(440, 'square', 0.15, 0.25);
    playTone(440, 'square', 0.15, 0.5);
    playTone(880, 'sawtooth', 0.4, 0.75);
  } else if (sound === 'monke') {
    // Ooh-ooh-aah synth call
    playTone(320, 'triangle', 0.14, 0, 480);
    playTone(340, 'triangle', 0.14, 0.18, 500);
    playTone(620, 'sawtooth', 0.28, 0.36, 260);
  } else if (sound === 'lava') {
    // Deep lava rumble + sizzle
    playTone(95, 'sawtooth', 0.5, 0, 45);
    playTone(1200, 'square', 0.25, 0.1, 300);
  } else if (sound === 'computer') {
    // Stump keyboard click-beep
    playTone(950, 'square', 0.06, 0);
    playTone(1250, 'square', 0.08, 0.07);
  } else if (sound === 'win') {
    // Victory arpeggio
    playTone(523.25, 'square', 0.12, 0);
    playTone(659.25, 'square', 0.12, 0.12);
    playTone(783.99, 'square', 0.12, 0.24);
    playTone(1046.5, 'square', 0.35, 0.36);
  }
}

// CLIENT MODS TOGGLES
const modState = {
  nightvision: false,
  crt: false,
  crosshair: false,
  fps: false
};

let fpsInterval = null;
let frameCount = 0;

function toggleMod(mod) {
  modState[mod] = !modState[mod];
  const btn = document.getElementById(`mod-${mod}`);
  const canvas = document.getElementById('unity-canvas');

  if (mod === 'nightvision') {
    btn.textContent = `NIGHT VISION: ${modState.nightvision ? 'ON' : 'OFF'}`;
    btn.classList.toggle('active', modState.nightvision);
    canvas.style.filter = modState.nightvision ? 'brightness(1.8) contrast(1.3) sepia(1) hue-rotate(70deg) saturate(3)' : 'none';
  } else if (mod === 'crt') {
    btn.textContent = `CRT SCANLINES: ${modState.crt ? 'ON' : 'OFF'}`;
    btn.classList.toggle('active', modState.crt);
    document.getElementById('crt-overlay').classList.toggle('gtag-hidden', !modState.crt);
  } else if (mod === 'crosshair') {
    btn.textContent = `CENTER CROSSHAIR: ${modState.crosshair ? 'ON' : 'OFF'}`;
    btn.classList.toggle('active', modState.crosshair);
    document.getElementById('gtag-crosshair').classList.toggle('gtag-hidden', !modState.crosshair);
  } else if (mod === 'fps') {
    btn.textContent = `LIVE FPS COUNTER: ${modState.fps ? 'ON' : 'OFF'}`;
    btn.classList.toggle('active', modState.fps);
    const hud = document.getElementById('gtag-hud-hint');

    if (modState.fps) {
      const countFrames = () => {
        frameCount++;
        if (modState.fps) requestAnimationFrame(countFrames);
      };
      requestAnimationFrame(countFrames);

      fpsInterval = setInterval(() => {
        hud.textContent = `FPS: ${frameCount} | [TAB] TERMINAL | [T] CHAT | [B] SOUNDS`;
        frameCount = 0;
      }, 1000);
    } else {
      clearInterval(fpsInterval);
      hud.textContent = `[TAB] TERMINAL | [T] CHAT | [B] SOUNDBOARD`;
    }
  }
}
