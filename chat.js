document.addEventListener("DOMContentLoaded", () => {
  const DEFAULT_GENERAL_ALIAS = "#stump-network-general:matrix.org";
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
  let cachedRoomList = [];
  let toastTimeout = null;

  // --- ONLINE PLAYTIME TRACKING ---
  let totalPlaySeconds = parseInt(localStorage.getItem("gtag_total_playtime") || "0", 10);
  const onlinePlayers = new Map();

  function formatPlaytime(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }

  function getMyDisplayName() {
    if (userId) return userId.split(":").at(0).replace(/^@/, "");
    if (guestUserId) {
      const raw = guestUserId.split(":").at(0).replace(/^@/, "");
      return /^\d+$/.test(raw) ? `MONKE_${raw.slice(-4)}` : raw;
    }
    return "YOU";
  }

  // Increment playtime every 1 second and update the leaderboard UI
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
    const entries = [
      { name: getMyDisplayName(), seconds: totalPlaySeconds, isSelf: true }
    ];

    onlinePlayers.forEach((info, name) => {
      if (now - info.lastSeen > 35000) return; // Offline after 35s without heartbeat
      const liveElapsed = Math.floor((now - info.lastSeen) / 1000);
      entries.push({
        name,
        seconds: info.seconds + liveElapsed,
        isSelf: false
      });
    });

    // Sort highest playtime first
    entries.sort((a, b) => b.seconds - a.seconds);

    if (countEl) countEl.textContent = `${entries.length} ONLINE`;

    listEl.innerHTML = entries.map((entry, idx) => {
      const cls = entry.isSelf ? "lb-row self-entry" : "lb-row";
      const label = `#${idx + 1} ${entry.name.slice(0, 12)}`;
      return `<div class="${cls}"><span>${label}</span><span>${formatPlaytime(entry.seconds)}</span></div>`;
    }).join("");
  }, 1000);

  // Broadcast playtime heartbeat every 10 seconds while online
  setInterval(() => {
    const tok = accessToken || guestToken;
    const rm = activeRoomId || guestRoomId;
    if (!tok || !rm) return;
    sendRawMatrixText(`[TIME:${totalPlaySeconds}]`);
  }, 10000);

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

      sendRawMatrixText(`[TIME:${totalPlaySeconds}]`);

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
        return data.name || "General";
      }
    } catch (_) {}
    return "General";
  }

  async function selectRoomById(rId) {
    activeRoomId = rId;
    localStorage.setItem("gtag_mx_custom_room", activeRoomId);
    const roomTitle = await getRoomName(activeRoomId);
    const label = document.getElementById("matrix-room-label");
    if (label) label.textContent = `ROOM: ${roomTitle.toUpperCase()}`;
    addChatLine("SYSTEM", `CONNECTED TO #${roomTitle.toUpperCase()}!`);
    sendRawMatrixText(`[TIME:${totalPlaySeconds}]`);
  }

  async function autoJoinGeneralRoom() {
    try {
      const lookupRes = await fetch(
        `${homeserver}/_matrix/client/v3/directory/room/${encodeURIComponent(DEFAULT_GENERAL_ALIAS)}`,
        { headers: { "Authorization": `Bearer ${accessToken}` } }
      );
      const lookupData = await lookupRes.json();
      if (!lookupRes.ok || !lookupData.room_id) {
        throw new Error(lookupData.error || "Alias not found");
      }

      const targetRoomId = lookupData.room_id;

      const joinRes = await fetch(
        `${homeserver}/_matrix/client/v3/join/${encodeURIComponent(targetRoomId)}`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body: "{}"
        }
      );

      if (!joinRes.ok) {
        const joinErr = await joinRes.json();
        throw new Error(joinErr.error || `Join failed (${joinRes.status})`);
      }

      await selectRoomById(targetRoomId);
    } catch (err) {
      addChatLine("SYSTEM", `AUTO-JOIN NOTE: ${err.message}`);
      await listMyElementRooms();
    }
  }

  async function listMyElementRooms() {
    addChatLine("SYSTEM", "SCANNING YOUR ELEMENT ROOMS...");
    try {
      const res = await fetch(`${homeserver}/_matrix/client/v3/joined_rooms`, {
        headers: { "Authorization": `Bearer ${accessToken}` }
      });
      const data = await res.json();
      const ids = data.joined_rooms || [];
      cachedRoomList = [];

      for (let i = 0; i < ids.length; i++) {
        const rId = ids.at(i);
        const name = await getRoomName(rId);
        cachedRoomList.push({ id: rId, name });
        addChatLine("ROOM", `[${i + 1}] ${name}`);
      }
      addChatLine("SYSTEM", "TYPE /use 1 (OR 2, 3...) TO SWITCH CHANNELS.");
    } catch (err) {
      addChatLine("SYSTEM", `SCAN ERROR: ${err.message}`);
    }
  }

  async function openStumpRoom() {
    loginBox.classList.add("gtag-hidden");
    chatBox.classList.remove("gtag-hidden");
    msgBox.innerHTML = "";
    addChatLine("SYSTEM", `LOGGED IN AS ${userId}`);

    const savedRoom = localStorage.getItem("gtag_mx_custom_room");
    if (savedRoom) {
      await selectRoomById(savedRoom);
    } else {
      await autoJoinGeneralRoom();
    }

    setTimeout(() => chatInput.focus(), 30);

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

        const joinedRooms = data.rooms?.join || {};
        const stumpData = joinedRooms[targetRoom];
        const events = stumpData?.timeline?.events || [];
        const selfId = userId || guestUserId;

        for (const ev of events) {
          if (ev.type === "m.room.message" && ev.content?.body) {
            const body = ev.content.body;
            const rawSender = ev.sender.split(":").at(0).replace(/^@/, "");
            const displayUser = /^\d+$/.test(rawSender) ? `MONKE_${rawSender.slice(-4)}` : rawSender;

            // Intercept silent [TIME:seconds] playtime heartbeat packets
            const timeMatch = body.match(/^\[TIME:(\d+)\]$/);
            if (timeMatch) {
              if (ev.sender !== selfId && !isInitialSync) {
                onlinePlayers.set(displayUser, {
                  seconds: parseInt(timeMatch.at(1), 10),
                  lastSeen: Date.now()
                });
              }
              continue;
            }

            if (accessToken) {
              addChatLine(displayUser, body);
              const overlay = document.getElementById("gtag-overlay");
              const terminalClosed = overlay && overlay.classList.contains("gtag-hidden");
              if (!isInitialSync && terminalClosed && ev.sender !== selfId) {
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

  async function sendRawMatrixText(bodyText) {
    const tok = accessToken || guestToken;
    const rm = activeRoomId || guestRoomId;
    const srv = accessToken ? homeserver : FALLBACK_SERVER;
    if (!tok || !rm) return null;

    const txnId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const sendUrl = `${srv}/_matrix/client/v3/rooms/${encodeURIComponent(rm)}/send/m.room.message/${txnId}`;

    return fetch(sendUrl, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${tok}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        msgtype: "m.text",
        body: bodyText
      })
    });
  }

  async function sendMessage(text) {
    if (!accessToken || !text) return;

    if (text === "/rooms") {
      await listMyElementRooms();
      return;
    }

    if (text.startsWith("/use ")) {
      const idx = parseInt(text.replace("/use ", "").trim(), 10) - 1;
      if (cachedRoomList.at(idx)) {
        await selectRoomById(cachedRoomList.at(idx).id);
      } else {
        addChatLine("SYSTEM", "INVALID NUMBER. TYPE /rooms TO SEE YOUR LIST.");
      }
      return;
    }

    try {
      const res = await sendRawMatrixText(text);
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
