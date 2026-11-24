// ZERO-CONFIG PEER-TO-PEER (WEBRTC) CHAT VIA PEERJS
const LOBBY_HOST_ID = "inca2026-gtag-stump-lobby-v1";
const playerName = "MONKE_" + Math.floor(1000 + Math.random() * 9000);

const chatInput = document.getElementById('chat-input');
const msgBox = document.getElementById('chat-messages');

let peer = null;
let isHost = false;
let hostConn = null;
const clientConns = new Map(); // Host tracks all connected players
const seenMsgIds = new Set();  // Prevents duplicate messages

function startP2P() {
  appendMessage("SYSTEM", "SEARCHING FOR P2P STUMP LOBBY...");

  // 1. Try to become the Lobby Host first
  const hostAttempt = new Peer(LOBBY_HOST_ID);

  hostAttempt.on('open', () => {
    peer = hostAttempt;
    isHost = true;
    appendMessage("SYSTEM", `HOSTING LOBBY AS ${playerName} (1 ONLINE)`);

    // Listen for other players joining
    peer.on('connection', (conn) => {
      conn.on('open', () => {
        clientConns.set(conn.peer, conn);
        broadcastSystem(`${conn.metadata?.name || "A MONKE"} JOINED (${clientConns.size + 1} ONLINE)`);
      });

      conn.on('data', (packet) => {
        if (packet.type === 'chat') {
          displayPacket(packet);
          // Relay message to all other connected players
          relayToClients(packet, conn.peer);
        }
      });

      conn.on('close', () => {
        clientConns.delete(conn.peer);
        broadcastSystem(`A MONKE LEFT (${clientConns.size + 1} ONLINE)`);
      });
    });
  });

  // 2. If LOBBY_HOST_ID is already taken, join as a Client instead!
  hostAttempt.on('error', (err) => {
    if (err.type === 'unavailable-id') {
      hostAttempt.destroy();
      connectAsClient();
    } else {
      appendMessage("SYSTEM", `P2P ERROR: ${err.type} - RETRYING...`);
      setTimeout(startP2P, 4000);
    }
  });
}

function connectAsClient() {
  peer = new Peer(); // Assigns a random unique Peer ID

  peer.on('open', () => {
    hostConn = peer.connect(LOBBY_HOST_ID, {
      metadata: { name: playerName },
      reliable: true
    });

    hostConn.on('open', () => {
      appendMessage("SYSTEM", `CONNECTED TO P2P LOBBY AS ${playerName}`);
    });

    hostConn.on('data', (packet) => {
      if (packet.type === 'chat' || packet.type === 'sys') {
        displayPacket(packet);
      }
    });

    // If the Host closes their tab, elect a new Host automatically
    hostConn.on('close', () => {
      appendMessage("SYSTEM", "HOST DISCONNECTED - MIGRATING LOBBY...");
      peer.destroy();
      setTimeout(startP2P, 1500 + Math.random() * 1500);
    });
  });
}

function relayToClients(packet, excludePeerId = null) {
  for (const [id, conn] of clientConns.entries()) {
    if (id !== excludePeerId && conn.open) {
      conn.send(packet);
    }
  }
}

function broadcastSystem(text) {
  const packet = {
    type: 'sys',
    id: Date.now() + "_" + Math.random(),
    user: 'SYSTEM',
    text
  };
  displayPacket(packet);
  if (isHost) relayToClients(packet);
}

function sendChatMessage(text) {
  const packet = {
    type: 'chat',
    id: Date.now() + "_" + Math.random(),
    user: playerName,
    text
  };

  displayPacket(packet);

  if (isHost) {
    relayToClients(packet);
  } else if (hostConn && hostConn.open) {
    hostConn.send(packet);
  } else {
    appendMessage("SYSTEM", "NOT CONNECTED TO LOBBY YET...");
  }
}

function displayPacket(packet) {
  if (seenMsgIds.has(packet.id)) return;
  seenMsgIds.add(packet.id);
  appendMessage(packet.user, packet.text);
}

// Capture Enter key before Unity WebGL steals it
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && chatInput.value.trim() !== '') {
    e.preventDefault();
    e.stopImmediatePropagation();
    const text = chatInput.value.trim();
    chatInput.value = '';
    sendChatMessage(text);
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

startP2P();
