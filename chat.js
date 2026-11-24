document.addEventListener("DOMContentLoaded", () => {
  let activeRoomId = localStorage.getItem("gtag_mx_room") || "!biZ1u5bq9LjBrSDFLVhfQwS-BYDBCziaT1vKTtq_S4A:matrix.org";
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
  let syncToken = "";
  let isSyncing = false;

  function setStatus(msg, isError = false) {
    if (!statusLabel) return;
    statusLabel.style.color = isError ? "#ff4444" : "#33ff33";
    statusLabel.textContent = msg;
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
  async function findStumpRoomFromJoined() {
    try {
      const res = await fetch(`${homeserver}/_matrix/client/v3/joined_rooms`, {
        headers: { "Authorization": `Bearer ${accessToken}` }
      });
      if (!res.ok) return null;
      const data = await res.json();
      const rooms = data.joined_rooms || [];

      for (const rId of rooms) {
        const nameRes = await fetch(`${homeserver}/_matrix/client/v3/rooms/${encodeURIComponent(rId)}/state/m.room.name`, {
          headers: { "Authorization": `Bearer ${accessToken}` }
        });
        if (nameRes.ok) {
          const nameData = await nameRes.json();
          if (nameData.name && nameData.name.toLowerCase().includes("stump")) {
            return rId;
          }
        }
      }
      return rooms.at(0) || null;
    } catch (_) {
      return null;
    }
  }

  async function joinRoomByIdOrAlias(target) {
    const encoded = encodeURIComponent(target);
    const joinRes = await fetch(`${homeserver}/_matrix/client/v3/join/${encoded}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: "{}"
    });
    const joinData = await joinRes.json();
    if (!joinRes.ok) {
      throw new Error(joinData.error || `HTTP ${joinRes.status}`);
    }
    return joinData.room_id || target;
  }

  async function openStumpRoom() {
    loginBox.classList.add("gtag-hidden");
    chatBox.classList.remove("gtag-hidden");
    msgBox.innerHTML = "";
    addChatLine("SYSTEM", `LOGGED IN AS ${userId}`);
    addChatLine("SYSTEM", "CONNECTING TO STUMP NETWORK...");

    try {
      const detectedRoom = await findStumpRoomFromJoined();
      if (detectedRoom) {
        activeRoomId = detectedRoom;
        localStorage.setItem("gtag_mx_room", activeRoomId);
        addChatLine("SYSTEM", "FOUND & CONNECTED TO STUMP NETWORK!");
      } else {
        activeRoomId = await joinRoomByIdOrAlias(activeRoomId);
        localStorage.setItem("gtag_mx_room", activeRoomId);
        addChatLine("SYSTEM", "JOINED STUMP NETWORK!");
      }
    } catch (err) {
      addChatLine("SYSTEM", `AUTO-JOIN NOTE: ${err.message}`);
      addChatLine("SYSTEM", "TYPE /join #yourroom:matrix.org TO SWITCH ROOMS.");
    }

    setTimeout(() => chatInput.focus(), 30);

    if (!isSyncing) {
      isSyncing = true;
      startSyncLoop();
    }
  }

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
        if (data.next_batch) syncToken = data.next_batch;

        const joinedRooms = data.rooms?.join || {};
        const stumpData = joinedRooms[activeRoomId];
        const events = stumpData?.timeline?.events || [];

        for (const ev of events) {
          if (ev.type === "m.room.message" && ev.content?.body) {
            const displayUser = ev.sender.split(":").at(0).replace(/^@/, "");
            addChatLine(displayUser, ev.content.body);
          }
        }
      } catch (_) {
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  }

  async function sendMessage(text) {
    if (!accessToken || !text) return;

    if (text.startsWith("/join ")) {
      const target = text.replace("/join ", "").trim();
      if (target) {
        addChatLine("SYSTEM", `JOINING ${target}...`);
        try {
          activeRoomId = await joinRoomByIdOrAlias(target);
          localStorage.setItem("gtag_mx_room", activeRoomId);
          addChatLine("SYSTEM", `CONNECTED TO ${target}!`);
        } catch (err) {
          addChatLine("SYSTEM", `JOIN FAILED: ${err.message}`);
        }
      }
      return;
    }

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

      if (!res.ok) {
        const errData = await res.json();
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
    localStorage.removeItem("gtag_mx_room");
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
