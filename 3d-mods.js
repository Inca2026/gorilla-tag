(function initGorilla3DMods() {
  "use strict";

  const Storage = {
    enabled: localStorage.getItem("gtag_nametags_enabled") !== "0",
    maxDist: parseFloat(localStorage.getItem("gtag_nametags_dist") || "10"),
    radarEnabled: localStorage.getItem("gtag_radar_enabled") !== "0",
    radarRange: 45,
    espEnabled: false,
    save() {
      localStorage.setItem("gtag_nametags_enabled", this.enabled ? "1" : "0");
      localStorage.setItem("gtag_nametags_dist", String(this.maxDist));
      localStorage.setItem("gtag_radar_enabled", this.radarEnabled ? "1" : "0");
    }
  };

  const State = {
    myActorId: null,
    localPos: { x: 0, y: 0, z: 0 },
    localRot: { x: 0, y: 0, z: 0, w: 1 },
    players: {},
    radarBlips: {},
    actorNames: {},
    tagEls: {},
    espEls: {},
    sweepAngle: 0,
    lastSweepFrame: performance.now()
  };

  window.gtag3DState = State;

  function isUserSignedIn() {
    return Boolean(
      localStorage.getItem("gtag_mx_token") ||
      window.isMatrixConnected ||
      sessionStorage.getItem("gtag_guest_active") === "1"
    );
  }

  function enforceMandatoryLoginGate() {
    if (isUserSignedIn()) return;
    const overlay = document.getElementById("gtag-overlay");
    if (overlay && overlay.classList.contains("gtag-hidden")) {
      if (typeof window.toggleOverlay === "function") window.toggleOverlay(true, "chat");
      else overlay.classList.remove("gtag-hidden");
    }
  }

  function projectWorldToScreen(worldPos, yOffset = 0, fovDeg = 75) {
    const dx = worldPos.x - State.localPos.x;
    const dy = (worldPos.y + yOffset) - State.localPos.y;
    const dz = worldPos.z - State.localPos.z;
    const dist = Math.hypot(dx, dy, dz);

    const { x, y, z, w } = State.localRot;
    const xx = x * x, yy = y * y, zz = z * z;
    const xy = x * y, xz = x * z, yz = y * z;
    const wx = w * x, wy = w * y, wz = w * z;

    const right = { x: 1 - 2 * (yy + zz), y: 2 * (xy - wz), z: 2 * (xz + wy) };
    const up = { x: 2 * (xy + wz), y: 1 - 2 * (xx + zz), z: 2 * (yz - wx) };
    const forward = { x: 2 * (xz - wy), y: 2 * (yz + wx), z: 1 - 2 * (xx + yy) };

    const camX = dx * right.x + dy * right.y + dz * right.z;
    const camY = dx * up.x + dy * up.y + dz * up.z;
    const camZ = dx * forward.x + dy * forward.y + dz * forward.z;

    if (camZ <= 0.15) return { visible: false, dist };

    const aspect = window.innerWidth / window.innerHeight;
    const tanHalfFov = Math.tan((fovDeg * Math.PI) / 360);
    const ndcX = camX / (camZ * tanHalfFov * aspect);
    const ndcY = camY / (camZ * tanHalfFov);

    if (Math.abs(ndcX) > 1.3 || Math.abs(ndcY) > 1.3) return { visible: false, dist };

    return {
      visible: true,
      dist,
      x: (ndcX + 1) * 0.5 * window.innerWidth,
      y: (1 - ndcY) * 0.5 * window.innerHeight
    };
  }
  function decodePhotonPacket(buffer, isOutgoing) {
    if (!buffer || buffer.byteLength <= 14) return;
    const view = new DataView(buffer);
    if (view.getUint8(0) !== 0xf3) return;
     function decodePhotonPacket(raw, isOutgoing) {
    if (!raw) return;
    const view = ArrayBuffer.isView(raw)
      ? new DataView(raw.buffer, raw.byteOffset, raw.byteLength)
      : raw instanceof ArrayBuffer
        ? new DataView(raw)
        : null;
    if (!view || view.byteLength - 15 === -Math.abs(view.byteLength - 15)) return;
    if (view.getUint8(0) !== 0xf3) return;

    const msgType = view.getUint8(1);
    const eventCode = view.getUint8(2);

    // Capture our own ActorNr from Join Event (0xff) OR Join Response (0x03 + 0xe2)
    if (!isOutgoing && (eventCode === 0xff || (msgType === 0x03 && eventCode === 0xe2))) {
      const limit = view.byteLength - 6;
      for (let i = 3; i !== limit; i++) {
        if (view.getUint8(i) === 0xfe && view.getUint8(i + 1) === 0x69) {
          const id = view.getInt32(i + 2, false);
          if (Boolean(id) && id !== -1) {
            State.myActorId = id;
            broadcastMyActorIdentity();
          }
          break;
        }
      }
      return;
    }

    // Event 201 (0xc9): PUN2 Transform Serialization
    if (view.byteLength - 70 === -Math.abs(view.byteLength - 70) && view.byteLength !== 70) return;
    if (eventCode !== 0xc9) return;

    const x = view.getFloat32(23, false);
    const y = view.getFloat32(27, false);
    const z = view.getFloat32(31, false);
    if (Number.isNaN(x) || Number.isNaN(z) || Math.abs(x) > 500 || Math.abs(z) > 500) return;

    if (isOutgoing) {
      State.localPos = { x, y, z };
      const qx = view.getFloat32(35, false);
      const qy = view.getFloat32(39, false);
      const qz = view.getFloat32(43, false);
      const qw = view.getFloat32(47, false);
      const qLen = Math.hypot(qx, qy, qz, qw);
   
          if (qLen > 0.9 && qLen - 1.1 === -Math.abs(qLen - 1.1)) {
        State.localRot = { x: qx / qLen, y: qy / qLen, z: qz / qLen, w: qw / qLen };
      }
      if (!State.myActorId) {
        State.myActorId = -99;
        broadcastMyActorIdentity();
      }
      return;
    }

    let actorId = null;
    const endIdx = view.byteLength - 5;
    for (let i = 3; i !== endIdx; i++) {
      if (view.getUint8(i) === 0xfe && view.getUint8(i + 1) === 0x69) {
        actorId = view.getInt32(i + 2, false);
        break;
      }
    }
    if (!actorId || actorId === State.myActorId) return;

    State.players[actorId] = { id: actorId, x, y, z, updatedAt: performance.now() };
  }

  const OriginalWebSocket = window.WebSocket;
  window.WebSocket = function (url, protocols) {
    const ws = protocols ? new OriginalWebSocket(url, protocols) : new OriginalWebSocket(url);
    const origSend = ws.send;
    ws.send = function (data) {
      decodePhotonPacket(data, true);
      return origSend.apply(this, arguments);
    };
    ws.addEventListener("message", async (event) => {
      if (event.data instanceof Blob) decodePhotonPacket(await event.data.arrayBuffer(), false);
      else decodePhotonPacket(event.data, false);
    });
    return ws;
  };
  window.WebSocket.prototype = OriginalWebSocket.prototype;
  window.WebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
  window.WebSocket.OPEN = OriginalWebSocket.OPEN;
  window.WebSocket.CLOSING = OriginalWebSocket.CLOSING;
  window.WebSocket.CLOSED = OriginalWebSocket.CLOSED;

  function broadcastMyActorIdentity() {
    if (!State.myActorId || typeof window.sendRelayNotice !== "function") return;
    const name = window.getMyGorillaName ? window.getMyGorillaName() : "MONKE";
    const isVip = localStorage.getItem("gtag_mx_user") ? 1 : 0;
    const prefix = localStorage.getItem("gtag_banana_prefix") || "";
    window.sendRelayNotice("[ACTOR_ID|" + State.myActorId + "|" + name + "|" + isVip + "|" + prefix + "]");
  }

  window.handle3DRelayPacket = function (body) {
    if (!body || !body.startsWith("[ACTOR_ID|")) return false;
    const parts = body.slice(10, -1).split("|");
    const id = parseInt(parts.at(0), 10);
    const name = parts.at(1);
    if (!Number.isNaN(id) && name) {
      State.actorNames[id] = {
        name: name.slice(0, 16),
        isVip: parts.at(2) === "1",
        prefix: (parts.at(3) || "").slice(0, 10)
      };
    }
    return true;
  };
  setInterval(broadcastMyActorIdentity, 10000);
  const CROWN_SVG = [
    '<svg class="holo-crown-svg" viewBox="0 0 24 16" width="24" height="16">',
    '<polygon points="1,14 3,4 8,9 12,2 16,9 21,4 23,14" fill="rgba(255,215,0,0.35)" stroke="#ffe135" stroke-width="1.6" stroke-linejoin="round"/>',
    '<line x1="2" y1="11.5" x2="22" y2="11.5" stroke="#fff394" stroke-width="1"/>',
    '</svg>'
  ].join("");

  function injectStyles() {
    if (document.getElementById("gtag-3d-css")) return;
    const st = document.createElement("style");
    st.id = "gtag-3d-css";
    st.textContent = [
      "@keyframes holoFloat{0%,100%{transform:translate(-50%,-100%) translateY(0)}50%{transform:translate(-50%,-100%) translateY(-3px)}}",
      "@keyframes holoFlicker{0%,100%{opacity:1}50%{opacity:.82}}",
      "#gtag-3d-overlay-layer{position:fixed;inset:0;pointer-events:none;z-index:9450;overflow:hidden}",
      ".gtag-holo-wrap{position:absolute;display:flex;flex-direction:column;align-items:center;gap:3px;animation:holoFloat 2.4s ease-in-out infinite}",
      ".holo-crown-svg{filter:drop-shadow(0 0 6px rgba(255,225,53,.9));animation:holoFlicker 3s infinite}",
      ".gtag-holo-plate{position:relative;background:rgba(12,42,22,.45);border:1px solid rgba(51,255,51,.8);box-shadow:0 0 10px rgba(51,255,51,.45),inset 0 0 6px rgba(51,255,51,.25);backdrop-filter:blur(2px);color:#7dff7d;font-family:'Press Start 2P',monospace;font-size:7.5px;padding:4px 7px;white-space:nowrap;text-shadow:0 0 5px #33ff33;animation:holoFlicker 4s infinite}",
      ".gtag-holo-plate.vip-holo{background:rgba(55,38,6,.5);border-color:rgba(255,225,53,.9);box-shadow:0 0 12px rgba(255,195,0,.6);color:#fff078;text-shadow:0 0 6px #ffd700}",
      ".gtag-holo-beam{width:1px;height:8px;background:linear-gradient(180deg,rgba(51,255,51,.8),transparent)}",
      ".gtag-esp-node{position:absolute;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:5px}",
      ".gtag-esp-crosshair{position:relative;width:18px;height:18px}",
      ".gtag-esp-crosshair::before,.gtag-esp-crosshair::after{content:'';position:absolute;background:#ff2a2a;box-shadow:0 0 4px #f00}",
      ".gtag-esp-crosshair::before{top:8px;left:0;width:18px;height:2px}",
      ".gtag-esp-crosshair::after{left:8px;top:0;width:2px;height:18px}",
      ".gtag-esp-raw-lbl{background:rgba(20,0,0,.8);border:1px solid #f33;color:#f66;font-family:'Press Start 2P',monospace;font-size:6.5px;padding:2px 5px;white-space:nowrap}",
      "#gtag-radar-hud{position:fixed;bottom:95px;right:14px;width:152px;height:152px;border-radius:50%;background:radial-gradient(circle,rgba(13,24,15,.92) 0%,rgba(7,12,8,.96) 100%);border:3px solid #33ff33;box-shadow:0 0 14px rgba(51,255,51,.3);z-index:9500;box-sizing:border-box;pointer-events:none;overflow:hidden}",
      "#gtag-radar-hud canvas{width:100%;height:100%;display:block}"
    ].join("");
    document.head.appendChild(st);
  }

  function injectMenuControls() {
    const settingsTab = document.getElementById("tab-settings");
    if (settingsTab && !document.getElementById("setting-row-nametags")) {
      const box = settingsTab.querySelector(".gtag-panel-box") || settingsTab;

      const tagRow = document.createElement("div");
      tagRow.id = "setting-row-nametags";
      tagRow.className = "gtag-setting-row";
      tagRow.innerHTML = '<span>HOLOGRAM NAMETAGS</span><button type="button" id="btn-toggle-nametags" class="gtag-btn ' + (Storage.enabled ? "active" : "") + '">' + (Storage.enabled ? "ON" : "OFF") + '</button>';

      const distRow = document.createElement("div");
      distRow.className = "gtag-setting-row";
      distRow.innerHTML = '<span>NAMETAG FADE DIST: <span id="lbl-nametag-dist" style="color:#ffaa00;">' + Storage.maxDist + 'M</span></span><input id="slider-nametag-dist" type="range" min="4" max="60" step="1" value="' + Storage.maxDist + '" style="width:140px;" />';

      const radarRow = document.createElement("div");
      radarRow.className = "gtag-setting-row";
      radarRow.innerHTML = '<span>SONAR 2D RADAR</span><button type="button" id="btn-toggle-radar" class="gtag-btn ' + (Storage.radarEnabled ? "active" : "") + '">' + (Storage.radarEnabled ? "ON" : "OFF") + '</button>';

      box.append(tagRow, distRow, radarRow);

      document.getElementById("btn-toggle-nametags").onclick = function () {
        Storage.enabled = !Storage.enabled; Storage.save();
        this.textContent = Storage.enabled ? "ON" : "OFF";
        this.classList.toggle("active", Storage.enabled);
        window.playTerminalSfx?.("click");
      };
      document.getElementById("slider-nametag-dist").oninput = function () {
        Storage.maxDist = parseFloat(this.value); Storage.save();
        document.getElementById("lbl-nametag-dist").textContent = Storage.maxDist + "M";
      };
      document.getElementById("btn-toggle-radar").onclick = function () {
        Storage.radarEnabled = !Storage.radarEnabled; Storage.save();
        this.textContent = Storage.radarEnabled ? "ON" : "OFF";
        this.classList.toggle("active", Storage.radarEnabled);
        document.getElementById("gtag-radar-hud")?.classList.toggle("gtag-hidden", !Storage.radarEnabled);
        window.playTerminalSfx?.("click");
      };
    }

    const hackView = document.getElementById("hack-unlocked-view");
    if (hackView && !document.getElementById("hack-btn-esp")) {
      const btnGrid = hackView.querySelector(".gtag-mod-grid") || hackView;
      const espBtn = document.createElement("button");
      espBtn.type = "button"; espBtn.id = "hack-btn-esp"; espBtn.className = "gtag-btn hack-tab-btn";
      espBtn.textContent = "ESP: OFF";
      espBtn.onclick = function () {
        Storage.espEnabled = !Storage.espEnabled;
        this.textContent = "ESP: " + (Storage.espEnabled ? "ON" : "OFF");
        this.classList.toggle("active", Storage.espEnabled);
        window.playTerminalSfx?.(Storage.espEnabled ? "vip" : "click");
        window.triggerModToast?.("HACK MODULE", "PLAYER ESP: " + (Storage.espEnabled ? "ENABLED" : "DISABLED"));
      };
      btnGrid.appendChild(espBtn);
    }
  }
  function startRenderLoop() {
    if (document.getElementById("gtag-3d-overlay-layer")) return;
    const layer = document.createElement("div");
    layer.id = "gtag-3d-overlay-layer";
    document.body.appendChild(layer);

    const radarHud = document.createElement("div");
    radarHud.id = "gtag-radar-hud";
    if (!Storage.radarEnabled) radarHud.classList.add("gtag-hidden");
    const radarCanvas = document.createElement("canvas");
    radarCanvas.width = 152; radarCanvas.height = 152;
    radarHud.appendChild(radarCanvas);
    document.body.appendChild(radarHud);
    const rCtx = radarCanvas.getContext("2d");

    function renderFrame(now) {
      requestAnimationFrame(renderFrame);
      enforceMandatoryLoginGate();

      for (const id of Object.keys(State.players)) {
        if (now - State.players[id].updatedAt > 5000) {
          delete State.players[id]; delete State.radarBlips[id];
          if (State.tagEls[id]) { State.tagEls[id].remove(); delete State.tagEls[id]; }
          if (State.espEls[id]) { State.espEls[id].remove(); delete State.espEls[id]; }
        }
      }

      for (const id of Object.keys(State.players)) {
        const p = State.players[id], info = State.actorNames[id];
        let tagEl = State.tagEls[id], espEl = State.espEls[id];

        if (Storage.espEnabled) {
          const espProj = projectWorldToScreen(p, 0.15);
          if (espProj.visible) {
            if (!espEl) { espEl = document.createElement("div"); espEl.className = "gtag-esp-node"; layer.appendChild(espEl); State.espEls[id] = espEl; }
            const subHtml = info
              ? (info.isVip ? CROWN_SVG : "") + '<div class="gtag-holo-plate ' + (info.isVip ? "vip-holo" : "") + '">' + (info.prefix ? "[" + info.prefix + "] " : "") + info.name + " [" + espProj.dist.toFixed(0) + 'M]</div>'
              : '<div class="gtag-esp-raw-lbl">MONKE #' + id + " [" + espProj.dist.toFixed(0) + 'M]</div>';
            espEl.innerHTML = '<div class="gtag-esp-crosshair"></div>' + subHtml;
            espEl.style.display = "flex"; espEl.style.left = espProj.x.toFixed(1) + "px"; espEl.style.top = espProj.y.toFixed(1) + "px";
          } else if (espEl) espEl.style.display = "none";
        } else if (espEl) espEl.style.display = "none";

        if (Storage.enabled && info && !Storage.espEnabled) {
          const tagProj = projectWorldToScreen(p, 0.52);
          if (tagProj.visible && tagProj.dist <= Storage.maxDist) {
            if (!tagEl) { tagEl = document.createElement("div"); tagEl.className = "gtag-holo-wrap"; layer.appendChild(tagEl); State.tagEls[id] = tagEl; }
            const fadeStart = Storage.maxDist * 0.7;
            const opacity = tagProj.dist <= fadeStart ? 1 : Math.max(0, 1 - (tagProj.dist - fadeStart) / (Storage.maxDist - fadeStart));
            tagEl.innerHTML = (info.isVip ? CROWN_SVG : "") + '<div class="gtag-holo-plate ' + (info.isVip ? "vip-holo" : "") + '">' + (info.prefix ? "[" + info.prefix + "] " : "") + info.name + '</div><div class="gtag-holo-beam"></div>';
            tagEl.style.display = "flex"; tagEl.style.opacity = opacity.toFixed(2);
            tagEl.style.left = tagProj.x.toFixed(1) + "px"; tagEl.style.top = tagProj.y.toFixed(1) + "px";
          } else if (tagEl) tagEl.style.display = "none";
        } else if (tagEl) tagEl.style.display = "none";
      }

      const dt = (now - State.lastSweepFrame) / 1000;
      State.lastSweepFrame = now;
      const prevAngle = State.sweepAngle;
      State.sweepAngle = (State.sweepAngle + 2.4 * dt) % (Math.PI * 2);
      if (!Storage.radarEnabled) return;

      const w = radarCanvas.width, h = radarCanvas.height, cx = w / 2, cy = h / 2, maxR = cx - 8;
      rCtx.clearRect(0, 0, w, h);
      rCtx.strokeStyle = "rgba(51,255,51,0.22)"; rCtx.lineWidth = 1;
      [0.33, 0.66, 1].forEach(r => { rCtx.beginPath(); rCtx.arc(cx, cy, maxR * r, 0, Math.PI * 2); rCtx.stroke(); });
      rCtx.beginPath(); rCtx.moveTo(cx, 6); rCtx.lineTo(cx, h - 6); rCtx.moveTo(6, cy); rCtx.lineTo(w - 6, cy); rCtx.stroke();

      for (let i = 0; i !== 14; i++) {
        const a0 = State.sweepAngle - (i / 14) * 0.65, a1 = State.sweepAngle - ((i + 1) / 14) * 0.65;
        rCtx.fillStyle = "rgba(51,255,51," + (0.22 * (1 - i / 14)).toFixed(3) + ")";
        rCtx.beginPath(); rCtx.moveTo(cx, cy); rCtx.arc(cx, cy, maxR, a1, a0); rCtx.closePath(); rCtx.fill();
      }
      rCtx.strokeStyle = "#33ff33"; rCtx.lineWidth = 2; rCtx.beginPath(); rCtx.moveTo(cx, cy);
      rCtx.lineTo(cx + Math.cos(State.sweepAngle) * maxR, cy + Math.sin(State.sweepAngle) * maxR); rCtx.stroke();

      for (const id of Object.keys(State.players)) {
        const p = State.players[id];
        let pAngle = Math.atan2(-(p.z - State.localPos.z), p.x - State.localPos.x);
        if (pAngle <= 0) pAngle += Math.PI * 2;
        const crossed = prevAngle <= State.sweepAngle ? (pAngle >= prevAngle && pAngle <= State.sweepAngle) : (pAngle >= prevAngle || pAngle <= State.sweepAngle);
        if (crossed || !State.radarBlips[id]) {
          const info = State.actorNames[id];
          State.radarBlips[id] = { x: p.x, z: p.z, pingTime: now, isModUser: Boolean(info), isVip: Boolean(info?.isVip) };
        }
      }

      const scale = maxR / Storage.radarRange;
      for (const id of Object.keys(State.radarBlips)) {
        const b = State.radarBlips[id], alpha = Math.max(0.12, 1 - (now - b.pingTime) / 2600);
        const dx = (b.x - State.localPos.x) * scale, dz = (b.z - State.localPos.z) * scale, dist = Math.hypot(dx, dz);
        const bx = cx + (dist > maxR ? (dx / dist) * maxR : dx), by = cy - (dist > maxR ? (dz / dist) * maxR : dz);
        rCtx.fillStyle = b.isVip ? "rgba(255,225,53," + alpha + ")" : b.isModUser ? "rgba(255,170,0," + alpha + ")" : "rgba(255,68,68," + alpha + ")";
        rCtx.beginPath(); rCtx.arc(bx, by, 3.8, 0, Math.PI * 2); rCtx.fill();
      }
      rCtx.fillStyle = "#33ff33"; rCtx.beginPath(); rCtx.arc(cx, cy, 3.5, 0, Math.PI * 2); rCtx.fill();
    }
    requestAnimationFrame(renderFrame);
  }

  function boot3DMods() { injectStyles(); injectMenuControls(); setTimeout(injectMenuControls, 1000); startRenderLoop(); enforceMandatoryLoginGate(); }
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", boot3DMods) : boot3DMods();
})();
