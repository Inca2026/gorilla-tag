(function initGorillaBananaExtension() {
  "use strict";

  const BananaStore = {
    PRICES: {
      prefix: 15, bananaVip: 25, privateChat: 30,
      themeYellow: 10, themeGrid: 10, themeVoid: 10,
      themeCrimson: 10, themeSynthwave: 10, themeFrost: 10, themeLava: 10,
      modBananaVision: 20, modHyperFov: 20, modDisco: 20
    },
    VIP_DURATION_MS: 15 * 60 * 1000,
    RANDOM_ALIAS: "#stump-network-random:matrix.org",
    BANANA_VIP_ALIAS: "#stump-network-banana-vip:matrix.org",
    FALLBACK_SERVER: "https://matrix.org",

    state: {
      bananas: parseInt(localStorage.getItem("gtag_bananas") || "0", 10),
      minuteProgressSec: 0,
      statsHudEnabled: localStorage.getItem("gtag_stats_hud_enabled") !== "0",
      unlocked: JSON.parse(localStorage.getItem("gtag_banana_unlocks") || "{}"),
      customPrefix: localStorage.getItem("gtag_banana_prefix") || "",
      activeTheme: localStorage.getItem("gtag_banana_theme") || "default",
      bananaVipExpiresAt: parseInt(localStorage.getItem("gtag_banana_vip_exp") || "0", 10),
      activeMods: JSON.parse(localStorage.getItem("gtag_banana_mods") || "{}")
    },

    save() {
      localStorage.setItem("gtag_bananas", String(this.state.bananas));
      localStorage.setItem("gtag_stats_hud_enabled", this.state.statsHudEnabled ? "1" : "0");
      localStorage.setItem("gtag_banana_unlocks", JSON.stringify(this.state.unlocked));
      localStorage.setItem("gtag_banana_prefix", this.state.customPrefix);
      localStorage.setItem("gtag_banana_theme", this.state.activeTheme);
      localStorage.setItem("gtag_banana_vip_exp", String(this.state.bananaVipExpiresAt));
      localStorage.setItem("gtag_banana_mods", JSON.stringify(this.state.activeMods));
    },

    hasBananaVip() { return Date.now() < this.state.bananaVipExpiresAt; },

    setBananas(amount) {
      this.state.bananas = Math.max(0, Math.floor(Number(amount) || 0));
      this.save();
      StatsHudModule.update();
      ShopModule.render();
    },

    trySpend(cost) {
      if (this.state.bananas < cost) {
        window.playTerminalSfx?.("error");
        window.triggerModToast?.("NOT ENOUGH BANANAS", `NEED ${cost} BN (EARN 1 BN / MIN)`);
        return false;
      }
      this.setBananas(this.state.bananas - cost);
      return true;
    }
  };

  const origGetItem = Storage.prototype.getItem;
  Storage.prototype.getItem = function (key) {
    const val = origGetItem.apply(this, arguments);
    if (key === "gtag_mx_token" && !val && BananaStore.hasBananaVip()) return "banana_vip_temp_token";
    return val;
  };
  const BananaNetwork = {
    randomRoomId: "",
    bananaRoomId: "",
    inBananaRoom: false,
    processedEventIds: new Set(),

    getMyPublicName() {
      const rawMxUser = origGetItem.call(localStorage, "gtag_mx_user");
      if (rawMxUser) {
        let clean = String(rawMxUser).split(":").at(0).replace(/^@/, "");
        const isDigits = clean.length > 0 && [...clean].every(c => c >= "0" && c <= "9");
        return isDigits ? `MONKE_${clean.slice(-4)}` : clean;
      }
      return sessionStorage.getItem("gtag_guest_nick") || origGetItem.call(localStorage, "gtag_saved_guest_nick") || "MONKE_GUEST";
    },

    getAuth() {
      const mxTok = origGetItem.call(localStorage, "gtag_mx_token");
      if (mxTok && mxTok !== "banana_vip_temp_token") {
        return { token: mxTok, server: origGetItem.call(localStorage, "gtag_mx_server") || BananaStore.FALLBACK_SERVER };
      }
      const guestTok = sessionStorage.getItem("gtag_guest_token");
      return guestTok ? { token: guestTok, server: BananaStore.FALLBACK_SERVER } : null;
    },

    async resolveRoom(alias) {
      const auth = this.getAuth();
      if (!auth) return null;
      try {
        const res = await this._origFetch(`${auth.server}/_matrix/client/v3/directory/room/${encodeURIComponent(alias)}`, { headers: { Authorization: `Bearer ${auth.token}` } });
        const data = await res.json();
        if (!data?.room_id) return null;
        await this._origFetch(`${auth.server}/_matrix/client/v3/join/${encodeURIComponent(data.room_id)}`, {
          method: "POST", headers: { Authorization: `Bearer ${auth.token}`, "Content-Type": "application/json" }, body: "{}"
        });
        return data.room_id;
      } catch (_) { return null; }
    },

    renderChatLine(senderId, rawBody) {
      const box = document.getElementById("chat-messages");
      if (!box) return;
      let user = senderId.split(":").at(0).replace(/^@/, ""), text = rawBody, isVip = user.toLowerCase() !== "meebo";
      if (text.startsWith("[GUEST:")) {
        const idx = text.indexOf("]");
        if (idx !== -1) { user = text.slice(7, idx); text = text.slice(idx + 2); isVip = false; }
      }
      const row = document.createElement("div"); row.className = "chat-line";
      row.innerHTML = `<span class="${isVip ? "chat-user vip-badge" : "chat-user"}">[${user}]: </span><span></span>`;
      row.lastElementChild.textContent = text;
      box.appendChild(row); box.scrollTop = box.scrollHeight;
    },

    async openBananaVipRoom() {
      this.inBananaRoom = true;
      const lbl = document.getElementById("matrix-room-label"), box = document.getElementById("chat-messages");
      if (lbl) lbl.textContent = "STUMP // #BANANA-VIP [PRIVATE]";
      if (box) box.innerHTML = `<div class="chat-line"><span class="chat-user">[SYSTEM]: </span><span>CONNECTING TO #STUMP-NETWORK-BANANA-VIP...</span></div>`;

      const auth = this.getAuth();
      if (!auth) return;
      if (!this.bananaRoomId) this.bananaRoomId = await this.resolveRoom(BananaStore.BANANA_VIP_ALIAS);
      if (!this.bananaRoomId) {
        if (box) box.innerHTML += `<div class="chat-line"><span class="chat-user">[SYSTEM]: </span><span>FAILED TO JOIN PRIVATE ROOM.</span></div>`;
        return;
      }
      if (box) box.innerHTML = `<div class="chat-line"><span class="chat-user">[SYSTEM]: </span><span>CONNECTED TO #BANANA-VIP</span></div>`;
      try {
        const res = await this._origFetch(`${auth.server}/_matrix/client/v3/rooms/${encodeURIComponent(this.bananaRoomId)}/messages?dir=b&limit=20`, { headers: { Authorization: `Bearer ${auth.token}` } });
        const data = await res.json();
        for (const ev of (data.chunk || []).reverse()) {
          if (ev.type === "m.room.message" && ev.content?.body) this.renderChatLine(ev.sender, ev.content.body);
        }
      } catch (_) {}
    },
    installFetchInterceptor() {
      const origFetch = window.fetch;
      window.fetch = async function (url, options) {
        if (typeof url === "string" && url.includes("/send/m.room.message/") && BananaNetwork.inBananaRoom && BananaNetwork.bananaRoomId && !url.includes(encodeURIComponent(BananaNetwork.bananaRoomId))) {
          try {
            const parsed = JSON.parse(options?.body || "{}");
            if (parsed.msgtype === "m.text") {
              url = url.replace(/\/rooms\/[^/]+\/send\//, `/rooms/${encodeURIComponent(BananaNetwork.bananaRoomId)}/send/`);
            }
          } catch (_) {}
        }

        if (typeof url === "string" && url.includes("/send/m.room.message/") && options?.body &&
            BananaStore.state.unlocked.prefix && BananaStore.state.customPrefix.trim()) {
          try {
            const parsed = JSON.parse(options.body);
            if (parsed.msgtype === "m.text" && typeof parsed.body === "string") {
              const tag = `[${BananaStore.state.customPrefix.trim().toUpperCase()}]`;
              if (parsed.body.startsWith("[GUEST:")) {
                const idx = parsed.body.indexOf("]");
                if (idx !== -1) parsed.body = `${parsed.body.slice(0, idx + 1)} ${tag} ${parsed.body.slice(idx + 2)}`;
              } else parsed.body = `${tag} ${parsed.body}`;
              options.body = JSON.stringify(parsed);
            }
          } catch (_) {}
        }

        const response = await origFetch.apply(this, arguments);
        if (typeof url === "string" && url.includes("/_matrix/client/v3/sync") && url.includes("since=") && response.ok) {
          try {
            const data = await response.clone().json();
            const myName = BananaNetwork.getMyPublicName().toLowerCase();
            for (const [roomId, roomData] of Object.entries(data?.rooms?.join || {})) {
              for (const ev of (roomData.timeline?.events || [])) {
                const body = ev?.content?.body;
                if (typeof body !== "string") continue;
                if (body.startsWith("[TIME:") || body.startsWith("[HACK|") || body.startsWith("[BANANA_SET|")) BananaNetwork.randomRoomId = roomId;

                if (roomId === BananaNetwork.bananaRoomId && BananaNetwork.inBananaRoom && ev.type === "m.room.message" && ev.event_id && !BananaNetwork.processedEventIds.has(ev.event_id)) {
                  BananaNetwork.processedEventIds.add(ev.event_id);
                  BananaNetwork.renderChatLine(ev.sender, body);
                }

                if (body.startsWith("[BANANA_SET|") && ev.event_id && !BananaNetwork.processedEventIds.has(ev.event_id)) {
                  BananaNetwork.processedEventIds.add(ev.event_id);
                  const [target, rawAmt] = body.slice(12, -1).split("|");
                  const parsedAmt = parseInt(rawAmt, 10);
                  if (target && (target === "ALL" || target.toLowerCase() === myName) && !Number.isNaN(parsedAmt)) {
                    BananaStore.setBananas(parsedAmt);
                    window.playTerminalSfx?.("vip");
                    window.triggerModToast?.("SYSTEM OVERRIDE", `BANANAS SET TO ${parsedAmt} BN BY REMOTE TERMINAL`);
                  }
                }
              }
            }
          } catch (_) {}
        }
        return response;
      };
      this._origFetch = origFetch;
    },

    async sendRemoteBananaSet(targetName, amount) {
      const auth = this.getAuth();
      if (!auth) { window.playTerminalSfx?.("error"); return window.triggerModToast?.("OFFLINE", "SIGN IN OR JOIN AS GUEST FIRST!"); }
      if (!this.randomRoomId) this.randomRoomId = await this.resolveRoom(BananaStore.RANDOM_ALIAS);
      if (!this.randomRoomId) { window.playTerminalSfx?.("error"); return window.triggerModToast?.("RELAY ERROR", "TELEMETRY ROOM NOT READY."); }
      await this._origFetch(`${auth.server}/_matrix/client/v3/rooms/${encodeURIComponent(this.randomRoomId)}/send/m.room.message/bn_${Date.now()}`, {
        method: "PUT", headers: { Authorization: `Bearer ${auth.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ msgtype: "m.notice", body: `[BANANA_SET|${targetName}|${amount}]` })
      }).catch(() => {});
      window.playTerminalSfx?.("send");
      window.triggerModToast?.("HACK EXECUTED", `SET ${targetName.toUpperCase()} BANANAS TO ${amount} BN`);
    }
  };
  const StatsHudModule = {
    init() {
      if (document.getElementById("gtag-stats-hud")) return;
      const hud = document.createElement("div");
      hud.id = "gtag-stats-hud";
      hud.innerHTML = `
        <div class="gtag-stats-header"><span>MONKE STATS</span><span id="stat-vip-tag"></span></div>
        <div class="gtag-stat-row"><span>USER:</span><span class="gtag-stat-val" id="stat-username">MONKE</span></div>
        <div class="gtag-stat-row"><span>PREFIX:</span><span class="gtag-stat-val" id="stat-prefix">NONE</span></div>
        <div class="gtag-stat-row"><span>PLAYTIME:</span><span class="gtag-stat-val" id="stat-playtime">00:00</span></div>
        <div class="gtag-stat-row"><span>BANANAS:</span><span class="gtag-stat-banana" id="stat-bananas">0 BN</span></div>`;
      document.body.appendChild(hud);
      this.applyVisibility();

      const hackPills = document.getElementById("gtag-hack-indicators");
      if (hackPills) hackPills.style.top = "158px";
      const keystrokes = document.getElementById("gtag-keystrokes");
      if (keystrokes && !keystrokes.style.top) keystrokes.style.bottom = "62px";

      try {
        const saved = JSON.parse(localStorage.getItem("gtag_hud_positions") || "{}");
        if (saved["gtag-stats-hud"]) Object.assign(hud.style, { left: saved["gtag-stats-hud"].left, top: saved["gtag-stats-hud"].top, right: "auto", bottom: "auto" });
      } catch (_) {}

      let dragging = false, startX = 0, startY = 0, origLeft = 0, origTop = 0;
      hud.addEventListener("mousedown", e => {
        if (!hud.classList.contains("hud-draggable-active")) return;
        dragging = true; const r = hud.getBoundingClientRect(); startX = e.clientX; startY = e.clientY; origLeft = r.left; origTop = r.top;
        hud.style.right = "auto"; hud.style.bottom = "auto"; e.preventDefault();
      });
      window.addEventListener("mousemove", e => { if (dragging) { hud.style.left = `${Math.max(0, Math.min(window.innerWidth - 60, origLeft + e.clientX - startX))}px`; hud.style.top = `${Math.max(0, Math.min(window.innerHeight - 30, origTop + e.clientY - startY))}px`; } });
      window.addEventListener("mouseup", () => { if (dragging) { dragging = false; const s = JSON.parse(localStorage.getItem("gtag_hud_positions") || "{}"); s["gtag-stats-hud"] = { left: hud.style.left, top: hud.style.top }; localStorage.setItem("gtag_hud_positions", JSON.stringify(s)); } });

      if (typeof window.toggleHudEditMode === "function") {
        const orig = window.toggleHudEditMode;
        window.toggleHudEditMode = (f = null) => {
          orig(f);
          const editing = !document.getElementById("gtag-hud-edit-banner")?.classList.contains("gtag-hidden");
          if (editing) hud.classList.remove("gtag-hidden");
          else this.applyVisibility();
          hud.classList.toggle("hud-draggable-active", editing);
        };
      }
      if (typeof window.resetHudPositions === "function") {
        const orig = window.resetHudPositions;
        window.resetHudPositions = () => { orig(); hud.style.cssText = ""; this.applyVisibility(); };
      }
      this.injectModToggle();
    },

    injectModToggle() {
      const modGrid = document.querySelector("#tab-mods .gtag-mod-grid");
      if (!modGrid || document.getElementById("mod-monkestats")) return;
      const btn = document.createElement("button");
      btn.type = "button"; btn.id = "mod-monkestats"; btn.className = "gtag-btn";
      btn.onclick = () => {
        BananaStore.state.statsHudEnabled = !BananaStore.state.statsHudEnabled;
        BananaStore.save();
        this.applyVisibility();
        window.playTerminalSfx?.("click");
        window.triggerModToast?.("GORILLA OS MOD", `MONKE STATS: ${BananaStore.state.statsHudEnabled ? "ENABLED" : "DISABLED"}`);
      };
      modGrid.insertBefore(btn, modGrid.firstChild);
      this.applyVisibility();
    },

    applyVisibility() {
      const hud = document.getElementById("gtag-stats-hud");
      const btn = document.getElementById("mod-monkestats");
      const on = BananaStore.state.statsHudEnabled;
      hud?.classList.toggle("gtag-hidden", !on);
      if (btn) { btn.textContent = `MONKE STATS: ${on ? "ON" : "OFF"}`; btn.classList.toggle("active", on); }
    },

    update() {
      const totalSec = parseInt(origGetItem.call(localStorage, "gtag_total_playtime") || "0", 10);
      const h = Math.floor(totalSec / 3600), m = Math.floor((totalSec % 3600) / 60), s = totalSec % 60;
      const pad = n => String(n).padStart(2, "0");
      const rawMxUser = origGetItem.call(localStorage, "gtag_mx_user");

      const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
      setTxt("stat-username", BananaNetwork.getMyPublicName().slice(0, 12));
      setTxt("stat-prefix", BananaStore.state.unlocked.prefix && BananaStore.state.customPrefix ? `[${BananaStore.state.customPrefix}]` : "NONE");
      setTxt("stat-playtime", h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`);
      setTxt("stat-bananas", `${BananaStore.state.bananas} BN`);
      setTxt("stat-vip-tag", rawMxUser ? "[VIP]" : (BananaStore.hasBananaVip() ? "[B-VIP]" : ""));
    }
  };
  const HackBananaModule = {
    init() {
      const view = document.getElementById("hack-unlocked-view");
      if (!view || document.getElementById("hack-banana-panel")) return;
      const panel = document.createElement("div");
      panel.id = "hack-banana-panel"; panel.className = "gtag-panel-box"; panel.style.cssText = "margin-top:10px; border-color:#ff4444;";
      panel.innerHTML = `<div style="font-size:8px; color:#ff6666; margin-bottom:8px;">BANANA ECONOMY OVERRIDE</div>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <input id="hack-banana-amount" type="number" min="0" max="999999" value="100" style="width:110px; background:#0a0202; border:1px solid #ff4444; color:#ff6666; font-family:'Press Start 2P', monospace; font-size:9px; padding:6px;" />
          <button type="button" class="gtag-btn hack-tab-btn" id="btn-hack-set-self">SET MY BN</button>
          <button type="button" class="gtag-btn hack-tab-btn" id="btn-hack-set-target">SET TARGET BN</button>
        </div>`;
      view.appendChild(panel);

      const inp = document.getElementById("hack-banana-amount");
      ["keydown", "keyup", "keypress"].forEach(evt => inp?.addEventListener(evt, e => e.stopPropagation()));
      document.getElementById("btn-hack-set-self")?.addEventListener("click", () => {
        const val = parseInt(inp?.value || "0", 10);
        if (!Number.isNaN(val) && val >= 0) { BananaStore.setBananas(val); window.playTerminalSfx?.("vip"); window.triggerModToast?.("SELF OVERRIDE", `MY BANANAS SET TO ${val} BN`); }
      });
      document.getElementById("btn-hack-set-target")?.addEventListener("click", () => {
        const val = parseInt(inp?.value || "0", 10);
        if (Number.isNaN(val) || val < 0) return;
        const target = (document.getElementById("hack-selected-label")?.textContent || "").replace(/^TARGET:\s*/i, "").trim() || "ALL";
        if (target === "ALL" || target.toLowerCase() === BananaNetwork.getMyPublicName().toLowerCase()) BananaStore.setBananas(val);
        BananaNetwork.sendRemoteBananaSet(target, val);
      });
    }
  };

  const ShopModule = {
    discoHue: 0,

    injectStyles() {
      if (document.getElementById("banana-shop-styles")) return;
      const style = document.createElement("style");
      style.id = "banana-shop-styles";
      style.textContent = `
        #gtag-stats-hud { position: fixed; top: 16px; left: 16px; width: 280px; background: rgba(13, 18, 13, 0.9); border: 3px solid #ffe135; color: #33ff33; padding: 13px; z-index: 9500; font-size: 10px; }
        .gtag-stats-header { display: flex; justify-content: space-between; border-bottom: 2px solid #ffe135; padding-bottom: 7px; margin-bottom: 8px; color: #ffe135; font-size: 10px; }
        .gtag-stat-row { display: flex; justify-content: space-between; margin-bottom: 6px; }
        .gtag-stat-val { color: #ffffff; } .gtag-stat-banana { color: #ffe135; }
        #gtag-leaderboard { width: 295px !important; padding: 13px !important; font-size: 10px !important; border-width: 3px !important; }
        .gtag-lb-header { font-size: 10px !important; padding-bottom: 7px !important; margin-bottom: 8px !important; border-bottom-width: 2px !important; }
        .lb-row { font-size: 9.5px !important; }
        #gtag-hud-hint { font-size: 10px !important; padding: 10px 14px !important; border-width: 3px !important; }
        #gtag-keystrokes { bottom: 62px !important; grid-template-columns: repeat(3, 40px) !important; gap: 5px !important; }
        .gtag-key-cap { height: 40px !important; font-size: 12px !important; border-width: 3px !important; }
        #gtag-hack-indicators { top: 158px !important; }
        .gtag-hack-pill { font-size: 10px !important; padding: 9px 12px !important; }
        .gtag-btn.banana-tab-btn { border-color: #ffe135; color: #ffe135; }
        .gtag-btn.banana-tab-btn:hover, .gtag-btn.banana-tab-btn.active { background: #ffe135; color: #141c14; }
        .banana-shop-header { display: flex; justify-content: space-between; align-items: center; border: 2px solid #ffe135; background: #1d1a08; padding: 10px; margin-bottom: 10px; font-size: 9px; }
        .banana-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; max-height: 230px; overflow-y: auto; padding-right: 4px; }
        .banana-grid::-webkit-scrollbar { width: 6px; } .banana-grid::-webkit-scrollbar-thumb { background: #ffe135; }
        .banana-card { border: 2px solid #3a3512; background: #111007; padding: 10px; display: flex; flex-direction: column; justify-content: space-between; gap: 6px; }
        .banana-card-title { font-size: 8px; color: #ffe135; } .banana-card-desc { font-size: 7px; color: #bbb; line-height: 1.5; }
        .banana-buy-btn { background: #2b260b; color: #ffe135; border: 2px solid #ffe135; padding: 6px; font-family: 'Press Start 2P', monospace; font-size: 7px; cursor: pointer; }
        .banana-buy-btn:hover { background: #ffe135; color: #111007; }
        .banana-buy-btn.owned { border-color: #33ff33; color: #33ff33; background: #122212; }
        #banana-prefix-input { width: 100%; background: #0a0a04; border: 1px solid #ffe135; color: #ffe135; font-family: 'Press Start 2P', monospace; font-size: 8px; padding: 5px; box-sizing: border-box; }
        .gtag-terminal.theme-yellow { background: #1c1908 !important; border-color: #ffe135 !important; box-shadow: 0 0 28px rgba(255, 225, 53, 0.4) !important; color: #ffe135 !important; }
        .gtag-terminal.theme-grid { background-color: #0b141a !important; background-image: linear-gradient(rgba(0, 229, 255, 0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 229, 255, 0.12) 1px, transparent 1px) !important; background-size: 20px 20px !important; border-color: #00e5ff !important; color: #00e5ff !important; }
        .gtag-terminal.theme-void { background: radial-gradient(circle at top, #1b0b2e 0%, #07030d 100%) !important; border-color: #c77dff !important; color: #e0aaff !important; }
        .gtag-terminal.theme-crimson { background: linear-gradient(180deg, #210707 0%, #0d0202 100%) !important; border-color: #ff3333 !important; box-shadow: 0 0 28px rgba(255, 51, 51, 0.4) !important; color: #ff5555 !important; }
        .gtag-terminal.theme-synthwave { background: linear-gradient(135deg, #240b36 0%, #0f0524 100%) !important; border-color: #ff2a85 !important; box-shadow: 0 0 28px rgba(255, 42, 133, 0.4) !important; color: #ff70a6 !important; }
        .gtag-terminal.theme-frost { background: linear-gradient(180deg, #0b1f29 0%, #061017 100%) !important; border-color: #80edff !important; box-shadow: 0 0 28px rgba(128, 237, 255, 0.35) !important; color: #caf0f8 !important; }
        .gtag-terminal.theme-lava { background: radial-gradient(circle at bottom, #2b0f03 0%, #0f0501 100%) !important; border-color: #ff6b00 !important; box-shadow: 0 0 28px rgba(255, 107, 0, 0.4) !important; color: #ff9e00 !important; }`;
      document.head.appendChild(style);
    },
    initTab() {
      const term = document.querySelector(".gtag-terminal"), header = document.querySelector(".gtag-header");
      if (!term || !header || document.getElementById("btn-tab-shop")) return;
      const tabContainer = document.getElementById("btn-tab-settings")?.parentElement || header;

      const btn = document.createElement("button");
      btn.type = "button"; btn.id = "btn-tab-shop"; btn.className = "gtag-btn banana-tab-btn"; btn.textContent = "[SHOP]";
      btn.onclick = () => window.switchTab("shop");
      const settingsBtn = document.getElementById("btn-tab-settings");
      settingsBtn ? tabContainer.insertBefore(btn, settingsBtn) : tabContainer.appendChild(btn);

      const panel = document.createElement("div");
      panel.id = "tab-shop"; panel.className = "gtag-hidden";
      panel.innerHTML = `<div class="banana-shop-header"><span>BANANA SHOP (+1 BN / MIN)</span><span id="shop-balance-lbl" style="color:#ffe135;">BALANCE: 0 BN</span></div><div class="banana-grid" id="banana-shop-items"></div>`;
      term.appendChild(panel);

      if (typeof window.switchTab === "function") {
        const orig = window.switchTab;
        window.switchTab = tab => { orig(tab); document.getElementById("tab-shop")?.classList.toggle("gtag-hidden", tab !== "shop"); document.getElementById("btn-tab-shop")?.classList.toggle("active", tab === "shop"); if (tab === "shop") ShopModule.render(); };
      }
    },

    render() {
      const bal = document.getElementById("shop-balance-lbl"), grid = document.getElementById("banana-shop-items");
      if (!grid) return;
      if (bal) bal.textContent = `BALANCE: ${BananaStore.state.bananas} BN`;
      const P = BananaStore.PRICES, U = BananaStore.state.unlocked, M = BananaStore.state.activeMods, T = BananaStore.state.activeTheme;
      const vipMin = BananaStore.hasBananaVip() ? Math.ceil((BananaStore.state.bananaVipExpiresAt - Date.now()) / 60000) : 0;

      const items = [
        { id: "prefix", title: "CUSTOM CHAT PREFIX", desc: "Custom tag before your name in chat & Stats HUD.", owned: U.prefix, btn: U.prefix ? "SAVE PREFIX" : `BUY (${P.prefix} BN)`, extra: U.prefix ? `<input id="banana-prefix-input" maxlength="10" placeholder="TAG (E.G. KING)" value="${BananaStore.state.customPrefix}" />` : "" },
        { id: "bananaVip", title: "BANANA VIP (15 MINS)", desc: "Temp access to [VIP] menu, VIP mods & VIP soundboard!", owned: BananaStore.hasBananaVip(), btn: BananaStore.hasBananaVip() ? `ACTIVE (${vipMin}M) +15M` : `RENT (${P.bananaVip} BN)` },
        { id: "privateChat", title: "PRIVATE BANANA CHAT", desc: "Unlock the live #banana-vip channel in Chat.", owned: U.privateChat, btn: U.privateChat ? "OPEN PRIVATE ROOM" : `UNLOCK (${P.privateChat} BN)` },
        { id: "themeYellow", title: "THEME: BANANA YELLOW", desc: "Bright yellow Gorilla OS border & golden terminal.", owned: U.themeYellow, btn: U.themeYellow ? (T === "yellow" ? "EQUIPPED" : "EQUIP THEME") : `BUY (${P.themeYellow} BN)` },
        { id: "themeGrid", title: "THEME: CYBER GRID", desc: "Neon cyan blueprint grid terminal background.", owned: U.themeGrid, btn: U.themeGrid ? (T === "grid" ? "EQUIPPED" : "EQUIP THEME") : `BUY (${P.themeGrid} BN)` },
        { id: "themeVoid", title: "THEME: MIDNIGHT VOID", desc: "Deep purple cosmic gradient terminal theme.", owned: U.themeVoid, btn: U.themeVoid ? (T === "void" ? "EQUIPPED" : "EQUIP THEME") : `BUY (${P.themeVoid} BN)` },
        { id: "themeCrimson", title: "THEME: CRIMSON BREACH", desc: "Red alert hacker terminal theme & border.", owned: U.themeCrimson, btn: U.themeCrimson ? (T === "crimson" ? "EQUIPPED" : "EQUIP THEME") : `BUY (${P.themeCrimson} BN)` },
        { id: "themeSynthwave", title: "THEME: SYNTHWAVE", desc: "Hot pink and retro magenta sunset gradient.", owned: U.themeSynthwave, btn: U.themeSynthwave ? (T === "synthwave" ? "EQUIPPED" : "EQUIP THEME") : `BUY (${P.themeSynthwave} BN)` },
        { id: "themeFrost", title: "THEME: ARCTIC FROST", desc: "Icy glacier blue and crisp frost terminal.", owned: U.themeFrost, btn: U.themeFrost ? (T === "frost" ? "EQUIPPED" : "EQUIP THEME") : `BUY (${P.themeFrost} BN)` },
        { id: "themeLava", title: "THEME: LAVA CORE", desc: "Molten orange and volcanic dark red glow.", owned: U.themeLava, btn: U.themeLava ? (T === "lava" ? "EQUIPPED" : "EQUIP THEME") : `BUY (${P.themeLava} BN)` },
        { id: "modBananaVision", title: "MOD: BANANA VISION", desc: "Turns the entire world into glowing golden vision.", owned: U.modBananaVision, btn: U.modBananaVision ? (M.bananaVision ? "MOD: ON" : "MOD: OFF") : `BUY (${P.modBananaVision} BN)` },
        { id: "modHyperFov", title: "MOD: HYPER SPEED FOV", desc: "Extreme wide-angle zoom for parkour awareness.", owned: U.modHyperFov, btn: U.modHyperFov ? (M.hyperFov ? "MOD: ON" : "MOD: OFF") : `BUY (${P.modHyperFov} BN)` },
        { id: "modDisco", title: "MOD: DISCO MONKE", desc: "High-contrast strobe hue shifting on the canvas.", owned: U.modDisco, btn: U.modDisco ? (M.disco ? "MOD: ON" : "MOD: OFF") : `BUY (${P.modDisco} BN)` },
        { id: "themeDefault", title: "DEFAULT OS THEME", desc: "Restore classic green Gorilla OS terminal style.", owned: true, btn: T === "default" ? "EQUIPPED" : "EQUIP DEFAULT" }
      ];

      grid.innerHTML = items.map(i => `<div class="banana-card"><div><div class="banana-card-title">${i.title}</div><div class="banana-card-desc">${i.desc}</div>${i.extra || ""}</div><button class="banana-buy-btn ${i.owned ? "owned" : ""}" onclick="window.bananaShopAction('${i.id}')">${i.btn}</button></div>`).join("");
      const inp = document.getElementById("banana-prefix-input");
      ["keydown", "keyup", "keypress"].forEach(evt => inp?.addEventListener(evt, e => e.stopPropagation()));
    },

    applyTheme() {
      const term = document.querySelector(".gtag-terminal");
      if (!term) return;
      term.classList.remove("theme-yellow", "theme-grid", "theme-void", "theme-crimson", "theme-synthwave", "theme-frost", "theme-lava");
      if (BananaStore.state.activeTheme !== "default") term.classList.add(`theme-${BananaStore.state.activeTheme}`);
    },
    applyMods() {
      const canvas = document.getElementById("unity-canvas");
      if (!canvas) return;
      const M = BananaStore.state.activeMods;
      if (M.hyperFov) canvas.style.transform = "scale(1.48, 1.48)";
      if (M.bananaVision) canvas.style.filter = "sepia(1) hue-rotate(12deg) saturate(420%) brightness(115%) contrast(125%)";
      else if (M.disco) { this.discoHue = (this.discoHue + 25) % 360; canvas.style.filter = `hue-rotate(${this.discoHue}deg) saturate(260%) contrast(140%)`; }
    },

    injectPrivateRoom() {
      if (!BananaStore.state.unlocked.privateChat) return;
      const sidebar = document.getElementById("room-sidebar-list");
      if (!sidebar) return;
      sidebar.querySelectorAll(".gtag-room-item:not(#btn-banana-private-room)").forEach(el => {
        if (!el.dataset.bnHooked) {
          el.dataset.bnHooked = "1";
          el.addEventListener("click", () => { BananaNetwork.inBananaRoom = false; document.getElementById("btn-banana-private-room")?.classList.remove("active"); });
        }
      });
      if (document.getElementById("btn-banana-private-room")) return;
      const btn = document.createElement("button");
      btn.type = "button"; btn.id = "btn-banana-private-room"; btn.className = "gtag-room-item"; btn.style.color = "#ffe135"; btn.textContent = "#banana-vip";
      btn.onclick = () => {
        window.playTerminalSfx?.("tab");
        sidebar.querySelectorAll(".gtag-room-item").forEach(el => el.classList.remove("active"));
        btn.classList.add("active");
        BananaNetwork.openBananaVipRoom();
      };
      sidebar.appendChild(btn);
    }
  };

  window.bananaShopAction = function (item) {
    const P = BananaStore.PRICES, S = BananaStore.state;
    if (item === "themeDefault") { S.activeTheme = "default"; ShopModule.applyTheme(); BananaStore.save(); return ShopModule.render(); }
    if (item === "prefix") {
      if (!S.unlocked.prefix) { if (!BananaStore.trySpend(P.prefix)) return; S.unlocked.prefix = true; S.customPrefix = "BANANA"; window.playTerminalSfx?.("vip"); }
      else { const inp = document.getElementById("banana-prefix-input"); if (inp) S.customPrefix = inp.value.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 10); window.playTerminalSfx?.("send"); }
      BananaStore.save(); StatsHudModule.update(); return ShopModule.render();
    }
    if (item === "bananaVip") {
      if (!BananaStore.trySpend(P.bananaVip)) return;
      S.bananaVipExpiresAt = (BananaStore.hasBananaVip() ? S.bananaVipExpiresAt : Date.now()) + BananaStore.VIP_DURATION_MS;
      BananaStore.save(); window.syncModUI?.(); window.playTerminalSfx?.("vip");
      window.triggerModToast?.("BANANA VIP ACTIVE!", "VIP TAB, MODS & SOUNDS UNLOCKED!"); return ShopModule.render();
    }
    if (item === "privateChat") {
      if (!S.unlocked.privateChat) { if (!BananaStore.trySpend(P.privateChat)) return; S.unlocked.privateChat = true; BananaStore.save(); window.playTerminalSfx?.("vip"); }
      ShopModule.injectPrivateRoom(); window.switchTab?.("chat"); return document.getElementById("btn-banana-private-room")?.click();
    }
    const themes = { themeYellow: "yellow", themeGrid: "grid", themeVoid: "void", themeCrimson: "crimson", themeSynthwave: "synthwave", themeFrost: "frost", themeLava: "lava" };
    if (themes[item]) {
      if (!S.unlocked[item]) { if (!BananaStore.trySpend(P[item])) return; S.unlocked[item] = true; window.playTerminalSfx?.("vip"); } else window.playTerminalSfx?.("click");
      S.activeTheme = themes[item]; ShopModule.applyTheme(); BananaStore.save(); return ShopModule.render();
    }
    const mods = { modBananaVision: "bananaVision", modHyperFov: "hyperFov", modDisco: "disco" };
    if (mods[item]) {
      if (!S.unlocked[item]) { if (!BananaStore.trySpend(P[item])) return; S.unlocked[item] = true; S.activeMods[mods[item]] = true; window.playTerminalSfx?.("vip"); }
      else { S.activeMods[mods[item]] = !S.activeMods[mods[item]]; window.playTerminalSfx?.("click"); }
      BananaStore.save(); ShopModule.applyMods(); ShopModule.render();
    }
  };

  BananaNetwork.installFetchInterceptor();
  function bootBananaExtension() {
    ShopModule.injectStyles(); StatsHudModule.init(); ShopModule.initTab(); HackBananaModule.init(); ShopModule.applyTheme(); StatsHudModule.update();
    let wasVip = BananaStore.hasBananaVip();
    setInterval(() => {
      if (++BananaStore.state.minuteProgressSec >= 60) {
        BananaStore.state.minuteProgressSec = 0;
        BananaStore.setBananas(BananaStore.state.bananas + 1);
        window.triggerModToast?.("BANANA EARNED!", `+1 BANANA! TOTAL: ${BananaStore.state.bananas} BN`);
      }
      const nowVip = BananaStore.hasBananaVip();
      if (wasVip && !nowVip) { window.syncModUI?.(); window.triggerModToast?.("BANANA VIP EXPIRED", "RENT AGAIN IN THE [SHOP] TAB!"); }
      wasVip = nowVip;
      if (BananaStore.state.unlocked.privateChat) ShopModule.injectPrivateRoom();
      if (BananaStore.state.activeMods.bananaVision || BananaStore.state.activeMods.hyperFov || BananaStore.state.activeMods.disco) ShopModule.applyMods();
      StatsHudModule.update();
    }, 1000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootBananaExtension);
  else bootBananaExtension();
})();
