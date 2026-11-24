document.addEventListener("DOMContentLoaded", () => {
  const GENERAL_ALIAS = "#stump-network-general:matrix.org";
  const RANDOM_ALIAS = "#stump-network-random:matrix.org"; // Silent backend presence & ping room
  const FALLBACK_SERVER = "https://matrix.org";

  const loginBox = document.getElementById("matrix-login-box");
  const chatBox = document.getElementById("matrix-chat-box");
  const statusLabel = document.getElementById("matrix-login-error");
  const loginBtn = document.getElementById("matrix-login-btn");
  const guestBtn = document.getElementById("matrix-guest-btn");
  const userField = document.getElementById("matrix-user-input");
  const passField = document.getElementById("matrix-pass-input");
  const chatInput = document.getElementById("chat-input");
  const msgBox = document.getElementById("chat-messages");

  let accessToken = localStorage.getItem("gtag_mx_token") || "";
  let userId = localStorage.getItem("gtag_mx_user") || "";
  let homeserver = localStorage.getItem("gtag_mx_server") || FALLBACK_SERVER;
  let activeRoomId = localStorage.getItem("gtag_mx_custom_room") || "";
  let backendRandomRoomId = "";
  let activeChannelKey = "general";

  let guestToken = sessionStorage.getItem("gtag_lb_guest_token") || "";
  let guestUserId = sessionStorage.getItem("gtag_lb_guest_user") || "";
  let isGuestMode = false;

  let syncToken = "";
  let isSyncing = false;
  let sidebarRooms = [];
  let toastTimeout = null;

  // Only full Element accounts unlock VIP features (guests do NOT set isMatrixConnected = true)
  window.isMatrixConnected = Boolean(accessToken && userId);

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
    let clean = rawMatrixId.split(":").at(0);
    if (clean.startsWith("@")) clean = clean.slice(1);
    const isAllDigits = clean.length > 0 && clean.split("").every(ch => ch >= "0" && ch <= "9");
    return isAllDigits ? `MONKE_${clean.slice(-4)}` : clean;
  }

  function isGuestName(name) {
    return name.startsWith("MONKE_") || name === "guavin";
  }

  setInterval(() => {
    totalPlaySeconds += 1;
    if (totalPlaySeconds % 5 === 0) localStorage.setItem("gtag_total_playtime", String(totalPlaySeconds));

    const lbBox = document.getElementById("gtag-leaderboard");
    const listEl = document.getElementById("lb-list");
    const countEl = document.getElementById("lb-count");
    if (!lbBox || !listEl || lbBox.classList.contains("gtag-hidden")) return;

    const now = Date.now();
    const myName = userId ? formatDisplayName(userId) : (guestUserId ? formatDisplayName(guestUserId) : "YOU");
    const entries = [{ name: myName, seconds: totalPlaySeconds, isSelf: true, isVip: Boolean(userId) }];

    onlinePlayers.forEach((info, name) => {
      if (name === myName || now - info.lastSeen > 60000) return;
      entries.push({
        name,
        seconds: info.seconds + Math.floor((now - info.lastSeen) / 1000),
        isSelf: false,
        isVip: !isGuestName(name)
      });
    });

    entries.sort((a, b) => b.seconds - a.seconds);
    if (countEl) countEl.textContent = `${entries.length} ONLINE`;
    listEl.innerHTML = entries.map((entry, idx) => {
      const cls = entry.isSelf ? "lb-row self-entry" : "lb-row";
      const badge = entry.isVip ? "★ " : "";
      return `<div class="${cls}"><span>#${idx + 1} ${badge}${entry.name.slice(0, 11)}</span><span>${formatPlaytime(entry.seconds)}</span></div>`;
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
        headers: { "Authorization": `Bearer ${tok}`, "Content-Type": "application/json" },
        body: JSON.stringify({ presence: "online", status_msg: `GTAG_TIME:${totalPlaySeconds}` })
      });
    } catch (_) {}

    // Silently ping #stump-network-random:matrix.org in the background (hidden from chat UI)
    if (backendRandomRoomId) {
      const txnId = `ping_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      try {
        await fetch(`${srv}/_matrix/client/v3/rooms/${encodeURIComponent(backendRandomRoomId)}/send/m.room.message/${txnId}`, {
          method: "PUT",
          headers: { "Authorization": `Bearer ${tok}`, "Content-Type": "application/json" },
          body: JSON.stringify({ msgtype: "m.notice", body: `[TIME:${totalPlaySeconds}]` })
        });
      } catch (_) {}
    }
  }

  setInterval(sendSilentPresence, 18000);

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
    playTerminalSfx?.("receive");

    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.add("gtag-hidden"), 4500);
  }

  function addChatLine(sender, text, isVip = false) {
    if (!msgBox) return;
    const row = document.createElement("div");
    row.className = "chat-line";
    const userSpan = document.createElement("span");
    userSpan.className = isVip ? "chat-user vip-badge" : "chat-user";
    userSpan.textContent = `[${sender}]: `;
    const textSpan = document.createElement("span");
    textSpan.textContent = text;
    row.appendChild(userSpan);
    row.appendChild(textSpan);
    msgBox.appendChild(row);
    msgBox.scrollTop = msgBox.scrollHeight;
  }

  async function ensureGuestSession(openChatAfter = false) {
    if (accessToken) return;
    try {
      if (openChatAfter && guestBtn) { guestBtn.disabled = true; guestBtn.textContent = "JOINING..."; }
      if (!guestToken) {
        const regRes = await fetch(`${FALLBACK_SERVER}/_matrix/client/v3/register?kind=guest`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: "{}"
        });
        const regData = await regRes.json();
        if (regData.access_token) {
          guestToken = regData.access_token;
          guestUserId = regData.user_id;
          sessionStorage.setItem("gtag_lb_guest_token", guestToken);
          sessionStorage.setItem("gtag_lb_guest_user", guestUserId);
        }
      }
      if (!guestToken) throw new Error("Guest registration unavailable");

      // Silently join #stump-network-random:matrix.org for backend player tracking
      const rndRes = await fetch(`${FALLBACK_SERVER}/_matrix/client/v3/directory/room/${encodeURIComponent(RANDOM_ALIAS)}`, {
        headers: { "Authorization": `Bearer ${guestToken}` }
      });
      const rndData = await rndRes.json();
      if (rndData.room_id) {
        backendRandomRoomId = rndData.room_id;
        await fetch(`${FALLBACK_SERVER}/_matrix/client/v3/join/${encodeURIComponent(backendRandomRoomId)}`, {
          method: "POST", headers: { "Authorization": `Bearer ${guestToken}`, "Content-Type": "application/json" }, body: "{}"
        });
      }

      if (openChatAfter) {
        isGuestMode = true;
        window.isMatrixConnected = false;
        if (typeof syncModUI === "function") syncModUI();
        await openStumpRoom(true);
      } else {
        await sendSilentPresence();
        if (!isSyncing) { isSyncing = true; startSyncLoop(); }
      }
    } catch (err) {
      if (openChatAfter) setStatus(`GUEST ERROR: ${err.message}`, true);
    } finally {
      if (guestBtn) { guestBtn.disabled = false; guestBtn.textContent = "CONTINUE AS GUEST"; }
    }
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
      playTerminalSfx?.("error");
      return setStatus("ENTER YOUR ELEMENT USERNAME AND PASSWORD.", true);
    }

    playTerminalSfx?.("click");
    loginBtn.disabled = true;
    loginBtn.textContent = "CONNECTING...";
    setStatus("LOOKING UP HOMESERVER...");

    try {
      let localpart = rawUser.startsWith("@") ? rawUser.slice(1) : rawUser;
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
          password
        })
      });

      const loginData = await loginRes.json();
      if (!loginRes.ok || !loginData.access_token) throw new Error(loginData.error || `Login rejected (${loginRes.status})`);

      if (guestUserId) onlinePlayers.delete(formatDisplayName(guestUserId));
      guestToken = ""; guestUserId = ""; isGuestMode = false;
      sessionStorage.removeItem("gtag_lb_guest_token");
      sessionStorage.removeItem("gtag_lb_guest_user");

      accessToken = loginData.access_token;
      userId = loginData.user_id;
      syncToken = "";
      window.isMatrixConnected = true;

      localStorage.setItem("gtag_mx_token", accessToken);
      localStorage.setItem("gtag_mx_user", userId);
      localStorage.setItem("gtag_mx_server", homeserver);

      if (typeof syncModUI === "function") syncModUI();
      passField.value = "";
      setStatus("");
      playTerminalSfx?.("vip");
      await openStumpRoom(false);
    } catch (err) {
      playTerminalSfx?.("error");
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
    // Only user-facing rooms are rendered here (#stump-network-random stays invisible)
    sidebarRooms.forEach((rm) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = rm.name === activeChannelKey ? "gtag-room-item active" : "gtag-room-item";
      btn.textContent = `#${rm.name}`;
      btn.title = rm.alias || rm.name;
      btn.onclick = () => { playTerminalSfx?.("tab"); selectStumpChannel(rm); };
      listEl.appendChild(btn);
    });
  }

  async function selectStumpChannel(channelObj) {
    activeChannelKey = channelObj.name;
    const label = document.getElementById("matrix-room-label");
    renderRoomSidebar();
    const roleTag = isGuestMode ? " [GUEST]" : " [★ VIP]";
    if (label) label.textContent = `STUMP // #${channelObj.name.toUpperCase()}${roleTag}`;

    if (channelObj.id) {
      activeRoomId = channelObj.id;
      if (!isGuestMode) localStorage.setItem("gtag_mx_custom_room", activeRoomId);
      msgBox.innerHTML = "";
      addChatLine("SYSTEM", `CONNECTED TO #${channelObj.name.toUpperCase()}`);
      await loadRecentRoomHistory(activeRoomId);
      chatInput?.focus();
    } else {
      msgBox.innerHTML = "";
      addChatLine("SYSTEM", `ROOM ${channelObj.alias} UNAVAILABLE FOR GUESTS OR NOT FOUND`);
    }
  }
  async function loadRecentRoomHistory(rId) {
    const tok = accessToken || guestToken;
    const srv = accessToken ? homeserver : FALLBACK_SERVER;
    try {
      const res = await fetch(`${srv}/_matrix/client/v3/rooms/${encodeURIComponent(rId)}/messages?dir=b&limit=20`, {
        headers: { "Authorization": `Bearer ${tok}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      for (const ev of (data.chunk || []).reverse()) {
        if (ev.type === "m.room.message" && ev.content?.body) {
          const b = ev.content.body;
          if (b.startsWith("[TIME:") || b.startsWith("[POS:")) continue;
          const displayName = formatDisplayName(ev.sender);
          addChatLine(displayName, b, !isGuestName(displayName));
        }
      }
    } catch (_) {}
  }

  async function resolveAndJoinAlias(alias) {
    const tok = accessToken || guestToken;
    const srv = accessToken ? homeserver : FALLBACK_SERVER;
    const lookupRes = await fetch(`${srv}/_matrix/client/v3/directory/room/${encodeURIComponent(alias)}`, {
      headers: { "Authorization": `Bearer ${tok}` }
    });
    const lookupData = await lookupRes.json();
    if (!lookupRes.ok || !lookupData.room_id) throw new Error(lookupData.error || `Room ${alias} not found`);
    const rId = lookupData.room_id;
    await fetch(`${srv}/_matrix/client/v3/join/${encodeURIComponent(rId)}`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${tok}`, "Content-Type": "application/json" },
      body: "{}"
    });
    return rId;
  }

  async function populateStumpSidebar() {
    sidebarRooms = [];
    try { sidebarRooms.push({ name: "general", alias: GENERAL_ALIAS, id: await resolveAndJoinAlias(GENERAL_ALIAS) }); }
    catch (_) { sidebarRooms.push({ name: "general", alias: GENERAL_ALIAS, id: null }); }
    try { backendRandomRoomId = await resolveAndJoinAlias(RANDOM_ALIAS); } catch (_) {}
    renderRoomSidebar();
  }

  async function openStumpRoom(asGuest = false) {
    loginBox.classList.add("gtag-hidden");
    chatBox.classList.remove("gtag-hidden");
    msgBox.innerHTML = "";
    if (asGuest) {
      addChatLine("SYSTEM", `SIGNED IN AS GUEST (${formatDisplayName(guestUserId)})`);
      addChatLine("SYSTEM", "SIGN IN WITH ELEMENT TO UNLOCK THE [★ VIP] TAB & MODS!");
    } else {
      addChatLine("SYSTEM", `LOGGED IN AS ${userId} [★ VIP TAB UNLOCKED]`, true);
    }
    await populateStumpSidebar();
    if (sidebarRooms.at(0)) await selectStumpChannel(sidebarRooms.at(0));
    await sendSilentPresence();
    if (!isSyncing) { isSyncing = true; startSyncLoop(); }
  }
  async function startSyncLoop() {
    while ((accessToken || guestToken) && isSyncing) {
      const tok = accessToken || guestToken;
      const srv = accessToken ? homeserver : FALLBACK_SERVER;
      try {
        const query = syncToken ? `?timeout=15000&since=${encodeURIComponent(syncToken)}` : "?timeout=15000";
        const res = await fetch(`${srv}/_matrix/client/v3/sync${query}`, { headers: { "Authorization": `Bearer ${tok}` } });
        if (!res.ok) {
          if (res.status === 401 && accessToken) { handleLogout(); return setStatus("SESSION EXPIRED.", true); }
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }
        const data = await res.json();
        const isInitialSync = !syncToken;
        if (data.next_batch) syncToken = data.next_batch;
        const selfId = userId || guestUserId;

        for (const pEv of (data.presence?.events || [])) {
          if (pEv.type === "m.presence" && pEv.sender && pEv.sender !== selfId) {
            const pName = formatDisplayName(pEv.sender);
            const statusMsg = pEv.content?.status_msg || "";
            if (pEv.content?.presence === "offline") onlinePlayers.delete(pName);
            else if (pEv.content?.presence === "online" || statusMsg.startsWith("GTAG_")) {
              const idx = statusMsg.indexOf(":");
              const sec = idx !== -1 ? parseInt(statusMsg.slice(idx + 1), 10) || 0 : 0;
              onlinePlayers.set(pName, { seconds: sec || (onlinePlayers.get(pName)?.seconds || 0), lastSeen: Date.now() });
            }
          }
        }

        const joinedRooms = data.rooms?.join || {};
        if (backendRandomRoomId && joinedRooms[backendRandomRoomId]) {
          for (const ev of (joinedRooms[backendRandomRoomId].timeline?.events || [])) {
            if (ev.type === "m.room.message" && ev.content?.body && ev.sender !== selfId) {
              const displayUser = formatDisplayName(ev.sender);
              if (ev.content.body.startsWith("[TIME:")) {
                const isNew = !onlinePlayers.has(displayUser);
                onlinePlayers.set(displayUser, { seconds: parseInt(ev.content.body.slice(6, -1), 10) || 0, lastSeen: Date.now() });
                if (isNew && !isInitialSync && accessToken && typeof modConfig !== "undefined" && modConfig.stumpbeacon) {
                  showGtagNotification("VIP RADAR // MONKE ONLINE", `${displayUser} JUST CAME ONLINE!`);
                }
              } else if (ev.content.body.startsWith("[VIP_FLARE]") && !isInitialSync) {
                showGtagNotification("★ VIP BROADCAST", `${displayUser}: ${ev.content.body.slice(11)}`);
              }
            }
          }
        }

        for (const ev of (joinedRooms[activeRoomId]?.timeline?.events || [])) {
          if (ev.type === "m.room.message" && ev.content?.body && !ev.content.body.startsWith("[TIME:") && !ev.content.body.startsWith("[POS:")) {
            const displayUser = formatDisplayName(ev.sender);
            if (ev.sender !== selfId && !isInitialSync) {
              onlinePlayers.set(displayUser, { seconds: onlinePlayers.get(displayUser)?.seconds || 0, lastSeen: Date.now() });
            }
            if ((accessToken || isGuestMode) && !isInitialSync) {
              addChatLine(displayUser, ev.content.body, !isGuestName(displayUser));
              const closed = document.getElementById("gtag-overlay")?.classList.contains("gtag-hidden");
              if (ev.sender !== selfId) {
                if (accessToken && typeof modConfig !== "undefined" && modConfig.chatnotify) playTerminalSfx?.("vip");
                if (closed) showGtagNotification("STUMP CHAT // REPLY", `[${displayUser}]: ${ev.content.body}`);
              }
            }
          }
        }
      } catch (_) { await new Promise(r => setTimeout(r, 3000)); }
    }
  }

  async function sendMessage(text) {
    const tok = accessToken || (isGuestMode ? guestToken : "");
    const srv = accessToken ? homeserver : FALLBACK_SERVER;
    if (!tok || !text || !activeRoomId) return;
    const txnId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    try {
      const res = await fetch(`${srv}/_matrix/client/v3/rooms/${encodeURIComponent(activeRoomId)}/send/m.room.message/${txnId}`, {
        method: "PUT",
        headers: { "Authorization": `Bearer ${tok}`, "Content-Type": "application/json" },
        body: JSON.stringify({ msgtype: "m.text", body: text })
      });
      if (res?.ok) playTerminalSfx?.("send");
      else { playTerminalSfx?.("error"); addChatLine("SYSTEM", `SEND ERROR: ${res?.status}`); }
    } catch (err) { addChatLine("SYSTEM", `NETWORK ERROR: ${err.message}`); }
  }

  window.sendVipBroadcastFlare = async function() {
    if (!accessToken || !backendRandomRoomId) return triggerModToast("VIP ONLY", "ELEMENT ACCOUNT REQUIRED!");
    const shout = prompt("Send a global VIP toast alert to all online monkes:");
    if (!shout?.trim()) return;
    await fetch(`${homeserver}/_matrix/client/v3/rooms/${encodeURIComponent(backendRandomRoomId)}/send/m.room.message/flare_${Date.now()}`, {
      method: "PUT",
      headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ msgtype: "m.notice", body: `[VIP_FLARE]${shout.trim().slice(0, 80)}` })
    });
    playTerminalSfx?.("vip");
    triggerModToast("VIP FLARE SENT", "BROADCASTED TO ALL ONLINE PLAYERS!");
  };

  document.getElementById("btn-add-room")?.addEventListener("click", async e => {
    e.preventDefault();
    if (!accessToken) return triggerModToast("ELEMENT REQUIRED", "GUESTS CANNOT JOIN CUSTOM ROOMS.");
    playTerminalSfx?.("click");
    const rawAlias = prompt("Enter Stump Channel Address (e.g. #stump-network-clips:matrix.org):");
    if (!rawAlias?.trim()) return;
    let formatted = rawAlias.trim();
    if (!formatted.startsWith("#") && !formatted.startsWith("!")) formatted = `#${formatted}`;
    if (!formatted.includes(":")) formatted = `${formatted}:matrix.org`;
    if (formatted.toLowerCase() === RANDOM_ALIAS) return addChatLine("SYSTEM", "RESERVED FOR BACKEND TELEMETRY.");
    try {
      const rId = await resolveAndJoinAlias(formatted);
      let shortName = formatted.split(":").at(0).replace(/^#stump-network-/, "").replace(/^#/, "");
      const newCh = { name: shortName, alias: formatted, id: rId };
      if (!sidebarRooms.some(r => r.alias === formatted)) sidebarRooms.push(newCh);
      await selectStumpChannel(newCh);
    } catch (err) { playTerminalSfx?.("error"); addChatLine("SYSTEM", `JOIN FAILED: ${err.message}`); }
  });

  function handleLogout() {
    accessToken = ""; userId = ""; syncToken = ""; isSyncing = false; isGuestMode = false; window.isMatrixConnected = false;
    ["gtag_mx_token", "gtag_mx_user", "gtag_mx_server", "gtag_mx_custom_room"].forEach(k => localStorage.removeItem(k));
    if (typeof syncModUI === "function") syncModUI();
    chatBox.classList.add("gtag-hidden"); loginBox.classList.remove("gtag-hidden");
    playTerminalSfx?.("close"); setStatus("SIGNED OUT."); ensureGuestSession(false);
  }

  window.loginElementAccount = handleLogin;
  window.logoutElementAccount = handleLogout;
  window.sendStumpChatInput = () => { const msg = chatInput.value.trim(); if (msg) { chatInput.value = ""; sendMessage(msg); } };
  if (loginBtn) loginBtn.onclick = e => { e.preventDefault(); handleLogin(); };
  if (guestBtn) guestBtn.onclick = e => { e.preventDefault(); ensureGuestSession(true); };
  document.getElementById("matrix-logout-btn")?.addEventListener("click", e => { e.preventDefault(); handleLogout(); });
  document.getElementById("chat-send-btn")?.addEventListener("click", e => { e.preventDefault(); window.sendStumpChatInput(); chatInput.focus(); });

  setStatus("READY TO SIGN IN OR CONTINUE AS GUEST.");
  if (accessToken && userId) openStumpRoom(false);
  else ensureGuestSession(false);
});
