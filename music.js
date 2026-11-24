// SOUNDCLOUD + YOUTUBE EMBED PLAYER (FULL TRACKS, NO LOGIN REQUIRED)
const PRESET_STATIONS = {
  gtag: "https://soundcloud.com",
  lofi: "https://soundcloud.com",
  phonk: "https://soundcloud.com"
};

function loadPresetMusic(stationKey) {
  const frame = document.getElementById('music-embed');
  if (PRESET_STATIONS[stationKey]) {
    frame.src = PRESET_STATIONS[stationKey];
  }
}

function loadCustomMusic() {
  const input = document.getElementById('music-link-input');
  const url = input.value.trim();
  const frame = document.getElementById('music-embed');

  if (!url) return;

  // 1. Check if it's a SoundCloud URL
  if (url.includes("://soundcloud.com")) {
    frame.src = `https://w.://soundcloud.complayer/?url=${encodeURIComponent(url)}&color=%2333ff33&auto_play=true&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false`;
    input.value = "";
    return;
  }

  // 2. Check if it's a YouTube URL (://youtube.com... or youtu.be/...)
  const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) {
    const videoId = ytMatch;
    frame.src = `https://youtube.com{videoId}?autoplay=1`;
    input.value = "";
    return;
  }

  alert("Paste a valid SoundCloud track/playlist URL or YouTube video URL!");
}
