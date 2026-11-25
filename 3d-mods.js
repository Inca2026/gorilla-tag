(function initGorilla3DMods() {
  "use strict";

  // 1. Settings & State (Saved in localStorage)
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

  // Live Multiplayer State (0ms zero-delay updates)
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

  // 2. Mandatory Sign-In Gate Helper
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
      if (typeof window.toggleOverlay === "function") {
        window.toggleOverlay(true, "chat");
      } else {
        overlay.classList.remove("gtag-hidden");
      }
    }
  }

  // 3. Quaternion -> Camera Basis & 3D-to-2D Screen Projection
  function quatToBasis(q) {
    const { x, y, z, w } = q;
    const xx = x * x, yy = y * y, zz = z * z;
    const xy = x * y, xz = x * z, yz = y * z;
    const wx = w * x, wy = w * y, wz = w * z;

    const right = { x: 1 - 2 * (yy + zz), y: 2 * (xy + wz), z: 2 * (xz - wy) };
    const up = { x: 2 * (xy - wz), y: 1 - 2 * (xx + zz), z: 2 * (yz + wx) };
    const forward = { x: 2 * (xz + wy), y: 2 * (yz - wx), z: 1 - 2 * (xx + yy) };
    return { right, up, forward };
  }

  function projectWorldToScreen(worldPos, yOffset = 0, fovDeg = 75) {
    const dx = worldPos.x - State.localPos.x;
    const dy = (worldPos.y + yOffset) - State.localPos.y;
    const dz = worldPos.z - State.localPos.z;
    const dist = Math.hypot(dx, dy, dz);

    const { right, up, forward } = quatToBasis(State.localRot);
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
  // 4. Zero-Delay Photon WebSocket Hook (0ms Instant Packet Decoding)
  function decodePhotonPacket(buffer, isOutgoing) {
    if (!buffer || buffer.byteLength < 15) return;
    const view = new DataView(buffer);

    // Byte 0 must be Photon magic byte 0xf3
    if (view.getUint8(0) !== 0xf3) return;
    const msgType = view.getUint8(1);
    const eventCode = view.getUint8(2);

    // Event 255 (0xff): Room Join -> captures our own ActorNr
    if (!isOutgoing && msgType === 0x04 && eventCode === 0xff) {
      for (let i = 3; i < buffer.byteLength - 5; i++) {
        if (view.getUint8(i) === 0xfe && view.getUint8(i + 1) === 0x69) {
          const id = view.getInt32(i + 2, false);
          if (id > 0 && id  500 || Math.abs(z) > 500) return;

    if (isOutgoing) {
      State.localPos = { x, y, z };
      const qx = view.getFloat32(35, false);
      const qy = view.getFloat32(39, false);
      const qz = view.getFloat32(43, false);
      const qw = view.getFloat32(47, false);
      const qLen = Math.hypot(qx, qy, qz, qw);
      if (qLen > 0.9 && qLen < 1.1) {
        State.localRot = { x: qx / qLen, y: qy / qLen, z: qz / qLen, w: qw / qLen };
      }
      return;
    }

    let actorId = null;
    for (let i = buffer.byteLength - 12; i < buffer.byteLength - 5; i++) {
      if (view.getUint8(i) === 0xfe && view.getUint8(i + 1) === 0x69) {
        actorId = view.getInt32(i + 2, false);
        break;
      }
    }
    if (!actorId || actorId === State.myActorId) return;

    State.players[actorId] = {
      id: actorId,
      x,
      y,
      z,
      updatedAt: performance.now()
    };
  }

  const OriginalWebSocket = window.WebSocket;
  window.WebSocket = function (url, protocols) {
    const ws = protocols
      ? new OriginalWebSocket(url, protocols)
      : new OriginalWebSocket(url);

    const origSend = ws.send;
    ws.send = function (data) {
      if (data instanceof ArrayBuffer) decodePhotonPacket(data, true);
      else if (ArrayBuffer.isView(data)) decodePhotonPacket(data.buffer, true);
      return origSend.apply(this, arguments);
    };

    ws.addEventListener("message", async (event) => {
      if (event.data instanceof ArrayBuffer) {
        decodePhotonPacket(event.data, false);
      } else if (event.data instanceof Blob) {
        decodePhotonPacket(await event.data.arrayBuffer(), false);
      }
    });

    return ws;
  };
  window.WebSocket.prototype = OriginalWebSocket.prototype;
  window.WebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
  window.WebSocket.OPEN = OriginalWebSocket.OPEN;
  window.WebSocket.CLOSING = OriginalWebSocket.CLOSING;
  window.WebSocket.CLOSED = OriginalWebSocket.CLOSED;
  // 5. Matrix Relay Identity Bridge (ActorID <-> Element/Guest Username + VIP Status)
  function broadcastMyActorIdentity() {
    if (!State.myActorId || typeof window.sendRelayNotice !== "function") return;
    const name = window.getMyGorillaName ? window.getMyGorillaName() : "MONKE";
    const isVip = localStorage.getItem("gtag_mx_user") ? 1 : 0;
    const prefix = localStorage.getItem("gtag_banana_prefix") || "";
    window.sendRelayNotice(`[ACTOR_ID|${State.myActorId}|${name}|${isVip}|${prefix}]`);
  }

  window.handle3DRelayPacket = function (body) {
    if (!body || !body.startsWith("[ACTOR_ID|")) return false;
    const [rawId, name, vipFlag, prefix] = body.slice(10, -1).split("|");
    const id = parseInt(rawId, 10);
    if (!Number.isNaN(id) && name) {
      State.actorNames[id] = {
        name: name.slice(0, 16),
        isVip: vipFlag === "1",
        prefix: (prefix || "").slice(0, 10)
      };
    }
    return true;
  };

  setInterval(broadcastMyActorIdentity, 10000);

  // 6. Hologram Styles (Usernames & Crown ONLY — Sharp ESP Crosshair)
  const CROWN_SVG = `
    <svg class="holo-crown-svg" viewBox="0 0 24 16" width="24" height="16">
      <polygon points="1,14 3,4 8,9 12,2 16,9 21,4 23,14"
        fill="rgba(255, 215, 0, 0.32)" stroke="#ffe135" stroke-width="1.6" stroke-linejoin="round"/>
      <line x1="2" y1="11.5" x2="22" y2="11.5" stroke="#fff394" stroke-width="1"/>
    </svg>
  `;

  function injectStyles() {
    if (document.getElementById("gtag-3d-css")) return;
    const st = document.createElement("style");
    st.id = "gtag-3d-css";
    st.textContent = `
      @keyframes holoFloat {
        0%, 100% { transform: translate(-50%, -100%) translateY(0px); }
        50% { transform: translate(-50%, -100%) translateY(-3px); }
      }
      @keyframes holoFlicker {
        0%, 100% { opacity: 1; }
        48% { opacity: 0.96; }
        50% { opacity: 0.78; }
        52% { opacity: 0.98; }
      }
      @keyframes crownBob {
        0%, 100% { transform: translateY(0px) scaleX(1); }
        50% { transform: translateY(-2.5px) scaleX(0.94); }
      }
      #gtag-3d-overlay-layer {
        position: fixed; inset: 0; pointer-events: none; z-index: 9450; overflow: hidden;
      }
      .gtag-holo-wrap {
        position: absolute; display: flex; flex-direction: column; align-items: center; gap: 3px;
        animation: holoFloat 2.4s ease-in-out infinite; will-change: transform, left, top, opacity;
      }
      .holo-crown-svg {
        filter: drop-shadow(0 0 6px rgba(255, 225, 53, 0.85)) drop-shadow(0 0 12px rgba(255, 170, 0, 0.5));
        animation: crownBob 2s ease-in-out infinite, holoFlicker 3.5s infinite;
      }
      .gtag-holo-plate {
        position: relative;
        background: linear-gradient(180deg, rgba(20, 65, 35, 0.38) 0%, rgba(10, 30, 18, 0.52) 100%);
        border: 1px solid rgba(51, 255, 51, 0.75);
        box-shadow: 0 0 10px rgba(51, 255, 51, 0.45), inset 0 0 8px rgba(51, 255, 51, 0.25);
        backdrop-filter: blur(2px); color: #7dff7d;
        font-family: 'Press Start 2P', monospace; font-size: 7.5px;
        padding: 4px 7px; white-space: nowrap; text-shadow: 0 0 5px rgba(51, 255, 51, 0.9);
        animation: holoFlicker 4s infinite;
      }
      .gtag-holo-plate::after {
        content: ""; position: absolute; inset: 0;
        background: repeating-linear-gradient(0deg, rgba(255,255,255,0.08) 0px, rgba(255,255,255,0.08) 1px, transparent 1px, transparent 3px);
        pointer-events: none;
      }
      .gtag-holo-plate.vip-holo {
        background: linear-gradient(180deg, rgba(75, 55, 10, 0.42) 0%, rgba(35, 24, 4, 0.56) 100%);
        border-color: rgba(255, 225, 53, 0.85);
        box-shadow: 0 0 12px rgba(255, 195, 0, 0.55), inset 0 0 8px rgba(255, 215, 0, 0.3);
        color: #fff078; text-shadow: 0 0 6px rgba(255, 215, 0, 0.95);
      }
      .gtag-holo-beam {
        width: 1px; height: 8px; background: linear-gradient(180deg, rgba(51, 255, 51, 0.8), transparent);
      }
      .vip-holo + .gtag-holo-beam {
        background: linear-gradient(180deg, rgba(255, 225, 53, 0.9), transparent);
      }
      .gtag-esp-node {
        position: absolute; transform: translate(-50%, -50%);
        display: flex; flex-direction: column; align-items: center; gap: 5px;
        will-change: left, top;
      }
      .gtag-esp-crosshair { position: relative; width: 18px; height: 18px; }
      .gtag-esp-crosshair::before, .gtag-esp-crosshair::after {
        content: ""; position: absolute; background: #ff2a2a; box-shadow: 0 0 4px #ff0000;
      }
      .gtag-esp-crosshair::before { top: 8px; left: 0; width: 18px; height: 2px; }
      .gtag-esp-crosshair::after { left: 8px; top: 0; width: 2px; height: 18px; }
      .gtag-esp-raw-lbl {
        background: rgba(20, 0, 0, 0.78); border: 1px solid #ff3333;
        color: #ff6666; font-family: 'Press Start 2P', monospace; font-size: 6.5px;
        padding: 2px 5px; white-space: nowrap;
      }
      #gtag-radar-hud {
        position: fixed; bottom: 110px; right: 14px; width: 156px; height: 156px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(13, 24, 15, 0.92) 0%, rgba(7, 12, 8, 0.96) 100%);
        border: 3px solid #33ff33; box-shadow: 0 0 14px rgba(51, 255, 51, 0.28);
        z-index: 9500; box-sizing: border-box; pointer-events: none; overflow: hidden;
      }
      #gtag-radar-hud canvas { width: 100%; height: 100%; display: block; }
    `;
    document.head.appendChild(st);
  }

  // 7. Inject Controls into [SETTINGS] and [HACK] Tabs
  function injectMenuControls() {
    const settingsTab = document.getElementById("tab-settings");
    if (settingsTab && !document.getElementById("setting-row-nametags")) {
      const box = settingsTab.querySelector(".gtag-panel-box") || settingsTab;

      const tagRow = document.createElement("div");
      tagRow.id = "setting-row-nametags";
      tagRow.className = "gtag-setting-row";
      tagRow.innerHTML = `<span>HOLOGRAM NAMETAGS</span>
        <button type="button" id="btn-toggle-nametags" class="gtag-btn ${Storage.enabled ? "active" : ""}">${Storage.enabled ? "ON" : "OFF"}</button>`;

      const distRow = document.createElement("div");
      distRow.className = "gtag-setting-row";
      distRow.innerHTML = `<span>NAMETAG FADE DIST: <span id="lbl-nametag-dist" style="color:#ffaa00;">${Storage.maxDist}M</span></span>
        <input id="slider-nametag-dist" type="range" min="4" max="60" step="1" value="${Storage.maxDist}" style="width:140px;" />`;

      const radarRow = document.createElement("div");
      radarRow.className = "gtag-setting-row";
      radarRow.innerHTML = `<span>SONAR 2D RADAR</span>
        <button type="button" id="btn-toggle-radar" class="gtag-btn ${Storage.radarEnabled ? "active" : ""}">${Storage.radarEnabled ? "ON" : "OFF"}</button>`;

      box.append(tagRow, distRow, radarRow);

      document.getElementById("btn-toggle-nametags").onclick = function () {
        Storage.enabled = !Storage.enabled; Storage.save();
        this.textContent = Storage.enabled ? "ON" : "OFF";
        this.classList.toggle("active", Storage.enabled);
        window.playTerminalSfx?.("click");
      };

      document.getElementById("slider-nametag-dist").oninput = function () {
        Storage.maxDist = parseFloat(this.value); Storage.save();
        document.getElementById("lbl-nametag-dist").textContent = `${Storage.maxDist}M`;
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
        this.textContent = `ESP: ${Storage.espEnabled ? "ON" : "OFF"}`;
        this.classList.toggle("active", Storage.espEnabled);
        window.playTerminalSfx?.(Storage.espEnabled ? "vip" : "click");
        window.triggerModToast?.("HACK MODULE", `PLAYER ESP: ${Storage.espEnabled ? "ENABLED" : "DISABLED"}`);
      };
      btnGrid.appendChild(espBtn);
    }
  }
  // 8. Main 60+ FPS Render Loop (Hologram Nametags, ESP Reticles & Sonar Sweep Radar)
  function startRenderLoop() {
    const layer = document.createElement("div");
    layer.id = "gtag-3d-overlay-layer";
    document.body.appendChild(layer);

    const radarHud = document.createElement("div");
    radarHud.id = "gtag-radar-hud";
    if (!Storage.radarEnabled) radarHud.classList.add("gtag-hidden");
    const radarCanvas = document.createElement("canvas");
    radarCanvas.width = 156; radarCanvas.height = 156;
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
              ? `${info.isVip ? CROWN_SVG : ""}<div class="gtag-holo-plate ${info.isVip ? "vip-holo" : ""}">${info.prefix ? `[${info.prefix}] ` : ""}${info.name} [${espProj.dist.toFixed(0)}M]</div>`
              : `<div class="gtag-esp-raw-lbl">MONKE #${id} [${espProj.dist.toFixed(0)}M]</div>`;
            espEl.innerHTML = `<div class="gtag-esp-crosshair"></div>${subHtml}`;
            espEl.style.display = "flex"; espEl.style.left = `${espProj.x.toFixed(1)}px`; espEl.style.top = `${espProj.y.toFixed(1)}px`;
          } else if (espEl) espEl.style.display = "none";
        } else if (espEl) espEl.style.display = "none";

        if (Storage.enabled && info && !Storage.espEnabled) {
          const tagProj = projectWorldToScreen(p, 0.52);
          if (tagProj.visible && tagProj.dist <= Storage.maxDist) {
            if (!tagEl) { tagEl = document.createElement("div"); tagEl.className = "gtag-holo-wrap"; layer.appendChild(tagEl); State.tagEls[id] = tagEl; }
            const fadeStart = Storage.maxDist * 0.7;
            const opacity = tagProj.dist <= fadeStart ? 1 : Math.max(0, 1 - (tagProj.dist - fadeStart) / (Storage.maxDist - fadeStart));
            tagEl.innerHTML = `${info.isVip ? CROWN_SVG : ""}<div class="gtag-holo-plate ${info.isVip ? "vip-holo" : ""}">${info.prefix ? `[${info.prefix}] ` : ""}${info.name}</div><div class="gtag-holo-beam"></div>`;
            tagEl.style.display = "flex"; tagEl.style.opacity = opacity.toFixed(2);
            tagEl.style.left = `${tagProj.x.toFixed(1)}px`; tagEl.style.top = `${tagProj.y.toFixed(1)}px`;
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
      rCtx.strokeStyle = "rgba(51, 255, 51, 0.22)"; rCtx.lineWidth = 1;
      [0.33, 0.66, 1].forEach(r => { rCtx.beginPath(); rCtx.arc(cx, cy, maxR * r, 0, Math.PI * 2); rCtx.stroke(); });
      rCtx.beginPath(); rCtx.moveTo(cx, 6); rCtx.lineTo(cx, h - 6); rCtx.moveTo(6, cy); rCtx.lineTo(w - 6, cy); rCtx.stroke();

      for (let i = 0; i < 14; i++) {
        const a0 = State.sweepAngle - (i / 14) * 0.65, a1 = State.sweepAngle - ((i + 1) / 14) * 0.65;
        rCtx.fillStyle = `rgba(51, 255, 51, ${(0.22 * (1 - i / 14)).toFixed(3)})`;
        rCtx.beginPath(); rCtx.moveTo(cx, cy); rCtx.arc(cx, cy, maxR, a1, a0); rCtx.closePath(); rCtx.fill();
      }
      rCtx.strokeStyle = "#33ff33"; rCtx.lineWidth = 2; rCtx.beginPath(); rCtx.moveTo(cx, cy);
      rCtx.lineTo(cx + Math.cos(State.sweepAngle) * maxR, cy + Math.sin(State.sweepAngle) * maxR); rCtx.stroke();

      for (const id of Object.keys(State.players)) {
        const p = State.players[id];
        let pAngle = Math.atan2(-(p.z - State.localPos.z), p.x - State.localPos.x);
        if (pAngle < 0) pAngle += Math.PI * 2;
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
        rCtx.fillStyle = b.isVip ? `rgba(255, 225, 53, ${alpha})` : b.isModUser ? `rgba(255, 170, 0, ${alpha})` : `rgba(255, 68, 68, ${alpha})`;
        rCtx.beginPath(); rCtx.arc(bx, by, 3.8, 0, Math.PI * 2); rCtx.fill();
      }
      rCtx.fillStyle = "#33ff33"; rCtx.beginPath(); rCtx.arc(cx, cy, 3.5, 0, Math.PI * 2); rCtx.fill();
    }
    requestAnimationFrame(renderFrame);
  }

  function boot3DMods() {
    injectStyles();
    injectMenuControls();
    setTimeout(injectMenuControls, 1000);
    startRenderLoop();
    enforceMandatoryLoginGate();
  }
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", boot3DMods) : boot3DMods();
})();
