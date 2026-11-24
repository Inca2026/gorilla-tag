document.addEventListener("DOMContentLoaded", () => {
  const STUMP_ROOM_ID = "!biZ1u5bq9LjBrSDFLVhfQwS-BYDBCziaT1vKTtq_S4A:matrix.org";
  const FALLBACK_SERVER = "https://matrix.org";

  const loginBox = document.getElementById("matrix-login-box");
  const chatBox = document.getElementById("matrix-chat-box");
  const statusLabel = document.getElementById("matrix-login-error");
  const loginBtn = document.getElementById("matrix-login-btn");
  const userField = document.getElementById("matrix-user-input");
  const passField = document.getElementById("matrix-pass-input");
  const chatInput = document.getElementById("chat-input");
  const msgBox = document.getElementById("chat-messages");

  if (!loginBtn || !userField || !passField) {
    console.error("GorillaOS Chat: Missing required HTML elements.");
    return;
  }

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
          identifier: {
            type: "m.id.user",
            user: localpart
          },
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

  async function openStumpRoom() {
    loginBox.classList.add("gtag-hidden");
    chatBox.classList.remove("gtag-hidden");
    msgBox.innerHTML = "";
    addChatLine("SYSTEM", `LOGGED IN AS ${userId}`);
    addChatLine("SYSTEM", "JOINING STUMP NETWORK...");

    try {
      const joinUrl = `${homeserver}/_matrix/client/v3/join/${encodeURIComponent(STUMP_ROOM_ID)}?server_name=matrix.org`;
      const joinRes = await fetch(joinUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: "{}"
      });

      const joinData = await joinRes.json();

      if (!joinRes.ok) {
        if (joinData.errcode === "M_UNKNOWN_TOKEN") {
          handleLogout();
          setStatus("SESSION EXPIRED. SIGN IN AGAIN.", true);
          return;
        }
        throw new Error(joinData.error || `Join failed (${joinRes.status})`);
      }

      addChatLine("SYSTEM", "CONNECTED TO STUMP NETWORK!");
      setTimeout(() => chatInput.focus(), 30);

      if (!isSyncing) {
        isSyncing = true;
        startSyncLoop();
      }
    } catch (err) {
      addChatLine("SYSTEM", `ROOM ERROR: ${err.message}`);
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
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }

        const data = await res.json();
        if (data.next_batch) syncToken = data.next_batch;

        const joinedRooms = data.rooms?.join || {};
        const stumpData = joinedRooms[STUMP_ROOM_ID];
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
    const txnId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const sendUrl = `${homeserver}/_matrix/client/v3/rooms/${encodeURIComponent(STUMP_ROOM_ID)}/send/m.room.message/${txnId}`;

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
        addChatLine("SYSTEM", `FAILED TO SEND: ${errData.error || res.status}`);
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
    chatBox.classList.add("gtag-hidden");
    loginBox.classList.remove("gtag-hidden");
    setStatus("SIGNED OUT.");
  }

  // Expose globally just in case HTML has inline onclick attributes
  window.loginElementAccount = handleLogin;
  window.logoutElementAccount = handleLogout;

  // Bind button clicks directly
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

  // Enter key in password field submits login
  passField.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopImmediatePropagation();
      handleLogin();
    }
  }, true);

  // Enter key in chat input sends message
  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopImmediatePropagation();
      const msg = chatInput.value.trim();
      if (msg) {
        chatInput.value = "";
        sendMessage(msg);
      }
    }
  }, true);

  // Show ready indicator & auto-resume existing session
  setStatus("READY TO SIGN IN.");
  if (accessToken && userId) {
    openStumpRoom();
  }
});
