document.addEventListener("DOMContentLoaded", () => {
  const DEFAULT_GENERAL_ALIAS = "#stump-network-general:matrix.org";
  const DEFAULT_RANDOM_ALIAS = "#stump-network-random:matrix.org";
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

  let guestToken = sessionStorage.getItem("gtag_lb_guest_token") || "";
  let guestUserId = sessionStorage.getItem("gtag_lb_guest_user") || "";
  let guestRoomId = "";

  let syncToken = "";
  let isSyncing = false;
  let sidebarRooms = [];
  let toastTimeout = null;

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
      if (now - info.lastSeen > 60000) return;
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
  }, 1000);

  async function sendSilentPresence() {
    const tok = accessToken || guestToken;
    const uid = userId || guestUserId;
    const srv = accessToken ? homeserver : FALLBACK_SERVER;
    if (!tok || !uid) return;

    try {
      await fetch(`${srv}/_matrix/client/v3/presence/${encodeURIComponent(uid)}/status`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${tok}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          presence: "online",
          status_msg: `GTAG_TIME:${totalPlaySeconds}`
        })
      });
    } catch (_) {}
  }

  setInterval(sendSilentPresence, 20000);

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
        `${FALLBACK_SERVER}/_matrix/client/v3/directory/room/${encodeURIComponent(DEFAULT_GENERAL_ALIAS)}`,
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

  async function getRoomName(rId) {
    try {
      const res = await fetch(`${homeserver}/_matrix/client/v3/rooms/${encodeURIComponent(rId)}/state/m.room.name`, {
        headers: { "Authorization": `Bearer ${accessToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        return data.name || "Channel";
      }
    } catch (_) {}
    return "Channel";
  }

  function renderRoomSidebar() {
    const listEl = document.getElementById("room-sidebar-list");
    if (!listEl) return;

    listEl.innerHTML = "";
    sidebarRooms.forEach((rm) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = rm.id === activeRoomId ? "gtag-room-item active" : "gtag-room-item";
      btn.textContent = `#${rm.name.toLowerCase()}`;
      btn.title = rm.name;
      btn.onclick = () => {
        if (typeof playTerminalSfx === "function") playTerminalSfx("tab");
        switchActiveRoom(rm.id, rm.name);
      };
      listEl.appendChild(btn);
    });
  }

  async function switchActiveRoom(rId, knownName = null) {
    activeRoomId = rId;
    localStorage.setItem("gtag_mx_custom_room", activeRoomId);
    const roomTitle = knownName || await getRoomName(activeRoomId);

    const label = document.getElementById("matrix-room-label");
    if (label) label.textContent = `ROOM: #${roomTitle.toUpperCase()}`;

    msgBox.innerHTML = "";
    addChatLine("SYSTEM", `SWITCHED TO #${roomTitle.toUpperCase()}`);
    renderRoomSidebar();
    await loadRecentRoomHistory(activeRoomId);
    chatInput.focus();
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

  async function populateRoomSidebar() {
    sidebarRooms = [];
    const seenIds = new Set();

    // 1. Always ensure #general and #random presets are joined & listed first
    const presets = [
      { alias: DEFAULT_GENERAL_ALIAS, fallbackName: "general" },
      { alias: DEFAULT_RANDOM_ALIAS, fallbackName: "random" }
    ];

    for (const p of presets) {
      try {
        const rId = await resolveAndJoinAlias(p.alias);
        if (!seenIds.has(rId)) {
          seenIds.add(rId);
          const name = await getRoomName(rId);
          sidebarRooms.push({ id: rId, name: name !== "Channel" ? name : p.fallbackName });
        }
      } catch (_) {}
    }

    // 2. Also load all other joined rooms from the player's Element account
    try {
      const res = await fetch(`${homeserver}/_matrix/client/v3/joined_rooms`, {
        headers: { "Authorization": `Bearer ${accessToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        for (const rId of (data.joined_rooms || [])) {
          if (!seenIds.has(rId)) {
            seenIds.add(rId);
            const name = await getRoomName(rId);
            sidebarRooms.push({ id: rId, name });
          }
        }
      }
    } catch (_) {}

    renderRoomSidebar();
  }

  async function openStumpRoom() {
    loginBox.classList.add("gtag-hidden");
    chatBox.classList.remove("gtag-hidden");
    msgBox.innerHTML = "";
    addChatLine("SYSTEM", `LOGGED IN AS ${userId}`);
    addChatLine("SYSTEM", "LOADING CHANNELS...");

    await populateRoomSidebar();

    const savedRoom = localStorage.getItem("gtag_mx_custom_room");
    const initialRoom = sidebarRooms.find(r => r.id === savedRoom) || sidebarRooms.at(0);

    if (initialRoom) {
      await switchActiveRoom(initialRoom.id, initialRoom.name);
    } else {
      addChatLine("SYSTEM", "NO CHANNELS FOUND. CLICK + ON LEFT TO JOIN ONE.");
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

        // 1. Silent Matrix Presence events (Zero chat messages!)
        const presenceEvents = data.presence?.events || [];
        for (const pEv of presenceEvents) {
          if (pEv.type === "m.presence" && pEv.sender && pEv.sender !== selfId) {
            const pName = formatDisplayName(pEv.sender);
            const state = pEv.content?.presence;
            const statusMsg = pEv.content?.status_msg || "";

            if (state === "offline") {
              onlinePlayers.delete(pName);
            } else if (state === "online" || statusMsg.startsWith("GTAG_TIME:")) {
              const parsedSec = statusMsg.startsWith("GTAG_TIME:")
                ? parseInt(statusMsg.replace("GTAG_TIME:", ""), 10) || 0
                : (onlinePlayers.get(pName)?.seconds || 0);

              onlinePlayers.set(pName, {
                seconds: parsedSec,
                lastSeen: Date.now()
              });
            }
          }
        }

        // 2. Real room chat messages
        const joinedRooms = data.rooms?.join || {};
        const stumpData = joinedRooms[targetRoom];
        const events = stumpData?.timeline?.events || [];

        for (const ev of events) {
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

  // "+" Button in Sidebar to Join Any Custom #room:matrix.org
  const addRoomBtn = document.getElementById("btn-add-room");
  if (addRoomBtn) {
    addRoomBtn.onclick = async (e) => {
      e.preventDefault();
      if (typeof playTerminalSfx === "function") playTerminalSfx("click");
      const rawAlias = prompt("Enter Element Room Address (e.g. #stump-network-random:matrix.org):");
      if (!rawAlias || !rawAlias.trim()) return;

      let formatted = rawAlias.trim();
      if (!formatted.startsWith("#") && !formatted.startsWith("!")) formatted = `#${formatted}`;
      if (!formatted.includes(":")) formatted = `${formatted}:matrix.org`;

      try {
        addChatLine("SYSTEM", `JOINING ${formatted}...`);
        const rId = await resolveAndJoinAlias(formatted);
        const name = await getRoomName(rId);
        if (!sidebarRooms.some(r => r.id === rId)) {
          sidebarRooms.push({ id: rId, name });
        }
        await switchActiveRoom(rId, name);
      } catch (err) {
        if (typeof playTerminalSfx === "function") playTerminalSfx("error");
        addChatLine("SYSTEM", `JOIN FAILED: ${err.message}`);
      }
    };
  }

  function handleLogout() {
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
