document.addEventListener("DOMContentLoaded", () => {
  const STUMP_CHANNELS = [
    { alias: "#stump-network-general:matrix.org", name: "general", type: "text" },
    { alias: "#stump-network-vc:matrix.org", name: "vc", type: "voice" }
  ];
  const FALLBACK_SERVER = "https://matrix.org";

  const loginBox = document.getElementById("matrix-login-box");
  const chatBox = document.getElementById("matrix-chat-box");
  const statusLabel = document.getElementById("matrix-login-error");
  const loginBtn = document.getElementById("matrix-login-btn");
  const userField = document.getElementById("matrix-user-input");
  const passField = document.getElementById("matrix-pass-input");
  const chatInput = document.getElementById("chat-input");
  const msgBox = document.getElementById("chat-messages");

  let accessToken = localStorage.getItem("gtag_mx_token") || "";
  let userId = localStorage.getItem("gtag_mx_user") || "";
  let homeserver = localStorage.getItem("gtag_mx_server") || FALLBACK_SERVER;
  let activeRoomId = localStorage.getItem("gtag_mx_custom_room") || "";
  let activeChannelKey = "general";

  let guestToken = sessionStorage.getItem("gtag_lb_guest_token") || "";
  let guestUserId = sessionStorage.getItem("gtag_lb_guest_user") || "";
  let guestRoomId = "";

  let syncToken = "";
  let isSyncing = false;
  let sidebarRooms = [];
  let toastTimeout = null;

  // --- CUSTOM WEBRTC + ELEMENT CALL VOICE STATE (#vc) ---
  let localAudioStream = null;
  let vcJoined = false;
  let vcMuted = false;
  let micAnalyserInterval = null;
  const peerConnections = new Map();
  const remoteAudioEls = new Map();
  const activeVcMembers = new Map();
  const ICE_CONFIG = { iceServers: [{ urls: "stun:://google.com" }] };

  // --- ONLINE PLAYTIME TRACKING (ZERO CHAT MESSAGES) ---
  let totalPlaySeconds = parseInt(localStorage.getItem("gtag_total_playtime") || "0", 10);
  const onlinePlayers = new Map();

  function formatPlaytime(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }

  function formatDisplayName(rawMatrixId) {
    if (!rawMatrixId) return "MONKE";
    const clean = rawMatrixId.split(":").at(0).replace(/^@/, "");
    return /^\d+$/.test(clean) ? `MONKE_${clean.slice(-4)}` : clean;
  }

  setInterval(() => {
    totalPlaySeconds += 1;
    if (totalPlaySeconds % 5 === 0) {
      localStorage.setItem("gtag_total_playtime", String(totalPlaySeconds));
    }

    const lbBox = document.getElementById("gtag-leaderboard");
    const listEl = document.getElementById("lb-list");
    const countEl = document.getElementById("lb-count");
    if (!lbBox || !listEl || lbBox.classList.contains("gtag-hidden")) return;

    const now = Date.now();
    const myName = userId ? formatDisplayName(userId) : (guestUserId ? formatDisplayName(guestUserId) : "YOU");
    const entries = [
      { name: myName, seconds: totalPlaySeconds, isSelf: true }
    ];

    onlinePlayers.forEach((info, name) => {
      if (name === myName || now - info.lastSeen > 60000) return;
      if (userId && (name.startsWith("MONKE_") || name === "guavin")) return;
      const liveElapsed = Math.floor((now - info.lastSeen) / 1000);
      entries.push({
        name,
        seconds: info.seconds + liveElapsed,
        isSelf: false
      });
    });

    entries.sort((a, b) => b.seconds - a.seconds);

    if (countEl) countEl.textContent = `${entries.length} ONLINE`;

    listEl.innerHTML = entries.map((entry, idx) => {
      const cls = entry.isSelf ? "lb-row self-entry" : "lb-row";
      const label = `#${idx + 1} ${entry.name.slice(0, 12)}`;
      return `<div class="${cls}"><span>${label}</span><span>${formatPlaytime(entry.seconds)}</span></div>`;
    }).join("");

    renderVcUsersList();
  }, 1000);

  async function sendSilentPresence() {
    const tok = accessToken || guestToken;
    const uid = userId || guestUserId;
    const srv = accessToken ? homeserver : FALLBACK_SERVER;
    if (!tok || !uid) return;

    const tag = vcJoined ? `GTAG_VC:${totalPlaySeconds}` : `GTAG_TIME:${totalPlaySeconds}`;
    try {
      await fetch(`${srv}/_matrix/client/v3/presence/${encodeURIComponent(uid)}/status`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${tok}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          presence: "online",
          status_msg: tag
        })
      });
    } catch (_) {}
  }

  setInterval(sendSilentPresence, 15000);

  function setStatus(msg, isError = false) {
    if (!statusLabel) return;
    statusLabel.style.color = isError ? "#ff4444" : "#33ff33";
    statusLabel.textContent = msg;
  }

  function showGtagNotification(title, bodyText) {
    const toast = document.getElementById("gtag-toast");
    const toastTitle = document.getElementById("gtag-toast-title");
    const toastBody = document.getElementById("gtag-toast-body");
    if (!toast || !toastTitle || !toastBody) return;

    toastTitle.textContent = title;
    toastBody.textContent = bodyText;
    toast.classList.remove("gtag-hidden");

    if (typeof playTerminalSfx === "function") playTerminalSfx("receive");

    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toast.classList.add("gtag-hidden");
    }, 4500);
  }

  function addChatLine(sender, text) {
    if (!msgBox) return;
    const row = document.createElement("div");
    row.className = "chat-line";

    const userSpan = document.createElement("span");
    userSpan.className = "chat-user";
    userSpan.textContent = `[${sender}]: `;

    const textSpan = document.createElement("span");
    textSpan.textContent = text;

    row.appendChild(userSpan);
    row.appendChild(textSpan);
    msgBox.appendChild(row);
    msgBox.scrollTop = msgBox.scrollHeight;
  }
  // --- CUSTOM WEBRTC + ELEMENT CALL VOICE ENGINE (#vc) ---
  function renderVcUsersList() {
    const listEl = document.getElementById("vc-users-list");
    const countEl = document.getElementById("vc-peer-count");
    if (!listEl) return;

    const now = Date.now();
    const me = formatDisplayName(userId || guestUserId || "YOU");
    const rows = [];

    if (vcJoined) {
      rows.push(`<div class="vc-user-row"><span>${me} (YOU)</span><span>${vcMuted ? "MUTED" : "LIVE"}</span></div>`);
    }

    activeVcMembers.forEach((lastTs, name) => {
      if (name === me || now - lastTs > 45000) return;
      if (userId && (name.startsWith("MONKE_") || name === "guavin")) return;
      rows.push(`<div class="vc-user-row"><span>${name}</span><span>CONNECTED</span></div>`);
    });

    if (countEl) countEl.textContent = `${rows.length} IN VC`;
    listEl.innerHTML = rows.length > 0
      ? rows.join("")
      : `<div style="color:#888;">NO ONE IN VOICE CHANNEL YET.</div>`;
  }

  async function sendVoiceSignal(targetUser, signalObj) {
    if (!accessToken || !activeRoomId) return;
    const txnId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const url = `${homeserver}/_matrix/client/v3/rooms/${encodeURIComponent(activeRoomId)}/send/m.gtag.voice/${txnId}`;
    try {
      await fetch(url, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          to: targetUser,
          signal: signalObj
        })
      });
    } catch (_) {}
  }

  function createVoicePeer(remoteUserId, isInitiator) {
    if (peerConnections.has(remoteUserId)) {
      peerConnections.get(remoteUserId).close();
    }

    const pc = new RTCPeerConnection(ICE_CONFIG);
    peerConnections.set(remoteUserId, pc);

    if (localAudioStream) {
      localAudioStream.getTracks().forEach(track => pc.addTrack(track, localAudioStream));
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        sendVoiceSignal(remoteUserId, { type: "ice", candidate: e.candidate });
      }
    };

    pc.ontrack = (e) => {
      let audioEl = remoteAudioEls.get(remoteUserId);
      if (!audioEl) {
        audioEl = document.createElement("audio");
        audioEl.autoplay = true;
        document.body.appendChild(audioEl);
        remoteAudioEls.set(remoteUserId, audioEl);
      }
      audioEl.srcObject = e.streams.at(0);
    };

    if (isInitiator) {
      pc.createOffer().then(offer => {
        pc.setLocalDescription(offer);
        sendVoiceSignal(remoteUserId, { type: "offer", sdp: offer });
      }).catch(() => {});
    }

    return pc;
  }

  async function handleIncomingVoiceSignal(senderId, content) {
    if (!vcJoined || senderId === userId || senderId === guestUserId) return;
    if (content.to && content.to !== userId && content.to !== "*") return;

    const sig = content.signal;
    if (!sig) return;

    activeVcMembers.set(formatDisplayName(senderId), Date.now());

    if (sig.type === "hello") {
      createVoicePeer(senderId, true);
    } else if (sig.type === "offer") {
      const pc = createVoicePeer(senderId, false);
      await pc.setRemoteDescription(new RTCSessionDescription(sig.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendVoiceSignal(senderId, { type: "answer", sdp: answer });
    } else if (sig.type === "answer") {
      const pc = peerConnections.get(senderId);
      if (pc) await pc.setRemoteDescription(new RTCSessionDescription(sig.sdp));
    } else if (sig.type === "ice") {
      const pc = peerConnections.get(senderId);
      if (pc && sig.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(sig.candidate)).catch(() => {});
      }
    } else if (sig.type === "bye") {
      activeVcMembers.delete(formatDisplayName(senderId));
      peerConnections.get(senderId)?.close();
      peerConnections.delete(senderId);
    }
  }

  async function joinStumpVoice() {
    if (vcJoined) return;
    const statusEl = document.getElementById("vc-status-text");
    const joinBtn = document.getElementById("btn-vc-join");
    const muteBtn = document.getElementById("btn-vc-mute");
    const leaveBtn = document.getElementById("btn-vc-leave");

    try {
      if (statusEl) statusEl.textContent = "REQUESTING MIC ACCESS...";
      localAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      vcJoined = true;
      vcMuted = false;

      if (statusEl) statusEl.textContent = "VOICE RELAY: CONNECTED";
      if (joinBtn) { joinBtn.disabled = true; joinBtn.classList.add("active"); }
      if (muteBtn) { muteBtn.disabled = false; muteBtn.textContent = "MUTE: OFF"; }
      if (leaveBtn) leaveBtn.disabled = false;

      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const src = ctx.createMediaStreamSource(localAudioStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const dataArr = new Uint8Array(analyser.frequencyBinCount);

      clearInterval(micAnalyserInterval);
      micAnalyserInterval = setInterval(() => {
        const bar = document.getElementById("vc-mic-bar");
        if (!bar || !vcJoined || vcMuted) {
          if (bar) bar.style.width = "0%";
          return;
        }
        analyser.getByteFrequencyData(dataArr);
        let sum = 0;
        for (let i = 0; i < dataArr.length; i++) sum += dataArr.at(i);
        const avg = Math.min(100, Math.round((sum / dataArr.length) * 2.2));
        bar.style.width = `${avg}%`;
      }, 80);

      if (typeof playTerminalSfx === "function") playTerminalSfx("send");
      await sendSilentPresence();
      await sendVoiceSignal("*", { type: "hello" });
      renderVcUsersList();

      const callUrl = "https://element.io";
      window.gtagVcPopup = window.open(callUrl, "StumpNetworkVC", "width=440,height=620,menubar=no,toolbar=no");
    } catch (err) {
      if (typeof playTerminalSfx === "function") playTerminalSfx("error");
      if (statusEl) statusEl.textContent = `MIC ERROR: ${err.message}`;
    }
  }

  function leaveStumpVoice() {
    if (!vcJoined) return;
    sendVoiceSignal("*", { type: "bye" });
    vcJoined = false;
    vcMuted = false;
    clearInterval(micAnalyserInterval);

    if (window.gtagVcPopup && !window.gtagVcPopup.closed) {
      window.gtagVcPopup.close();
    }

    if (localAudioStream) {
      localAudioStream.getTracks().forEach(t => t.stop());
      localAudioStream = null;
    }

    peerConnections.forEach(pc => pc.close());
    peerConnections.clear();
    remoteAudioEls.forEach(el => el.remove());
    remoteAudioEls.clear();

    const statusEl = document.getElementById("vc-status-text");
    const joinBtn = document.getElementById("btn-vc-join");
    const muteBtn = document.getElementById("btn-vc-mute");
    const leaveBtn = document.getElementById("btn-vc-leave");
    const bar = document.getElementById("vc-mic-bar");

    if (statusEl) statusEl.textContent = "VOICE RELAY: DISCONNECTED";
    if (joinBtn) { joinBtn.disabled = false; joinBtn.classList.remove("active"); }
    if (muteBtn) { muteBtn.disabled = true; muteBtn.textContent = "MUTE: OFF"; muteBtn.classList.remove("active"); }
    if (leaveBtn) leaveBtn.disabled = true;
    if (bar) bar.style.width = "0%";

    if (typeof playTerminalSfx === "function") playTerminalSfx("close");
    sendSilentPresence();
    renderVcUsersList();
  }

  document.getElementById("btn-vc-join")?.addEventListener("click", joinStumpVoice);
  document.getElementById("btn-vc-leave")?.addEventListener("click", leaveStumpVoice);
  document.getElementById("btn-vc-mute")?.addEventListener("click", () => {
    if (!localAudioStream) return;
    vcMuted = !vcMuted;
    localAudioStream.getAudioTracks().forEach(t => { t.enabled = !vcMuted; });
    const muteBtn = document.getElementById("btn-vc-mute");
    if (muteBtn) {
      muteBtn.textContent = `MUTE: ${vcMuted ? "ON" : "OFF"}`;
      muteBtn.classList.toggle("active", vcMuted);
    }
    if (typeof playTerminalSfx === "function") playTerminalSfx("click");
    renderVcUsersList();
  });
  async function initGuestLeaderboardSession() {
    if (accessToken) return;
    try {
      if (!guestToken) {
        const regRes = await fetch(`${FALLBACK_SERVER}/_matrix/client/v3/register?kind=guest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}"
        });
        const regData = await regRes.json();
        if (regData.access_token) {
          guestToken = regData.access_token;
          guestUserId = regData.user_id;
          sessionStorage.setItem("gtag_lb_guest_token", guestToken);
          sessionStorage.setItem("gtag_lb_guest_user", guestUserId);
        }
      }

      if (!guestToken) return;

      const lookupRes = await fetch(
        `${FALLBACK_SERVER}/_matrix/client/v3/directory/room/${encodeURIComponent(STUMP_CHANNELS.at(0).alias)}`,
        { headers: { "Authorization": `Bearer ${guestToken}` } }
      );
      const lookupData = await lookupRes.json();
      if (!lookupData.room_id) return;

      guestRoomId = lookupData.room_id;
      await fetch(`${FALLBACK_SERVER}/_matrix/client/v3/join/${encodeURIComponent(guestRoomId)}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${guestToken}`,
          "Content-Type": "application/json"
        },
        body: "{}"
      });

      await sendSilentPresence();

      if (!isSyncing) {
        isSyncing = true;
        startSyncLoop();
      }
    } catch (_) {}
  }

  async function resolveHomeserver(domain) {
    try {
      const res = await fetch(`https://${domain}/.well-known/matrix/client`);
      if (res.ok) {
        const info = await res.json();
        const base = info?.["m.homeserver"]?.base_url;
        if (base) return base.replace(/\/$/, "");
      }
    } catch (_) {}
    return domain.toLowerCase() === "matrix.org" ? FALLBACK_SERVER : `https://${domain}`;
  }

  async function handleLogin() {
    const rawUser = userField.value.trim();
    const password = passField.value;

    if (!rawUser || !password) {
      if (typeof playTerminalSfx === "function") playTerminalSfx("error");
      setStatus("ENTER YOUR ELEMENT USERNAME AND PASSWORD.", true);
      return;
    }

    if (typeof playTerminalSfx === "function") playTerminalSfx("click");
    loginBtn.disabled = true;
    loginBtn.textContent = "CONNECTING...";
    setStatus("LOOKING UP HOMESERVER...");

    try {
      let localpart = rawUser.replace(/^@/, "");
      let domain = "matrix.org";

      if (localpart.includes(":")) {
        const splitUser = localpart.split(":");
        localpart = splitUser.at(0);
        domain = splitUser.at(1) || "matrix.org";
      }

      homeserver = await resolveHomeserver(domain);
      setStatus(`SIGNING IN TO ${domain.toUpperCase()}...`);

      const loginRes = await fetch(`${homeserver}/_matrix/client/v3/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "m.login.password",
          identifier: { type: "m.id.user", user: localpart },
          password: password
        })
      });

      const loginData = await loginRes.json();
      if (!loginRes.ok || !loginData.access_token) {
        throw new Error(loginData.error || `Login rejected (${loginRes.status})`);
      }

      // Wipe old guest session so you never appear twice on leaderboard or VC
      if (guestUserId) {
        onlinePlayers.delete(formatDisplayName(guestUserId));
        activeVcMembers.delete(formatDisplayName(guestUserId));
      }
      guestToken = "";
      guestUserId = "";
      sessionStorage.removeItem("gtag_lb_guest_token");
      sessionStorage.removeItem("gtag_lb_guest_user");

      accessToken = loginData.access_token;
      userId = loginData.user_id;
      syncToken = "";

      localStorage.setItem("gtag_mx_token", accessToken);
      localStorage.setItem("gtag_mx_user", userId);
      localStorage.setItem("gtag_mx_server", homeserver);

      passField.value = "";
      setStatus("");
      if (typeof playTerminalSfx === "function") playTerminalSfx("send");
      await openStumpRoom();
    } catch (err) {
      if (typeof playTerminalSfx === "function") playTerminalSfx("error");
      setStatus(`LOGIN ERROR: ${err.message}`, true);
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = "SIGN IN & JOIN";
    }
  }

  function renderRoomSidebar() {
    const listEl = document.getElementById("room-sidebar-list");
    if (!listEl) return;

    listEl.innerHTML = "";
    sidebarRooms.forEach((rm) => {
      const btn = document.createElement("button");
      btn.type = "button";
      const isSelected = rm.name === activeChannelKey;
      btn.className = isSelected ? "gtag-room-item active" : "gtag-room-item";
      btn.textContent = `#${rm.name}`;
      btn.title = rm.alias || rm.name;
      btn.onclick = () => {
        if (typeof playTerminalSfx === "function") playTerminalSfx("tab");
        selectStumpChannel(rm);
      };
      listEl.appendChild(btn);
    });
  }

  async function selectStumpChannel(channelObj) {
    activeChannelKey = channelObj.name;
    const textPanel = document.getElementById("stump-text-panel");
    const vcPanel = document.getElementById("stump-vc-panel");
    const label = document.getElementById("matrix-room-label");

    renderRoomSidebar();

    if (channelObj.type === "voice") {
      if (label) label.textContent = "STUMP NETWORK // #VC";
      textPanel.classList.add("gtag-hidden");
      vcPanel.classList.remove("gtag-hidden");
      renderVcUsersList();
      return;
    }

    vcPanel.classList.add("gtag-hidden");
    textPanel.classList.remove("gtag-hidden");
    if (label) label.textContent = `STUMP NETWORK // #${channelObj.name.toUpperCase()}`;

    if (channelObj.id) {
      activeRoomId = channelObj.id;
      localStorage.setItem("gtag_mx_custom_room", activeRoomId);
      msgBox.innerHTML = "";
      addChatLine("SYSTEM", `CONNECTED TO #${channelObj.name.toUpperCase()}`);
      await loadRecentRoomHistory(activeRoomId);
      chatInput.focus();
    } else {
      msgBox.innerHTML = "";
      addChatLine("SYSTEM", `ROOM ${channelObj.alias} NOT FOUND OR PRIVATE ON MATRIX.ORG`);
    }
  }

  async function loadRecentRoomHistory(rId) {
    try {
      const res = await fetch(`${homeserver}/_matrix/client/v3/rooms/${encodeURIComponent(rId)}/messages?dir=b&limit=15`, {
        headers: { "Authorization": `Bearer ${accessToken}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      const history = (data.chunk || []).reverse();
      for (const ev of history) {
        if (ev.type === "m.room.message" && ev.content?.body) {
          if (/^\[(TIME|POS):/.test(ev.content.body)) continue;
          addChatLine(formatDisplayName(ev.sender), ev.content.body);
        }
      }
    } catch (_) {}
  }

  async function resolveAndJoinAlias(alias) {
    const lookupRes = await fetch(
      `${homeserver}/_matrix/client/v3/directory/room/${encodeURIComponent(alias)}`,
      { headers: { "Authorization": `Bearer ${accessToken}` } }
    );
    const lookupData = await lookupRes.json();
    if (!lookupRes.ok || !lookupData.room_id) {
      throw new Error(lookupData.error || `Room ${alias} not found`);
    }

    const rId = lookupData.room_id;
    await fetch(`${homeserver}/_matrix/client/v3/join/${encodeURIComponent(rId)}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: "{}"
    });
    return rId;
  }

  async function populateStumpSidebar() {
    sidebarRooms = [];

    for (const ch of STUMP_CHANNELS) {
      if (ch.type === "voice") {
        sidebarRooms.push({ name: ch.name, alias: ch.alias, type: "voice", id: null });
        continue;
      }

      try {
        const rId = await resolveAndJoinAlias(ch.alias);
        sidebarRooms.push({ name: ch.name, alias: ch.alias, type: "text", id: rId });
      } catch (_) {
        sidebarRooms.push({ name: ch.name, alias: ch.alias, type: "text", id: null });
      }
    }

    renderRoomSidebar();
  }

  async function openStumpRoom() {
    loginBox.classList.add("gtag-hidden");
    chatBox.classList.remove("gtag-hidden");
    msgBox.innerHTML = "";
    addChatLine("SYSTEM", `LOGGED IN AS ${userId}`);
    addChatLine("SYSTEM", "LOADING STUMP NETWORK...");

    await populateStumpSidebar();

    const firstChannel = sidebarRooms.at(0);
    if (firstChannel) {
      await selectStumpChannel(firstChannel);
    }

    await sendSilentPresence();

    if (!isSyncing) {
      isSyncing = true;
      startSyncLoop();
    }
  }
  async function startSyncLoop() {
    while ((accessToken || guestToken) && isSyncing) {
      const tok = accessToken || guestToken;
      const srv = accessToken ? homeserver : FALLBACK_SERVER;
      const targetRoom = activeRoomId || guestRoomId;

      try {
        const query = syncToken ? `?timeout=15000&since=${encodeURIComponent(syncToken)}` : "?timeout=15000";
        const res = await fetch(`${srv}/_matrix/client/v3/sync${query}`, {
          headers: { "Authorization": `Bearer ${tok}` }
        });

        if (!res.ok) {
          if (res.status === 401 && accessToken) {
            handleLogout();
            setStatus("SESSION EXPIRED. SIGN IN AGAIN.", true);
            return;
          }
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }

        const data = await res.json();
        const isInitialSync = !syncToken;
        if (data.next_batch) syncToken = data.next_batch;
        const selfId = userId || guestUserId;

        const presenceEvents = data.presence?.events || [];
        for (const pEv of presenceEvents) {
          if (pEv.type === "m.presence" && pEv.sender && pEv.sender !== selfId) {
            const pName = formatDisplayName(pEv.sender);
            const state = pEv.content?.presence;
            const statusMsg = pEv.content?.status_msg || "";

            if (state === "offline") {
              onlinePlayers.delete(pName);
              activeVcMembers.delete(pName);
            } else if (state === "online" || statusMsg.startsWith("GTAG_")) {
              const numStr = statusMsg.replace(/^GTAG_(TIME|VC):/, "");
              const parsedSec = parseInt(numStr, 10) || (onlinePlayers.get(pName)?.seconds || 0);

              onlinePlayers.set(pName, {
                seconds: parsedSec,
                lastSeen: Date.now()
              });

              if (statusMsg.startsWith("GTAG_VC:")) {
                activeVcMembers.set(pName, Date.now());
              } else {
                activeVcMembers.delete(pName);
              }
            }
          }
        }

        const joinedRooms = data.rooms?.join || {};
        const stumpData = joinedRooms[targetRoom];
        const events = stumpData?.timeline?.events || [];

        for (const ev of events) {
          if (ev.type === "m.gtag.voice" && !isInitialSync) {
            await handleIncomingVoiceSignal(ev.sender, ev.content);
            continue;
          }

          if (ev.type === "m.room.message" && ev.content?.body) {
            const body = ev.content.body;
            if (/^\[(TIME|POS):/.test(body)) continue;

            const displayUser = formatDisplayName(ev.sender);

            if (ev.sender !== selfId && !isInitialSync) {
              if (!onlinePlayers.has(displayUser)) {
                onlinePlayers.set(displayUser, { seconds: 0, lastSeen: Date.now() });
              } else {
                onlinePlayers.get(displayUser).lastSeen = Date.now();
              }
            }

            if (accessToken && !isInitialSync) {
              addChatLine(displayUser, body);
              const overlay = document.getElementById("gtag-overlay");
              const terminalClosed = overlay && overlay.classList.contains("gtag-hidden");
              if (terminalClosed && ev.sender !== selfId) {
                showGtagNotification("STUMP CHAT // [T] TO REPLY", `[${displayUser}]: ${body}`);
              }
            }
          }
        }
      } catch (_) {
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  }

  async function sendMessage(text) {
    if (!accessToken || !text || !activeRoomId) return;

    const txnId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const sendUrl = `${homeserver}/_matrix/client/v3/rooms/${encodeURIComponent(activeRoomId)}/send/m.room.message/${txnId}`;

    try {
      const res = await fetch(sendUrl, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          msgtype: "m.text",
          body: text
        })
      });

      if (res && res.ok) {
        if (typeof playTerminalSfx === "function") playTerminalSfx("send");
      } else if (res) {
        const errData = await res.json();
        if (typeof playTerminalSfx === "function") playTerminalSfx("error");
        addChatLine("SYSTEM", `SEND ERROR: ${errData.error || res.status}`);
      }
    } catch (err) {
      addChatLine("SYSTEM", `NETWORK ERROR: ${err.message}`);
    }
  }

  const addRoomBtn = document.getElementById("btn-add-room");
  if (addRoomBtn) {
    addRoomBtn.onclick = async (e) => {
      e.preventDefault();
      if (typeof playTerminalSfx === "function") playTerminalSfx("click");
      const rawAlias = prompt("Enter Stump Channel Address (e.g. #stump-network-clips:matrix.org):");
      if (!rawAlias || !rawAlias.trim()) return;

      let formatted = rawAlias.trim();
      if (!formatted.startsWith("#") && !formatted.startsWith("!")) formatted = `#${formatted}`;
      if (!formatted.includes(":")) formatted = `${formatted}:matrix.org`;

      try {
        addChatLine("SYSTEM", `JOINING ${formatted}...`);
        const rId = await resolveAndJoinAlias(formatted);
        const shortName = formatted.split(":").at(0).replace(/^#stump-network-/, "").replace(/^#/, "");
        const newCh = { name: shortName, alias: formatted, type: "text", id: rId };
        if (!sidebarRooms.some(r => r.alias === formatted)) {
          sidebarRooms.push(newCh);
        }
        await selectStumpChannel(newCh);
      } catch (err) {
        if (typeof playTerminalSfx === "function") playTerminalSfx("error");
        addChatLine("SYSTEM", `JOIN FAILED: ${err.message}`);
      }
    };
  }

  function handleLogout() {
    leaveStumpVoice();
    accessToken = "";
    userId = "";
    syncToken = "";
    isSyncing = false;
    localStorage.removeItem("gtag_mx_token");
    localStorage.removeItem("gtag_mx_user");
    localStorage.removeItem("gtag_mx_server");
    localStorage.removeItem("gtag_mx_custom_room");
    chatBox.classList.add("gtag-hidden");
    loginBox.classList.remove("gtag-hidden");
    if (typeof playTerminalSfx === "function") playTerminalSfx("close");
    setStatus("SIGNED OUT.");
    initGuestLeaderboardSession();
  }

  window.loginElementAccount = handleLogin;
  window.logoutElementAccount = handleLogout;

  window.sendStumpChatInput = function() {
    const msg = chatInput.value.trim();
    if (msg) {
      chatInput.value = "";
      sendMessage(msg);
    }
  };

  loginBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleLogin();
  };

  const logoutBtn = document.getElementById("matrix-logout-btn");
  if (logoutBtn) {
    logoutBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleLogout();
    };
  }

  const sendBtn = document.getElementById("chat-send-btn");
  if (sendBtn) {
    sendBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.sendStumpChatInput();
      chatInput.focus();
    };
  }

  setStatus("READY TO SIGN IN.");
  if (accessToken && userId) {
    openStumpRoom();
  } else {
    initGuestLeaderboardSession();
  }
});
