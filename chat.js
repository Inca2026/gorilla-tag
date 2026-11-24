document.addEventListener("DOMContentLoaded", () => {
  const GENERAL_ALIAS = "#stump-network-general:matrix.org";
  const RANDOM_ALIAS = "#stump-network-random:matrix.org";
  const FALLBACK_SERVER = "https://matrix.org";
  const GUEST_BOT_USER = "@meebo:matrix.org";
  const GUEST_BOT_PASS = "ColdLeg6932";
  const GUEST_IDLE_LIMIT_MS = 10 * 60 * 1000;

  const loginBox = document.getElementById("matrix-login-box");
  const chatBox = document.getElementById("matrix-chat-box");
  const statusLabel = document.getElementById("matrix-login-error");
  const loginBtn = document.getElementById("matrix-login-btn");
  const guestBtn = document.getElementById("matrix-guest-btn");
  const guestNickField = document.getElementById("guest-nick-input");
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
  let activeDmPeer = "";
  const dmThreads = {};
  const unreadDms = new Set();

  let savedGuestNick = localStorage.getItem("gtag_saved_guest_nick") || "";
  if (guestNickField && savedGuestNick) guestNickField.value = savedGuestNick;

  let guestToken = sessionStorage.getItem("gtag_guest_token") || "";
  let guestBotId = sessionStorage.getItem("gtag_guest_bot_id") || "";
  let guestName = sessionStorage.getItem("gtag_guest_nick") || "";
  let isGuestMode = Boolean(!accessToken && sessionStorage.getItem("gtag_guest_active") === "1" && guestToken);

  let syncToken = "";
  let isSyncing = false;
  let sidebarRooms = [];
  let toastTimeout = null;
  let flareTimeout = null;
  let lastActivityTs = Date.now();

  window.isMatrixConnected = Boolean(accessToken && userId);
  let totalPlaySeconds = parseInt(localStorage.getItem("gtag_total_playtime") || "0", 10);
  const onlinePlayers = new Map();
  window.gtagOnlinePlayers = onlinePlayers;

  document.getElementById("btn-tab-about")?.remove();
  document.getElementById("tab-about")?.remove();
  document.getElementById("gtag-puppet-banner")?.remove();
  document.getElementById("hack-btn-puppet")?.remove();
  function formatPlaytime(sec) {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }

  function sanitizeGuestNick(raw) {
    const cleaned = (raw || "").trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 14);
    if (!cleaned || cleaned.toLowerCase() === "meebo" || cleaned.toLowerCase() === "system") {
      return `MONKE_${Math.floor(1000 + Math.random() * 9000)}`;
    }
    return cleaned;
  }

  function formatDisplayName(rawId) {
    if (!rawId) return "MONKE";
    let clean = rawId.split(":").at(0);
    if (clean.startsWith("@")) clean = clean.slice(1);
    if (clean.toLowerCase() === "meebo") return guestName || "MONKE_GUEST";
    const isDigits = clean.length > 0 && clean.split("").every(ch => ch >= "0" && ch <= "9");
    return isDigits ? `MONKE_${clean.slice(-4)}` : clean;
  }

  window.getMyGorillaName = () => userId ? formatDisplayName(userId) : (guestName || savedGuestNick || "MONKE_GUEST");

  setInterval(() => {
    totalPlaySeconds += 1;
    if (totalPlaySeconds % 5 === 0) localStorage.setItem("gtag_total_playtime", String(totalPlaySeconds));

    const lbBox = document.getElementById("gtag-leaderboard");
    const listEl = document.getElementById("lb-list");
    const countEl = document.getElementById("lb-count");
    if (!lbBox || !listEl || lbBox.classList.contains("gtag-hidden")) return;

    const now = Date.now();
    const myName = window.getMyGorillaName();
    const entries = [{ name: myName, seconds: totalPlaySeconds, isSelf: true, isVip: Boolean(userId) }];

    onlinePlayers.forEach((info, name) => {
      if (name === myName || name.toLowerCase() === "meebo" || now - info.lastSeen > 25000) return;
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
      const badge = entry.isVip ? "[VIP] " : "";
      return `<div class="${cls}"><span>#${idx + 1} ${badge}${entry.name.slice(0, 11)}</span><span>${formatPlaytime(entry.seconds)}</span></div>`;
    }).join("");
  }, 1000);
  function showVipFlareBanner(senderName, flareText) {
    const banner = document.getElementById("gtag-vip-flare-banner");
    const senderEl = document.getElementById("vip-flare-sender");
    const msgEl = document.getElementById("vip-flare-msg");
    if (!banner || !senderEl || !msgEl) return;

    senderEl.textContent = `[VIP] BROADCAST FROM ${senderName.toUpperCase()}`;
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

  function addChatLine(sender, text, isVip = false, tsOverride = null) {
    if (!msgBox) return;
    const ts = tsOverride || new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const row = document.createElement("div");
    row.className = "chat-line";
    const timeSpan = document.createElement("span");
    timeSpan.style.cssText = "color:#5f875f; font-size:7px;";
    timeSpan.textContent = `[${ts}] `;
    const userSpan = document.createElement("span");
    userSpan.className = isVip ? "chat-user vip-badge" : "chat-user";
    userSpan.textContent = `[${sender}]: `;
    const textSpan = document.createElement("span");
    textSpan.textContent = text;
    row.append(timeSpan, userSpan, textSpan);
    msgBox.appendChild(row);
    msgBox.scrollTop = msgBox.scrollHeight;
  }

  function parseIncomingMessage(senderId, rawBody) {
    if (rawBody.startsWith("[GUEST:")) {
      const endBracket = rawBody.indexOf("]");
      if (endBracket !== -1) {
        return { displayUser: rawBody.slice(7, endBracket), cleanText: rawBody.slice(endBracket + 2), isVip: false };
      }
    }
    return { displayUser: formatDisplayName(senderId), cleanText: rawBody, isVip: senderId !== guestBotId };
  }
  async function startGuestSession() {
    if (accessToken) return;
    const typedNick = guestNickField?.value || savedGuestNick;
    guestName = sanitizeGuestNick(typedNick);
    savedGuestNick = guestName;

    localStorage.setItem("gtag_saved_guest_nick", savedGuestNick);
    if (guestNickField) guestNickField.value = savedGuestNick;
    sessionStorage.setItem("gtag_guest_nick", guestName);

    if (guestBtn) { guestBtn.disabled = true; guestBtn.textContent = "CONNECTING..."; }
    setStatus(`CONNECTING AS ${guestName}...`);

    try {
      if (!guestToken && GUEST_BOT_USER && GUEST_BOT_PASS) {
        const cleanBotUser = GUEST_BOT_USER.replace(/^@/, "").split(":").at(0);
        const res = await fetch(`${FALLBACK_SERVER}/_matrix/client/v3/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "m.login.password",
            identifier: { type: "m.id.user", user: cleanBotUser },
            password: GUEST_BOT_PASS
          })
        });
        const data = await res.json();
        if (res.ok && data.access_token) {
          guestToken = data.access_token;
          guestBotId = data.user_id;
          sessionStorage.setItem("gtag_guest_token", guestToken);
          sessionStorage.setItem("gtag_guest_bot_id", guestBotId);
        }
      }

      isGuestMode = true;
      lastActivityTs = Date.now();
      sessionStorage.setItem("gtag_guest_active", "1");
      window.isMatrixConnected = false;
      if (typeof syncModUI === "function") syncModUI();
      playTerminalSfx?.("send");
      await openStumpRoom(true);
    } finally {
      if (guestBtn) { guestBtn.disabled = false; guestBtn.textContent = "CONTINUE AS GUEST"; }
    }
  }

  window.sendRelayNotice = async function(noticeBody) {
    const tok = accessToken || guestToken;
    const srv = accessToken ? homeserver : FALLBACK_SERVER;
    if (!tok || !backendRandomRoomId) return false;
    const txnId = `rel_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    try {
      const r = await fetch(`${srv}/_matrix/client/v3/rooms/${encodeURIComponent(backendRandomRoomId)}/send/m.room.message/${txnId}`, {
        method: "PUT",
        headers: { "Authorization": `Bearer ${tok}`, "Content-Type": "application/json" },
        body: JSON.stringify({ msgtype: "m.notice", body: noticeBody })
      });
      return r.ok;
    } catch (_) { return false; }
  };

  async function sendSilentPresence() {
    if (!accessToken && !isGuestMode) return;
    const myPublicName = window.getMyGorillaName();
    await window.sendRelayNotice(`[TIME:${totalPlaySeconds}|${myPublicName}|${accessToken ? 1 : 0}]`);
  }

  function endSessionBeacon(clearGuestStorage = false) {
    const tok = accessToken || guestToken;
    const srv = accessToken ? homeserver : FALLBACK_SERVER;
    const myPublicName = window.getMyGorillaName();
    if (tok && backendRandomRoomId && myPublicName) {
      fetch(`${srv}/_matrix/client/v3/rooms/${encodeURIComponent(backendRandomRoomId)}/send/m.room.message/bye_${Date.now()}`, {
        method: "PUT", keepalive: true,
        headers: { "Authorization": `Bearer ${tok}`, "Content-Type": "application/json" },
        body: JSON.stringify({ msgtype: "m.notice", body: `[OFFLINE|${myPublicName}]` })
      }).catch(() => {});
    }
    if (clearGuestStorage) {
      ["gtag_guest_nick", "gtag_guest_token", "gtag_guest_bot_id", "gtag_guest_active"].forEach(k => sessionStorage.removeItem(k));
    }
  }
  ["keydown", "mousedown", "touchstart"].forEach(evt => window.addEventListener(evt, () => { lastActivityTs = Date.now(); }, { passive: true }));
  setInterval(() => { if (isGuestMode && Date.now() - lastActivityTs > GUEST_IDLE_LIMIT_MS) handleLogout("GUEST SESSION TIMED OUT."); }, 15000);
  window.addEventListener("pagehide", () => endSessionBeacon(isGuestMode));
  window.addEventListener("beforeunload", () => endSessionBeacon(isGuestMode));
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
    if (!rawUser || !password) { playTerminalSfx?.("error"); return setStatus("ENTER USERNAME AND PASSWORD.", true); }

    playTerminalSfx?.("click");
    loginBtn.disabled = true; loginBtn.textContent = "CONNECTING...";
    setStatus("LOOKING UP HOMESERVER...");

    try {
      let localpart = rawUser.startsWith("@") ? rawUser.slice(1) : rawUser;
      let domain = "matrix.org";
      if (localpart.includes(":")) { const sp = localpart.split(":"); localpart = sp.at(0); domain = sp.at(1) || "matrix.org"; }

      homeserver = await resolveHomeserver(domain);
      const loginRes = await fetch(`${homeserver}/_matrix/client/v3/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "m.login.password", identifier: { type: "m.id.user", user: localpart }, password })
      });
      const loginData = await loginRes.json();
      if (!loginRes.ok || !loginData.access_token) throw new Error(loginData.error || `Login rejected (${loginRes.status})`);

      if (guestName) { endSessionBeacon(true); onlinePlayers.delete(guestName); }
      guestName = ""; guestToken = ""; guestBotId = ""; isGuestMode = false;
      accessToken = loginData.access_token; userId = loginData.user_id; syncToken = "";
      window.isMatrixConnected = true;

      localStorage.setItem("gtag_mx_token", accessToken);
      localStorage.setItem("gtag_mx_user", userId);
      localStorage.setItem("gtag_mx_server", homeserver);

      if (typeof syncModUI === "function") syncModUI();
      passField.value = ""; setStatus(""); playTerminalSfx?.("vip");
      await openStumpRoom(false);
    } catch (err) {
      playTerminalSfx?.("error");
      setStatus(`LOGIN ERROR: ${err.message}`, true);
    } finally {
      loginBtn.disabled = false; loginBtn.textContent = "SIGN IN & JOIN";
    }
  }

  function renderRoomSidebar() {
    const listEl = document.getElementById("room-sidebar-list");
    if (!listEl) return;
    listEl.innerHTML = "";
    sidebarRooms.forEach((rm) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = (!activeDmPeer && rm.name === activeChannelKey) ? "gtag-room-item active" : "gtag-room-item";
      btn.textContent = `#${rm.name}`;
      btn.onclick = () => { playTerminalSfx?.("tab"); activeDmPeer = ""; renderDmList(); selectStumpChannel(rm); };
      listEl.appendChild(btn);
    });
    renderDmList();
  }

  function renderDmList() {
    const sidebar = document.querySelector(".gtag-room-sidebar");
    if (!sidebar) return;
    let dmList = document.getElementById("dm-sidebar-list");
    if (!dmList) {
      const head = document.createElement("div"); head.className = "gtag-sidebar-head"; head.style.marginTop = "8px";
      head.innerHTML = `<span>DIRECT MSGS</span>`;
      dmList = document.createElement("div"); dmList.id = "dm-sidebar-list";
      dmList.style.cssText = "display:flex; flex-direction:column; gap:5px; max-height:95px; overflow-y:auto;";
      sidebar.append(head, dmList);
    }
    const peers = [...new Set([...onlinePlayers.keys(), ...Object.keys(dmThreads)])].filter(p => p !== window.getMyGorillaName() && p.toLowerCase() !== "meebo");
    if (!peers.length) { dmList.innerHTML = `<div style="font-size:6.5px; color:#557755;">NO MONKES ONLINE</div>`; return; }
    dmList.innerHTML = peers.map(p => {
      const act = activeDmPeer === p ? "gtag-room-item active" : "gtag-room-item";
      const unread = unreadDms.has(p) ? "border-color:#ffe135; color:#ffe135;" : "";
      return `<button type="button" class="${act}" style="${unread}" onclick="window.openPrivateDm('${p}')">@${p.slice(0, 11)}${unreadDms.has(p) ? " *" : ""}</button>`;
    }).join("");
  }

  window.openPrivateDm = function(peer) {
    activeDmPeer = peer; unreadDms.delete(peer);
    renderRoomSidebar();
    const label = document.getElementById("matrix-room-label");
    if (label) label.textContent = `PRIVATE DM // @${peer.toUpperCase()}`;
    msgBox.innerHTML = "";
    const msgs = dmThreads[peer] || [];
    if (!msgs.length) addChatLine("SYSTEM", `1-ON-1 PRIVATE DM WITH ${peer}. ONLY YOU TWO SEE THIS.`);
    else msgs.forEach(m => addChatLine(m.from, m.text, false, m.ts));
    chatInput?.focus();
  };
  async function selectStumpChannel(channelObj) {
    activeChannelKey = channelObj.name; activeDmPeer = "";
    const label = document.getElementById("matrix-room-label");
    renderRoomSidebar();
    const roleTag = isGuestMode ? ` [${guestName}]` : " [VIP]";
    if (label) label.textContent = `STUMP // #${channelObj.name.toUpperCase()}${roleTag}`;
    msgBox.innerHTML = "";
    addChatLine("SYSTEM", `CONNECTED TO #${channelObj.name.toUpperCase()}`);
    if (channelObj.id) {
      activeRoomId = channelObj.id;
      if (!isGuestMode) localStorage.setItem("gtag_mx_custom_room", activeRoomId);
      await loadRecentRoomHistory(activeRoomId);
    }
    chatInput?.focus();
  }

  async function loadRecentRoomHistory(rId) {
    const tok = accessToken || guestToken, srv = accessToken ? homeserver : FALLBACK_SERVER;
    if (!tok) return;
    try {
      const res = await fetch(`${srv}/_matrix/client/v3/rooms/${encodeURIComponent(rId)}/messages?dir=b&limit=20`, { headers: { "Authorization": `Bearer ${tok}` } });
      if (!res.ok) return;
      const data = await res.json();
      for (const ev of (data.chunk || []).reverse()) {
        if (ev.type === "m.room.message" && ev.content?.body && !ev.content.body.startsWith("[TIME:")) {
          const parsed = parseIncomingMessage(ev.sender, ev.content.body);
          addChatLine(parsed.displayUser, parsed.cleanText, parsed.isVip);
        }
      }
    } catch (_) {}
  }

  async function resolveAndJoinAlias(alias) {
    const tok = accessToken || guestToken, srv = accessToken ? homeserver : FALLBACK_SERVER;
    const lookupRes = await fetch(`${srv}/_matrix/client/v3/directory/room/${encodeURIComponent(alias)}`, { headers: { "Authorization": `Bearer ${tok}` } });
    const lookupData = await lookupRes.json();
    if (!lookupRes.ok || !lookupData.room_id) throw new Error(lookupData.error || `Room ${alias} not found`);
    await fetch(`${srv}/_matrix/client/v3/join/${encodeURIComponent(lookupData.room_id)}`, {
      method: "POST", headers: { "Authorization": `Bearer ${tok}`, "Content-Type": "application/json" }, body: "{}"
    });
    return lookupData.room_id;
  }

  async function openStumpRoom(asGuest = false) {
    loginBox.classList.add("gtag-hidden");
    chatBox.classList.remove("gtag-hidden");
    msgBox.innerHTML = ""; sidebarRooms = [];
    const tok = accessToken || guestToken;
    if (tok) {
      try { sidebarRooms.push({ name: "general", alias: GENERAL_ALIAS, id: await resolveAndJoinAlias(GENERAL_ALIAS) }); }
      catch (_) { sidebarRooms.push({ name: "general", alias: GENERAL_ALIAS, id: null }); }
      try { backendRandomRoomId = await resolveAndJoinAlias(RANDOM_ALIAS); } catch (_) {}
    } else sidebarRooms.push({ name: "general", alias: GENERAL_ALIAS, id: null });

    renderRoomSidebar();
    if (sidebarRooms.at(0)) await selectStumpChannel(sidebarRooms.at(0));
    addChatLine("SYSTEM", asGuest ? `GUEST NAME: ${guestName}` : `LOGGED IN AS ${userId} [VIP]`, !asGuest);
    if (tok && !isSyncing) { isSyncing = true; startSyncLoop(); }
    await sendSilentPresence();
  }

  async function startSyncLoop() {
    while ((accessToken || isGuestMode) && isSyncing) {
      const tok = accessToken || guestToken, srv = accessToken ? homeserver : FALLBACK_SERVER;
      if (!tok) break;
      try {
        const query = syncToken ? `?timeout=15000&since=${encodeURIComponent(syncToken)}` : "?timeout=15000";
        const res = await fetch(`${srv}/_matrix/client/v3/sync${query}`, { headers: { "Authorization": `Bearer ${tok}` } });
        if (!res.ok) {
          if (res.status === 401 && accessToken) { handleLogout("SESSION EXPIRED."); return; }
          await new Promise(r => setTimeout(r, 3000)); continue;
        }
        const data = await res.json();
        const isInitialSync = !syncToken;
        if (data.next_batch) syncToken = data.next_batch;
        const myPublicName = window.getMyGorillaName();
        const joinedRooms = data.rooms?.join || {};

        if (backendRandomRoomId && joinedRooms[backendRandomRoomId]) {
          for (const ev of (joinedRooms[backendRandomRoomId].timeline?.events || [])) {
            if (isInitialSync || !ev.content?.body) continue;
            const body = ev.content.body;
            if (body.startsWith("[OFFLINE|")) {
              onlinePlayers.delete(body.slice(9, -1)); renderDmList(); window.renderHackTargetList?.();
            } else if (body.startsWith("[TIME:")) {
              const [secStr, nick, vipFlag] = body.slice(6, -1).split("|");
              const pName = nick || formatDisplayName(ev.sender);
              if (pName && pName !== myPublicName && pName.toLowerCase() !== "meebo") {
                const isNew = !onlinePlayers.has(pName);
                onlinePlayers.set(pName, { seconds: parseInt(secStr, 10) || 0, lastSeen: Date.now(), isVip: vipFlag === "1" });
                if (isNew) { renderDmList(); window.renderHackTargetList?.(); window.refreshGamblePeers?.(); }
              }
            } else if (body.startsWith("[DM|")) {
              const [, from, to, ...rest] = body.slice(4, -1).split("|");
              if (to && to.toLowerCase() === myPublicName.toLowerCase() && from) {
                const ts = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                if (!dmThreads[from]) dmThreads[from] = [];
                dmThreads[from].push({ from, text: rest.join("|"), ts });
                if (activeDmPeer === from) addChatLine(from, rest.join("|"), false, ts);
                else { unreadDms.add(from); renderDmList(); showGtagNotification(`PRIVATE DM FROM ${from}`, rest.join("|")); }
              }
            } else if (body.startsWith("[VIP_FLARE]")) {
              showVipFlareBanner(formatDisplayName(ev.sender), body.slice(11));
            } else if (body.startsWith("[SFX|")) {
              window.playMonkeSound?.(body.slice(5, -1).trim(), true);
              showGtagNotification("GLOBAL SOUNDBOARD", `${formatDisplayName(ev.sender)} PLAYED [${body.slice(5, -1).toUpperCase()}]`);
            } else if (body.startsWith("[HACK|")) {
              const [targetName, effect, stateStr] = body.slice(6, -1).split("|");
              if (targetName === "ALL" || targetName.toLowerCase() === myPublicName.toLowerCase()) {
                if (effect === "clear") window.clearAllIncomingHacks?.();
                else if (effect !== "puppet") window.applyIncomingHack?.(effect, stateStr === "1", formatDisplayName(ev.sender));
              }
            } else if (body.startsWith("[BANANA_SET|") || body.startsWith("[WAGER_")) {
              window.handleBananaRelayPacket?.(body);
            }
          }
        }

        if (!activeDmPeer) {
          for (const ev of (joinedRooms[activeRoomId]?.timeline?.events || [])) {
            if (ev.type === "m.room.message" && ev.content?.body && !ev.content.body.startsWith("[TIME:")) {
              const parsed = parseIncomingMessage(ev.sender, ev.content.body);
              if (!isInitialSync) {
                addChatLine(parsed.displayUser, parsed.cleanText, parsed.isVip);
                if (parsed.displayUser !== myPublicName && document.getElementById("gtag-overlay")?.classList.contains("gtag-hidden")) {
                  showGtagNotification("STUMP CHAT", `[${parsed.displayUser}]: ${parsed.cleanText}`);
                }
              }
            }
          }
        }
      } catch (_) { await new Promise(r => setTimeout(r, 3000)); }
    }
  }
  let lastGlobalSfxTs = 0;
  window.broadcastGlobalSound = async function(soundKey) {
    if (!accessToken || !backendRandomRoomId) return;
    const now = Date.now();
    if (now - lastGlobalSfxTs < 2500) return triggerModToast("SFX COOLDOWN", "WAIT 2 SECONDS!");
    lastGlobalSfxTs = now;
    await window.sendRelayNotice(`[SFX|${soundKey}]`);
  };

  async function sendMessage(text) {
    if (!text) return;
    if (activeDmPeer) {
      const ts = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      if (!dmThreads[activeDmPeer]) dmThreads[activeDmPeer] = [];
      dmThreads[activeDmPeer].push({ from: window.getMyGorillaName(), text, ts });
      addChatLine(window.getMyGorillaName(), text, false, ts);
      await window.sendRelayNotice(`[DM|${window.getMyGorillaName()}|${activeDmPeer}|${text}]`);
      playTerminalSfx?.("send");
      return;
    }

    const tok = accessToken || guestToken, srv = accessToken ? homeserver : FALLBACK_SERVER;
    if (!tok || !activeRoomId) return;
    const tagStr = window.getBananaChatTags ? window.getBananaChatTags() : "";
    const taggedText = tagStr ? `${tagStr} ${text}` : text;
    const outboundBody = isGuestMode ? `[GUEST:${guestName}] ${taggedText}` : taggedText;

    const txnId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const res = await fetch(`${srv}/_matrix/client/v3/rooms/${encodeURIComponent(activeRoomId)}/send/m.room.message/${txnId}`, {
      method: "PUT", headers: { "Authorization": `Bearer ${tok}`, "Content-Type": "application/json" },
      body: JSON.stringify({ msgtype: "m.text", body: outboundBody })
    });
    if (res?.ok) playTerminalSfx?.("send");
    else { playTerminalSfx?.("error"); addChatLine("SYSTEM", `SEND ERROR (${res?.status || "NET"})`); }
  }

  window.sendVipBroadcastFlare = async function() {
    if (!accessToken) return triggerModToast("VIP ONLY", "ELEMENT ACCOUNT REQUIRED!");
    const flareInput = document.getElementById("vip-flare-input");
    const shout = flareInput?.value.trim() || "";
    if (!shout) { playTerminalSfx?.("error"); return triggerModToast("EMPTY FLARE", "TYPE A MESSAGE FIRST!"); }
    flareInput.value = "";
    const ok = await window.sendRelayNotice(`[VIP_FLARE]${shout.slice(0, 85)}`);
    if (!ok) { playTerminalSfx?.("error"); triggerModToast("FLARE FAILED", "RELAY NOT CONNECTED"); }
  };

  const HACK_SECRET_CODE = "elsd6932";
  let isHackUnlocked = sessionStorage.getItem("gtag_hack_unlocked") === "1";
  let selectedHackTarget = "";
  const targetHackStates = new Map();

  function syncHackTerminalUI() {
    document.getElementById("hack-locked-view")?.classList.toggle("gtag-hidden", isHackUnlocked);
    document.getElementById("hack-unlocked-view")?.classList.toggle("gtag-hidden", !isHackUnlocked);
    if (isHackUnlocked) window.renderHackTargetList();
  }

  window.unlockHackTerminal = function() {
    const codeInput = document.getElementById("hack-code-input");
    const errEl = document.getElementById("hack-code-error");
    if ((codeInput?.value.trim() || "") === HACK_SECRET_CODE) {
      isHackUnlocked = true; sessionStorage.setItem("gtag_hack_unlocked", "1");
      if (codeInput) codeInput.value = ""; if (errEl) errEl.textContent = "";
      playTerminalSfx?.("vip"); syncHackTerminalUI();
    } else { playTerminalSfx?.("error"); if (errEl) errEl.textContent = "INVALID ACCESS CODE."; }
  };

  window.renderHackTargetList = function() {
    const listEl = document.getElementById("hack-target-list");
    const lblEl = document.getElementById("hack-selected-label");
    if (!listEl) return;
    const myName = window.getMyGorillaName();
    const targets = ["ALL", myName];
    onlinePlayers.forEach((_, name) => { if (name.toLowerCase() !== "meebo" && !targets.includes(name)) targets.push(name); });
    if (!selectedHackTarget || !targets.includes(selectedHackTarget)) selectedHackTarget = targets.at(0);
    if (lblEl) lblEl.textContent = `TARGET: ${selectedHackTarget}`;

    listEl.innerHTML = targets.map(name => {
      const active = name === selectedHackTarget ? "gtag-room-item active" : "gtag-room-item";
      const tag = name === "ALL" ? "ALL PLAYERS" : (name === myName ? `${name} (YOU)` : name);
      return `<button type="button" class="${active}" onclick="selectHackTarget('${name}')">${tag}</button>`;
    }).join("");

    const st = targetHackStates.get(selectedHackTarget) || { screen: false, movement: false, invert: false, hud: false };
    ["screen", "movement", "invert", "hud"].forEach(k => {
      document.getElementById(`hack-btn-${k}`)?.classList.toggle("active", Boolean(st[k]));
    });
  };

  window.selectHackTarget = function(name) { selectedHackTarget = name; playTerminalSfx?.("click"); window.renderHackTargetList(); };

  window.triggerRemoteHack = async function(effect) {
    if (!isHackUnlocked || effect === "puppet") return;
    const st = targetHackStates.get(selectedHackTarget) || { screen: false, movement: false, invert: false, hud: false };
    const nextVal = effect === "clear" ? false : !st[effect];
    if (effect === "clear") targetHackStates.set(selectedHackTarget, { screen: false, movement: false, invert: false, hud: false });
    else { st[effect] = nextVal; targetHackStates.set(selectedHackTarget, st); }
    window.renderHackTargetList(); playTerminalSfx?.("send");
    await window.sendRelayNotice(`[HACK|${selectedHackTarget}|${effect}|${nextVal ? 1 : 0}]`);
  };

  document.getElementById("btn-add-room")?.addEventListener("click", async e => {
    e.preventDefault();
    if (!accessToken) return triggerModToast("ELEMENT REQUIRED", "GUESTS CANNOT JOIN CUSTOM ROOMS.");
    const rawAlias = prompt("Enter Stump Channel Address (e.g. #stump-network-clips:matrix.org):");
    if (!rawAlias?.trim()) return;
    let formatted = rawAlias.trim();
    if (!formatted.startsWith("#") && !formatted.startsWith("!")) formatted = `#${formatted}`;
    if (!formatted.includes(":")) formatted = `${formatted}:matrix.org`;
    if (formatted.toLowerCase() === RANDOM_ALIAS) return addChatLine("SYSTEM", "RESERVED FOR TELEMETRY.");
    try {
      const rId = await resolveAndJoinAlias(formatted);
      const shortName = formatted.split(":").at(0).replace(/^#stump-network-/, "").replace(/^#/, "");
      const newCh = { name: shortName, alias: formatted, id: rId };
      if (!sidebarRooms.some(r => r.alias === formatted)) sidebarRooms.push(newCh);
      await selectStumpChannel(newCh);
    } catch (err) { playTerminalSfx?.("error"); addChatLine("SYSTEM", `JOIN FAILED: ${err.message}`); }
  });

  function handleLogout(customMsg = "SIGNED OUT.") {
    endSessionBeacon(true);
    accessToken = ""; userId = ""; guestToken = ""; guestBotId = "";
    syncToken = ""; isSyncing = false; isGuestMode = false; guestName = ""; activeDmPeer = "";
    window.isMatrixConnected = false;
    ["gtag_mx_token", "gtag_mx_user", "gtag_mx_server", "gtag_mx_custom_room"].forEach(k => localStorage.removeItem(k));
    if (guestNickField && savedGuestNick) guestNickField.value = savedGuestNick;
    if (typeof syncModUI === "function") syncModUI();
    chatBox.classList.add("gtag-hidden"); loginBox.classList.remove("gtag-hidden");
    playTerminalSfx?.("close"); setStatus(customMsg);
  }

  guestNickField?.addEventListener("input", () => { savedGuestNick = guestNickField.value.trim().slice(0, 14); localStorage.setItem("gtag_saved_guest_nick", savedGuestNick); });
  window.loginElementAccount = handleLogin; window.logoutElementAccount = handleLogout;
  window.sendStumpChatInput = () => { const msg = chatInput.value.trim(); if (msg) { chatInput.value = ""; sendMessage(msg); } };
  if (loginBtn) loginBtn.onclick = e => { e.preventDefault(); handleLogin(); };
  if (guestBtn) guestBtn.onclick = e => { e.preventDefault(); startGuestSession(); };
  document.getElementById("matrix-logout-btn")?.addEventListener("click", e => { e.preventDefault(); handleLogout("SIGNED OUT."); });
  document.getElementById("chat-send-btn")?.addEventListener("click", e => { e.preventDefault(); window.sendStumpChatInput(); chatInput.focus(); });

  syncHackTerminalUI(); setStatus("READY TO SIGN IN OR CONTINUE AS GUEST.");
  if (accessToken && userId) openStumpRoom(false);
  else if (isGuestMode) openStumpRoom(true);
});
