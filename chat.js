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
  let syncToken = "";
  let isSyncing = false;
  let cachedRoomList = [];
  let toastTimeout = null;

  // --- MANDATORY AUTOMATIC POSITION TRACKING FROM SPAWN (0, 0) ---
  let myPosX = 0;
  let myPosZ = 0;
  let myYaw = 0;
  let lastBroadcastX = null;
  let lastBroadcastZ = null;
  let lastHeartbeatTime = 0;
  const activeKeys = new Set();
  const trackedMonkes = new Map();

  window.addEventListener("keydown", (e) => {
    const overlay = document.getElementById("gtag-overlay");
    if (overlay && !overlay.classList.contains("gtag-hidden")) return;
    const k = e.key.toLowerCase();
    activeKeys.add(k);
    if (k === "r") {
      window.resetRadarSpawn();
    }
  }, true);

  window.addEventListener("keyup", (e) => {
    activeKeys.delete(e.key.toLowerCase());
  }, true);

  window.addEventListener("mousemove", (e) => {
    if (document.pointerLockElement) {
      myYaw += e.movementX * 0.003;
    }
  }, true);

  window.resetRadarSpawn = function() {
    myPosX = 0;
    myPosZ = 0;
    myYaw = 0;
    lastBroadcastX = null;
    lastBroadcastZ = null;
    const coordEl = document.getElementById("radar-coords");
    if (coordEl) coordEl.textContent = "X:0 Z:0";
  };

  setInterval(() => {
    const overlay = document.getElementById("gtag-overlay");
    if (overlay && !overlay.classList.contains("gtag-hidden")) return;

    let forward = 0;
    let strafe = 0;
    if (activeKeys.has("w") || activeKeys.has("arrowup")) forward += 1;
    if (activeKeys.has("s") || activeKeys.has("arrowdown")) forward -= 1;
    if (activeKeys.has("d") || activeKeys.has("arrowright")) strafe += 1;
    if (activeKeys.has("a") || activeKeys.has("arrowleft")) strafe -= 1;

    if (forward !== 0 || strafe !== 0) {
      const speed = 0.28;
      myPosX += (Math.sin(myYaw) * forward + Math.cos(myYaw) * strafe) * speed;
      myPosZ += (-Math.cos(myYaw) * forward + Math.sin(myYaw) * strafe) * speed;

      const coordEl = document.getElementById("radar-coords");
      if (coordEl) coordEl.textContent = `X:${Math.round(myPosX)} Z:${Math.round(myPosZ)}`;
    }
  }, 33);

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

    if (typeof playMonkeSound === "function") {
      playMonkeSound("computer");
    }

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
      setStatus("ENTER YOUR ELEMENT USERNAME AND PASSWORD.", true);
      return;
    }

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

      localStorage.setItem("gtag_mx_token", accessToken);
      localStorage.setItem("gtag_mx_user", userId);
      localStorage.setItem("gtag_mx_server", homeserver);

      passField.value = "";
      setStatus("");
      await openStumpRoom();
    } catch (err) {
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
    addChatLine("SYSTEM", "AUTO-RADAR BROADCAST: ACTIVE");

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

  setInterval(() => {
    if (!accessToken || !activeRoomId) return;
    const rx = Math.round(myPosX);
    const rz = Math.round(myPosZ);
    const now = Date.now();

    if (rx !== lastBroadcastX || rz !== lastBroadcastZ || now - lastHeartbeatTime > 12000) {
      lastBroadcastX = rx;
      lastBroadcastZ = rz;
      lastHeartbeatTime = now;
      sendRawMatrixText(`[POS:${rx},${rz}]`);
    }
  }, 3500);
  async function startSyncLoop() {
    while (accessToken && isSyncing) {
      try {
        const query = syncToken ? `?timeout=15000&since=${encodeURIComponent(syncToken)}` : "?timeout=15000";
        const res = await fetch(`${homeserver}/_matrix/client/v3/sync${query}`, {
          headers: { "Authorization": `Bearer ${accessToken}` }
        });

        if (!res.ok) {
          if (res.status === 401) {
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
        const stumpData = joinedRooms[activeRoomId];
        const events = stumpData?.timeline?.events || [];

        for (const ev of events) {
          if (ev.type === "m.room.message" && ev.content?.body) {
            const body = ev.content.body;
            const displayUser = ev.sender.split(":").at(0).replace(/^@/, "");

            const posMatch = body.match(/^\[POS:(-?\d+),(-?\d+)\]$/);
            if (posMatch) {
              if (ev.sender !== userId) {
                trackedMonkes.set(displayUser, {
                  x: parseInt(posMatch.at(1), 10),
                  z: parseInt(posMatch.at(2), 10),
                  time: Date.now()
                });
              }
              continue;
            }

            addChatLine(displayUser, body);

            const overlay = document.getElementById("gtag-overlay");
            const terminalClosed = overlay && overlay.classList.contains("gtag-hidden");
            if (!isInitialSync && terminalClosed && ev.sender !== userId) {
              showGtagNotification("STUMP CHAT // [T] TO REPLY", `[${displayUser}]: ${body}`);
            }
          }
        }
      } catch (_) {
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  }

  async function sendRawMatrixText(bodyText) {
    if (!accessToken || !activeRoomId) return null;
    const txnId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const sendUrl = `${homeserver}/_matrix/client/v3/rooms/${encodeURIComponent(activeRoomId)}/send/m.room.message/${txnId}`;

    return fetch(sendUrl, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
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
      if (res && !res.ok) {
        const errData = await res.json();
        addChatLine("SYSTEM", `SEND ERROR: ${errData.error || res.status}`);
      }
    } catch (err) {
      addChatLine("SYSTEM", `NETWORK ERROR: ${err.message}`);
    }
  }

  let radarSweep = 0;
  setInterval(() => {
    const radarBox = document.getElementById("gtag-radar");
    const canvas = document.getElementById("radar-canvas");
    if (!radarBox || !canvas || radarBox.classList.contains("gtag-hidden")) return;

    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const r = w / 2 - 4;

    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = "#1f3d1f";
    ctx.lineWidth = 1;
    [0.33, 0.66, 1].forEach(s => {
      ctx.beginPath();
      ctx.arc(cx, cy, r * s, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.beginPath();
    ctx.moveTo(cx, 4); ctx.lineTo(cx, h - 4);
    ctx.moveTo(4, cy); ctx.lineTo(w - 4, cy);
    ctx.stroke();

    radarSweep = (radarSweep + 0.08) % (Math.PI * 2);
    ctx.strokeStyle = "rgba(51, 255, 51, 0.55)";
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(radarSweep) * r, cy + Math.sin(radarSweep) * r);
    ctx.stroke();

    ctx.fillStyle = "#33ff33";
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#33ff33";
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.sin(myYaw) * 12, cy - Math.cos(myYaw) * 12);
    ctx.stroke();

    let onlineFriends = 0;
    const now = Date.now();
    ctx.font = "7px monospace";

    trackedMonkes.forEach((info, name) => {
      if (now - info.time > 30000) return;
      onlineFriends++;

      let dx = (info.x - myPosX) * 0.65;
      let dz = (info.z - myPosZ) * 0.65;

      const dist = Math.hypot(dx, dz);
      if (dist > r - 8) {
        dx = (dx / dist) * (r - 8);
        dz = (dz / dist) * (r - 8);
      }

      const bx = cx + dx;
      const by = cy + dz;

      ctx.fillStyle = "#ffaa00";
      ctx.beginPath();
      ctx.arc(bx, by, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText(name.slice(0, 8), bx + 6, by + 3);
    });

    const countEl = document.getElementById("radar-count");
    if (countEl) countEl.textContent = `${onlineFriends + 1} ONLINE`;
  }, 50);

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
    setStatus("SIGNED OUT.");
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
  }
});
