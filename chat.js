import { initializeApp } from "https://gstatic.com";
import { getDatabase, ref, push, onChildAdded, query, limitToLast } from "https://gstatic.com";

// REPLACE WITH YOUR FIREBASE CONFIG
const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  databaseURL: "https://firebaseio.com",
  projectId: "YOUR-PROJECT-ID"
};

if (firebaseConfig.apiKey !== "YOUR_FIREBASE_API_KEY") {
  const app = initializeApp(firebaseConfig);
  const db = getDatabase(app);
  const chatRef = ref(db, 'gtag_global_chat');
  const playerName = "MONKE_" + Math.floor(1000 + Math.random() * 9000);

  document.getElementById('chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.value.trim() !== '') {
      push(chatRef, { user: playerName, text: e.target.value.trim(), timestamp: Date.now() });
      e.target.value = '';
    }
  });

  onChildAdded(query(chatRef, limitToLast(30)), (snapshot) => {
    const data = snapshot.val();
    const msgBox = document.getElementById('chat-messages');
    const line = document.createElement('div');
    line.className = 'chat-line';
    line.innerHTML = `<span class="chat-user">[${escapeHTML(data.user)}]:</span> ${escapeHTML(data.text)}`;
    msgBox.appendChild(line);
    msgBox.scrollTop = msgBox.scrollHeight;
  });
}

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag]));
}
