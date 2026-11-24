// ELEMENT / MATRIX DEFAULT ROOM CHAT
const MATRIX_HOMESERVER = "https://matrix.org";
let currentRoomAlias = "#gorillatag:matrix.org";

const playerName = "MONKE_" + Math.floor(1000 + Math.random() * 9000);
const chatInput = document.getElementById('chat-input');
const msgBox = document.getElementById('chat-messages');

let accessToken = null;
let roomId = null;
let nextBatch = "";
let pollingActive = false;

async function initMatrix() {
  try {
    appendMessage("SYSTEM", "CONNECTING TO MATRIX.ORG...");

    // Register or reuse a guest token stored in sessionStorage
    let savedToken = sessionStorage.getItem("matrix_guest_token");
    if (!savedToken) {
      const regRes = await fetch(`${MATRIX_HOMESERVER}/_matrix/client/v3/register?kind=guest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      const regData = await regRes.json();
      if (!regData.access_token) throw new Error(regData.error || "Guest login blocked");
      savedToken = regData.access_token;
      sessionStorage.setItem("matrix_guest_token", savedToken);
    }
    accessToken = savedToken;

    await joinMatrixRoom(currentRoomAlias);
    if (!pollingActive) {
      pollingActive = true;
      pollMatrix();
    }
  } catch (err) {
    appendMessage("SYSTEM", `ELEMENT ERROR: ${err.message}`);
  }
}

async function joinMatrixRoom(aliasOrId) {
  const res = await fetch(`${MATRIX_HOMESERVER}/_matrix/client/v3/join/${encodeURIComponent(aliasOrId)}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({})
  });
  const data = await res.json();
  if (!data.room_id) throw new Error(data.error || "Could not join room");

  roomId = data.room_id;
  currentRoomAlias = aliasOrId;
  document.getElementById('matrix-room-label').textContent = `ROOM: ${aliasOrId}`;
  appendMessage("SYSTEM", `JOINED ${aliasOrId} AS ${playerName}`);
}

async function pollMatrix() {
  while (accessToken) {
    try {
      const url = `${MATRIX_HOMESERVER}/_matrix/client/v3/sync?timeout=15000${nextBatch ? `&since=${nextBatch}` : ""}`;
      const res = await fetch(url, {
        headers: { "Authorization": `Bearer ${accessToken}` }
      });
      const data = await res.json();
      if (data.next_batch) nextBatch = data.next_batch;

      if (roomId && data.rooms?.join?.[roomId]) {
        const events = data.rooms.join[roomId].timeline?.events || [];
        for (const ev of events) {
          if (ev.type === "m.room.message" && ev.content?.body) {
            const raw = ev.content.body;
            const match = raw.match(/^\[(MONKE_\d+)\]:\s*(.*)$/);
            if (match) {
              appendMessage(match, match);
            } else {
              const sender = ev.sender.split(":").replace("@", "");
              appendMessage(sender, raw);
            }
          }
        }
      }
    } catch (e) {
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

async function sendMatrixMessage(text) {
  // Allow switching Element rooms via "/room #roomname:matrix.org"
  if (text.startsWith("/room ")) {
    const newRoom = text.replace("/room ", "").trim();
    if (newRoom) {
      try {
        await joinMatrixRoom(newRoom);
      } catch (e) {
        appendMessage("SYSTEM", `FAILED TO JOIN ${newRoom}: ${e.message}`);
      }
    }
    return;
  }

  if (!accessToken || !roomId) {
    appendMessage("SYSTEM", "NOT CONNECTED TO ELEMENT YET...");
    return;
  }

  const txnId = Date.now() + "_" + Math.random().toString(36).slice(2);
  const res = await fetch(`${MATRIX_HOMESERVER}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      msgtype: "m.text",
      body: `[${playerName}]: ${text}`
    })
  });

  if (!res.ok) {
    appendMessage("SYSTEM", "MESSAGE FAILED (ROOM MAY REQUIRE REGISTERED ELEMENT ACCOUNT)");
  }
}

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && chatInput.value.trim() !== '') {
    e.preventDefault();
    e.stopImmediatePropagation();
    const text = chatInput.value.trim();
    chatInput.value = '';
    sendMatrixMessage(text);
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

initMatrix();
