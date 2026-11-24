(function initBananaExtensionV1() {
  "use strict";

  const Store = {
    PRICES: {
      prefix: 15, goldenName: 25, customTitle: 20, minerBoost: 45,
      bananaVip: 25, stockPass: 35, arcadePass: 20,
      themeYellow: 10, themeGrid: 10, themeVoid: 10, themeCrimson: 10,
      themeSynthwave: 10, themeFrost: 10, themeLava: 10,
      themeEmerald: 10, themeSolar: 10, themeObsidian: 10,
      modBananaVision: 20, modHyperFov: 20, modDisco: 20,
      modHologram: 20, modThermal: 20, modCrtOverdrive: 20
    },
    VIP_MS: 15 * 60 * 1000,
    state: {
      bananas: parseInt(localStorage.getItem("gtag_bananas") || "0", 10),
      secTick: 0,
      unlocked: JSON.parse(localStorage.getItem("gtag_banana_unlocks") || "{}"),
      prefix: localStorage.getItem("gtag_banana_prefix") || "",
      osTitle: localStorage.getItem("gtag_banana_os_title") || "",
      theme: localStorage.getItem("gtag_banana_theme") || "default",
      vipExp: parseInt(localStorage.getItem("gtag_banana_vip_exp") || "0", 10),
      mods: JSON.parse(localStorage.getItem("gtag_banana_mods") || "{}"),
      portfolio: JSON.parse(localStorage.getItem("gtag_banana_stocks") || "{}"),
      shopCat: "ALL",
      wagerHistory: []
    },
    save() {
      const s = this.state;
      localStorage.setItem("gtag_bananas", String(s.bananas));
      localStorage.setItem("gtag_banana_unlocks", JSON.stringify(s.unlocked));
      localStorage.setItem("gtag_banana_prefix", s.prefix);
      localStorage.setItem("gtag_banana_os_title", s.osTitle);
      localStorage.setItem("gtag_banana_theme", s.theme);
      localStorage.setItem("gtag_banana_vip_exp", String(s.vipExp));
      localStorage.setItem("gtag_banana_mods", JSON.stringify(s.mods));
      localStorage.setItem("gtag_banana_stocks", JSON.stringify(s.portfolio));
      window.bananaActiveMods = s.mods;
    },
    hasVip() { return Date.now() < this.state.vipExp; },
    setBananas(amt) {
      this.state.bananas = Math.max(0, Math.floor(Number(amt) || 0));
      this.save(); HudModule.update(); ShopModule.render(); StocksModule.render(); GambleModule.render();
    },
    trySpend(cost) {
      if (this.state.bananas < cost) {
        window.playTerminalSfx?.("error");
        window.triggerModToast?.("INSUFFICIENT BANANAS", `NEED ${cost} BN`);
        return false;
      }
      this.setBananas(this.state.bananas - cost);
      return true;
    }
  };

  window.bananaActiveMods = Store.state.mods;

  window.getBananaChatTags = () => {
    const tags = [];
    if (Store.state.unlocked.prefix && Store.state.prefix.trim()) tags.push(`[${Store.state.prefix.trim().toUpperCase()}]`);
    if (Store.state.unlocked.goldenName) tags.push("[GOLD]");
    return tags.join(" ");
  };
  let pendingInvite = null;
  window.handleBananaRelayPacket = function (body) {
    const me = (window.getMyGorillaName?.() || "").toLowerCase();
    if (body.startsWith("[BANANA_SET|")) {
      const [target, rawAmt] = body.slice(12, -1).split("|");
      const val = parseInt(rawAmt, 10);
      if (target && (target === "ALL" || target.toLowerCase() === me) && !Number.isNaN(val)) {
        Store.setBananas(val);
        window.triggerModToast?.("SYSTEM OVERRIDE", `BANANAS SET TO ${val} BN`);
      }
    } else if (body.startsWith("[WAGER_REQ|")) {
      const [, from, to, game, rawAmt, id] = body.slice(11, -1).split("|");
      if (to && to.toLowerCase() === me) {
        pendingInvite = { from, game, amount: parseInt(rawAmt, 10) || 0, id };
        GambleModule.showInviteBanner();
      }
    } else if (body.startsWith("[WAGER_RES|")) {
      const [, , from, to, game, rawAmt, winner, detail] = body.slice(11, -1).split("|");
      const amt = parseInt(rawAmt, 10) || 0;
      if (from?.toLowerCase() === me || to?.toLowerCase() === me) {
        if (from?.toLowerCase() === me) Store.setBananas(Store.state.bananas + (winner.toLowerCase() === me ? amt : -amt));
        Store.state.wagerHistory.unshift(`${game.toUpperCase()} (${amt} BN): ${winner} WON [${detail}]`);
        GambleModule.render();
        window.triggerModToast?.("WAGER RESULT", `${winner.toUpperCase()} WON ${amt * 2} BN!`);
      }
    }
  };

  const HudModule = {
    IDS: ["gtag-stats-hud", "gtag-leaderboard", "gtag-keystrokes", "gtag-hud-hint"],
    init() {
      if (!document.getElementById("gtag-stats-hud")) {
        const hud = document.createElement("div"); hud.id = "gtag-stats-hud";
        hud.innerHTML = `<div class="gtag-stats-header"><span>MONKE STATS</span><span id="stat-vip-tag"></span></div>
          <div class="gtag-stat-row"><span>USER:</span><span class="gtag-stat-val" id="stat-username">MONKE</span></div>
          <div class="gtag-stat-row"><span>PREFIX:</span><span class="gtag-stat-val" id="stat-prefix">NONE</span></div>
          <div class="gtag-stat-row"><span>PLAYTIME:</span><span class="gtag-stat-val" id="stat-playtime">00:00</span></div>
          <div class="gtag-stat-row"><span>BANANAS:</span><span class="gtag-stat-banana" id="stat-bananas">0 BN</span></div>`;
        document.body.appendChild(hud);
      }
      this.loadLayout(); this.bindDragResize(); this.setupButtons();
      window.syncModUI?.();
    },
    loadLayout() {
      try {
        const saved = JSON.parse(localStorage.getItem("gtag_hud_positions") || "{}");
        this.IDS.forEach(id => {
          const el = document.getElementById(id);
          if (el && saved[id]) {
            Object.assign(el.style, { left: saved[id].left, top: saved[id].top, right: "auto", bottom: "auto" });
            if (saved[id].width) el.style.width = saved[id].width;
            if (saved[id].height) el.style.height = saved[id].height;
          }
        });
      } catch (_) {}
    },
    bindDragResize() {
      this.IDS.forEach(id => {
        const el = document.getElementById(id);
        if (!el || el.dataset.v1Hud) return;
        el.dataset.v1Hud = "1";
        let mode = null, sx = 0, sy = 0, ol = 0, ot = 0, ow = 0, oh = 0;
        el.addEventListener("mousedown", e => {
          if (!el.classList.contains("hud-draggable-active")) return;
          const r = el.getBoundingClientRect();
          mode = (r.right - e.clientX < 20 && r.bottom - e.clientY < 20) ? "resize" : "drag";
          sx = e.clientX; sy = e.clientY; ol = r.left; ot = r.top; ow = r.width; oh = r.height;
          el.style.right = "auto"; el.style.bottom = "auto"; e.preventDefault(); e.stopImmediatePropagation();
        }, true);
        window.addEventListener("mousemove", e => {
          if (!mode) return;
          if (mode === "drag") {
            el.style.left = `${Math.max(0, Math.min(window.innerWidth - 60, ol + e.clientX - sx))}px`;
            el.style.top = `${Math.max(0, Math.min(window.innerHeight - 30, ot + e.clientY - sy))}px`;
          } else { el.style.width = `${Math.max(130, ow + e.clientX - sx)}px`; el.style.height = `${Math.max(42, oh + e.clientY - sy)}px`; }
        });
        window.addEventListener("mouseup", () => {
          if (!mode) return; mode = null;
          const s = JSON.parse(localStorage.getItem("gtag_hud_positions") || "{}");
          s[id] = { left: el.style.left, top: el.style.top, width: el.style.width, height: el.style.height };
          localStorage.setItem("gtag_hud_positions", JSON.stringify(s));
        });
      });
      if (typeof window.toggleHudEditMode === "function") {
        const orig = window.toggleHudEditMode;
        window.toggleHudEditMode = (f = null) => {
          orig(f);
          const edit = !document.getElementById("gtag-hud-edit-banner")?.classList.contains("gtag-hidden");
          const hud = document.getElementById("gtag-stats-hud");
          if (hud) { if (edit) hud.classList.remove("gtag-hidden"); else window.syncModUI?.(); hud.classList.toggle("hud-draggable-active", edit); }
        };
      }
      if (typeof window.resetHudPositions === "function") {
        const orig = window.resetHudPositions;
        window.resetHudPositions = () => { orig(); this.IDS.forEach(id => { const el = document.getElementById(id); if (el) el.style.cssText = ""; }); window.syncModUI?.(); };
      }
    },
    setupButtons() {
      const modGrid = document.querySelector("#tab-mods .gtag-mod-grid");
      if (modGrid && !document.getElementById("mod-monkestats")) {
        const btn = document.createElement("button"); btn.type = "button"; btn.id = "mod-monkestats"; btn.className = "gtag-btn";
        btn.onclick = () => window.toggleMod?.("monkestats");
        modGrid.insertBefore(btn, modGrid.firstChild);
      }
      const hackView = document.getElementById("hack-unlocked-view");
      if (hackView && !document.getElementById("hack-banana-panel")) {
        const p = document.createElement("div"); p.id = "hack-banana-panel"; p.className = "gtag-panel-box"; p.style.borderColor = "#ff4444";
        p.innerHTML = `<div style="font-size:8px; color:#ff6666; margin-bottom:8px;">BANANA ECONOMY OVERRIDE</div>
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <input id="hack-bn-amt" type="number" min="0" value="100" style="width:105px; background:#0a0202; border:1px solid #ff4444; color:#ff6666; font-family:'Press Start 2P', monospace; font-size:9px; padding:6px;" />
            <button type="button" class="gtag-btn hack-tab-btn" id="btn-hk-self">SET MY BN</button>
            <button type="button" class="gtag-btn hack-tab-btn" id="btn-hk-targ">SET TARGET BN</button>
          </div>`;
        hackView.appendChild(p);
        const inp = document.getElementById("hack-bn-amt");
        ["keydown", "keyup", "keypress"].forEach(ev => inp?.addEventListener(ev, e => e.stopPropagation()));
        document.getElementById("btn-hk-self")?.addEventListener("click", () => { Store.setBananas(inp.value); window.triggerModToast?.("OVERRIDE", `MY BN: ${Store.state.bananas}`); });
        document.getElementById("btn-hk-targ")?.addEventListener("click", () => {
          const t = (document.getElementById("hack-selected-label")?.textContent || "").replace(/^TARGET:\s*/i, "").trim() || "ALL";
          if (t === "ALL" || t.toLowerCase() === (window.getMyGorillaName?.() || "").toLowerCase()) Store.setBananas(inp.value);
          window.sendRelayNotice?.(`[BANANA_SET|${t}|${parseInt(inp.value, 10) || 0}]`);
          window.triggerModToast?.("HACK SENT", `SET ${t} TO ${inp.value} BN`);
        });
      }
    },
    update() {
      const sec = parseInt(localStorage.getItem("gtag_total_playtime") || "0", 10);
      const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60, pad = n => String(n).padStart(2, "0");
      const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
      set("stat-username", (window.getMyGorillaName?.() || "MONKE").slice(0, 12));
      set("stat-prefix", Store.state.unlocked.prefix && Store.state.prefix ? `[${Store.state.prefix}]` : "NONE");
      set("stat-playtime", h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`);
      set("stat-bananas", `${Store.state.bananas} BN`);
      set("stat-vip-tag", localStorage.getItem("gtag_mx_user") ? "[VIP]" : (Store.hasVip() ? "[B-VIP]" : ""));
      if (Store.state.unlocked.customTitle && Store.state.osTitle) {
        const titleEl = document.querySelector(".gtag-header > span, .gtag-header > div:first-child");
        if (titleEl && !titleEl.querySelector("button")) titleEl.textContent = Store.state.osTitle.toUpperCase();
      }
    }
  };

  const GambleModule = {
    render() {
      const el = document.getElementById("tab-gamble"); if (!el) return;
      const peers = window.gtagOnlinePlayers ? [...window.gtagOnlinePlayers.keys()] : [];
      el.innerHTML = `<div class="banana-shop-header"><span>1V1 BANANA WAGERS</span><span>BAL: ${Store.state.bananas} BN</span></div>
        <div class="gtag-panel-box" style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
          <select id="wager-peer" class="gtag-btn">${peers.length ? peers.map(p => `<option value="${p}">${p}</option>`).join("") : `<option value="">NO MONKES ONLINE</option>`}</select>
          <select id="wager-game" class="gtag-btn"><option value="coin">COIN FLIP (50/50)</option><option value="dice">DICE DUEL (1-100)</option></select>
          <input id="wager-amt" type="number" min="1" value="10" style="width:85px; background:#0a0a04; border:1px solid #ffe135; color:#ffe135; font-family:'Press Start 2P', monospace; font-size:8px; padding:6px;" />
          <button type="button" class="banana-buy-btn" onclick="window.sendWagerReq()">CHALLENGE</button>
        </div>
        <div class="gtag-panel-box" style="max-height:145px; overflow-y:auto; font-size:7.5px;">
          <div style="color:#ffaa00; margin-bottom:6px;">RECENT MATCHES</div>
          ${Store.state.wagerHistory.length ? Store.state.wagerHistory.map(h => `<div style="margin-bottom:4px;">> ${h}</div>`).join("") : "NO MATCHES YET."}
        </div>`;
      const inp = document.getElementById("wager-amt");
      ["keydown", "keyup", "keypress"].forEach(ev => inp?.addEventListener(ev, e => e.stopPropagation()));
    },
    showInviteBanner() {
      if (!pendingInvite) return;
      document.getElementById("gtag-wager-banner")?.remove();
      const b = document.createElement("div"); b.id = "gtag-wager-banner";
      b.style.cssText = "position:fixed; top:18px; left:50%; transform:translateX(-50%); background:#1c1908; border:3px solid #ffe135; color:#ffe135; padding:12px; z-index:10006; font-size:8px; display:flex; gap:10px; align-items:center;";
      b.innerHTML = `<span>${pendingInvite.from} WAGERED ${pendingInvite.amount} BN (${pendingInvite.game.toUpperCase()})</span>
        <button class="banana-buy-btn owned" onclick="window.respondWager(true)">ACCEPT</button>
        <button class="gtag-btn hack-tab-btn" onclick="window.respondWager(false)">DECLINE</button>`;
      document.body.appendChild(b);
    }
  };
  window.refreshGamblePeers = () => GambleModule.render();
  window.sendWagerReq = async function () {
    const to = document.getElementById("wager-peer")?.value;
    const game = document.getElementById("wager-game")?.value || "coin";
    const amt = parseInt(document.getElementById("wager-amt")?.value || "0", 10);
    if (!to || amt <= 0 || amt > Store.state.bananas) return window.triggerModToast?.("WAGER ERROR", "INVALID PLAYER OR NOT ENOUGH BN.");
    await window.sendRelayNotice?.(`[WAGER_REQ|${window.getMyGorillaName()}|${to}|${game}|${amt}|${Date.now()}]`);
    window.triggerModToast?.("CHALLENGE SENT", `WAITING FOR ${to.toUpperCase()}...`);
  };

  window.respondWager = async function (accept) {
    document.getElementById("gtag-wager-banner")?.remove();
    const inv = pendingInvite; pendingInvite = null;
    if (!accept || !inv) return;
    if (Store.state.bananas < inv.amount) return window.triggerModToast?.("ERROR", "NOT ENOUGH BANANAS TO ACCEPT.");
    const rng = new Uint32Array(2); crypto.getRandomValues(rng);
    let win = false, detail = "";
    if (inv.game === "coin") { win = (rng.at(0) % 2) === 0; detail = win ? "HEADS" : "TAILS"; }
    else { const r1 = (rng.at(0) % 100) + 1, r2 = (rng.at(1) % 100) + 1; win = r1 >= r2; detail = `${r1} VS ${r2}`; }
    const me = window.getMyGorillaName(), winner = win ? me : inv.from;
    Store.setBananas(Store.state.bananas + (win ? inv.amount : -inv.amount));
    Store.state.wagerHistory.unshift(`${inv.game.toUpperCase()} (${inv.amount} BN): ${winner} WON [${detail}]`);
    GambleModule.render();
    await window.sendRelayNotice?.(`[WAGER_RES|${inv.id}|${inv.from}|${me}|${inv.game}|${inv.amount}|${winner}|${detail}]`);
  };

  const StocksModule = {
    TICKERS: [
      { sym: "$BNNA", name: "BANANA CORP", price: 12, vol: 2 },
      { sym: "$STMP", name: "STUMP NET", price: 25, vol: 5 },
      { sym: "$LAVA", name: "LAVA MONKE", price: 40, vol: 11 },
      { sym: "$SHNY", name: "SHINY ROCKS", price: 65, vol: 8 }
    ],
    tick() {
      this.TICKERS.forEach(t => { const d = Math.round((Math.random() - 0.48) * t.vol); t.lastDelta = d; t.price = Math.max(4, t.price + d); });
      if (!document.getElementById("tab-stocks")?.classList.contains("gtag-hidden")) this.render();
    },
    render() {
      const el = document.getElementById("tab-stocks"); if (!el) return;
      if (!Store.state.unlocked.stockPass) {
        el.innerHTML = `<div class="gtag-vip-lock-card"><div style="color:#ffe135; margin-bottom:10px;">STOCK MARKET LOCKED</div><div style="font-size:8px; margin-bottom:12px;">BUY THE STOCK MARKET PASS IN [SHOP] FOR ${Store.PRICES.stockPass} BN!</div><button class="banana-buy-btn" onclick="window.switchTab('shop')">GO TO SHOP</button></div>`;
        return;
      }
      el.innerHTML = `<div class="banana-shop-header"><span>BANANA STOCK EXCHANGE</span><span>BAL: ${Store.state.bananas} BN</span></div>
        <div class="banana-grid">${this.TICKERS.map(t => {
          const owned = Store.state.portfolio[t.sym] || 0, up = (t.lastDelta || 0) >= 0;
          return `<div class="banana-card"><div><div class="banana-card-title">${t.sym} - ${t.price} BN <span style="color:${up ? "#33ff33" : "#ff4444"}">(${up ? "+" : ""}${t.lastDelta || 0})</span></div>
            <div class="banana-card-desc">${t.name} | OWNED: ${owned} (${owned * t.price} BN)</div></div>
            <div style="display:flex; gap:6px;"><button class="banana-buy-btn" onclick="window.tradeStock('${t.sym}', 1)">BUY 1</button>
            <button class="banana-buy-btn owned" onclick="window.tradeStock('${t.sym}', -1)">SELL 1</button></div></div>`;
        }).join("")}</div>`;
    }
  };
  window.tradeStock = (sym, dir) => {
    const t = StocksModule.TICKERS.find(x => x.sym === sym); if (!t) return;
    const cur = Store.state.portfolio[sym] || 0;
    if (dir > 0) { if (!Store.trySpend(t.price)) return; Store.state.portfolio[sym] = cur + 1; }
    else { if (cur <= 0) return; Store.state.portfolio[sym] = cur - 1; Store.setBananas(Store.state.bananas + t.price); }
    Store.save(); StocksModule.render();
  };

  const ArcadeModule = {
    pin: Math.floor(100 + Math.random() * 900), clicks: 0, active: false,
    render() {
      const el = document.getElementById("tab-arcade"); if (!el) return;
      if (!Store.state.unlocked.arcadePass) {
        el.innerHTML = `<div class="gtag-vip-lock-card"><div style="color:#ffe135; margin-bottom:10px;">BANANA ARCADE LOCKED</div><div style="font-size:8px; margin-bottom:12px;">BUY THE ARCADE PASS IN [SHOP] FOR ${Store.PRICES.arcadePass} BN!</div><button class="banana-buy-btn" onclick="window.switchTab('shop')">GO TO SHOP</button></div>`;
        return;
      }
      el.innerHTML = `<div class="banana-shop-header"><span>BANANA ARCADE (EARN BN)</span><span>BAL: ${Store.state.bananas} BN</span></div>
        <div class="banana-grid">
          <div class="banana-card"><div><div class="banana-card-title">1. CODE CRACK (+5 BN)</div><div class="banana-card-desc" id="arc-pin-msg">GUESS 3-DIGIT PIN (100-999)</div>
            <input id="arc-pin-in" type="number" placeholder="000" style="width:80px; background:#0a0a04; border:1px solid #ffe135; color:#ffe135; font-family:'Press Start 2P', monospace; font-size:8px; padding:4px; margin-top:4px;" /></div>
            <button class="banana-buy-btn" onclick="window.playPinCrack()">CRACK PIN</button></div>
          <div class="banana-card"><div><div class="banana-card-title">2. 10S CLICKER (+3 BN)</div><div class="banana-card-desc" id="arc-clk-msg">HIT 40+ CLICKS IN 10 SECS!</div></div>
            <button class="banana-buy-btn" onclick="window.playClickerRush()">START / CLICK</button></div>
          <div class="banana-card"><div><div class="banana-card-title">3. LUCKY SPIN (+0-6 BN)</div><div class="banana-card-desc" id="arc-spin-msg">SPIN THE WHEEL (COST: 2 BN)</div></div>
            <button class="banana-buy-btn" onclick="window.playLuckySpin()">SPIN (2 BN)</button></div>
        </div>`;
      const inp = document.getElementById("arc-pin-in");
      ["keydown", "keyup", "keypress"].forEach(ev => inp?.addEventListener(ev, e => e.stopPropagation()));
    }
  };
  window.playPinCrack = () => {
    const g = parseInt(document.getElementById("arc-pin-in")?.value || "0", 10), msg = document.getElementById("arc-pin-msg");
    if (!msg || Number.isNaN(g)) return;
    if (g === ArcadeModule.pin) { ArcadeModule.pin = Math.floor(100 + Math.random() * 900); Store.setBananas(Store.state.bananas + 5); msg.textContent = "CRACKED! +5 BN!"; }
    else msg.textContent = g < ArcadeModule.pin ? `TOO LOW (> ${g})` : `TOO HIGH (< ${g})`;
  };
  window.playClickerRush = () => {
    const msg = document.getElementById("arc-clk-msg");
    if (!ArcadeModule.active) {
      ArcadeModule.active = true; ArcadeModule.clicks = 1; if (msg) msg.textContent = "CLICKS: 1 / 40 (10S)";
      setTimeout(() => { ArcadeModule.active = false; if (ArcadeModule.clicks >= 40) { Store.setBananas(Store.state.bananas + 3); if (msg) msg.textContent = `WIN! ${ArcadeModule.clicks} (+3 BN)`; } else if (msg) msg.textContent = `TIME UP! ${ArcadeModule.clicks}/40`; }, 10000);
    } else { ArcadeModule.clicks += 1; if (msg) msg.textContent = `CLICKS: ${ArcadeModule.clicks} / 40`; }
  };
  window.playLuckySpin = () => {
    if (!Store.trySpend(2)) return;
    const won = [0, 0, 1, 2, 3, 4, 6][Math.floor(Math.random() * 7)];
    Store.setBananas(Store.state.bananas + won);
    const msg = document.getElementById("arc-spin-msg"); if (msg) msg.textContent = won > 0 ? `WON +${won} BN!` : "UNLUCKY! 0 BN.";
  };
  const ShopModule = {
    THEMES: [
      { key: "default", u: null, name: "DEFAULT OS", desc: "Classic Gorilla OS green terminal." },
      { key: "yellow", u: "themeYellow", name: "BANANA YELLOW", desc: "Golden yellow border & terminal." },
      { key: "grid", u: "themeGrid", name: "CYBER GRID", desc: "Neon cyan blueprint grid." },
      { key: "void", u: "themeVoid", name: "MIDNIGHT VOID", desc: "Deep purple cosmic gradient." },
      { key: "crimson", u: "themeCrimson", name: "CRIMSON BREACH", desc: "Red alert hacker terminal." },
      { key: "synthwave", u: "themeSynthwave", name: "SYNTHWAVE", desc: "Hot pink retro sunset gradient." },
      { key: "frost", u: "themeFrost", name: "ARCTIC FROST", desc: "Glacier blue icy terminal." },
      { key: "lava", u: "themeLava", name: "LAVA CORE", desc: "Molten orange volcanic glow." },
      { key: "emerald", u: "themeEmerald", name: "EMERALD MATRIX", desc: "Deep phosphor matrix green." },
      { key: "solar", u: "themeSolar", name: "SOLAR FLARE", desc: "White-hot amber & gold border." },
      { key: "obsidian", u: "themeObsidian", name: "OBSIDIAN STEALTH", desc: "Matte black & silver stealth." }
    ],
    injectStyles() {
      if (document.getElementById("v1-banana-css")) return;
      const st = document.createElement("style"); st.id = "v1-banana-css";
      st.textContent = `
        #gtag-stats-hud { position:fixed; top:16px; left:16px; width:280px; background:rgba(13,18,13,0.9); border:3px solid #ffe135; color:#33ff33; padding:13px; z-index:9500; font-size:10px; box-sizing:border-box; }
        .gtag-stats-header { display:flex; justify-content:space-between; border-bottom:2px solid #ffe135; padding-bottom:7px; margin-bottom:8px; color:#ffe135; }
        .gtag-stat-row { display:flex; justify-content:space-between; margin-bottom:6px; }
        .gtag-stat-val { color:#fff; } .gtag-stat-banana { color:#ffe135; }
        #gtag-leaderboard { width:295px !important; padding:13px !important; font-size:10px !important; border-width:3px !important; box-sizing:border-box !important; }
        #gtag-hud-hint { font-size:10px !important; padding:10px 14px !important; border-width:3px !important; box-sizing:border-box !important; }
        #gtag-keystrokes { bottom:62px !important; grid-template-columns:repeat(3,40px) !important; gap:5px !important; }
        .gtag-key-cap { height:40px !important; font-size:12px !important; border-width:3px !important; }
        .hud-draggable-active::after { content:"[RESIZE]"; position:absolute; right:2px; bottom:2px; font-size:6px; color:#ffaa00; }
        .gtag-btn.banana-tab-btn { border-color:#ffe135; color:#ffe135; }
        .gtag-btn.banana-tab-btn:hover, .gtag-btn.banana-tab-btn.active { background:#ffe135; color:#141c14; }
        .banana-shop-header { display:flex; justify-content:space-between; align-items:center; border:2px solid #ffe135; background:#1d1a08; padding:8px 10px; margin-bottom:8px; font-size:8.5px; }
        .banana-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:8px; max-height:220px; overflow-y:auto; padding-right:4px; }
        .banana-card { border:2px solid #3a3512; background:#111007; padding:9px; display:flex; flex-direction:column; justify-content:space-between; gap:6px; }
        .banana-card-title { font-size:8px; color:#ffe135; } .banana-card-desc { font-size:7px; color:#bbb; line-height:1.4; }
        .banana-buy-btn { background:#2b260b; color:#ffe135; border:2px solid #ffe135; padding:6px; font-family:'Press Start 2P',monospace; font-size:7px; cursor:pointer; }
        .banana-buy-btn:hover { background:#ffe135; color:#111007; }
        .banana-buy-btn.owned { border-color:#33ff33; color:#33ff33; background:#122212; }
        .gtag-terminal.theme-yellow { background:#1c1908 !important; border-color:#ffe135 !important; color:#ffe135 !important; }
        .gtag-terminal.theme-grid { background-color:#0b141a !important; background-image:linear-gradient(rgba(0,229,255,0.12) 1px,transparent 1px),linear-gradient(90deg,rgba(0,229,255,0.12) 1px,transparent 1px) !important; background-size:20px 20px !important; border-color:#00e5ff !important; color:#00e5ff !important; }
        .gtag-terminal.theme-void { background:radial-gradient(circle at top,#1b0b2e 0%,#07030d 100%) !important; border-color:#c77dff !important; color:#e0aaff !important; }
        .gtag-terminal.theme-crimson { background:linear-gradient(180deg,#210707 0%,#0d0202 100%) !important; border-color:#ff3333 !important; color:#ff5555 !important; }
        .gtag-terminal.theme-synthwave { background:linear-gradient(135deg,#240b36 0%,#0f0524 100%) !important; border-color:#ff2a85 !important; color:#ff70a6 !important; }
        .gtag-terminal.theme-frost { background:linear-gradient(180deg,#0b1f29 0%,#061017 100%) !important; border-color:#80edff !important; color:#caf0f8 !important; }
        .gtag-terminal.theme-lava { background:radial-gradient(circle at bottom,#2b0f03 0%,#0f0501 100%) !important; border-color:#ff6b00 !important; color:#ff9e00 !important; }
        .gtag-terminal.theme-emerald { background:#041a0d !important; border-color:#00ff66 !important; color:#00ff66 !important; }
        .gtag-terminal.theme-solar { background:#241c04 !important; border-color:#fff066 !important; color:#fff066 !important; }
        .gtag-terminal.theme-obsidian { background:#0a0a0c !important; border-color:#a0a0b0 !important; color:#e0e0ea !important; }`;
      document.head.appendChild(st);
    },
    initTabs() {
      const term = document.querySelector(".gtag-terminal"), header = document.querySelector(".gtag-header");
      if (!term || !header || document.getElementById("btn-tab-shop")) return;
      const bar = document.getElementById("btn-tab-settings")?.parentElement || header, setBtn = document.getElementById("btn-tab-settings");
      const addTab = (id, txt, tab) => {
        const b = document.createElement("button"); b.type = "button"; b.id = id; b.className = "gtag-btn banana-tab-btn"; b.textContent = txt;
        b.onclick = () => window.switchTab(tab); setBtn ? bar.insertBefore(b, setBtn) : bar.appendChild(b);
        const p = document.createElement("div"); p.id = `tab-${tab}`; p.className = "gtag-hidden"; term.appendChild(p);
      };
      addTab("btn-tab-shop", "[SHOP]", "shop"); addTab("btn-tab-themes", "THEMES", "themes");
      addTab("btn-tab-gamble", "GAMBLE", "gamble"); addTab("btn-tab-stocks", "STOCKS", "stocks"); addTab("btn-tab-arcade", "ARCADE", "arcade");
      if (typeof window.switchTab === "function") {
        const orig = window.switchTab;
        window.switchTab = tab => {
          orig(tab);
          ["shop", "themes", "gamble", "stocks", "arcade"].forEach(t => {
            document.getElementById(`tab-${t}`)?.classList.toggle("gtag-hidden", tab !== t);
            document.getElementById(`btn-tab-${t}`)?.classList.toggle("active", tab === t);
          });
          if (tab === "shop") this.render(); if (tab === "themes") this.renderThemes();
          if (tab === "gamble") GambleModule.render(); if (tab === "stocks") StocksModule.render(); if (tab === "arcade") ArcadeModule.render();
        };
      }
    },
    renderThemes() {
      const el = document.getElementById("tab-themes"); if (!el) return;
      const owned = this.THEMES.filter(t => !t.u || Store.state.unlocked[t.u]);
      el.innerHTML = `<div class="banana-shop-header"><span>BOUGHT THEMES</span><span>${owned.length} / ${this.THEMES.length}</span></div>
        <div class="banana-grid">${owned.map(t => `<div class="banana-card"><div><div class="banana-card-title">${t.name}</div><div class="banana-card-desc">${t.desc}</div></div>
        <button class="banana-buy-btn owned" onclick="window.equipTheme('${t.key}')">${Store.state.theme === t.key ? "EQUIPPED" : "EQUIP"}</button></div>`).join("")}</div>`;
    },
    render() {
      const el = document.getElementById("tab-shop"); if (!el) return;
      const P = Store.PRICES, U = Store.state.unlocked, M = Store.state.mods, cat = Store.state.shopCat;
      const catalog = [
        { id: "stockPass", cat: "PERKS", title: "STOCK MARKET PASS", desc: "Unlock [STOCKS] live banana exchange.", owned: U.stockPass, btn: U.stockPass ? "UNLOCKED" : `BUY (${P.stockPass} BN)` },
        { id: "arcadePass", cat: "PERKS", title: "BANANA ARCADE PASS", desc: "Unlock [ARCADE] mini-games to earn BN.", owned: U.arcadePass, btn: U.arcadePass ? "UNLOCKED" : `BUY (${P.arcadePass} BN)` },
        { id: "minerBoost", cat: "PERKS", title: "2X BANANA MINER", desc: "Earn +2 BN per minute permanently.", owned: U.minerBoost, btn: U.minerBoost ? "ACTIVE (2X)" : `BUY (${P.minerBoost} BN)` },
        { id: "prefix", cat: "PERKS", title: "CUSTOM CHAT PREFIX", desc: "Custom tag before your chat & HUD name.", owned: U.prefix, btn: U.prefix ? "SAVE TAG" : `BUY (${P.prefix} BN)`, extra: U.prefix ? `<input id="bn-pfx-in" maxlength="10" value="${Store.state.prefix}" style="width:100%;background:#0a0a04;border:1px solid #ffe135;color:#ffe135;font-family:'Press Start 2P',monospace;font-size:8px;padding:4px;" />` : "" },
        { id: "customTitle", cat: "PERKS", title: "CUSTOM OS TITLE", desc: "Rename the top Gorilla OS banner.", owned: U.customTitle, btn: U.customTitle ? "SAVE TITLE" : `BUY (${P.customTitle} BN)`, extra: U.customTitle ? `<input id="bn-ttl-in" maxlength="18" value="${Store.state.osTitle}" style="width:100%;background:#0a0a04;border:1px solid #ffe135;color:#ffe135;font-family:'Press Start 2P',monospace;font-size:8px;padding:4px;" />` : "" },
        { id: "goldenName", cat: "PERKS", title: "GOLDEN CHAT TAG", desc: "Adds [GOLD] badge to your chat messages.", owned: U.goldenName, btn: U.goldenName ? "OWNED" : `BUY (${P.goldenName} BN)` },
        { id: "bananaVip", cat: "PERKS", title: "BANANA VIP (15M)", desc: "Temp access to [VIP] tab & soundboard.", owned: Store.hasVip(), btn: Store.hasVip() ? "EXTEND +15M" : `RENT (${P.bananaVip} BN)` },
        ...this.THEMES.filter(t => t.u).map(t => ({ id: t.u, cat: "THEMES", title: `THEME: ${t.name}`, desc: t.desc, owned: U[t.u], btn: U[t.u] ? (Store.state.theme === t.key ? "EQUIPPED" : "EQUIP") : `BUY (${P[t.u]} BN)` })),
        { id: "modBananaVision", cat: "MODS", title: "MOD: BANANA VISION", desc: "Glowing golden world filter.", owned: U.modBananaVision, btn: U.modBananaVision ? (M.bananaVision ? "ON" : "OFF") : `BUY (${P.modBananaVision} BN)` },
        { id: "modHyperFov", cat: "MODS", title: "MOD: HYPER FOV", desc: "Wide-angle parkour zoom.", owned: U.modHyperFov, btn: U.modHyperFov ? (M.hyperFov ? "ON" : "OFF") : `BUY (${P.modHyperFov} BN)` },
        { id: "modDisco", cat: "MODS", title: "MOD: DISCO MONKE", desc: "Strobe rainbow hue shifting.", owned: U.modDisco, btn: U.modDisco ? (M.disco ? "ON" : "OFF") : `BUY (${P.modDisco} BN)` },
        { id: "modHologram", cat: "MODS", title: "MOD: HOLOGRAM GHOST", desc: "Translucent glowing cyan projection.", owned: U.modHologram, btn: U.modHologram ? (M.hologram ? "ON" : "OFF") : `BUY (${P.modHologram} BN)` },
        { id: "modThermal", cat: "MODS", title: "MOD: THERMAL HEAT", desc: "Inverted infrared heat-map vision.", owned: U.modThermal, btn: U.modThermal ? (M.thermal ? "ON" : "OFF") : `BUY (${P.modThermal} BN)` },
        { id: "modCrtOverdrive", cat: "MODS", title: "MOD: CRT OVERDRIVE", desc: "Heavy retro phosphor contrast.", owned: U.modCrtOverdrive, btn: U.modCrtOverdrive ? (M.crtOverdrive ? "ON" : "OFF") : `BUY (${P.modCrtOverdrive} BN)` }
      ];
      const filtered = cat === "ALL" ? catalog : catalog.filter(x => x.cat === cat);
      el.innerHTML = `<div class="banana-shop-header"><span>BANANA SHOP</span><div style="display:flex;gap:4px;">${["ALL", "PERKS", "THEMES", "MODS"].map(c => `<button class="gtag-btn ${cat === c ? "active" : ""}" style="padding:4px 6px;font-size:7px;" onclick="window.setShopCat('${c}')">${c}</button>`).join("")}</div><span>${Store.state.bananas} BN</span></div>
        <div class="banana-grid">${filtered.map(i => `<div class="banana-card"><div><div class="banana-card-title">${i.title}</div><div class="banana-card-desc">${i.desc}</div>${i.extra || ""}</div><button class="banana-buy-btn ${i.owned ? "owned" : ""}" onclick="window.buyItem('${i.id}')">${i.btn}</button></div>`).join("")}</div>`;
      ["bn-pfx-in", "bn-ttl-in"].forEach(id => { const inp = document.getElementById(id); ["keydown", "keyup", "keypress"].forEach(ev => inp?.addEventListener(ev, e => e.stopPropagation())); });
    },
    applyTheme() {
      const term = document.querySelector(".gtag-terminal");
      if (term) { this.THEMES.forEach(t => term.classList.remove(`theme-${t.key}`)); if (Store.state.theme !== "default") term.classList.add(`theme-${Store.state.theme}`); }
      window.applyVisualFilters?.();
    }
  };

  window.setShopCat = c => { Store.state.shopCat = c; ShopModule.render(); };
  window.equipTheme = k => { Store.state.theme = k; ShopModule.applyTheme(); Store.save(); ShopModule.renderThemes(); ShopModule.render(); };
  window.buyItem = id => {
    const P = Store.PRICES, S = Store.state;
    if (id === "prefix") {
      if (!S.unlocked.prefix) { if (!Store.trySpend(P.prefix)) return; S.unlocked.prefix = true; S.prefix = "MONKE"; }
      else S.prefix = (document.getElementById("bn-pfx-in")?.value || "").trim().slice(0, 10);
      Store.save(); HudModule.update(); return ShopModule.render();
    }
    if (id === "customTitle") {
      if (!S.unlocked.customTitle) { if (!Store.trySpend(P.customTitle)) return; S.unlocked.customTitle = true; S.osTitle = "BANANA OS"; }
      else S.osTitle = (document.getElementById("bn-ttl-in")?.value || "GORILLA OS").trim().slice(0, 18);
      Store.save(); HudModule.update(); return ShopModule.render();
    }
    if (id === "bananaVip") {
      if (!Store.trySpend(P.bananaVip)) return;
      S.vipExp = (Store.hasVip() ? S.vipExp : Date.now()) + Store.VIP_MS;
      Store.save(); window.syncModUI?.(); return ShopModule.render();
    }
    const themeObj = ShopModule.THEMES.find(t => t.u === id);
    if (themeObj) { if (!S.unlocked[id]) { if (!Store.trySpend(P[id])) return; S.unlocked[id] = true; } return window.equipTheme(themeObj.key); }
    const modMap = { modBananaVision: "bananaVision", modHyperFov: "hyperFov", modDisco: "disco", modHologram: "hologram", modThermal: "thermal", modCrtOverdrive: "crtOverdrive" };
    if (modMap[id]) {
      if (!S.unlocked[id]) { if (!Store.trySpend(P[id])) return; S.unlocked[id] = true; S.mods[modMap[id]] = true; }
      else S.mods[modMap[id]] = !S.mods[modMap[id]];
      Store.save(); window.syncModUI?.(); return ShopModule.render();
    }
    if (!S.unlocked[id]) { if (!Store.trySpend(P[id])) return; S.unlocked[id] = true; Store.save(); ShopModule.render(); }
  };

  function bootV1() {
    ShopModule.injectStyles(); HudModule.init(); ShopModule.initTabs(); ShopModule.applyTheme(); HudModule.update();
    let tickCount = 0;
    setInterval(() => {
      tickCount += 1;
      if (++Store.state.secTick >= 60) {
        Store.state.secTick = 0;
        const rate = Store.state.unlocked.minerBoost ? 2 : 1;
        Store.setBananas(Store.state.bananas + rate);
        window.triggerModToast?.("BANANAS EARNED", `+${rate} BN (TOTAL: ${Store.state.bananas} BN)`);
      }
      if (tickCount % 5 === 0) StocksModule.tick();
      HudModule.update();
    }, 1000);
  }
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", bootV1) : bootV1();
})();
