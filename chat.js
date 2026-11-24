document.addEventListener("DOMContentLoaded", () => {
  const GENERAL_ALIAS = "#stump-network-general:matrix.org";
  const RANDOM_ALIAS = "#stump-network-random:matrix.org";
  const FALLBACK_SERVER = "https://matrix.org";
  const GUEST_RELAY_WS = "wss://://socketsbay.com";

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

  let guestName = sessionStorage.getItem("gtag_guest_nick") || "";
  let isGuestMode = Boolean(!accessToken && guestName);
  let guestSocket = null;

  let syncToken = "";
  let isSyncing = false;
  let sidebarRooms = [];
  let toastTimeout = null;
  let flareTimeout = null;

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

  function formatDisplayName(rawId) {
    if (!rawId) return "MONKE";
    let clean = rawId.split(":").at(0);
    if (clean.startsWith("@")) clean = clean.slice(1);
    const isDigits = clean.length > 0 && clean.split("").every(ch => ch >= "0" && ch <= "9");
    return isDigits ? `MONKE_${clean.slice(-4)}` : clean;
  }

  setInterval(() => {
    totalPlaySeconds += 1;
    if (totalPlaySeconds % 5 === 0) localStorage.setItem("gtag_total_playtime", String(totalPlaySeconds));

    const lbBox = document.getElementById("gtag-leaderboard");
    const listEl = document.getElementById("lb-list");
    const countEl = document.getElementById("lb-count");
    if (!lbBox || !listEl || lbBox.classList.contains("gtag-hidden")) return;

    const now = Date.now();
    const myName = userId ? formatDisplayName(userId) : (guestName || "MONKE_GUEST");
    const entries = [{ name: myName, seconds: totalPlaySeconds, isSelf: true, isVip: Boolean(userId) }];

    onlinePlayers.forEach((info, name) => {
      if (name === myName || now - info.lastSeen > 60000) return;
      entries.push({
        name,
        seconds: info.seconds + Math.floor((now - info.lastSeen) / 1000),
        isSelf: false,
        isVip: Boolean(info.isVip)
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
  function showVipFlareBanner(senderName, flareText) {
    const banner = document.getElementById("gtag-vip-flare-banner");
    const senderEl = document.getElementById("vip-flare-sender");
    const msgEl = document.getElementById("vip-flare-msg");
    if (!banner || !senderEl || !msgEl) return;

    senderEl.textContent = `[★] VIP BROADCAST FROM ${senderName.toUpperCase()}`;
    msgEl.textContent = flareText;
    banner.classList.remove("gtag-hidden");
    playTerminalSfx?.("vip");

    clearTimeout(flareTimeout);
    flareTimeout = setTimeout(() => banner.classList.add("gtag-hidden"), 6500);
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

  function connectGuestRelay() {
    if (guestSocket && guestSocket.readyState <= 1) return;
    try {
      guestSocket = new WebSocket(GUEST_RELAY_WS);
      guestSocket.onopen = () => broadcastGuestPacket({ type: "ping", user: guestName, sec: totalPlaySeconds });
      guestSocket.onmessage = (evt) => {
        try {
          const pkt = JSON.parse(evt.data);
          if (!pkt || pkt.app !== "GTAG_OS" || pkt.user === guestName) return;
          if (pkt.type === "ping") {
            onlinePlayers.set(pkt.user, { seconds: pkt.sec || 0, lastSeen: Date.now(), isVip: Boolean(pkt.isVip) });
          } else if (pkt.type === "chat" && isGuestMode && activeChannelKey === "general") {
            addChatLine(pkt.user, pkt.text, Boolean(pkt.isVip));
            if (document.getElementById("gtag-overlay")?.classList.contains("gtag-hidden")) {
              showGtagNotification("STUMP CHAT // REPLY", `[${pkt.user}]: ${pkt.text}`);
            }
          } else if (pkt.type === "flare") {
            showVipFlareBanner(pkt.user, pkt.text);
          }
        } catch (_) {}
      };
      guestSocket.onclose = () => { if (!accessToken) setTimeout(connectGuestRelay, 4000); };
    } catch (_) {}
  }

  function broadcastGuestPacket(payload) {
    if (guestSocket && guestSocket.readyState === WebSocket.OPEN) {
      guestSocket.send(JSON.stringify({ app: "GTAG_OS", ...payload }));
    }
  }

  function startGuestSession(openChatAfter = false) {
    if (accessToken) return;
    if (!guestName) {
      if (openChatAfter) {
        const picked = prompt("Enter a Guest Monke Name (or leave blank for random):", `MONKE_${Math.floor(1000 + Math.random() * 9000)}`);
        guestName = (picked && picked.trim()) ? picked.trim().slice(0, 14) : `MONKE_${Math.floor(1000 + Math.random() * 9000)}`;
      } else {
        guestName = `MONKE_${Math.floor(1000 + Math.random() * 9000)}`;
      }
      sessionStorage.setItem("gtag_guest_nick", guestName);
    }
    connectGuestRelay();
    if (openChatAfter) {
      isGuestMode = true;
      window.isMatrixConnected = false;
      if (typeof syncModUI === "function") syncModUI();
      playTerminalSfx?.("send");
      openStumpRoom(true);
    }
  }
  async function sendSilentPresence() {
    const myNick = userId ? formatDisplayName(userId) : guestName;
    if (myNick) {
      broadcastGuestPacket({ type: "ping", user: myNick, sec: totalPlaySeconds, isVip: Boolean(accessToken) });
    }
    if (!accessToken || !userId) return;

    try {
      await fetch(`${homeserver}/_matrix/client/v3/presence/${encodeURIComponent(userId)}/status`, {
        method: "PUT",
        headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ presence: "online", status_msg: `GTAG_TIME:${totalPlaySeconds}` })
      });
    } catch (_) {}

    if (backendRandomRoomId) {
      const txnId = `ping_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      try {
        await fetch(`${homeserver}/_matrix/client/v3/rooms/${encodeURIComponent(backendRandomRoomId)}/send/m.room.message/${txnId}`, {
          method: "PUT",
          headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ msgtype: "m.notice", body: `[TIME:${totalPlaySeconds}]` })
        });
      } catch (_) {}
    }
  }

  setInterval(sendSilentPresence, 15000);

  function setStatus(msg, isError = false) {
    if (!statusLabel) return;
    statusLabel.style.color = isError ? "#ff4444" : "#33ff33";
    statusLabel.textContent = msg;
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

      if (guestName) onlinePlayers.delete(guestName);
      guestName = ""; isGuestMode = false;
      sessionStorage.removeItem("gtag_guest_nick");

      accessToken = loginData.access_token;
      userId = loginData.user_id;
      syncToken = "";
      window.isMatrixConnected = true;

      localStorage.setItem("gtag_mx_token", accessToken);
      localStorage.setItem("gtag_mx_user", userId);
      localStorage.setItem("gtag_mx_server", homeserver);

      connectGuestRelay();
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
    sidebarRooms.forEach((rm) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = rm.name === activeChannelKey ? "gtag-room-item active" : "gtag-room-item";
      btn.textContent = `#${rm.name}`;
      btn.onclick = () => { playTerminalSfx?.("tab"); selectStumpChannel(rm); };
      listEl.appendChild(btn);
    });
  }

  async function selectStumpChannel(channelObj) {
    activeChannelKey = channelObj.name;
    const label = document.getElementById("matrix-room-label");
    renderRoomSidebar();
    const roleTag = isGuestMode ? ` [${guestName}]` : " [★ VIP]";
    if (label) label.textContent = `STUMP // #${channelObj.name.toUpperCase()}${roleTag}`;

    msgBox.innerHTML = "";
    addChatLine("SYSTEM", `CONNECTED TO #${channelObj.name.toUpperCase()}`);
    if (channelObj.id && accessToken) {
      activeRoomId = channelObj.id;
      localStorage.setItem("gtag_mx_custom_room", activeRoomId);
      await loadRecentRoomHistory(activeRoomId);
    }
    chatInput?.focus();
  }

  async function loadRecentRoomHistory(rId) {
    if (!accessToken) return;
    try {
      const res = await fetch(`${homeserver}/_matrix/client/v3/rooms/${encodeURIComponent(rId)}/messages?dir=b&limit=20`, {
        headers: { "Authorization": `Bearer ${accessToken}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      for (const ev of (data.chunk || []).reverse()) {
        if (ev.type === "m.room.message" && ev.content?.body && !ev.content.body.startsWith("[TIME:")) {
          addChatLine(formatDisplayName(ev.sender), ev.content.body, true);
        }
      }
    } catch (_) {}
  }

  async function resolveAndJoinAlias(alias) {
    const lookupRes = await fetch(`${homeserver}/_matrix/client/v3/directory/room/${encodeURIComponent(alias)}`, {
      headers: { "Authorization": `Bearer ${accessToken}` }
    });
    const lookupData = await lookupRes.json();
    if (!lookupRes.ok || !lookupData.room_id) throw new Error(lookupData.error || `Room ${alias} not found`);
    await fetch(`${homeserver}/_matrix/client/v3/join/${encodeURIComponent(lookupData.room_id)}`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: "{}"
    });
    return lookupData.room_id;
  }

  async function openStumpRoom(asGuest = false) {
    loginBox.classList.add("gtag-hidden");
    chatBox.classList.remove("gtag-hidden");
    msgBox.innerHTML = "";
    sidebarRooms = [];

    if (asGuest) {
      sidebarRooms.push({ name: "general", alias: GENERAL_ALIAS, id: "guest-general" });
      renderRoomSidebar();
      addChatLine("SYSTEM", `GUEST SESSION ACTIVE: ${guestName}`);
      addChatLine("SYSTEM", "SIGN IN WITH ELEMENT TO UNLOCK [★ VIP] & MATRIX ROOMS!");
      await selectStumpChannel(sidebarRooms.at(0));
    } else {
      addChatLine("SYSTEM", `LOGGED IN AS ${userId} [★ VIP TAB UNLOCKED]`, true);
      try { sidebarRooms.push({ name: "general", alias: GENERAL_ALIAS, id: await resolveAndJoinAlias(GENERAL_ALIAS) }); }
      catch (_) { sidebarRooms.push({ name: "general", alias: GENERAL_ALIAS, id: null }); }
      try { backendRandomRoomId = await resolveAndJoinAlias(RANDOM_ALIAS); } catch (_) {}
      renderRoomSidebar();
      if (sidebarRooms.at(0)) await selectStumpChannel(sidebarRooms.at(0));
      if (!isSyncing) { isSyncing = true; startSyncLoop(); }
    }
    await sendSilentPresence();
  }
  async function startSyncLoop() {
    while (accessToken && isSyncing) {
      try {
        const query = syncToken ? `?timeout=15000&since=${encodeURIComponent(syncToken)}` : "?timeout=15000";
        const res = await fetch(`${homeserver}/_matrix/client/v3/sync${query}`, { headers: { "Authorization": `Bearer ${accessToken}` } });
        if (!res.ok) {
          if (res.status === 401) { handleLogout(); return setStatus("SESSION EXPIRED.", true); }
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }
        const data = await res.json();
        const isInitialSync = !syncToken;
        if (data.next_batch) syncToken = data.next_batch;

        const joinedRooms = data.rooms?.join || {};
        if (backendRandomRoomId && joinedRooms[backendRandomRoomId]) {
          for (const ev of (joinedRooms[backendRandomRoomId].timeline?.events || [])) {
            if (ev.type === "m.room.message" && ev.content?.body && ev.sender !== userId) {
              const displayUser = formatDisplayName(ev.sender);
              if (ev.content.body.startsWith("[TIME:")) {
                const isNew = !onlinePlayers.has(displayUser);
                onlinePlayers.set(displayUser, { seconds: parseInt(ev.content.body.slice(6, -1), 10) || 0, lastSeen: Date.now(), isVip: true });
                if (isNew && !isInitialSync && modConfig?.stumpbeacon) {
                  showGtagNotification("VIP RADAR // MONKE ONLINE", `${displayUser} JUST CAME ONLINE!`);
                }
              } else if (ev.content.body.startsWith("[VIP_FLARE]") && !isInitialSync) {
                showVipFlareBanner(displayUser, ev.content.body.slice(11));
              }
            }
          }
        }

        for (const ev of (joinedRooms[activeRoomId]?.timeline?.events || [])) {
          if (ev.type === "m.room.message" && ev.content?.body && !ev.content.body.startsWith("[TIME:")) {
            const displayUser = formatDisplayName(ev.sender);
            if (!isInitialSync) {
              addChatLine(displayUser, ev.content.body, true);
              if (ev.sender !== userId) {
                if (modConfig?.chatnotify) playTerminalSfx?.("vip");
                if (document.getElementById("gtag-overlay")?.classList.contains("gtag-hidden")) {
                  showGtagNotification("STUMP CHAT // REPLY", `[${displayUser}]: ${ev.content.body}`);
                }
              }
            }
          }
        }
      } catch (_) { await new Promise(r => setTimeout(r, 3000)); }
    }
  }

  async function sendMessage(text) {
    if (!text) return;
    if (isGuestMode) {
      addChatLine(guestName, text, false);
      broadcastGuestPacket({ type: "chat", user: guestName, text, isVip: false });
      playTerminalSfx?.("send");
      return;
    }
    if (!accessToken || !activeRoomId) return;
    if (activeChannelKey === "general") {
      broadcastGuestPacket({ type: "chat", user: formatDisplayName(userId), text, isVip: true });
    }
    const txnId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const res = await fetch(`${homeserver}/_matrix/client/v3/rooms/${encodeURIComponent(activeRoomId)}/send/m.room.message/${txnId}`, {
      method: "PUT",
      headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ msgtype: "m.text", body: text })
    });
    if (res?.ok) playTerminalSfx?.("send");
  }

  window.sendVipBroadcastFlare = async function() {
    if (!accessToken) return triggerModToast("VIP ONLY", "ELEMENT ACCOUNT REQUIRED!");
    const shout = prompt("Send a top-screen VIP Flare announcement to all online monkes:");
    if (!shout?.trim()) return;
    const cleanShout = shout.trim().slice(0, 85);
    const myVipName = formatDisplayName(userId);
    showVipFlareBanner(myVipName, cleanShout);
    broadcastGuestPacket({ type: "flare", user: myVipName, text: cleanShout });
    if (backendRandomRoomId) {
      await fetch(`${homeserver}/_matrix/client/v3/rooms/${encodeURIComponent(backendRandomRoomId)}/send/m.room.message/flare_${Date.now()}`, {
        method: "PUT",
        headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ msgtype: "m.notice", body: `[VIP_FLARE]${cleanShout}` })
      }).catch(() => {});
    }
  };

  document.getElementById("btn-add-room")?.addEventListener("click", async e => {
    e.preventDefault();
    if (!accessToken) return triggerModToast("ELEMENT REQUIRED", "GUESTS CANNOT JOIN CUSTOM MATRIX ROOMS.");
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
    accessToken = ""; userId = ""; syncToken = ""; isSyncing = false; isGuestMode = false; guestName = ""; window.isMatrixConnected = false;
    ["gtag_mx_token", "gtag_mx_user", "gtag_mx_server", "gtag_mx_custom_room"].forEach(k => localStorage.removeItem(k));
    sessionStorage.removeItem("gtag_guest_nick");
    if (typeof syncModUI === "function") syncModUI();
    chatBox.classList.add("gtag-hidden"); loginBox.classList.remove("gtag-hidden");
    playTerminalSfx?.("close"); setStatus("SIGNED OUT."); startGuestSession(false);
  }

  window.loginElementAccount = handleLogin;
  window.logoutElementAccount = handleLogout;
  window.sendStumpChatInput = () => { const msg = chatInput.value.trim(); if (msg) { chatInput.value = ""; sendMessage(msg); } };
  if (loginBtn) loginBtn.onclick = e => { e.preventDefault(); handleLogin(); };
  if (guestBtn) guestBtn.onclick = e => { e.preventDefault(); startGuestSession(true); };
  document.getElementById("matrix-logout-btn")?.addEventListener("click", e => { e.preventDefault(); handleLogout(); });
  document.getElementById("chat-send-btn")?.addEventListener("click", e => { e.preventDefault(); window.sendStumpChatInput(); chatInput.focus(); });

  setStatus("READY TO SIGN IN OR CONTINUE AS GUEST.");
  if (accessToken && userId) { connectGuestRelay(); openStumpRoom(false); }
  else if (isGuestMode) { connectGuestRelay(); openStumpRoom(true); }
  else startGuestSession(false);
});
