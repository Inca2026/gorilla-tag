(function initGorillaBananaExtension() {
  "use strict";

  const BananaStore = {
    PRICES: {
      prefix: 15, bananaVip: 25, privateChat: 30,
      themeYellow: 10, themeGrid: 10, themeVoid: 10,
      modBananaVision: 20, modHyperFov: 20, modDisco: 20
    },
    VIP_DURATION_MS: 15 * 60 * 1000,
    RANDOM_ALIAS: "#stump-network-random:matrix.org",
    FALLBACK_SERVER: "https://matrix.org",

    state: {
      bananas: parseInt(localStorage.getItem("gtag_bananas") || "0", 10),
      minuteProgressSec: 0,
      unlocked: JSON.parse(localStorage.getItem("gtag_banana_unlocks") || "{}"),
      customPrefix: localStorage.getItem("gtag_banana_prefix") || "",
      activeTheme: localStorage.getItem("gtag_banana_theme") || "default",
      bananaVipExpiresAt: parseInt(localStorage.getItem("gtag_banana_vip_exp") || "0", 10),
      activeMods: JSON.parse(localStorage.getItem("gtag_banana_mods") || "{}")
    },

    save() {
      localStorage.setItem("gtag_bananas", String(this.state.bananas));
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
    processedEventIds: new Set(),

    getMyPublicName() {
      const rawMxUser = origGetItem.call(localStorage, "gtag_mx_user");
      if (rawMxUser) {
        let clean = String(rawMxUser).split(":")[0].replace(/^@/, "");
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

    installFetchInterceptor() {
      const origFetch = window.fetch;
      window.fetch = async function (url, options) {
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
      if (!this.randomRoomId) {
        try {
          const res = await this._origFetch(`${auth.server}/_matrix/client/v3/directory/room/${encodeURIComponent(BananaStore.RANDOM_ALIAS)}`, { headers: { Authorization: `Bearer ${auth.token}` } });
          const data = await res.json();
          if (data?.room_id) this.randomRoomId = data.room_id;
        } catch (_) {}
      }
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
        window.toggleHudEditMode = (f = null) => { orig(f); hud.classList.toggle("hud-draggable-active", !document.getElementById("gtag-hud-edit-banner")?.classList.contains("gtag-hidden")); };
      }
      if (typeof window.resetHudPositions === "function") {
        const orig = window.resetHudPositions;
        window.resetHudPositions = () => { orig(); hud.style.cssText = ""; };
      }
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

    initTab() {
      const term = document.querySelector(".gtag-terminal");
      const header = document.querySelector(".gtag-header");
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
        window.switchTab = tab => {
          orig(tab);
          document.getElementById("tab-shop")?.classList.toggle("gtag-hidden", tab !== "shop");
          document.getElementById("btn-tab-shop")?.classList.toggle("active", tab === "shop");
          if (tab === "shop") ShopModule.render();
        };
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
        { id: "privateChat", title: "PRIVATE BANANA CHAT", desc: "Unlock the secret #banana-lounge channel in Chat.", owned: U.privateChat, btn: U.privateChat ? "OPEN PRIVATE ROOM" : `UNLOCK (${P.privateChat} BN)` },
        { id: "themeYellow", title: "THEME: BANANA YELLOW", desc: "Bright yellow Gorilla OS border & golden terminal.", owned: U.themeYellow, btn: U.themeYellow ? (T === "yellow" ? "EQUIPPED" : "EQUIP THEME") : `BUY (${P.themeYellow} BN)` },
        { id: "themeGrid", title: "THEME: CYBER GRID", desc: "Neon cyan blueprint grid terminal background.", owned: U.themeGrid, btn: U.themeGrid ? (T === "grid" ? "EQUIPPED" : "EQUIP THEME") : `BUY (${P.themeGrid} BN)` },
        { id: "themeVoid", title: "THEME: MIDNIGHT VOID", desc: "Deep purple cosmic gradient terminal theme.", owned: U.themeVoid, btn: U.themeVoid ? (T === "void" ? "EQUIPPED" : "EQUIP THEME") : `BUY (${P.themeVoid} BN)` },
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
      term.classList.remove("theme-yellow", "theme-grid", "theme-void");
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
      if (!sidebar || document.getElementById("btn-banana-private-room")) return;
      const btn = document.createElement("button");
      btn.type = "button"; btn.id = "btn-banana-private-room"; btn.className = "gtag-room-item"; btn.style.color = "#ffe135"; btn.textContent = "#banana-lounge";
      btn.onclick = () => {
        window.playTerminalSfx?.("tab");
        document.querySelectorAll(".gtag-room-item").forEach(el => el.classList.remove("active"));
        btn.classList.add("active");
        const lbl = document.getElementById("matrix-room-label"), box = document.getElementById("chat-messages");
        if (lbl) lbl.textContent = "STUMP // #BANANA-LOUNGE [VIP]";
        if (box) box.innerHTML = `<div class="chat-line"><span class="chat-user" style="color:#ffe135;">[BANANA BOT]: </span><span>WELCOME TO THE PRIVATE BANANA LOUNGE!</span></div>`;
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
    const themes = { themeYellow: "yellow", themeGrid: "grid", themeVoid: "void" };
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
    StatsHudModule.init(); ShopModule.initTab(); HackBananaModule.init(); ShopModule.applyTheme(); StatsHudModule.update();
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
