// REPLACE WITH YOUR SPOTIFY DEVELOPER CLIENT ID
const SPOTIFY_CLIENT_ID = "YOUR_SPOTIFY_CLIENT_ID";
const REDIRECT_URI = window.location.origin + window.location.pathname;

async function loginWithSpotify() {
  const verifier = generateRandomString(64);
  const challenge = await generateCodeChallenge(verifier);
  localStorage.setItem('spotify_pkce_verifier', verifier);

  const scope = 'streaming user-read-email user-read-private user-modify-playback-state user-read-playback-state';
  const authUrl = new URL("https://spotify.com");
  authUrl.search = new URLSearchParams({
    response_type: 'code',
    client_id: SPOTIFY_CLIENT_ID,
    scope: scope,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    redirect_uri: REDIRECT_URI,
  }).toString();

  window.location.href = authUrl.toString();
}

async function handleSpotifyCallback() {
  const code = new URLSearchParams(window.location.search).get('code');
  if (!code) return;

  const res = await fetch('https://spotify.com', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: SPOTIFY_CLIENT_ID,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: REDIRECT_URI,
      code_verifier: localStorage.getItem('spotify_pkce_verifier'),
    }),
  });

  const data = await res.json();
  if (data.access_token) {
    localStorage.setItem('spotify_access_token', data.access_token);
    window.history.replaceState({}, document.title, REDIRECT_URI);
    initSpotifyPlayer();
  }
}

function initSpotifyPlayer() {
  const token = localStorage.getItem('spotify_access_token');
  if (!token || !window.Spotify) return;

  document.getElementById('spotify-login-btn').classList.add('gtag-hidden');
  document.getElementById('spotify-controls').classList.remove('gtag-hidden');

  const player = new Spotify.Player({
    name: 'Gorilla Tag Web',
    getOAuthToken: cb => cb(token),
    volume: 0.5
  });

  player.addListener('player_state_changed', state => {
    if (!state) return;
    const track = state.track_window.current_track;
    document.getElementById('track-info').textContent = `PLAYING: ${track.name} - ${track.artists.map(a => a.name).join(', ')}`;
  });

  player.addListener('authentication_error', () => {
    localStorage.removeItem('spotify_access_token');
    document.getElementById('spotify-login-btn').classList.remove('gtag-hidden');
    document.getElementById('spotify-controls').classList.add('gtag-hidden');
  });

  player.connect();
  window.gtagSpotifyPlayer = player;
}

window.onSpotifyWebPlaybackSDKReady = () => handleSpotifyCallback().then(() => initSpotifyPlayer());

function spotifyAction(action) {
  if (!window.gtagSpotifyPlayer) return;
  if (action === 'playpause') window.gtagSpotifyPlayer.togglePlay();
  if (action === 'next') window.gtagSpotifyPlayer.nextTrack();
  if (action === 'previous') window.gtagSpotifyPlayer.previousTrack();
}

function generateRandomString(len) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: len }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
}

async function generateCodeChallenge(verifier) {
  const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
