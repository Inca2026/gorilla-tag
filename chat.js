// ELEMENT / MATRIX ACCOUNT SIGN-IN + AUTO-JOIN "STUMP NETWORK"
const MATRIX_HOMESERVER = "https://matrix.org";
const STUMP_ROOM_ID = "!biZ1u5bq9LjBrSDFLVhfQwS-BYDBCziaT1vKTtq_S4A:matrix.org";

const loginBox = document.getElementById('matrix-login-box');
const chatBox = document.getElementById('matrix-chat-box');
const loginError = document.getElementById('matrix-login-error');
const chatInput = document.getElementById('chat-input');
const msgBox = document.getElementById('chat-messages');

let accessToken = localStorage.getItem('element_access_token') || null;
let myUserId = localStorage.getItem('element_user_id') || null;
let nextBatch = "";
let polling = false;

// Auto-resume session if already signed in
if (accessToken && myUserId) {
  enterStumpNetwork();
}

async function loginElementAccount() {
  const userField = document.getElementById('matrix-user-input').value.trim();
  const passField = document.getElementById('matrix-pass-input').value;
  const btn = document.getElementById('matrix-login-btn');

  if (!userField || !passField) {
    loginError.textContent = "ENTER BOTH USERNAME AND PASSWORD.";
    return;
  }

  loginError.textContent = "";
  btn.textContent = "SIGNING IN...";
  btn.disabled = true;

  try {
    // Strip leading @ or :matrix.org if entered so Matrix login accepts it cleanly
    const cleanUser = userField.replace(/^@/, '').replace(/:matrix\.org$/i, '');

    const res = await fetch(`${MATRIX_HOMESERVER}/_matrix/client/v3/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "m.login.password",
        identifier: { type: "m.id.user", user: cleanUser },
        password: passField
      })
    });

    const data = await res.json();
    if (!res.ok || !data.access_token) {
      throw new Error(data.error || "Invalid Element username or password");
    }

    accessToken = data.access_token;
    myUserId = data.user_id;
    localStorage.setItem('element_access_token', accessToken);
    localStorage.setItem('element_user_id', myUserId);

    document.getElementById('matrix-pass-input').value = "";
    await enterStumpNetwork();
  } catch (err) {
    loginError.textContent = "LOGIN FAILED: " + err.message;
  } finally {
    btn.textContent = "SIGN IN & JOIN";
    btn.disabled = false;
  }
}

function logoutElementAccount() {
  accessToken = null;
  myUserId = null;
  polling = false;
  localStorage.removeItem('element_access_token');
  localStorage.removeItem('element_user_id');
  chatBox.classList.add('gtag-hidden');
  loginBox.classList.remove('gtag-hidden');
  msgBox.innerHTML = '<div class="chat-line" style="color:#888;">* LOGGED OUT *</div>';
}

async function enterStumpNetwork() {
  loginBox.classList.add('gtag-hidden');
  chatBox.classList.remove('gtag-hidden');
  appendMessage("SYSTEM", `SIGNED IN AS ${myUserId}`);
  appendMessage("SYSTEM", "JOINING STUMP NETWORK...");

  try {
    const joinRes = await fetch(`${MATRIX_HOMESERVER}/_matrix/client/v3/join/${encodeURIComponent(STUMP_ROOM_ID)}?server_name=matrix.org`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    });

    const joinData = await joinRes.json();
    if (!joinRes.ok) {
      if (joinData.errcode === "M_UNKNOWN_TOKEN") {
        logoutElementAccount();
        loginError.textContent = "SESSION EXPIRED - PLEASE SIGN IN AGAIN.";
        return;
      }
      throw new Error(joinData.error || "Could not join Stump Network");
    }

    appendMessage("SYSTEM", "CONNECTED TO STUMP NETWORK!");
    setTimeout(() => chatInput.focus(), 20);

    if (!polling) {
      polling = true;
      pollStumpMessages();
    }
  } catch (err) {
    appendMessage("SYSTEM", `JOIN ERROR: ${err.message}`);
  }
}

async function pollStumpMessages() {
  while (accessToken && polling) {
    try {
      const url = `${MATRIX_HOMESERVER}/_matrix/client/v3/sync?timeout=15000${nextBatch ? `&since=${nextBatch}` : ""}`;
      const res = await fetch(url, {
        headers: { "Authorization": `Bearer ${accessToken}` }
      });
      const data = await res.json();
      if (data.next_batch) nextBatch = data.next_batch;

      const roomTimeline = data.rooms?.join?.[STUMP_ROOM_ID]?.timeline?.events || [];
      for (const ev of roomTimeline) {
        if (ev.type === "m.room.message" && ev.content?.body) {
          const shortUser = ev.sender.split(":").replace("@", "");
          appendMessage(shortUser, ev.content.body);
        }
      }
    } catch (e) {
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

async function sendStumpMessage(text) {
  if (!accessToken) return;
  const txnId = Date.now() + "_" + Math.random().toString(36).slice(2);

  const res = await fetch(`${MATRIX_HOMESERVER}/_matrix/client/v3/rooms/${encodeURIComponent(STUMP_ROOM_ID)}/send/m.room.message/${txnId}`, {
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
    const err = await res.json();
    appendMessage("SYSTEM", `SEND ERROR: ${err.error || "Failed to send"}`);
  }
}

// Capture Enter key inside chat input before Unity steals it
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && chatInput.value.trim() !== '') {
    e.preventDefault();
    e.stopImmediatePropagation();
    const text = chatInput.value.trim();
    chatInput.value = '';
    sendStumpMessage(text);
  }
}, true);

// Allow pressing Enter in password field to submit login
document.getElementById('matrix-pass-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    e.stopImmediatePropagation();
    loginElementAccount();
  }
}, true);

function appendMessage(user, text) {
  const line = document.createElement('div');
  line.className = 'chat-line';
  line.innerHTML = `<span class="chat-user">[${escapeHTML(user)}]:</span> ${escapeHTML(text)}`;
  msgBox.appendChild(line);
  msgBox.scrollTop = msgBox.scrollHeight;
}

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag]));
}
