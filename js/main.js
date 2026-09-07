// main.js —— M4：完整战斗系统
// 商店买单位 → 拖上场；合成升级；农民/小兵/武将；
// 士兵驻守+小范围迎击回位（A）；武将出击+技能（B）；Boss；暂停/加速。
(function () {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  // ---------- 状态 ----------
  let phase = "ready"; // ready/between/battle/over/win
  let gateHp = CONFIG.gateHp;
  let grain = CONFIG.startGrain;
  let waveIndex = 0;
  let waveToSpawn = 0;
  let waveBossPending = false;
  let waveSpawnTimer = 0;
  let waveHpMul = 1;
  let waveSpeed = CONFIG.enemy.speed; // 本波小兵速度（随波次递增，封顶 maxSpeed）
  let prepTimer = 0;
  let paused = false;
  let speed = 1;
  let diffKey = "normal"; // 当前难度
  let enemies = [];
  let buildings = [];
  let soldiers = [];
  let tracers = [];
  let explosions = [];
  let bullets = [];     // 追踪飞行弹丸（视觉）
  let fxSlashes = [];   // 近战斩击弧线
  let fxFloats = [];    // 飘字
  let waveBanner = null; // 波次横幅（唯一槽位：新横幅替换旧的，绝不叠加）
  let fxDeaths = [];    // 死亡残影动画
  let fxParts = [];     // 火花粒子
  let pendingHits = []; // 挥击/放箭的延迟命中结算：伤害与特效在动作「命中帧」同步触发

  // 武器命中帧（占攻击动作时长的比例）：出伤时刻 = 武器挥至目标的一瞬
  const HIT_P = { saber: 0.36, spear: 0.42, bow: 0.55, fan: 0.5 };
  // 待机持械角（弧度，相对水平右方；含微幅摇晃）
  const REST_ANG = { saber: 0.95, spear: 0.3, bow: 0.55, fan: 1.35 };

  function scheduleHit(s, target, dmg, delay, opts) {
    pendingHits.push({
      s: s, e: target, dmg: dmg, t: Math.max(0.02, delay),
      dir: opts.dir, ranged: !!opts.ranged, color: opts.color
    });
  }
  function updatePendingHits(dt) {
    for (let i = pendingHits.length - 1; i >= 0; i--) {
      const h = pendingHits[i];
      h.t -= dt;
      if (h.t > 0) continue;
      pendingHits.splice(i, 1);
      if (h.s.dead || !h.e || h.e.dead) continue; // 落空：目标已亡或自身阵亡，不结算
      damageEnemy(h.e, h.dmg);
      gainRage(h.s, CONFIG.rage.perAttack);
      const def = unitDef(h.s.type);
      // 全局被动：溅射 + 吸血
      if (buffs.splashFactor > 0) {
        const sr = buffs.splashRange * getCellSize();
        for (const o of enemies) {
          if (o.dead || o === h.e) continue;
          if (Math.hypot(o.x - h.e.x, o.y - h.e.y) <= sr) damageEnemy(o, h.dmg * buffs.splashFactor);
        }
      }
      if (buffs.vamp > 0 && !h.s.dead) {
        h.s.hp = Math.min(h.s.maxHp, h.s.hp + h.dmg * buffs.vamp);
        addFloat(h.s.x, h.s.y - getCellSize() * 0.4, "吸血", "#ff6b6b", 0.13, 0.5);
      }
      if (h.ranged) {
        addBullet(h.s.x, h.s.y, h.e, h.color || def.color); // 箭矢在放弦瞬间离手
        addSparks(h.e.x, h.e.y, 2, "#ffffff", 70);
      } else {
        addSlash(h.e.x, h.e.y, h.dir, def.hero ? "#ffd700" : "#ffffff"); // 斩击弧在命中处张开
        addSparks(h.e.x, h.e.y, 3, "#ffffff", 90);
        if (def.hero) addShake(0.08, 1);
      }
    }
  }
  let animClock = 0;    // 全局动画时钟（待机呼吸用）
  let shakeTime = 0;    // 屏幕震动剩余时间
  let shakeMag = 0;
  let inventory = new Array(CONFIG.inventorySize).fill(null);
  let uidCounter = 1;
  let placeSeqCounter = 0; // 场上单位部署顺序（越小越先上场，升星时优先保留）
  // 技能卡：击杀掉落；同名自动升阶（3张同阶 → 1张高阶），白/红/金，升阶数值更强
  let cardLevels = {};  // 技能卡 id → { 1:x, 2:y, 3:z } 各阶持有张数
  let activeCds = {};   // 主动卡 id → 剩余冷却秒
  let buffs = { atkIntervalMul: 1, dmgMul: 1, hpMul: 1, bountyMul: 1, enemySlow: 1, splashFactor: 0, splashRange: 1.2, vamp: 0 };
  let casting = null;   // 主动施法瞄准中：{ id, level }（点战场释放，右键/Esc 取消）
  let curLevelId = 1;   // 当前关卡
  let curPaths = [];    // 当前关所有路径（引用自 CONFIG.levels）
  let spawnRR = 0;      // 敌人分路轮询计数
  let homeOpen = true;  // 首页是否打开（打开时主循环挂起，省性能）
  let selectedLevelId = 1; // 首页选中的关卡

  let drag = null;
  let selected = null; // 点击查看的单位：{ kind: "unit" | "enemy", ref }
  const mouse = { x: 0, y: 0, inside: false };
  let hintTimer = null;

  // ---------- DOM ----------
  const hudWave = document.getElementById("hud-wave");
  const hudGrain = document.getElementById("hud-grain");
  const hudPop = document.getElementById("hud-pop");
  const hudPhase = document.getElementById("hud-phase");
  const btnStart = document.getElementById("btn-start");
  const btnPause = document.getElementById("btn-pause");
  const btnSpeed = document.getElementById("btn-speed");
  const selDiff = document.getElementById("sel-diff");
  const shopItems = document.getElementById("shop-items");
  const btnRefresh = document.getElementById("btn-refresh");
  const grainBoxVal = document.getElementById("grain-box-val");
  const inventoryBar = document.getElementById("inventory-bar");
  const hintEl = document.getElementById("deploy-hint");
  const homeScreen = document.getElementById("home-screen");
  const levelCards = document.getElementById("level-cards");
  const btnHomeStart = document.getElementById("btn-home-start");
  const btnMute = document.getElementById("btn-mute");
  const btnHome = document.getElementById("btn-home");
  const confirmLayer = document.getElementById("confirm-layer");
  const btnCfStay = document.getElementById("btn-cf-stay");
  const btnCfLeave = document.getElementById("btn-cf-leave");
  const cardPassiveEl = document.getElementById("card-passive");
  const cardActiveEl = document.getElementById("card-active");

  const dragGhost = document.createElement("div");
  dragGhost.style.cssText =
    "position:fixed;left:0;top:0;display:none;pointer-events:none;z-index:999;" +
    "padding:3px 10px;border-radius:10px;color:#fff;font-size:14px;" +
    "border:2px solid rgba(255,255,255,0.9);box-shadow:0 2px 8px rgba(0,0,0,0.5);" +
    "transform:translate(-50%,-50%);white-space:nowrap;";
  document.body.appendChild(dragGhost);

  // ---------- 工具 ----------
  function unitDef(type) {
    if (type.indexOf("farmer.") === 0) return CONFIG.farmers[type.slice(7)];
    if (type.indexOf("hero.") === 0) return CONFIG.heroes[type.slice(5)];
    if (type.indexOf("soldier.") === 0) return CONFIG.soldiers[type.slice(8)];
    return null;
  }
  function statMul(level) { return Math.pow(CONFIG.levelGrowth, level - 1); }

  // 由已获被动推导全局加成（累乘/累加字段约定：multiplicative 默认 1 累乘，splash/vamp 累加）
  const SC = CONFIG.skillCards || {};
  const BUFF_MUL = ["atkIntervalMul", "dmgMul", "hpMul", "bountyMul", "enemySlow"];
  function passiveCfg(id) { return (SC.passive || []).find(function (p) { return p.id === id; }); }
  function activeCfg(id) { return (SC.active || []).find(function (a) { return a.id === id; }); }
  // 卡牌持有结构：cardLevels[id] = { 1:x, 2:y, 3:z }，3 张同★自动合成升 1 颗★
  function cardLevelsOf(id) { return cardLevels[id] || { 1: 0, 2: 0, 3: 0 }; }
  function cardTotal(id) { const l = cardLevelsOf(id); return l[1] + l[2] + l[3]; }
  function cardTopLevel(id) { const l = cardLevelsOf(id); return l[3] ? 3 : (l[2] ? 2 : (l[1] ? 1 : 0)); }
  // 星级→效果权重：★1=1，每升1★ 乘 STAR_BOOST 倍（★2=×starBoost，★3=×starBoost²）。
  // 数值只在升星时提升（不随持有张数累加），倍数可在配置 starBoost 自行调整。
  const STAR_BOOST = (SC.starBoost != null) ? SC.starBoost : 2.0;
  function starWeight(star) { return Math.pow(STAR_BOOST, star - 1); }
  function cardStarWeight(id) { return starWeight(Math.max(1, cardTopLevel(id))); }
  // 被动卡当前星的数值（用于详情/提示展示）
  function cardEffectText(c) {
    if (!c) return "";
    const w = cardStarWeight(c.id);
    function pct(v) { return Math.round((Math.pow(v, w) - 1) * 100); }
    if (c.atkIntervalMul != null) return "全军攻速 +" + pct(1 / c.atkIntervalMul) + "%";
    if (c.dmgMul != null) return "全军攻击力 +" + pct(c.dmgMul) + "%";
    if (c.hpMul != null) return "全军生命上限 +" + pct(c.hpMul) + "%";
    if (c.splashFactor != null) return "攻击附带 " + Math.round(c.splashFactor * w * 100) + "% 溅射";
    if (c.vamp != null) return "攻击吸血 " + Math.round(c.vamp * w * 100) + "%";
    if (c.bountyMul != null) return "击杀赏金 +" + pct(c.bountyMul) + "%";
    if (c.enemySlow != null) return "敌军减速 " + Math.round((1 - Math.pow(c.enemySlow, w)) * 100) + "%";
    return c.desc || "";
  }
  function makeBuffs() {
    const b = { atkIntervalMul: 1, dmgMul: 1, hpMul: 1, bountyMul: 1, enemySlow: 1,
      splashFactor: 0, splashRange: 1.2, vamp: 0 };
    for (const id in cardLevels) {
      const c = passiveCfg(id);
      if (!c) continue;
      const w = cardStarWeight(id);
      for (const kk of BUFF_MUL) if (c[kk] != null) b[kk] *= Math.pow(c[kk], w);
      if (c.splashFactor != null) b.splashFactor += c.splashFactor * w;
      if (c.splashRange != null) b.splashRange = Math.max(b.splashRange, c.splashRange);
      if (c.vamp != null) b.vamp += c.vamp * w;
    }
    return b;
  }
  // 好感加成后的单位数值
  function effHp(def, level) { return Math.round(def.hp * buffs.hpMul * statMul(level)); }
  function effDmg(def, level) { return def.damage * buffs.dmgMul * statMul(level); }
  function effInterval(def) { return Math.max(0.1, def.attackInterval * buffs.atkIntervalMul); }

  // 击杀掉落技能卡（被动/主动均可获得）
  function maybeDropCard(isBoss, x, y) {
    if (!SC || (!(SC.passive && SC.passive.length) && !(SC.active && SC.active.length))) return;
    if (isBoss ? !SC.bossDrop : Math.random() > (SC.dropChance || 0)) return;
    let pool = [];
    for (const p of (SC.passive || [])) pool.push(p);
    for (const a of (SC.active || [])) pool.push(a);
    if (!pool.length) return;
    let sum = 0; for (const p of pool) sum += (p.weight || 1);
    let r = Math.random() * sum;
    let pick = pool[pool.length - 1];
    for (const p of pool) { r -= (p.weight || 1); if (r <= 0) { pick = p; break; } }
    addCard(pick.id);
    addFloat(x, y - getCellSize() * 0.4, "技能卡", "#ffd97a", 0.2, 0.9);
    if (window.SFX) SFX.play("card");
  }
  // 获得一张卡：同名同阶 3 张自动合并升 1 阶
  function addCard(id) {
    if (!cardLevels[id]) cardLevels[id] = { 1: 0, 2: 0, 3: 0 };
    cardLevels[id][1]++;
    let mergedUp = false;
    for (let L = 1; L <= 2; L++) {
      while (cardLevels[id][L] >= 3) { cardLevels[id][L] -= 3; cardLevels[id][L + 1]++; mergedUp = true; }
    }
    const pc = passiveCfg(id);
    // 生命类被动：变强时对场上已有单位即时抬高上限
    if (pc && pc.hpMul) {
      for (const s of soldiers) { if (!s.dead) { s.maxHp = effHp(unitDef(s.type), s.level); s.hp = Math.min(s.maxHp, s.hp); } }
    }
    buffs = makeBuffs();
    renderCardBar();
    const c = pc || activeCfg(id);
    if (mergedUp) setHint("技能升阶：" + (c ? c.name : "？") + " → ★" + cardTopLevel(id) + "（效果提升）");
    else setHint("获得技能：" + (c ? c.name : "？") + (c && pc ? "：" + cardEffectText(c) : ""));
  }
  // 渲染右侧两列卡片：主动列在前，被动列在后
  function renderCardBar() {
    if (!cardPassiveEl || !cardActiveEl) return;
    // 主动列（前）
    cardActiveEl.innerHTML = "";
    let anyA = false;
    for (const c of (SC.active || [])) {
      if (cardTopLevel(c.id) === 0) continue;
      anyA = true;
      cardActiveEl.appendChild(makeChip(c, (activeCds[c.id] || 0)));
    }
    if (!anyA) cardActiveEl.innerHTML = "<span class='card-empty'>暂无主动技能<br>战斗中点卡片可施放</span>";
    // 被动列（后）
    cardPassiveEl.innerHTML = "";
    let anyP = false;
    for (const c of (SC.passive || [])) {
      if (cardTopLevel(c.id) === 0) continue;
      anyP = true;
      cardPassiveEl.appendChild(makeChip(c, -1));
    }
    if (!anyP) cardPassiveEl.innerHTML = "<span class='card-empty'>暂无被动技能<br>击杀敌人掉落</span>";
  }
  function makeChip(c, cd) {
    const info = cardTopLevel(c.id);
    const isActive = cd !== -1;
    const d = document.createElement("div");
    d.className = "card-chip lvl" + Math.max(1, info) + (isActive ? " act" : "");
    d.title = c.name + "：" + (isActive ? c.desc : cardEffectText(c));
    // 分档显示持有数：主徽＝最高星张数，有低星残余时左上角追加小徽（如 ★2×1 ＋★1×2）
    const lv = cardLevelsOf(c.id);
    const tiers = [];
    for (let L = 3; L >= 1; L--) if (lv[L] > 0) tiers.push({ L: L, n: lv[L] });
    let mainHtml = "×0", lowHtml = "";
    if (tiers.length) {
      mainHtml = "★" + tiers[0].L + "×" + tiers[0].n;
      if (tiers.length > 1) lowHtml = "+" + tiers.slice(1).map(t => "★" + t.L + "×" + t.n).join("");
    }
    d.innerHTML = "<span class='c-short' style='color:" + c.color + "'>" + c.short +
      "<span class='c-count'>" + mainHtml + "</span>" +
      (lowHtml ? "<span class='c-low'>" + lowHtml + "</span>" : "") + "</span>" +
      "<span class='c-name'>" + c.name + "</span>" +
      (isActive && cd > 0 ? "<span class='c-cd'>" + Math.ceil(cd) + "</span>" : "");
    // 点击卡片 → 查看详情
    d.addEventListener("click", function () { openCardDetail(c.id); });
    return d;
  }

  // ---------- 卡片详情弹层 ----------
  let cardModal = null, cmName = null, cmLevel = null, cmDesc = null, cmMerge = null, cmCastBtn = null;
  function hookCardModal() {
    cardModal = document.getElementById("cardModal");
    if (!cardModal) return;
    cmName = document.getElementById("cm-name");
    cmLevel = document.getElementById("cm-level");
    cmDesc = document.getElementById("cm-desc");
    cmMerge = document.getElementById("cm-merge");
    cmCastBtn = document.getElementById("btn-cm-cast");
    document.getElementById("btn-cm-close").addEventListener("click", closeCardModal);
    if (cmCastBtn) cmCastBtn.addEventListener("click", function () {
      const id = cmCastBtn.getAttribute("data-id");
      if (phase !== "battle") { setHint("战斗中才能施放主动技能"); return; }
      if (activeCds[id] > 0) { setHint("该技能冷却中，请稍候"); return; }
      const lv = parseInt(cmCastBtn.getAttribute("data-level"), 10) || 1;
      closeCardModal();
      if (casting) cancelCast();
      casting = { id: id, level: lv };
      if (canvas) canvas.style.cursor = "crosshair";
      const c = activeCfg(id);
      setHint("已选「" + (c ? c.name : "") + "」——在战场上点击落点释放，右键/Esc 取消");
    });
  }
  function openCardDetail(id) {
    if (!cardModal) return;
    const pc = passiveCfg(id), ac = activeCfg(id);
    const c = pc || ac;
    if (!c) return;
    const cnt = cardTotal(id);
    const lv = Math.max(1, cardTopLevel(id));
    cmName.textContent = c.name;
    cmLevel.textContent = "★" + lv;
    cmLevel.className = "cm-lv lvl" + lv;
    // 被动显示当前实际效果数值（随升阶提升）；主动显示技能描述
    cmDesc.textContent = pc ? ("当前效果：" + cardEffectText(c)) : c.desc;
    const atMax = lv >= 3;
    cmMerge.textContent = pc
      ? "已拥有 ×" + cnt + " · 当前★" + lv + (atMax
        ? "（已达最高阶，多余卡片继续增强效果）"
        : " · 集齐 3 张★" + lv + " 合成★" + (lv + 1) + "（数量将减少、效果大幅提升）")
      : "已拥有 ×" + cnt + " · 当前★" + lv + (atMax
        ? "（已达最高阶）"
        : " · 集齐 3 张★" + lv + " 合成★" + (lv + 1) + "（数量将减少、威力提升）");
    if (cmCastBtn) {
      cmCastBtn.style.display = ac ? "block" : "none";
      cmCastBtn.setAttribute("data-id", id);
      cmCastBtn.setAttribute("data-level", lv);
    }
    cardModal.hidden = false;
  }
  function closeCardModal() { if (cardModal) cardModal.hidden = true; }
  function cancelCast() {
    casting = null;
    if (canvas) canvas.style.cursor = "default";
    renderCardBar();
  }
  // 手动施放：在战场坐标 (px,py) 处释放（按主动卡等级放大效果）
  function resolveCast(px, py) {
    if (!casting) { renderCardBar(); return; }
    const meta = activeCfg(casting.id);
    if (!meta) { casting = null; renderCardBar(); return; }
    const k = starWeight(casting.level); // 主动技能伤害/数值按星级放大（同 starBoost 可配置）
    const cs = getCellSize();
    const _rad = (meta.radius || 2) * cs;
    const s = Math.min(1, Math.max(0.28, _rad));
    addExplosion(px, py, s, 0.4);
    if (window.SFX) SFX.play("boom");
    switch (meta.id) {
      case "thunder":
      case "rain": {
        const r2 = _rad;
        for (const e of enemies) {
          if (e.dead) continue;
          if (Math.hypot(e.x - px, e.y - py) <= r2) {
            damageEnemy(e, (meta.dmg || 0) * k);
            if (meta.stun) applyStun(e, meta.stun);
            addSparks(e.x, e.y, 5, "#fff", 120);
          }
        }
        break;
      }
      case "freeze":
        for (const e of enemies) { if (!e.dead) applySlow(e, meta.slowMul, meta.slowDur); }
        setHint("全场敌军减速 " + Math.round((1 - meta.slowMul) * 100) + "%");
        break;
      case "healwall":
        for (const u of soldiers) { if (!u.dead) { u.hp = Math.min(u.maxHp, u.hp + (meta.heal || 0) * k); addFloat(u.x, u.y - cs * 0.4, "+" + Math.round((meta.heal || 0) * k), "#7dffb0", 0.16, 0.6); } }
        break;
      case "grainfest":
        grain += Math.round((meta.grain || 0) * k);
        addFloat(px, py, "+" + Math.round((meta.grain || 0) * k) + "粮", "#ffd700", 0.22, 0.8);
        updateHud();
        break;
    }
    activeCds[casting.id] = meta.cd || 0;
    casting = null;
    if (canvas) canvas.style.cursor = "default";
    renderCardBar();
    updateHud();
  }
  function addShake() { /* 震屏已关闭（保留接口，想开启时恢复实现即可） */ }
  function addFloat(x, y, text, color, size, life) {
    fxFloats.push({ x: x, y: y, text: text, color: color || "#fff", size: size || 0.2, life: life || 0.6, ttl: life || 0.6 });
    if (fxFloats.length > 80) fxFloats.shift();
  }
  // 波次横幅：同一时间只保留一条（新替旧），避免「破 / 来袭」同屏重影
  function announce(text, color) {
    waveBanner = { text: text, color: color || "#ffd97a", t: 0, dur: 1.5 };
  }
  function addSlash(x, y, dir, color) {
    fxSlashes.push({ x: x, y: y, dir: dir, color: color || "#ffffff", life: 0.2, ttl: 0.2 });
  }
  function addBullet(x, y, target, color) {
    bullets.push({ x: x, y: y, tx: target.x, ty: target.y, color: color, life: 0.4, ttl: 0.4 });
  }
  function easeOutBack(t) {
    const c = 1.70158;
    const u = t - 1;
    return 1 + (c + 1) * u * u * u + c * u * u;
  }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function smoothstep(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }
  function addSparks(x, y, n, color, speed) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (0.35 + Math.random() * 0.65) * (speed || 120);
      const life = 0.3 + Math.random() * 0.25;
      fxParts.push({
        x: x, y: y,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: life, ttl: life,
        color: color, size: 1.5 + Math.random() * 2
      });
    }
    if (fxParts.length > 260) fxParts.splice(0, fxParts.length - 260);
  }
  function addDeathFx(x, y, r, color, isBoss, text) {
    fxDeaths.push({ x: x, y: y, r: r, color: color, life: 0.45, ttl: 0.45, isBoss: !!isBoss, text: text || null });
    addSparks(x, y, isBoss ? 16 : 8, color, isBoss ? 190 : 130);
  }
  function addExplosion(x, y, radius, dur) {
    explosions.push({ x: x, y: y, life: dur, ttl: dur, radius: radius });
    addSparks(x, y, 6, "#ffb74d", 150);
  }
  function killSoldier(sl) {
    if (sl.dead) return;
    sl.dead = true;
    const def = unitDef(sl.type);
    const cs = getCellSize();
    addDeathFx(sl.x, sl.y, cs * 0.3, def.color, def.hero, def.short + (sl.level > 1 ? sl.level : ""));
  }
  function fieldCount() { return buildings.length + soldiers.length; }
  function freeSlot() { for (let i = 0; i < inventory.length; i++) if (!inventory[i]) return i; return -1; }

  // ---------- 升星 / 自动合成 ----------
  // 升星规则：同款同等级满 mergeNeed（默认 3）个 → 并入第一个（升 1 级），其余消失
  const MERGE_NEED = CONFIG.mergeNeed || 3;

  // 统计同款同等级棋子数量（备战区 + 场上武将/小兵/农民一并计入）
  function countOwnedCopies(type, level) {
    let n = 0;
    for (const u of inventory) if (u && u.type === type && u.level === level) n++;
    for (const s of soldiers) if (!s.dead && s.type === type && s.level === level) n++;
    for (const b of buildings) if (b.type === type && b.level === level) n++;
    return n;
  }
  // 找到升星幸存者：优先场上（同款同等级中「先上场」的，placeSeq 最小）→ 备战区低槽位
  function firstCopyOf(type, level) {
    let born = null, bornSeq = Infinity;
    for (const s of soldiers)
      if (!s.dead && s.type === type && s.level === level && s.placeSeq < bornSeq) { born = s; bornSeq = s.placeSeq; }
    for (const b of buildings)
      if (b.type === type && b.level === level && b.placeSeq < bornSeq) { born = b; bornSeq = b.placeSeq; }
    if (born) return { kind: "field", uid: born.uid };
    for (let i = 0; i < inventory.length; i++)
      if (inventory[i] && inventory[i].type === type && inventory[i].level === level) return { kind: "inv", i: i };
    return null;
  }
  // 合并：幸存者升 1 级，其余同款同等级消失（备战区清槽、场上武将/小兵阵亡、场上农民移除）
  function doMergeCopies(type, level) {
    const t = firstCopyOf(type, level);
    if (!t) return;
    if (t.kind === "inv") {
      inventory[t.i] = { type: type, level: level + 1 };
      // 场上同款同等级需全部消失
      for (const s of soldiers) if (!s.dead && s.type === type && s.level === level) killSoldier(s);
      for (let i = buildings.length - 1; i >= 0; i--) if (buildings[i].type === type && buildings[i].level === level) buildings.splice(i, 1);
    } else {
      const s = soldiers.find(function (x) { return x.uid === t.uid; });
      if (s) {
        s.level = level + 1;
        s.maxHp = unitDef(type).hp * statMul(level + 1);
        s.hp = s.maxHp;
      } else {
        const b = buildings.find(function (x) { return x.uid === t.uid; });
        if (!b) return;
        b.level = level + 1;
      }
    }
    for (let i = 0; i < inventory.length; i++)
      if (inventory[i] && inventory[i].type === type && inventory[i].level === level && !(t.kind === "inv" && t.i === i))
        inventory[i] = null;
    for (const s of soldiers)
      if (!s.dead && s.type === type && s.level === level && !(t.kind === "field" && t.uid === s.uid))
        killSoldier(s);
    for (let i = buildings.length - 1; i >= 0; i--)
      if (buildings[i] && buildings[i].type === type && buildings[i].level === level && !(t.kind === "field" && t.uid === buildings[i].uid))
        buildings.splice(i, 1);
  }
  // 自动升星：同款同等级（含备战区 + 场上）满 mergeNeed 自动并入第一个，其余消失；连锁升级
  // 例：场上 1 个关羽 + 背包 2 个关羽 → 自动合成 Lv2
  function autoMergeInventory() {
    let changed = false;
    let again = true;
    while (again) {
      again = false;
      for (let i = 0; i < inventory.length; i++) {
        const u = inventory[i];
        if (!u) continue;
        if (u.level >= CONFIG.maxLevel) continue;
        if (countOwnedCopies(u.type, u.level) >= MERGE_NEED) {
          doMergeCopies(u.type, u.level);
          changed = true;
          again = true;
          break;
        }
      }
      if (again) continue;
      for (const s of soldiers) {
        if (s.dead) continue;
        if (s.level >= CONFIG.maxLevel) continue;
        if (countOwnedCopies(s.type, s.level) >= MERGE_NEED) {
          doMergeCopies(s.type, s.level);
          changed = true;
          again = true;
          break;
        }
      }
      if (again) continue;
      for (const b of buildings) {
        if (b.level >= CONFIG.maxLevel) continue;
        if (countOwnedCopies(b.type, b.level) >= MERGE_NEED) {
          doMergeCopies(b.type, b.level);
          changed = true;
          again = true;
          break;
        }
      }
    }
    if (changed) { renderInventory(); updateHud(); }
  }

  function activePhase() { return phase === "ready" || phase === "battle" || phase === "between"; }
  function diffConf() { return CONFIG.difficulties[diffKey] || CONFIG.difficulties.normal; }
  // 城门格（约定所有路径末格相同）
  function gateCell() {
    const p0 = curPaths[0];
    return p0[p0.length - 1];
  }

  function setHint(text) {
    if (!hintEl) return;
    if (hintTimer) clearTimeout(hintTimer);
    if (!text) { hintEl.textContent = ""; hintEl.style.display = "none"; return; }
    hintEl.textContent = text;
    hintEl.style.display = "";
    // 重启入场动画（改文本不会自动触发 CSS animation）
    hintEl.style.animation = "none";
    void hintEl.offsetWidth;
    hintEl.style.animation = "";
    hintTimer = setTimeout(function () { hintEl.textContent = ""; hintEl.style.display = "none"; }, 2600);
  }

  function isEndlessLevel() {
    const lv = CONFIG.levels.find(function (l) { return l.id === curLevelId; });
    return !!(lv && lv.endless);
  }

  function updateHud() {
    hudWave.textContent = isEndlessLevel() ? waveIndex + "/∞" : waveIndex + "/" + CONFIG.waves.total;
    hudGrain.textContent = grain;
    hudPop.textContent = fieldCount() + "/" + CONFIG.popCap;

    let text = "准备中";
    if (phase === "battle") text = "第 " + waveIndex + " 波进攻中";
    else if (phase === "between") text = "备战：第 " + (waveIndex + 1) + " 波还有 " + Math.ceil(prepTimer) + " 秒";
    else if (phase === "over") text = "城破……";
    else if (phase === "win") text = "守城成功！";
    hudPhase.textContent = text;

    btnStart.disabled = !(phase === "ready" || phase === "between" || phase === "over" || phase === "win");
    if (phase === "ready") btnStart.textContent = "开始守城";
    else if (phase === "between") btnStart.textContent = "开始第 " + (waveIndex + 1) + " 波";
    else if (phase === "win") {
      const hasNext = CONFIG.levels.some(function (l) { return l.id === curLevelId + 1; });
      btnStart.textContent = hasNext ? "下一关 ▸" : "再战一局";
    }
    else if (phase === "over") btnStart.textContent = "再战一局";
    else btnStart.textContent = "进攻中…";

    btnPause.textContent = paused ? "继续" : "暂停";
    btnPause.classList.toggle("active", paused);
    btnSpeed.textContent = "速度 ×" + speed;

    grainBoxVal.textContent = grain;

    syncShopButtons(); // 粮草/背包变化时同步商店购买按钮可用态
  }

  // ---------- 格子工具 ----------
  function cellFromPoint(px, py) {
    const s = getCellSize();
    const col = Math.floor(px / s);
    const row = Math.floor(py / s);
    if (col < 0 || row < 0 || col >= CONFIG.gridCols || row >= CONFIG.gridRows) return null;
    return { c: col, r: row };
  }
  function buildingAt(col, row) {
    for (const b of buildings) if (b.col === col && b.row === row) return b;
    return null;
  }
  // 某点附近的己方武将（供全向交战判定）
  // rad：可选半径覆盖。传值时按指定半径扫描（敌人用自身 attackRange）；
  // 不传则按各武将自身出手距离：近战 atkRange，远程默认 1.5 格。
  function soldiersNear(x, y, rad) {
    const out = [], cs = getCellSize();
    for (const s of soldiers) {
      if (s.dead) continue;
      const def = unitDef(s.type);
      const r = (rad !== undefined)
        ? rad
        : ((!def.ranged && def.atkRange) ? def.atkRange : 1.5);
      if (Math.hypot(s.x - x, s.y - y) <= r * cs) out.push(s);
    }
    return out;
  }

  // 近战可行走格集合：所有路径格（validatePlace 保证武将驻守格在路上）
  // 近战移动只在这些格之间逐格行走（四方向），绝不斜穿草地
  let PATH_CELL_SET = new Set();
  function rebuildPathCellSet() {
    PATH_CELL_SET = new Set();
    for (const p of LEVEL_PATHS)
      for (const cell of p) PATH_CELL_SET.add(cell.c + "," + cell.r);
  }

  // BFS：沿路径格从 (fc,fr) 走到 (tc,tr) 的下一步格（四方向逐格走）
  // 途经格（不含起点）须为路径格，且距锚点格 (homeC,homeR) 不超过 maxD 格
  // 返回 {c,r}；已在目标格或不可达时返回 null
  function bfsStep(fc, fr, tc, tr, homeC, homeR, maxD) {
    if (fc === tc && fr === tr) return null;
    const key = function (c, r) { return c + "," + r; };
    const startK = key(fc, fr);
    const prev = new Map();
    const seen = new Set([startK]);
    const q = [[fc, fr]];
    while (q.length) {
      const cur = q.shift();
      const c = cur[0], r = cur[1];
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (let i = 0; i < 4; i++) {
        const nc = c + dirs[i][0], nr = r + dirs[i][1], nk = key(nc, nr);
        if (seen.has(nk)) continue;
        if (!PATH_CELL_SET.has(nk)) continue;
        if (Math.hypot(nc - homeC, nr - homeR) > maxD + 1e-9) continue;
        seen.add(nk);
        prev.set(nk, key(c, r));
        if (nc === tc && nr === tr) {
          let curK = nk;
          while (prev.get(curK) !== startK) curK = prev.get(curK);
          const parts = curK.split(",");
          return { c: parseInt(parts[0], 10), r: parseInt(parts[1], 10) };
        }
        q.push([nc, nr]);
      }
    }
    return null;
  }

  function validatePlace(type, level, col, row, fromField) {
    const def = unitDef(type);
    if (!def) return { ok: false, msg: "未知单位" };
    const last = gateCell();
    if (col === last.c && row === last.r) return { ok: false, msg: "城门口不能放单位" };
    if (def.kind === "soldier") {
      if (!isPathCell(col, row)) return { ok: false, msg: "士兵/武将要放在路上" };
    } else {
      if (isPathCell(col, row)) return { ok: false, msg: "农民要放在草地格" };
      if (buildingAt(col, row)) return { ok: false, msg: "这里已经有建筑了" };
    }
    if (!fromField && fieldCount() >= CONFIG.popCap) return { ok: false, msg: "人口已满（" + CONFIG.popCap + "）" };
    return { ok: true };
  }

  function addUnitToField(type, level, col, row) {
    const def = unitDef(type);
    const center = cellCenter(col, row);
    const uid = uidCounter++;
    if (def.kind === "soldier") {
      soldiers.push({
        uid: uid, type: type, level: level,
        col: col, row: row, x: center.x, y: center.y,
        homeC: col, homeR: row,
        hp: effHp(def, level), maxHp: effHp(def, level),
        cd: 0, rage: 0, castT: 0, dead: false, hitFlash: 0,
        animT: 0, animDur: 0, animDir: 0, spawnT: 0.32,
        placeSeq: placeSeqCounter++
      });
    } else {
      buildings.push({
        uid: uid, type: type, level: level,
        col: col, row: row, x: center.x, y: center.y,
        cd: 0, timer: def.produceInterval || def.cooldown,
        recoilT: 0, bounceT: 0, spawnT: 0.32,
        placeSeq: placeSeqCounter++
      });
    }
  }
  function removeFieldUid(uid) {
    for (let i = buildings.length - 1; i >= 0; i--) if (buildings[i].uid === uid) { buildings.splice(i, 1); return; }
    for (let i = soldiers.length - 1; i >= 0; i--) if (soldiers[i].uid === uid) { soldiers.splice(i, 1); return; }
  }
  function findMergeTarget(type, level, col, row) {
    const def = unitDef(type);
    if (def.kind === "soldier") {
      for (const s of soldiers) if (!s.dead && s.col === col && s.row === row && s.type === type && s.level === level) return s;
    } else {
      const b = buildingAt(col, row);
      if (b && b.type === type && b.level === level) return b;
    }
    return null;
  }
  function grabUnitAt(col, row) {
    for (const s of soldiers) if (!s.dead && s.col === col && s.row === row) return s;
    return buildingAt(col, row);
  }

  // ---------- 商店 ----------
  let shopStock = [];
  let shopButtons = []; // 当前购买按钮引用

  // 购买按钮保持可点，原因提示统一由 buyFromShop 弹出（如“粮草不足”“背包已满”）
  function syncShopButtons() {
    for (const b of shopButtons) b.disabled = false;
  }

  function pickRandomType() {
    const total = CONFIG.shop.pool.reduce(function (s, p) { return s + p.weight; }, 0);
    let r = Math.random() * total;
    for (const p of CONFIG.shop.pool) {
      r -= p.weight;
      if (r <= 0) return p.type;
    }
    return CONFIG.shop.pool[0].type;
  }
  function refreshShop() {
    shopStock = [];
    for (let i = 0; i < CONFIG.shop.size; i++) shopStock.push({ type: pickRandomType() });
    renderShop();
  }
  function renderShop() {
    shopItems.innerHTML = "";
    shopButtons = [];
    for (let i = 0; i < shopStock.length; i++) {
      const item = shopStock[i];
      if (!item) {
        const empty = document.createElement("div");
        empty.className = "shop-card empty-shop";
        empty.textContent = "已购";
        shopItems.appendChild(empty);
        continue;
      }
      const def = unitDef(item.type);
      const div = document.createElement("div");
      div.className = "shop-card";
      // 购买即凑齐升星（背包/场上已有 mergeNeed-1 个同款同级）→ 重点标记高亮
      const canUp = countOwnedCopies(item.type, 1) >= MERGE_NEED - 1;
      if (canUp) div.classList.add("up-able");
      // 点击整张卡片即可购买（含按钮区域；按钮不另绑事件，避免冒泡重复触发）
      div.addEventListener("click", function () { buyFromShop(item.type, i); });
      const btn = document.createElement("button");
      btn.textContent = "购买 " + def.cost + " 粮草";
      shopButtons.push(btn);
      div.innerHTML = "<div class='sc-name'>" + def.name + "</div>" +
                      "<div class='sc-lv'>1 级</div>" +
                      (canUp ? "<div class='sc-up'>可升星</div>" : "");
      div.appendChild(btn);
      shopItems.appendChild(div);
    }
    btnRefresh.disabled = false;
  }
  function buyFromShop(type, index) {
    if (phase === "over" || phase === "win") { setHint("本局已结束，请先开启下一局"); return; }
    if (!shopStock[index]) return;
    const def = unitDef(type);
    if (grain < def.cost) { setHint("粮草不足"); return; }
    const idx = freeSlot();
    let merged = false;
    if (idx < 0) {
      // 背包已满：若能凑满同款同级升星，仍可购买并即时自动升星（仿金铲铲：买到的张直接参与合成，不占格）
      if (countOwnedCopies(type, 1) >= MERGE_NEED - 1) {
        grain -= def.cost;
        inventory.push({ type: type, level: 1 }); // 临时挂到末尾参与 autoMerge 合并
        autoMergeInventory();
        inventory.pop();                          // 清掉合成后残留的临时空槽
        merged = true;
      } else {
        setHint("背包已满（5 格），先部署或合成腾位置"); return;
      }
    } else {
      grain -= def.cost;
      inventory[idx] = { type: type, level: 1 };
    }
    shopStock[index] = null;
    if (merged) {
      setHint("背包满也能升星：" + def.name + " 自动合成升 1 级");
      if (window.SFX) SFX.play("merge");
    } else {
      setHint("已购入 " + def.name + " → 放入背包第 " + (idx + 1) + " 格");
      if (window.SFX) SFX.play("buy");
    }
    autoMergeInventory(); // 兜底触发连锁升星
    renderInventory();
    renderShop();
    updateHud();
  }

  // ---------- 背包 ----------
  function renderInventory() {
    inventoryBar.innerHTML = "";
    for (let i = 0; i < inventory.length; i++) {
      const div = document.createElement("div");
      div.className = "slot" + (inventory[i] ? " filled" : "");
      div.dataset.index = i;
      if (inventory[i]) {
        const def = unitDef(inventory[i].type);
        div.innerHTML = def.name + "<br><span class='lv'>Lv" + inventory[i].level + "</span>";
        div.addEventListener("mousedown", function (e) {
          e.preventDefault();
          if (!activePhase()) { setHint("本局已结束，请先开启下一局"); return; }
          startDragFromInv(i);
        });
      } else {
        div.innerHTML = "<span class='empty'>空</span>";
      }
      inventoryBar.appendChild(div);
    }
  }

  // ---------- 拖拽 ----------
  function showDragGhost(type, level) {
    const def = unitDef(type);
    dragGhost.style.background = def.color;
    dragGhost.textContent = def.name + " Lv" + level;
    dragGhost.style.display = "block";
  }
  function hideDragGhost() { dragGhost.style.display = "none"; }

  function startDragFromInv(slot) {
    const u = inventory[slot];
    if (!u) return;
    drag = { type: u.type, level: u.level, from: "inv", slot: slot };
    showDragGhost(u.type, u.level);
  }
  function startDragFromField(unit) {
    drag = { type: unit.type, level: unit.level, from: "field", uid: unit.uid, srcCol: unit.col, srcRow: unit.row };
    showDragGhost(unit.type, unit.level);
  }
  function clearDrag() { drag = null; hideDragGhost(); }

  function removeDragSource() {
    if (!drag) return;
    if (drag.from === "inv") {
      inventory[drag.slot] = null;
      renderInventory();
    } else {
      removeFieldUid(drag.uid);
    }
  }

  function performDrop(clientX, clientY) {
    if (!drag) return;
    const d = drag;

    // 0) 出售区
    const dropEl = document.elementFromPoint(clientX, clientY);
    const inSell = dropEl && dropEl.closest ? !!dropEl.closest("#sell-zone") : false;
    if (inSell) {
      if (phase === "over" || phase === "win") { setHint("本局已结束，请先开启下一局"); clearDrag(); return; }
      const sdef = unitDef(d.type);
      const value = sdef.cost * Math.pow(2, d.level - 1);
      removeDragSource();
      grain += value;
      setHint("已出售 " + sdef.name + " Lv" + d.level + " → +" + value + " 粮草");
      if (window.SFX) SFX.play("coin");
      renderShop(); // 腾出背包空格，立即放开购买按钮
      updateHud();
      clearDrag();
      return;
    }

    // 1) 背包格
    const slotEl = dropEl && dropEl.closest ? dropEl.closest(".slot") : null;
    if (slotEl) {
      const idx = parseInt(slotEl.dataset.index, 10);
      const tgt = inventory[idx];
      if (d.from === "inv" && d.slot === idx) { clearDrag(); return; }
      if (tgt && tgt.type === d.type && tgt.level === d.level) {
        if (d.level >= CONFIG.maxLevel) { setHint("已满级，不能再升星"); clearDrag(); return; }
        const need = MERGE_NEED - countOwnedCopies(d.type, d.level);
        if (need > 0) { setHint("升星需 " + MERGE_NEED + " 个同款同等级，还差 " + need + " 个"); clearDrag(); return; }
        removeDragSource();
        doMergeCopies(d.type, d.level); // 并入第一个升 1 级，其余消失
        setHint("合成成功！" + unitDef(d.type).name + " → Lv" + (d.level + 1));
        if (window.SFX) SFX.play("merge");
        renderInventory(); renderShop(); updateHud();
        clearDrag(); return;
      }
      if (!tgt) {
        removeDragSource();
        inventory[idx] = { type: d.type, level: d.level };
        renderInventory(); renderShop(); updateHud();
        autoMergeInventory(); // 凑满 3 个自动升星
        setHint("已放入背包第 " + (idx + 1) + " 格");
        clearDrag(); return;
      }
      setHint("只有相同类型、相同等级的单位才能合成");
      clearDrag(); return;
    }

    // 2) 画布
    const rect = canvas.getBoundingClientRect();
    const cell = cellFromPoint(
      (clientX - rect.left) * (canvas.width / rect.width),
      (clientY - rect.top) * (canvas.height / rect.height)
    );
    if (cell) {
      // 原地点击（点了没拖走）→ 查看该单位信息
      if (d.from === "field" && d.srcCol === cell.c && d.srcRow === cell.r) {
        const src = fieldUnitByUid(d.uid);
        if (src) {
          selected = { kind: "unit", ref: src, born: 0 };
          if (window.SFX) SFX.play("click");
          clearDrag();
          return;
        }
      }
      const tgt = findMergeTarget(d.type, d.level, cell.c, cell.r);
      if (tgt) {
        if (d.level >= CONFIG.maxLevel) { setHint("已满级，不能再升星"); clearDrag(); return; }
        if (d.from === "field" && d.uid === tgt.uid) { clearDrag(); return; }
        const need = MERGE_NEED - countOwnedCopies(d.type, d.level);
        if (need > 0) { setHint("升星需 " + MERGE_NEED + " 个同款同等级，还差 " + need + " 个"); clearDrag(); return; }
        removeDragSource();
        doMergeCopies(d.type, d.level); // 并入第一个升 1 级，其余消失
        const mc = cellCenter(cell.c, cell.r);
        addSparks(mc.x, mc.y, 8, "#ffd700", 130);
        setHint("合成成功！" + unitDef(d.type).name + " → Lv" + (d.level + 1));
        if (window.SFX) SFX.play("merge");
        renderInventory(); renderShop(); updateHud();
        clearDrag(); return;
      }
      const v = validatePlace(d.type, d.level, cell.c, cell.r, d.from === "field");
      if (v.ok) {
        removeDragSource();
        addUnitToField(d.type, d.level, cell.c, cell.r);
        setHint("已部署 " + unitDef(d.type).name);
        autoMergeInventory(); // 部署新棋子后，一并计入场上同款进行自动升星
        renderShop(); // 背包腾出空格，放开购买按钮
        updateHud();
        clearDrag(); return;
      }
      setHint(v.msg);
      clearDrag(); return;
    }
    clearDrag();
  }

  // ---------- 敌军 / 波次 ----------
  // 按当前波次权重随机选择一个可用兵种（只挑 minWave 已解锁的）
  function pickEnemyType() {
    const pool = (CONFIG.enemyTypes || [])
      .filter(t => t.minWave <= waveIndex)
      .map(t => t);
    if (pool.length === 0) return { name: "敌兵", hp: CONFIG.enemy.hp, dmg: CONFIG.enemy.damage,
      attackInterval: CONFIG.enemy.attackInterval, attackRange: CONFIG.enemy.attackRange,
      bounty: CONFIG.enemy.bounty, radiusMul: CONFIG.enemy.radiusMul || 0.26,
      speedMul: CONFIG.enemy.speedMul || 1, color: CONFIG.enemy.color };
    let sum = 0; for (const t of pool) sum += (t.weight || 1);
    let r = Math.random() * sum;
    for (const t of pool) { r -= (t.weight || 1); if (r <= 0) return t; }
    return pool[pool.length - 1];
  }
  function spawnEnemy(isBoss) {
    const p = spawnRR % curPaths.length;   // 轮询分路：公平分配到各入口
    spawnRR++;
    const first = curPaths[p][0];
    const pos = cellCenter(first.c, first.r);
    // 批量出兵时同批小兵在出生格附近随机散布，避免完全重叠
    const jit = getCellSize() * 0.28;
    const jx = pos.x + (Math.random() - 0.5) * jit * 2;
    const jy = pos.y + (Math.random() - 0.5) * jit * 2;
    if (isBoss) {
      // 按登场回合轮换 Boss（第 5 波第 1 个，之后每 bossEvery 波换下一个，循环）
      const list = (CONFIG.bosses && CONFIG.bosses.length) ? CONFIG.bosses : [CONFIG.boss];
      const chosen = list[Math.floor(((waveIndex - 1) / (CONFIG.waves.bossEvery || 5))) % list.length];
      const bd = Object.assign({}, CONFIG.boss, chosen);   // 兜底合并默认 Boss 字段
      const scale = 1 + 0.1 * (waveIndex - 1);
      enemies.push({
        path: p, at: 0, x: jx, y: jy,
        hp: bd.hp * scale, maxHp: bd.hp * scale,
        isBoss: true, def: bd,
        fighting: false, attackCd: 0, dead: false, flash: 0,
        stunTime: 0, ampTime: 0, ampMul: 1,
        // 技能状态
        skillCd: (bd.skill && bd.skill.cd) ? bd.skill.cd * 0.5 : 999, // 首次技能更快放出
        shieldTime: 0, shieldMax: 0,
        buffAtkMul: 1, buffAtkTime: 0, buffSpdMul: 1, buffSpdTime: 0,
        age: 0, walkPhase: Math.random() * Math.PI * 2, lungeT: 0, lungeDir: 0
      });
    } else {
      const def = pickEnemyType();               // 随机兵种
      const hp = def.hp * waveHpMul;
      enemies.push({
        path: p, at: 0, x: jx, y: jy,
        hp: hp, maxHp: hp, def: def,
        isBoss: false,
        fighting: false, attackCd: 0, dead: false, flash: 0,
        slowMul: 1, slowTime: 0, dotDmg: 0, dotInterval: 0, dotTime: 0, dotTimer: 0,
        stunTime: 0, ampTime: 0, ampMul: 1,
        age: 0, walkPhase: Math.random() * Math.PI * 2, lungeT: 0, lungeDir: 0
      });
    }
  }
  // Boss 技能文案（供信息面板显示）
  function skillDesc(sk) {
    if (!sk) return "";
    const cd = sk.cd ? sk.cd + " 秒" : "";
    switch (sk.id) {
      case "summon": return "召唤小兵 ×" + (sk.num || 3) + "（每 " + cd + "）";
      case "shield": return "护盾免疫 + 回血 " + (sk.heal || 0) + "（" + (sk.dur || 5) + " 秒 / " + cd + "）";
      case "enrage": return "狂暴攻速" + (sk.atkMul || 1.5) + "×" + (sk.spdMul || 1.3) + "× + 践踏" + (sk.range || 2) + "格（每 " + cd + "）";
      case "fury": return "狂暴 + 践踏 + 召唤 ×" + (sk.summon || 2) + "（每 " + cd + "）";
      default: return "";
    }
  }

  // Boss 技能施放：按 skill.id 分发不同效果（参数都在 config.bosses[].skill 里可调）
  function castBossSkill(e) {
    const sk = e.def && e.def.skill;
    if (!sk) return;
    const cs = getCellSize();
    const s = e.def;
    addFloat(e.x, e.y - cs * 0.9, "技", "#ffd700", 0.4, 0.9);   // 通用施法花字
    addSparks(e.x, e.y, 10, "#ffd700", 140);
    addShake(0.12, 1.6);

    if (sk.id === "summon") {
      // 召唤：立刻补几只小兵
      const n = sk.num || 3;
      for (let k = 0; k < n; k++) spawnEnemy(false);
      if (window.SFX) SFX.play("alarm");
    } else if (sk.id === "shield") {
      // 护盾 + 回血：一段时间内免疫伤害，并回一口血
      e.shieldTime = sk.dur || 5;
      e.shieldMax = e.shieldTime;
      if (sk.heal) e.hp = Math.min(e.maxHp, e.hp + sk.heal);
      addFloat(e.x, e.y - cs, "护盾 +" + (sk.heal || 0), "#8efff0", 0.5, 1);
    } else if (sk.id === "enrage" || sk.id === "fury") {
      // 狂暴：提升攻速与移速
      e.buffAtkMul = sk.atkMul || 1.5; e.buffAtkTime = sk.dur || 5;
      e.buffSpdMul = sk.spdMul || 1.3; e.buffSpdTime = sk.dur || 5;
      e.buffAtkMul -= 1; e.buffSpdMul -= 1;            // 适配 buffAtkTime 归零逻辑（存增量）
      addFloat(e.x, e.y - cs, "狂暴", "#ff8a4d", 0.5, 1);
      if (sk.stomp) stomp(e, sk);                       // 践踏
      if (sk.id === "fury" && sk.summon) for (let k = 0; k < sk.summon; k++) spawnEnemy(false);
    }
  }

  // Boss 践踏：对周围 range 内所有武将造成一次 AOE 伤害（不是普通攻击的单个目标）
  function stomp(e, sk) {
    const r = (sk.range || 2) * getCellSize();
    const dmg = sk.stompDmg || 30;
    addShake(0.2, 2);
    addSparks(e.x, e.y, 14, "#ff6b3d", 180);
    for (let i = soldiers.length - 1; i >= 0; i--) {
      const sl = soldiers[i];
      if (sl.dead) continue;
      if (Math.hypot(sl.x - e.x, sl.y - e.y) <= r) {
        sl.hp -= dmg;
        sl.hitFlash = 0.15;
        addFloat(sl.x, sl.y - 20, "-" + dmg, "#ff5252", 0.3, 0.7);
        gainRage(sl, CONFIG.rage.perHurt);
        if (sl.hp <= 0) killSoldier(sl);
      }
    }
  }

  function arriveGate(e) {
    e.dead = true; // 已入城：不再接收任何延迟命中结算
    gateHp -= e.isBoss ? 10 : 1;
    if (window.SFX) SFX.play("alarm");
    const end = gateCell();
    const ec = cellCenter(end.c, end.r);
    addFloat(ec.x, ec.y - getCellSize() * 0.6, "-" + (e.isBoss ? 10 : 1) + "耐", "#ff5252", 0.22, 0.8);
    addSparks(ec.x, ec.y, 5, "#ff5252", 110);
    if (gateHp <= 0) { gateHp = 0; phase = "over"; if (window.SFX) SFX.play("lose"); updateHud(); }
  }
  function damageEnemy(e, dmg) {
    if (e.dead) return;
    if (e.shieldTime > 0) {                       // Boss 护盾：期间免疫伤害
      e.shieldTime -= 0.02;                       // 每击略削护盾（视觉反馈）
      addFloat(e.x, e.y - getCellSize() * 0.5, "格挡", "#8efff0", 0.18, 0.5);
      return;
    }
    if (e.ampTime > 0) dmg *= (e.ampMul || 1);   // 易伤：伤害加深
    e.hp -= dmg;
    if (dmg > 0 && !e.dead) e.flash = 0.1; // 受击闪白
    if (dmg > 0 && !e.dead) addFloat(e.x, e.y - getCellSize() * 0.5, String(Math.round(dmg)), "#ffffff", 0.16, 0.5);
    if (e.hp <= 0 && !e.dead) {
      e.dead = true;
      const d = e.def || CONFIG.enemy;
      const bounty = (e.isBoss ? (d.bounty || CONFIG.boss.bounty) : d.bounty) * buffs.bountyMul;
      grain += bounty;
      addFloat(e.x, e.y, "+" + Math.round(bounty) + "粮", "#ffd700", 0.24, 0.8);
      const cs = getCellSize();
      addDeathFx(e.x, e.y, cs * ((e.isBoss ? d : d).radiusMul || 0.26),
        e.isBoss ? (d.color || CONFIG.boss.color) : d.color, e.isBoss, e.isBoss ? ((d.ch) || "将") : null);
      maybeDropCard(e.isBoss, e.x, e.y); // 击杀掉落技能卡
    }
  }
  function applySlow(e, mul, dur) {
    e.slowMul = mul;
    e.slowTime = dur;
  }
  function applyDot(e, dmg, interval, dur) {
    e.dotDmg = dmg;
    e.dotInterval = interval;
    e.dotTime = dur;
    e.dotTimer = interval;
  }
  // 眩晕：定身（不能移动、不能攻击），重复施加取较长者
  function applyStun(e, dur) {
    e.stunTime = Math.max(e.stunTime || 0, dur);
  }
  // 伤害加深（易伤）：期间所受伤害 ×mul
  function applyAmp(e, mul, dur) {
    e.ampMul = mul;
    e.ampTime = dur;
  }
  // 武将怒气积攒：攻击 / 受击都能涨，攒满自动放技能
  function gainRage(u, amt) {
    if (!u || u.dead) return;
    const def = unitDef(u.type);
    if (!def || !def.hero || !def.skill) return;
    const was = u.rage || 0;
    u.rage = Math.min(CONFIG.rage.max, was + amt);
    if (was < CONFIG.rage.max && u.rage >= CONFIG.rage.max) {
      addFloat(u.x, u.y - getCellSize() * 0.75, "怒气已满", "#ff9d3a", 0.18, 0.8);
    }
  }
  function nearestEnemy(x, y, rangeCells) {
    const s = getCellSize();
    const rangePx = rangeCells * s;
    let best = null, bestDist = Infinity;
    for (const e of enemies) {
      if (e.dead) continue;
      const dx = e.x - x, dy = e.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= rangePx && dist < bestDist) { bestDist = dist; best = e; }
    }
    return best;
  }

  function waveCount(n) {
    const dc = diffConf();
    return Math.max(1, Math.floor((CONFIG.waves.baseCount + (n - 1) * CONFIG.waves.countPerWave) * dc.countMul));
  }

  function beginWave(n) {
    waveIndex = n;
    phase = "battle";
    waveToSpawn = waveCount(n);
    waveBossPending = (n % CONFIG.waves.bossEvery === 0);
    if (waveBossPending) waveToSpawn += 1;
    waveSpawnTimer = 0.3;
    waveHpMul = (1 + CONFIG.waves.hpGrowth * (n - 1)) * diffConf().hpMul;
    // 小兵速度前期慢、随波次加快，达到 maxSpeed 后封顶
    waveSpeed = Math.min(CONFIG.enemy.speed + (CONFIG.enemy.speedPerWave || 0) * (n - 1), CONFIG.enemy.maxSpeed || CONFIG.enemy.speed);
    announce("第 " + n + " 波 · 来袭", "#ff8c6a");
    // 波次间不再自动刷新商店（商店始终保留当前上架，需手动刷新）→ 锁定已无意义
    updateHud();
  }
  function grantWaveReward() {
    const bonus = CONFIG.waves.bonusBase + waveIndex * CONFIG.waves.bonusPerWave;
    grain += bonus;
    if (window.SFX) SFX.play("coin");
    setHint("第 " + waveIndex + " 波守住！奖励 " + bonus + " 粮草");
    recordWaveCleared(); // 存档：最高波次
  }
  function onWaveCleared() {
    grantWaveReward();
    if (waveIndex >= CONFIG.waves.total && !isEndlessLevel()) {
      phase = "win";
      if (window.SFX) SFX.play("win");
      recordLevelCleared(); // 存档：通关 + 解锁下一关
      updateHud();
    } else {
      phase = "between";
      prepTimer = CONFIG.waves.prepTime;
      if (prepTimer <= 0) {
        beginWave(waveIndex + 1); // 不停顿：立刻开下一波（省略「破」横幅，防止与「来袭」叠加重影）
        return;
      }
      announce("第 " + waveIndex + " 波 · 破", "#ffd700");
      updateHud();
    }
  }

  // ---------- 更新 ----------
  function update(dt) {
    if (phase === "between") {
      prepTimer -= dt;
      if (prepTimer <= 0) beginWave(waveIndex + 1);
      updateHud();
      return;
    }
    if (phase !== "battle") return;

    // 出生：少量错峰出兵（spawnEnemy 内部轮询分配出生点，故每次只从少数几个点各出一两只，绝不全部点同时爆）
    // 难度随波次递增：单次放出数温和上调（上限 < 路数，保证不会所有点齐涌）+ 放兵间隔逐波缩短
    if (waveToSpawn > 0) {
      waveSpawnTimer -= dt;
      if (waveSpawnTimer <= 0) {
        const maxPerTick = Math.max(1, curPaths.length - 1);   // 一次最多占用的出生点数（留一个点缓冲）
        const batchBoost = Math.floor((waveIndex - 1) / 4);    // 大约每 4 波，单次多放一个
        const batch = Math.min(maxPerTick, (CONFIG.enemy.spawnBatch || 1) + batchBoost);
        const spawn = Math.min(batch, waveToSpawn);
        for (let i = 0; i < spawn; i++) {
          if (waveBossPending) { spawnEnemy(true); waveBossPending = false; }
          else spawnEnemy(false);
          waveToSpawn--;
        }
        waveSpawnTimer = Math.max(0.22, (CONFIG.enemy.spawnInterval || 0.6) * Math.pow(0.9, waveIndex - 1));
      }
    }

    updateBuildings(dt);
    updateSoldiers(dt);
    updateHeroSkills(dt);
    updateEnemies(dt);
    updatePendingHits(dt); // 命中帧结算：伤害/怒气/命中特效与挥击动作同步

    // 主动技能卡冷却推进（战斗中）
    let cdChanged = false;
    for (const id in activeCds) if (activeCds[id] > 0) { activeCds[id] = Math.max(0, activeCds[id] - dt); cdChanged = true; }
    if (casting || cdChanged) renderCardBar();

    enemies = enemies.filter(function (e) { return !e.dead; });
    soldiers = soldiers.filter(function (s) { return !s.dead; });

    // 前一波未结束（场上还有敌人）决不放出下一波；出尽且清场后才开下一波
    if (phase === "battle" && waveToSpawn <= 0 && enemies.length === 0) onWaveCleared();
    updateHud();
  }

  // 建筑：农民产粮
  function updateBuildings(dt) {
    for (const b of buildings) {
      const def = unitDef(b.type);
      if (def.kind !== "farmer") continue;
      b.timer -= dt;
      if (b.timer <= 0) {
        const got = def.produce[b.level - 1];
        grain += got;
        b.timer = def.produceInterval;
        b.bounceT = 0.45;   // 产粮欢快弹跳
        addFloat(b.x, b.y - getCellSize() * 0.5, "+" + got + "粮", "#ffd700", 0.18, 0.7);
      }
    }
  }

  function updateSoldiers(dt) {
    for (const s of soldiers) {
      if (s.dead) continue;
      const def = unitDef(s.type);

      if (def.ranged) {
        // 远程：站桩拉弓，放弦瞬间（命中帧）出伤
        s.cd -= dt;
        if (s.cd <= 0) {
          const target = nearestEnemy(s.x, s.y, def.range);
          if (target) {
            s.cd = effInterval(def);
            s.animDur = 0.3;
            s.animT = s.animDur;
            s.animDir = Math.atan2(target.y - s.y, target.x - s.x);
            const hp = HIT_P[def.weapon] !== undefined ? HIT_P[def.weapon] : 0.5;
            scheduleHit(s, target, effDmg(def, s.level), s.animDur * hp,
              { dir: s.animDir, ranged: true, color: def.color });
          }
        }
        continue;
      }

      // 近战：全向寻敌（真实距离判定，四周任意方向的敌人都可交战，不限同一条路）
      // 追击半径（engage，锚点圈）与攻击距离（atkRange，出手圈）独立配置
      const cs = getCellSize();
      const homePt = cellCenter(s.homeC, s.homeR);
      const atkR = (def.atkRange || 1.5) * cs;

      // 出手前必须「完全进框」：武者已与所在格中心对齐站稳（不在两格边界线上）。
      // 否则敌人虽进入攻击距离，武者仍站在线上隔空挥刀 —— 先把步子走稳进框，再开打。
      const stoodPt = cellCenter(s.col, s.row);
      const stoodIn = Math.hypot(s.x - stoodPt.x, s.y - stoodPt.y) <= cs * 0.06;

      // 1) 交战：完全进框后，攻击距离内最近的敌人（任意方向、任意路径）
      let target = null, bestD = Infinity;
      if (stoodIn) {
        for (const e of enemies) {
          if (e.dead) continue;
          const d = Math.hypot(e.x - s.x, e.y - s.y);
          if (d <= atkR && d < bestD) { bestD = d; target = e; }
        }
      }
      if (target) {
        s.cd -= dt;
        if (s.cd <= 0) {
          s.cd = effInterval(def);
          s.animDur = Math.max(0.18, Math.min(0.34, effInterval(def) * 0.6));
          s.animT = s.animDur;
          s.animDir = Math.atan2(target.y - s.y, target.x - s.x);
          // 伤害延迟至挥击命中帧结算（与武器轨迹、身体突进峰值同步）
          const hp = HIT_P[def.weapon] !== undefined ? HIT_P[def.weapon] : 0.35;
          scheduleHit(s, target, effDmg(def, s.level), s.animDur * hp,
            { dir: s.animDir });
        }
        continue; // 交战距离内保持原位
      }

      // 小兵不追击，站桩防守：只打攻击距离内敌人，绝不自行移动（仅武将出击走追击逻辑）
      if (!def.hero) continue;

      // 2) 追击：驻守格锚点圈（engage 格）内的敌人 → 沿路径格逐格逼近，不踩草地
      //    判据与橙色虚线标注一致：敌人进入 engage 圈才出动，杜绝“寻敌范围比标注大”
      const engage = def.engage || 2;
      const reach = engage * cs;
      let far = null, bestFar = Infinity;
      for (const e of enemies) {
        if (e.dead) continue;
        const d = Math.hypot(e.x - homePt.x, e.y - homePt.y);
        if (d <= reach && d < bestFar) { bestFar = d; far = e; }
      }

      // 目标格：锚点圈内的路径格中距敌人最近的一格（无敌可寻时 = 驻守格，即回位）
      let goal = null;
      if (far) {
        let bestGoal = Infinity;
        const R = Math.ceil(engage);
        for (let dc = -R; dc <= R; dc++) {
          for (let dr = -R; dr <= R; dr++) {
            const c = s.homeC + dc, r = s.homeR + dr;
            if (!PATH_CELL_SET.has(c + "," + r)) continue;
            if (Math.hypot(c - s.homeC, r - s.homeR) > engage + 1e-9) continue;
            const pt = cellCenter(c, r);
            const d = Math.hypot(far.x - pt.x, far.y - pt.y);
            if (d < bestGoal) { bestGoal = d; goal = { c: c, r: r }; }
          }
        }
      } else {
        goal = { c: s.homeC, r: s.homeR }; // 3) 回位：无敌可寻，返回驻守格
      }

      if (goal) {
        if (goal.c === s.col && goal.r === s.row) {
          // 已在目标格：对齐到格中心
          const gp = cellCenter(goal.c, goal.r);
          const dx = gp.x - s.x, dy = gp.y - s.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 2) {
            const step = (def.moveSpeed || 3) * cs * dt;
            s.x += (dx / dist) * Math.min(step, dist);
            s.y += (dy / dist) * Math.min(step, dist);
          }
        } else {
          // 逐格行走：BFS 求下一步路径格，朝其格中心移动
          const nxt = bfsStep(s.col, s.row, goal.c, goal.r, s.homeC, s.homeR, engage);
          if (nxt) {
            const np = cellCenter(nxt.c, nxt.r);
            const dx = np.x - s.x, dy = np.y - s.y;
            const dist = Math.hypot(dx, dy) || 1;
            const step = (def.moveSpeed || 3) * cs * dt;
            const nx = s.x + (dx / dist) * Math.min(step, dist);
            const ny = s.y + (dy / dist) * Math.min(step, dist);
            // 软碰撞：允许武将贴紧（间距 ≥ 0.42 格即可，身体半径 0.3 格，轻微靠拢但基本不重叠），
            // 使后排能挤进前排身后进入攻击距离出伤，避免相邻近战互相挡路导致后排打不到敌人、攒不满怒气
            let blocked = false;
            for (const o of soldiers) {
              if (o === s || o.dead) continue;
              if (Math.hypot(o.x - nx, o.y - ny) < cs * 0.42) { blocked = true; break; }
            }
            if (!blocked) { s.x = nx; s.y = ny; }
          }
          // nxt 为 null（不可达）：原地等待敌人靠近
        }
      }

      // 同步逻辑格（供点击选取等信息判定）
      s.col = Math.max(0, Math.min(CONFIG.gridCols - 1, Math.round(s.x / cs - 0.5)));
      s.row = Math.max(0, Math.min(CONFIG.gridRows - 1, Math.round(s.y / cs - 0.5)));
    }
  }

  // 武将技能（怒气攒满自动施放；无合适目标时保留满怒等待）
  function updateHeroSkills(dt) {
    const rcfg = CONFIG.rage;
    for (const s of soldiers) {
      if (s.dead) continue;
      const def = unitDef(s.type);
      if (!def.hero || !def.skill) continue;
      if (s.rage < rcfg.max) continue;
      const sk = def.skill;
      const dmgMul = statMul(s.level);
      const sCell = getCellSize();
      let casted = false;

      function foesInRadius(radius) {
        const list = [];
        const rp = radius * sCell;
        for (const e of enemies) {
          if (e.dead) continue;
          const dx = e.x - s.x, dy = e.y - s.y;
          if (Math.sqrt(dx * dx + dy * dy) <= rp) list.push(e);
        }
        return list;
      }

      if (sk.type === "aoe" || sk.type === "roar" || sk.type === "fire" || sk.type === "storm") {
        const list = foesInRadius(sk.radius);
        if (list.length > 0) {
          for (const e of list) damageEnemy(e, sk.damage * dmgMul);
          if (sk.slowMul) for (const e of list) applySlow(e, sk.slowMul, sk.slowDur);
          // 张飞·燕人咆哮：眩晕（时长随武将等级提升）
          if (sk.stunDur) {
            const dur = Array.isArray(sk.stunDur)
              ? (sk.stunDur[s.level - 1] || sk.stunDur[sk.stunDur.length - 1])
              : sk.stunDur;
            for (const e of list) applyStun(e, dur);
          }
          // 诸葛亮·八阵风云：伤害加深（易伤）
          if (sk.ampMul) for (const e of list) applyAmp(e, sk.ampMul, sk.ampDur);
          addExplosion(s.x, s.y, sk.radius * sCell, 0.4);
          if (window.SFX) SFX.play("boom");
          addShake(0.15, 2);
          casted = true;
        }
      } else if (sk.type === "multihit") {
        const target = nearestEnemy(s.x, s.y, sk.range || 5);
        if (target) {
          damageEnemy(target, sk.damage * sk.count * dmgMul);
          addExplosion(target.x, target.y, 0.6 * sCell, 0.25);
          if (window.SFX) SFX.play("shoot");
          addShake(0.08, 1);
          casted = true;
        }
      } else if (sk.type === "snipe") {
        let target = null, bestHp = -1;
        for (const e of enemies) {
          if (e.dead) continue;
          const dx = e.x - s.x, dy = e.y - s.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist <= (sk.range || 5) * sCell && e.hp > bestHp) { bestHp = e.hp; target = e; }
        }
        if (target) {
          damageEnemy(target, sk.damage * dmgMul);
          tracers.push({ x1: s.x, y1: s.y, x2: target.x, y2: target.y, life: 0.2 });
          addExplosion(target.x, target.y, 0.7 * sCell, 0.3);
          addShake(0.1, 1.5);
          casted = true;
        }
      }

      if (casted) {
        addFloat(s.x, s.y - sCell * 0.95, "【" + sk.name + "】", "#ffd700", 0.22, 1.1);
        s.castT = 0.35;
        s.rage = 0;
      }
    }
  }

  function updateEnemies(dt) {
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (e.dead) continue;

      // 状态：眩晕 / 易伤 / 减速 / 灼烧 / 受击闪白 / 行走相位 + Boss 技能状态
      if (e.stunTime > 0) e.stunTime -= dt;
      if (e.ampTime > 0) e.ampTime -= dt;
      if (e.slowTime > 0) e.slowTime -= dt;
      if (e.shieldTime > 0) e.shieldTime -= dt;         // Boss 护盾剩余
      if (e.buffAtkTime > 0 && (e.buffAtkTime -= dt) <= 0) { e.buffAtkTime = 0; e.buffAtkMul = 0; }
      if (e.buffSpdTime > 0 && (e.buffSpdTime -= dt) <= 0) { e.buffSpdTime = 0; e.buffSpdMul = 0; }
      if (e.isBoss && e.skillCd != null) e.skillCd -= dt;   // Boss 技能冷却
      if (e.dotTime > 0) {
        e.dotTime -= dt;
        e.dotTimer -= dt;
        if (e.dotTimer <= 0) {
          e.dotTimer = e.dotInterval;
          damageEnemy(e, e.dotDmg);
        }
      }
      if (e.flash > 0) e.flash -= dt;
      e.age += dt;
      if (e.lungeT > 0) e.lungeT -= dt;

      // 眩晕中：定身——不移动、不攻击、不入城
      if (e.stunTime > 0) continue;

      // 交战判定：敌人按自身 attackRange（任意方向）扫描有武将进入 → 停下与其交战；
      // Boss 沿用武将交互距离（默认 1.5 格）
      const eRange = e.isBoss ? 1.5 : ((e.def && e.def.attackRange) || CONFIG.enemy.attackRange);
      const defs = soldiersNear(e.x, e.y, eRange);
      if (defs.length > 0) e.fighting = true;

      if (e.fighting) {
        // Boss 施放技能（冷却结束且配有技能时）
        if (e.isBoss && e.skillCd != null && e.skillCd <= 0 && e.def && e.def.skill) {
          castBossSkill(e);
          e.skillCd = (e.def.skill.cd || 999);
        }
        e.attackCd -= dt;
        if (defs.length === 0) {
          e.fighting = false;
        } else if (e.attackCd <= 0) {
          const ed = e.def || CONFIG.enemy;
          const atkMul = 1 + (e.buffAtkMul || 0);   // 狂暴攻伤倍率
          if (e.isBoss) {
            const bdmg = (e.def && e.def.damage) || CONFIG.boss.damage;
            for (const d of defs) {
              d.hp -= bdmg * atkMul;
              d.hitFlash = 0.1;
              gainRage(d, CONFIG.rage.perHurt);
              if (d.hp <= 0) killSoldier(d);
            }
          } else {
            defs[0].hp -= (ed.dmg || CONFIG.enemy.damage) * atkMul;
            defs[0].hitFlash = 0.1;
            gainRage(defs[0], CONFIG.rage.perHurt);
            if (defs[0].hp <= 0) killSoldier(defs[0]);
          }
          const interval = e.isBoss
            ? ((e.def && e.def.attackInterval) || CONFIG.boss.attackInterval) / atkMul   // 狂暴攻速提升
            : (ed.attackInterval || CONFIG.enemy.attackInterval);
          e.attackCd = interval;
          // 扑向防守单位的突进动作
          e.lungeT = 0.18;
          e.lungeDir = Math.atan2(defs[0].y - e.y, defs[0].x - e.x);
        }
        continue;
      }

      if (e.at >= curPaths[e.path].length - 1) { arriveGate(e); enemies.splice(i, 1); continue; }

      const next = curPaths[e.path][e.at + 1];
      const dest = cellCenter(next.c, next.r);
      const dx = dest.x - e.x, dy = dest.y - e.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const baseSpd = e.isBoss
        ? ((e.def && e.def.speed) || CONFIG.boss.speed) * (1 + (e.buffSpdMul || 0))   // Boss 狂暴加移速
        : waveSpeed * (e.def ? (e.def.speedMul || 1) : CONFIG.enemy.speedMul);
      const spd = (e.slowTime > 0 ? e.slowMul : 1) * baseSpd * buffs.enemySlow;
      const step = spd * getCellSize() * dt;
      // 行军步伐：每走半格完成一个起伏周期
      e.walkPhase += (step / getCellSize()) * Math.PI;
      if (dist <= step) {
        e.at += 1;
        e.x = dest.x; e.y = dest.y;
        if (e.at >= curPaths[e.path].length - 1) { arriveGate(e); enemies.splice(i, 1); continue; }
      } else {
        e.x += (dx / dist) * step;
        e.y += (dy / dist) * step;
      }
    }
  }

  // 纯视觉计时器与特效更新（独立于战斗逻辑，波间/待机也保持流畅）
  function tickVisual(dt) {
    animClock += dt;
    if (waveBanner) {
      waveBanner.t += dt;
      if (waveBanner.t >= waveBanner.dur) waveBanner = null;
    }
    if (selected && selected.born < 1) selected.born = Math.min(1, selected.born + dt * 6);
    for (const b of buildings) {
      if (b.spawnT > 0) b.spawnT -= dt;
      if (b.bounceT > 0) b.bounceT -= dt;
      if (b.recoilT > 0) b.recoilT -= dt;
    }
    for (const sl of soldiers) {
      if (sl.spawnT > 0) sl.spawnT -= dt;
      if (sl.animT > 0) sl.animT -= dt;
      if (sl.hitFlash > 0) sl.hitFlash -= dt;
      if (sl.castT > 0) sl.castT -= dt;
    }
    for (let i = fxFloats.length - 1; i >= 0; i--) {
      const f = fxFloats[i];
      f.life -= dt; f.y -= 26 * dt;
      if (f.life <= 0) fxFloats.splice(i, 1);
    }
    for (let i = fxSlashes.length - 1; i >= 0; i--) {
      if ((fxSlashes[i].life -= dt) <= 0) fxSlashes.splice(i, 1);
    }
    for (let i = explosions.length - 1; i >= 0; i--) {
      if ((explosions[i].life -= dt) <= 0) explosions.splice(i, 1);
    }
    for (let i = tracers.length - 1; i >= 0; i--) {
      if ((tracers[i].life -= dt) <= 0) tracers.splice(i, 1);
    }
    for (let i = fxDeaths.length - 1; i >= 0; i--) {
      if ((fxDeaths[i].life -= dt) <= 0) fxDeaths.splice(i, 1);
    }
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.life -= dt;
      const dx = b.tx - b.x, dy = b.ty - b.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const spd = 900 * dt;
      if (dist <= spd || b.life <= 0) { bullets.splice(i, 1); continue; }
      b.x += (dx / dist) * spd;
      b.y += (dy / dist) * spd;
    }
    for (let i = fxParts.length - 1; i >= 0; i--) {
      const p = fxParts[i];
      p.life -= dt;
      if (p.life <= 0) { fxParts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      const drag = Math.max(0, 1 - 3.5 * dt);
      p.vx *= drag; p.vy *= drag;
    }
  }

  // ---------- 绘制 ----------
  function drawHpBar(x, y, w, h, ratio, color) {
    ctx.fillStyle = "#1c1c1c";
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = color;
    if (ratio > 0) ctx.fillRect(x, y, w * ratio, h);
  }
  function drawBuildings() {
    const s = getCellSize();
    for (const b of buildings) {
      const def = unitDef(b.type);
      // 出生弹出（弹性超调）
      let pop = 1;
      if (b.spawnT > 0) pop = Math.max(0.01, easeOutBack(1 - b.spawnT / 0.32));
      if (def.kind === "farmer") {
        // 农民：待机轻晃 + 产粮两段欢快弹跳
        let bounce = 0, sq = 1;
        const idle = Math.sin(animClock * 2 + b.uid * 2.3) * s * 0.015;
        if (b.bounceT > 0) {
          const p = 1 - b.bounceT / 0.45;
          bounce = -Math.abs(Math.sin(p * Math.PI * 2)) * s * 0.12;
          sq = 1 + Math.sin(p * Math.PI * 4) * 0.08;
        }
        ctx.save();
        ctx.translate(b.x, b.y + bounce + idle);
        ctx.scale(pop, pop * sq);
        ctx.fillStyle = "rgba(0,0,0,0.10)";
        ctx.beginPath(); ctx.arc(0, s * 0.12, s * 0.36, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = def.color;
        ctx.beginPath(); ctx.arc(0, 0, s * 0.3, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(20,10,0,0.6)"; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = "#fff";
        ctx.font = s * 0.26 + "px KaiTi, serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(def.short + (b.level > 1 ? b.level : ""), 0, 0);
        ctx.restore();
      }
    }
  }
  // 按武器类型绘制武将手持器械（纯程序化，无图片）
  // o.drawP：弓弦拉距（>0 拉弓搭箭；<0 放弦后弦振）
  function drawWeapon(c, weapon, w, o) {
    const r = w * 0.32; // 身体半径
    const drawP = o ? (o.drawP || 0) : 0;
    if (weapon === "saber") {
      // 青龙偃月刀：长杆 + 弯月刀刃 + 红缨
      c.strokeStyle = "#8a6a3f"; c.lineWidth = w * 0.07; c.lineCap = "round";
      c.beginPath(); c.moveTo(-r * 0.15, 0); c.lineTo(r * 1.35, 0); c.stroke(); // 刀杆
      c.fillStyle = "#e8e6e3"; c.strokeStyle = "#b9b6b0"; c.lineWidth = w * 0.02;
      c.beginPath();
      c.moveTo(r * 1.2, 0);
      c.quadraticCurveTo(r * 1.78, -w * 0.1, r * 1.98, -w * 0.32); // 刀背弧至刀尖
      c.quadraticCurveTo(r * 1.72, -w * 0.16, r * 1.26, -w * 0.05); // 刀刃弧收回
      c.closePath(); c.fill(); c.stroke();
      c.fillStyle = "#c0392b"; // 刀杆红缨
      for (let k = -1; k <= 1; k++) {
        c.beginPath(); c.moveTo(r * 1.2, 0); c.lineTo(r * 1.08, k * w * 0.06); c.lineTo(r * 1.16, k * w * 0.03); c.closePath(); c.fill();
      }
    } else if (weapon === "spear") {
      // 长枪：枪杆 + 菱形枪尖 + 红缨
      c.strokeStyle = "#c8a06a"; c.lineWidth = w * 0.06; c.lineCap = "butt";
      c.beginPath(); c.moveTo(-r * 0.45, 0); c.lineTo(r * 1.45, 0); c.stroke();
      c.fillStyle = "#e8e6e3"; c.strokeStyle = "#b9b6b0"; c.lineWidth = w * 0.015;
      c.beginPath(); c.moveTo(r * 1.4, 0); c.lineTo(r * 1.82, -w * 0.045); c.lineTo(r * 1.98, 0); c.lineTo(r * 1.82, w * 0.045); c.closePath(); c.fill(); c.stroke();
      c.strokeStyle = "#c0392b"; c.lineWidth = w * 0.028; c.lineCap = "round"; // 红缨
      for (let k = -1; k <= 1; k++) {
        c.beginPath(); c.moveTo(r * 1.42, 0); c.lineTo(r * 1.26, k * w * 0.07); c.stroke();
      }
    } else if (weapon === "bow") {
      // 长弓：竹弓背 + 弦（拉弓时中点后拉）+ 搭箭
      const bx = r * 0.5, br = r * 0.78;
      c.strokeStyle = "#a97b50"; c.lineWidth = w * 0.075; c.lineCap = "round";
      c.beginPath(); c.arc(bx, 0, br, -1.05, 1.05); c.stroke(); // 弓背
      const tipX = bx + br * Math.cos(1.05), tipY = br * Math.sin(1.05);
      const pull = drawP * br * 0.75;
      c.strokeStyle = "rgba(40,25,10,0.75)"; c.lineWidth = w * 0.022; c.lineCap = "butt";
      c.beginPath(); c.moveTo(tipX, -tipY); c.lineTo(bx - pull, 0); c.lineTo(tipX, tipY); c.stroke(); // 弦
      if (drawP > 0.02) { // 拉弓时搭箭
        c.strokeStyle = "#6d4c2f"; c.lineWidth = w * 0.03; c.lineCap = "round";
        c.beginPath(); c.moveTo(bx - pull, 0); c.lineTo(bx + br * 0.92, 0); c.stroke();
        c.fillStyle = "#e8e6e3";
        c.beginPath(); c.moveTo(bx + br * 0.92, 0); c.lineTo(bx + br * 1.16, -w * 0.035); c.lineTo(bx + br * 1.16, w * 0.035); c.closePath(); c.fill();
      }
    } else if (weapon === "fan") {
      // 羽扇：扇柄 + 扇面 + 扇骨 + 白羽点缀
      c.strokeStyle = "#8a6a3f"; c.lineWidth = w * 0.05; c.lineCap = "round";
      c.beginPath(); c.moveTo(r * 0.05, 0); c.lineTo(r * 0.52, 0); c.stroke(); // 扇柄
      c.fillStyle = "#fdf6e3"; c.strokeStyle = "#c9a86a"; c.lineWidth = w * 0.035;
      c.beginPath(); c.moveTo(r * 0.5, 0); c.arc(r * 0.5, 0, r * 0.85, -0.95, 0.95); c.closePath(); c.fill(); c.stroke();
      c.strokeStyle = "#d4a530"; c.lineWidth = w * 0.022; // 扇骨
      for (let k = -2; k <= 2; k++) {
        const a = k * 0.32;
        c.beginPath(); c.moveTo(r * 0.5, 0); c.lineTo(r * 0.5 + r * 0.85 * Math.cos(a), r * 0.85 * Math.sin(a)); c.stroke();
      }
      c.fillStyle = "#eef6fd"; // 扇缘白羽
      for (let k = -1; k <= 1; k++) {
        const a = k * 0.5;
        c.beginPath(); c.arc(r * 0.5 + r * 0.78 * Math.cos(a), r * 0.78 * Math.sin(a), w * 0.032, 0, Math.PI * 2); c.fill();
      }
    }
  }

  function drawSoldiers() {
    const s = getCellSize();
    for (const sld of soldiers) {
      if (sld.dead) continue;
      const def = unitDef(sld.type);

      // ---- 动作合成：待机呼吸 + 攻击突进/后坐 + 受击抖动 + 出生弹出 ----
      const idle = Math.sin(animClock * 2.4 + sld.uid * 1.7) * s * 0.018;
      let ox = 0, oy = idle, sx = 1, sy = 1;
      const isAtk = sld.animT > 0 && sld.animDur > 0;
      // 武器姿态：挥击角 wAng / 长枪突刺位移 wExt / 弓弦拉距 bowDraw
      let wAng = null, wExt = 0, bowDraw = 0;
      const REST = def.weapon ? REST_ANG[def.weapon] : undefined;
      const hp = def.weapon && HIT_P[def.weapon] !== undefined ? HIT_P[def.weapon] : 0.35;
      if (isAtk) {
        const p = 1 - sld.animT / sld.animDur;
        // 身体推进在命中帧达到峰值（与出伤同步），随后收势回落
        let push;
        if (def.ranged) {
          // 远程：命中前小幅前倾瞄准，放弦瞬间后坐
          push = p < hp ? 0.3 * smoothstep(p / hp) : -0.9 * (1 - smoothstep((p - hp) / (1 - hp)));
        } else {
          push = p < hp ? smoothstep(p / hp) : 1 - smoothstep((p - hp) / (1 - hp));
        }
        const lungeAmp = def.weapon === "saber" ? 0.27 : def.weapon === "spear" ? 0.17 : 0.2;
        ox += Math.cos(sld.animDir) * push * s * lungeAmp;
        oy += Math.sin(sld.animDir) * push * s * lungeAmp;
        if (def.ranged) { const k = Math.max(0, -push); sx = 1 - 0.06 * k; sy = 1 + 0.05 * k; }
        // ---- 武器挥击轨迹（蓄力 → 命中帧挥至目标 → 收势回垂）----
        if (def.weapon === "saber" || def.weapon === "fan") {
          const WIND = def.weapon === "saber" ? -1.45 : -1.1;   // 举兵器过肩
          const FOL = def.weapon === "saber" ? 0.75 : 0.45;     // 抡出随势角
          if (p < hp) {
            const q = easeOutCubic(p / hp);
            wAng = REST + (sld.animDir + WIND - REST) * q;      // 待机位 → 蓄力位
          } else {
            const q = (p - hp) / (1 - hp);
            if (q < 0.4) wAng = sld.animDir + WIND + (FOL - WIND) * easeOutCubic(q / 0.4); // 抡出扫过目标
            else {
              const A = sld.animDir + FOL;
              wAng = A + (REST - A) * smoothstep((q - 0.4) / 0.6); // 收势回垂（无缝接待机）
            }
          }
        } else if (def.weapon === "spear") {
          if (p < hp) {
            const q = p / hp, eo = easeOutCubic(q);
            wAng = REST + (sld.animDir - REST) * eo;            // 枪身摆正对敌
            const pull = easeOutCubic(Math.min(1, q / 0.6));     // 先后拉蓄力
            const thrust = q > 0.6 ? easeOutCubic((q - 0.6) / 0.4) : 0; // 再刺出，命中帧最深
            wExt = -0.3 * pull + 0.92 * thrust;
          } else {
            const q = (p - hp) / (1 - hp), t = smoothstep(q);
            wAng = sld.animDir * (1 - t) + REST * t + 0.12 * Math.sin(q * Math.PI) * (1 - t); // 收枪回垂
            wExt = 0.62 * (1 - t);
          }
        } else if (def.weapon === "bow") {
          if (p < hp) {
            const q = p / hp, eo = easeOutCubic(q);
            wAng = REST + (sld.animDir - REST) * eo;            // 转身瞄准
            bowDraw = eo;                                       // 渐进拉弓
          } else {
            const q = (p - hp) / (1 - hp), t = smoothstep(q);
            wAng = sld.animDir * (1 - t) + REST * t;            // 收弓回垂
            bowDraw = -0.3 * Math.sin(q * Math.PI * 2.5) * (1 - q); // 放弦后弦振
          }
        }
      } else if (def.weapon && REST !== undefined) {
        wAng = REST + Math.sin(animClock * 1.8 + sld.uid * 2.1) * 0.06; // 待机：武器垂放身侧微晃
      }
      if (sld.hitFlash > 0) {
        const k = Math.min(1, sld.hitFlash / 0.1);
        sx *= 1 + 0.18 * k; sy *= 1 - 0.18 * k;               // 受击压扁
        ox += Math.sin(animClock * 55) * s * 0.02 * k;        // 受击抖动
      }
      let pop = 1;
      if (sld.spawnT > 0) pop = Math.max(0.01, easeOutBack(1 - sld.spawnT / 0.32));

      const x = sld.x + ox, y = sld.y + oy;

      // 贴地阴影（随出生动画生长）
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.beginPath();
      ctx.ellipse(sld.x, sld.y + s * 0.24, s * 0.3 * pop, s * 0.11 * pop, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(x, y);
      ctx.scale(pop * sx, pop * sy);
      ctx.fillStyle = def.color;
      ctx.beginPath(); ctx.arc(0, 0, s * 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(20,10,0,0.6)"; ctx.lineWidth = 2; ctx.stroke();
      if (def.hero) {
        ctx.strokeStyle = "#ffd700";
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(0, 0, s * 0.36, 0, Math.PI * 2); ctx.stroke();
        // 怒气已满：外圈橙色呼吸光环
        if (def.skill && sld.rage >= CONFIG.rage.max) {
          ctx.globalAlpha = 0.3 + 0.3 * Math.sin(animClock * 7);
          ctx.strokeStyle = "#ff8c3a";
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(0, 0, s * 0.45, 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
      ctx.fillStyle = "#fff";
      ctx.font = s * 0.26 + "px KaiTi, serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(def.short + (sld.level > 1 ? sld.level : ""), 0, 0);
      if (sld.hitFlash > 0) {
        ctx.globalAlpha = Math.min(1, sld.hitFlash / 0.1) * 0.7;
        ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.arc(0, 0, s * 0.32, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      // 武器：按挥击轨迹（wAng 旋转 / wExt 突刺位移 / bowDraw 弓弦）绘制
      if (def.weapon && wAng !== null) {
        ctx.save();
        ctx.rotate(wAng);
        if (wExt) ctx.translate(wExt * s, 0);
        drawWeapon(ctx, def.weapon, s, { drawP: bowDraw });
        ctx.restore();
      }
      ctx.restore();

      // 技能施放金环
      if (sld.castT > 0) {
        const cp = 1 - sld.castT / 0.35;
        ctx.globalAlpha = (1 - cp) * 0.7;
        ctx.strokeStyle = "#ffd700";
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, s * (0.32 + cp * 0.55), 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (sld.hp < sld.maxHp) {
        drawHpBar(x - s * 0.3, y - s * 0.5, s * 0.6, 5,
          Math.max(0, sld.hp / sld.maxHp), def.hero ? "#ffd700" : "#4caf50");
      }
      // 武将怒气条（血条下方，橙色；满怒金色脉动）
      if (def.hero && def.skill) {
        const rw = s * 0.6, rh = 4;
        const rx = x - rw / 2, ry = y - s * 0.5 + 7;
        const rp = Math.max(0, Math.min(1, sld.rage / CONFIG.rage.max));
        ctx.fillStyle = "#241a0e";
        ctx.fillRect(rx - 1, ry - 1, rw + 2, rh + 2);
        if (rp >= 1) {
          ctx.globalAlpha = 0.65 + 0.35 * Math.sin(animClock * 8);
          ctx.fillStyle = "#ffd700";
          ctx.fillRect(rx, ry, rw, rh);
          ctx.globalAlpha = 1;
        } else {
          ctx.fillStyle = "#ff8c3a";
          ctx.fillRect(rx, ry, rw * rp, rh);
        }
      }
    }
  }
  function drawEnemies() {
    const s = getCellSize();
    for (const e of enemies) {
      if (e.dead) continue;
      const ed = e.def || CONFIG.enemy;
      const r = s * ((e.isBoss ? CONFIG.boss : ed).radiusMul || 0.26);

      // ---- 动作合成：行军起伏 + 挤压拉伸 + 出生弹出 + 攻击突进 + 受击 ----
      const bobNorm = Math.abs(Math.sin(e.walkPhase));
      const bob = -bobNorm * s * (e.isBoss ? 0.05 : 0.04);
      let sx = 1, sy = 1;
      if (!e.fighting) {
        const stretch = 1 + Math.sin(e.walkPhase * 2) * (e.isBoss ? 0.03 : 0.05);
        sy = stretch; sx = 2 - stretch;                 // 落地压扁、腾空拉长
      }
      if (e.flash > 0) {
        const k = Math.min(1, e.flash / 0.1);
        sx *= 1 + 0.22 * k; sy *= 1 - 0.22 * k;
      }
      let ox = 0, oy = 0;
      if (e.lungeT > 0) {
        const p = 1 - e.lungeT / 0.18;
        const l = Math.sin(p * Math.PI);
        ox = Math.cos(e.lungeDir) * l * s * 0.16;
        oy = Math.sin(e.lungeDir) * l * s * 0.16;
      }
      let pop = 1;
      if (e.age < 0.3) pop = Math.max(0.01, easeOutBack(e.age / 0.3));

      // 贴地阴影（跳起时收小）
      ctx.fillStyle = "rgba(0,0,0,0.14)";
      ctx.beginPath();
      ctx.ellipse(e.x, e.y + r * 0.75, r * (1.15 - bobNorm * 0.25) * pop, r * 0.45 * pop, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(e.x + ox, e.y + oy + bob);
      ctx.scale(pop * sx, pop * sy);
      if (e.stunTime > 0) ctx.rotate(Math.sin(animClock * 6) * 0.13);   // 眩晕晃动
      ctx.fillStyle = e.isBoss ? (e.def && e.def.color || CONFIG.boss.color) : ed.color;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(20,10,0,0.6)"; ctx.lineWidth = 2; ctx.stroke();
      if (e.isBoss) {
        // Boss 光环：狂暴变红、护盾变青
        let auraCol = "255,215,0";
        if (e.buffAtkTime > 0) auraCol = "255,90,60";
        else if (e.shieldTime > 0) auraCol = "110,255,220";
        const aura = 0.3 + 0.25 * Math.sin(animClock * 3);
        ctx.strokeStyle = "rgba(" + auraCol + "," + aura.toFixed(3) + ")";
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, r * 1.22, 0, Math.PI * 2); ctx.stroke();
        // 狂暴红色体边 / 护盾青色体边
        if (e.buffAtkTime > 0) { ctx.strokeStyle = "rgba(255,90,60,0.9)"; ctx.lineWidth = 3; }
        else if (e.shieldTime > 0) { ctx.strokeStyle = "rgba(110,255,220,0.9)"; ctx.lineWidth = 3; }
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = "#fff";
        ctx.font = "bold " + s * 0.3 + "px KaiTi, serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText((e.def && e.def.ch) || "将", 0, 0);   // 各 Boss 独有字
      } else {
        // 兵种单字：显示在敌人体内
        ctx.fillStyle = "#fff";
        ctx.font = "bold " + Math.max(s * 0.3, r * 1.2) + "px KaiTi, serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText((ed.ch || "兵"), 0, r * 0.06);
      }
      if (e.flash > 0) {
        ctx.globalAlpha = Math.min(1, e.flash / 0.1) * 0.7;
        ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();

      if (e.hp < e.maxHp) {
        const w = e.isBoss ? s * 0.9 : s * Math.max(0.5, r / s * 2.0);
        drawHpBar(e.x + ox - w / 2, e.y + oy + bob - r - s * 0.16, w, 5,
          Math.max(0, e.hp / e.maxHp), "#e74c3c");
      }
      // 易伤（伤害加深）：红色“易伤”标记
      if (e.ampTime > 0) {
        ctx.fillStyle = "rgba(255,82,82,0.95)";
        ctx.font = s * 0.2 + "px KaiTi, serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("易伤", e.x + ox - r - s * 0.1, e.y + oy + bob - r);
      }
      if (e.dotTime > 0 || e.slowTime > 0) {
        ctx.fillStyle = "rgba(255,140,0,0.95)";
        ctx.font = s * 0.22 + "px KaiTi, serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(e.slowTime > 0 ? "冻" : "烧", e.x + ox + r, e.y + oy + bob - r);
      }
      // 眩晕符号：头顶金边徽章“眩” + 三颗环绕旋转小星
      if (e.stunTime > 0) {
        const hx = e.x + ox, hy = e.y + oy + bob - r - s * 0.36;
        for (let k = 0; k < 3; k++) {
          const a = animClock * 5 + (k * Math.PI * 2) / 3;
          ctx.fillStyle = "#ffe9b0";
          ctx.beginPath();
          ctx.arc(hx + Math.cos(a) * s * 0.3, hy + Math.sin(a) * s * 0.12 - s * 0.06, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 0.82 + 0.18 * Math.sin(animClock * 10);
        ctx.fillStyle = "#241a0e";
        ctx.beginPath(); ctx.arc(hx, hy, s * 0.15, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#ffd700"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(hx, hy, s * 0.15, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = "#ffd700";
        ctx.font = s * 0.17 + "px KaiTi, serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("眩", hx, hy + 0.5);
        ctx.globalAlpha = 1;
      }
    }
  }
  // 死亡残影：残躯放大淡出 + 破碎环 + 字符飘散
  function drawDeaths() {
    const s = getCellSize();
    for (const d of fxDeaths) {
      const p = 1 - d.life / d.ttl;
      const a = 1 - p;
      const dy = -p * s * 0.15;
      ctx.globalAlpha = a * 0.5;
      ctx.fillStyle = d.color;
      ctx.beginPath(); ctx.arc(d.x, d.y + dy, d.r * (1 + p * 0.6), 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = a * 0.8;
      ctx.strokeStyle = d.isBoss ? "#ffd700" : "#ffffff";
      ctx.lineWidth = 2.5 * a + 0.5;
      ctx.beginPath(); ctx.arc(d.x, d.y + dy, d.r * (1 + p * 1.6), 0, Math.PI * 2); ctx.stroke();
      if (d.text) {
        ctx.globalAlpha = a;
        ctx.fillStyle = "#fff";
        ctx.font = s * 0.28 + "px KaiTi, serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(d.text, d.x, d.y + dy - p * s * 0.3);
      }
      ctx.globalAlpha = 1;
    }
  }
  // 火花粒子
  function drawParts() {
    for (const p of fxParts) {
      const a = Math.max(0, p.life / p.ttl);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function drawTracers() {
    ctx.strokeStyle = "#ffe9b0";
    ctx.lineWidth = 2;
    for (const t of tracers) {
      ctx.globalAlpha = Math.max(0, Math.min(1, t.life / 0.12));
      ctx.beginPath();
      ctx.moveTo(t.x1, t.y1);
      ctx.lineTo(t.x2, t.y2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  function drawExplosions() {
    for (const x of explosions) {
      const ttl = x.ttl || 0.4;
      const p = 1 - x.life / ttl;          // 0→1 扩张进度
      const a = Math.max(0, 1 - p);
      const r = x.radius * (0.25 + 0.75 * p);
      // 内部炽热
      ctx.globalAlpha = a * 0.3;
      ctx.fillStyle = "#ff9800";
      ctx.beginPath(); ctx.arc(x.x, x.y, r * 0.8, 0, Math.PI * 2); ctx.fill();
      // 冲击环（快速扩张后消散）
      ctx.globalAlpha = a;
      ctx.strokeStyle = "#ffc46b";
      ctx.lineWidth = 3 * a + 1;
      ctx.beginPath(); ctx.arc(x.x, x.y, r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  function drawBullets() {
    const s = getCellSize();
    for (const b of bullets) {
      const a = Math.atan2(b.ty - b.y, b.tx - b.x);
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(a);
      // 速度反方向拖尾（渐隐残影）
      for (let i = 2; i >= 1; i--) {
        ctx.globalAlpha = 0.09 * (3 - i);
        ctx.fillStyle = b.color;
        ctx.fillRect(-s * 0.14 - i * s * 0.13, -s * 0.035, s * 0.26, s * 0.07);
      }
      ctx.globalAlpha = 1;
      // 弹体 + 亮头
      ctx.fillStyle = b.color;
      ctx.fillRect(-s * 0.14, -s * 0.045, s * 0.28, s * 0.09);
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(s * 0.14, 0, s * 0.035, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }
  function drawFxSlashes() {
    const s = getCellSize();
    for (const f of fxSlashes) {
      const p = 1 - f.life / 0.2;            // 0→1 挥砍进度
      const grow = 0.35 + 0.45 * p;          // 弧线半径扩张
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.dir);
      // 外圈辉光
      ctx.globalAlpha = (1 - p) * 0.35;
      ctx.strokeStyle = f.color;
      ctx.lineWidth = s * 0.16;
      ctx.beginPath(); ctx.arc(s * 0.12, 0, s * grow, -0.9 + p * 0.5, 0.9 + p * 0.5); ctx.stroke();
      // 内圈亮刃
      ctx.globalAlpha = (1 - p) * 0.95;
      ctx.lineWidth = s * 0.05;
      ctx.beginPath(); ctx.arc(s * 0.12, 0, s * grow, -0.85 + p * 0.5, 0.85 + p * 0.5); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }
  function drawFxFloats() {
    const s = getCellSize();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const f of fxFloats) {
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life / f.ttl));
      ctx.font = (f.size * s) + "px KaiTi, serif";
      ctx.strokeStyle = "rgba(0,0,0,0.7)";
      ctx.lineWidth = 3;
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }
  // 波次横幅：屏中央偏上，快入缓出 + 入场轻抬（同时只存在一条）
  function drawWaveBanner() {
    if (!waveBanner) return;
    const s = getCellSize();
    const b = waveBanner;
    let alpha;
    if (b.t < 0.15) alpha = b.t / 0.15;
    else if (b.t > b.dur - 0.35) alpha = Math.max(0, (b.dur - b.t) / 0.35);
    else alpha = 1;
    const rise = (1 - Math.pow(1 - Math.min(1, b.t / 0.3), 3)) * -6;
    ctx.globalAlpha = alpha;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold " + (s * 0.48) + "px KaiTi, serif";
    const y = canvas.height / 2 - 30 + rise;
    ctx.strokeStyle = "rgba(0,0,0,0.75)";
    ctx.lineWidth = 5;
    ctx.strokeText(b.text, canvas.width / 2, y);
    ctx.fillStyle = b.color;
    ctx.fillText(b.text, canvas.width / 2, y);
    ctx.globalAlpha = 1;
  }
  function drawGateHpBar() {
    const s = getCellSize();
    const end = gateCell();
    const ec = cellCenter(end.c, end.r);
    const w = s * 0.9, h = Math.max(6, s * 0.12);
    const x = ec.x - w / 2, y = ec.y - s * 0.78;
    const ratio = Math.max(0, Math.min(1, gateHp / CONFIG.gateHp));
    drawHpBar(x, y, w, h, ratio, ratio > 0.5 ? "#4caf50" : ratio > 0.25 ? "#f1c40f" : "#e74c3c");
  }
  // ---------- 单位信息面板（点击单位查看详情） ----------
  function fieldUnitByUid(uid) {
    for (const sl of soldiers) if (sl.uid === uid) return sl;
    for (const b of buildings) if (b.uid === uid) return b;
    return null;
  }
  function enemyAtPoint(px, py) {
    const s = getCellSize();
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (e.dead) continue;
      const r = (s * ((e.isBoss ? CONFIG.boss : (e.def || CONFIG.enemy)).radiusMul || 0.26)) + 5;
      const dx = e.x - px, dy = e.y - py;
      if (dx * dx + dy * dy <= r * r) return e;
    }
    return null;
  }
  function selectionAlive() {
    if (!selected) return false;
    const r = selected.ref;
    if (selected.kind === "enemy") return !r.dead && enemies.indexOf(r) >= 0;
    return !r.dead && (soldiers.indexOf(r) >= 0 || buildings.indexOf(r) >= 0);
  }
  function panelBox(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function dashedLine(x1, y1, x2, y2) {
    ctx.strokeStyle = "rgba(90,74,42,0.9)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  function wrapCn(text, maxChars) {
    const lines = [];
    let line = "";
    for (let i = 0; i < text.length; i++) {
      line += text[i];
      if (line.length >= maxChars) { lines.push(line); line = ""; }
    }
    if (line) lines.push(line);
    return lines;
  }

  // 射程指示圈：选中武将时，在脚下绘制可及范围（区分攻击距离与追击距离）
  function drawHeroRanges(u, def, s) {
    if (def.kind !== "soldier") return;
    if (def.ranged) {
      // 远程：单圈「攻击射程」，实心淡蓝 + 亮蓝描边
      const r = def.range * s;
      ctx.fillStyle = "rgba(66,184,255,0.14)";
      ctx.strokeStyle = "rgba(120,210,255,0.85)";
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(u.x, u.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.stroke();
      return;
    }
    // 近战：两种圈并显
    //   1) 攻击距离 —— 以武将当前位置为圆心，实心淡青绿 + 实线（出手即可命中）
    const ar = (def.atkRange || 1.5) * s;
    ctx.fillStyle = "rgba(56,220,160,0.16)";
    ctx.strokeStyle = "rgba(86,235,180,0.9)";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(u.x, u.y, ar, 0, Math.PI * 2); ctx.fill();
    ctx.stroke();
    // 2) 追击距离 —— 仅武将出击才有（小兵站桩不追击），以驻守格为圆心（追击锚点圈），淡橙红虚线
    if (def.hero) {
      const er = (def.engage || 2) * s;
      const hx = cellCenter(u.homeC, u.homeR).x;
      const hy = cellCenter(u.homeC, u.homeR).y;
      ctx.fillStyle = "rgba(255,140,70,0.10)";
      ctx.strokeStyle = "rgba(255,150,90,0.85)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([9, 6]);
      ctx.beginPath(); ctx.arc(hx, hy, er, 0, Math.PI * 2); ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      // 驻守格锚点小标记
      ctx.fillStyle = "rgba(255,150,90,0.5)";
      ctx.beginPath(); ctx.arc(hx, hy, 2.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  // 选中标记：金色/红色虚线旋转圆环
  function drawSelectionMark() {
    if (!selected || !selectionAlive()) return;
    const u = selected.ref;
    const s = getCellSize();
    let r;
    if (selected.kind === "enemy") {
      r = (s * ((u.isBoss ? CONFIG.boss : (u.def || CONFIG.enemy)).radiusMul || 0.26)) + 6;
    } else {
      const def = unitDef(u.type);
      r = def.kind === "soldier" ? s * 0.42 : s * 0.48;
      drawHeroRanges(u, def, s); // 先绘射程圈，选中环叠于其上
    }
    ctx.strokeStyle = selected.kind === "enemy" ? "#ff6b5e" : "#ffd97a";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.lineDashOffset = -animClock * 26;
    ctx.beginPath();
    ctx.arc(u.x, u.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
  }

  // 信息面板主体（画布内绘制，跟随单位、边界钳制）
  function drawUnitInfoPanel() {
    if (!selected) return;
    if (phase === "over" || phase === "win") { selected = null; return; }
    if (!selectionAlive()) { selected = null; return; }
    const u = selected.ref;
    const s = getCellSize();
    const W = 252, pad = 11;

    // ---- 组装内容 ----
    let name, lv = 0, tag, iconColor, iconChar, iconSquare = false;
    const rows = [];
    let skill = null, rageRatio = 0, skillPower = 0;

    if (selected.kind === "enemy") {
      const isBoss = !!u.isBoss;
      const ed = u.def || CONFIG.enemy;
      name = isBoss ? (ed.name || "敌方将领") : (ed.name || "敌兵");
      tag = isBoss ? "BOSS" : "敌军";
      iconColor = isBoss ? (ed.color || CONFIG.boss.color) : ed.color;
      iconChar = isBoss ? ((ed.ch) || "将") : "兵";
      rows.push({ label: "生命", bar: u.hp / u.maxHp, text: Math.ceil(u.hp) + "/" + Math.ceil(u.maxHp) });
      rows.push({ label: "攻击", value: (isBoss ? (ed.damage || CONFIG.boss.damage) : ed.dmg) + "（每 " + (isBoss ? (ed.attackInterval || CONFIG.boss.attackInterval) : ed.attackInterval) + " 秒）" });
      rows.push({ label: "赏金", value: (isBoss ? (ed.bounty || CONFIG.boss.bounty) : ed.bounty) + " 粮草" });
      if (isBoss && ed.skill) rows.push({ label: "技能", value: skillDesc(ed.skill) });
      if (isBoss) rows.push({ label: "破城", value: "冲入城门扣 10 耐久" });
      else rows.push({ label: "行军", value: "速度 " + (CONFIG.enemy.speed * (ed.speedMul || 1)).toFixed(2) + " ~ " + (CONFIG.enemy.maxSpeed * (ed.speedMul || 1)).toFixed(2) + " 格/秒" });
    } else {
      const def = unitDef(u.type);
      name = def.name;
      lv = u.level;
      iconColor = def.color;
      iconChar = def.short;
      if (def.kind === "soldier") {
        tag = (def.hero ? "武将 · " : "小兵 · ") + (def.ranged ? "远程" : "近战");
        const mul = statMul(u.level);
        rows.push({ label: "生命", bar: Math.max(0, u.hp / u.maxHp), text: Math.ceil(u.hp) + "/" + Math.ceil(u.maxHp) });
        rows.push({ label: "攻击", value: Math.round(def.damage * mul) + "（每 " + def.attackInterval + " 秒）" });
        rows.push({ label: "攻击距离", value: (def.ranged ? def.range : (def.atkRange || 1.5)) + " 格" });
        if (!def.ranged && def.hero) rows.push({ label: "追击半径", value: (def.engage || 2) + " 格" });
        if (def.skill) {
          skill = def.skill;
          rageRatio = Math.max(0, Math.min(1, u.rage / CONFIG.rage.max));
          skillPower = Math.round((skill.damage || 0) * (skill.count || 1) * mul);
        }
      } else {
        tag = "辅助";
        rows.push({ label: "产粮", value: "每 " + def.produceInterval + " 秒 +" + def.produce[u.level - 1] + " 粮草" });
      }
    }

    const descLines = skill ? wrapCn(skill.desc, 16) : [];
    const H = 12 + 24 + 12 + rows.length * 17 + (skill ? 9 + 20 + 18 + descLines.length * 15 + 14 : 0) + 12;

    // ---- 定位：面板放单位右侧，超出画布则放左侧，整体钳制在画布内 ----
    let px = u.x + s * 0.55;
    if (px + W > canvas.width - 8) px = u.x - s * 0.55 - W;
    px = Math.max(8, Math.min(px, canvas.width - W - 8));
    let py = Math.max(8, Math.min(u.y - H / 2, canvas.height - H - 8));

    // 入场动画：从单位一侧滑入 + 淡入（easeOutCubic）
    const born = selected.born === undefined ? 1 : selected.born;
    const bp = 1 - Math.pow(1 - born, 3);
    const slide = (1 - bp) * 16;
    if (px > u.x) px -= slide; else px += slide;
    ctx.globalAlpha = 0.3 + 0.7 * bp;

    // 单位 → 面板 连接线
    ctx.strokeStyle = "rgba(201,168,106,0.55)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(u.x, u.y);
    ctx.lineTo(px > u.x ? px : px + W, Math.max(py + 14, Math.min(u.y, py + H - 14)));
    ctx.stroke();
    ctx.setLineDash([]);

    // 面板底：深墨底 + 铜框 + 内金线
    ctx.fillStyle = "rgba(20,14,8,0.96)";
    panelBox(px, py, W, H, 9);
    ctx.fill();
    ctx.strokeStyle = "#8c6d3f";
    ctx.lineWidth = 1.5;
    panelBox(px, py, W, H, 9);
    ctx.stroke();
    ctx.strokeStyle = "rgba(201,168,106,0.3)";
    ctx.lineWidth = 1;
    panelBox(px + 3, py + 3, W - 6, H - 6, 6);
    ctx.stroke();

    let y = py + 12;
    ctx.textBaseline = "middle";

    // 头部：图标 + 名字 + 标签
    const icR = 10;
    if (iconSquare) {
      ctx.fillStyle = iconColor;
      ctx.fillRect(px + pad, y - icR, icR * 2, icR * 2);
      ctx.strokeStyle = "rgba(20,10,0,0.6)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(px + pad, y - icR, icR * 2, icR * 2);
    } else {
      ctx.fillStyle = iconColor;
      ctx.beginPath();
      ctx.arc(px + pad + icR, y, icR, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(20,10,0,0.6)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.fillStyle = "#fff";
    ctx.font = "12px KaiTi, serif";
    ctx.textAlign = "center";
    ctx.fillText(iconChar, px + pad + icR, y + 1);
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffe9b0";
    ctx.font = "bold 16px KaiTi, serif";
    ctx.fillText(name + (lv ? "  Lv" + lv : ""), px + pad + icR * 2 + 8, y);
    ctx.font = "12px KaiTi, serif";
    const tagW = ctx.measureText(tag).width + 12;
    const tx = px + W - pad - tagW;
    ctx.fillStyle = "rgba(140,31,31,0.9)";
    panelBox(tx, y - 9, tagW, 18, 4);
    ctx.fill();
    ctx.strokeStyle = "rgba(201,168,106,0.6)";
    ctx.lineWidth = 1;
    panelBox(tx, y - 9, tagW, 18, 4);
    ctx.stroke();
    ctx.fillStyle = "#ffd97a";
    ctx.textAlign = "center";
    ctx.fillText(tag, tx + tagW / 2, y + 1);

    y += 24 + 6;
    dashedLine(px + pad, y, px + W - pad, y);
    y += 6;

    // 属性行
    for (const row of rows) {
      ctx.textAlign = "left";
      ctx.fillStyle = "#b99a5e";
      ctx.font = "13px KaiTi, serif";
      ctx.fillText(row.label, px + pad, y);
      if (row.bar !== undefined) {
        const bw = 96, bx = px + pad + 36;
        ctx.fillStyle = "#241a0e";
        ctx.fillRect(bx - 1, y - 5, bw + 2, 9);
        ctx.fillStyle = row.bar > 0.5 ? "#4caf50" : row.bar > 0.25 ? "#f1c40f" : "#e74c3c";
        ctx.fillRect(bx, y - 4, bw * Math.max(0, Math.min(1, row.bar)), 7);
        ctx.fillStyle = "#f0e2c0";
        ctx.font = "12px KaiTi, serif";
        ctx.fillText(row.text, bx + bw + 8, y);
      } else {
        ctx.fillStyle = "#f0e2c0";
        ctx.font = "13px KaiTi, serif";
        ctx.fillText(row.value, px + pad + 36, y);
      }
      y += 17;
    }

    // 技能区（武将专属）
    if (skill) {
      y += 3;
      dashedLine(px + pad, y, px + W - pad, y);
      y += 6;
      ctx.textAlign = "left";
      ctx.fillStyle = "#ffd700";
      ctx.font = "bold 15px KaiTi, serif";
      ctx.fillText("技 · " + skill.name, px + pad, y);
      ctx.fillStyle = "#ffb75e";
      ctx.font = "12px KaiTi, serif";
      ctx.textAlign = "right";
      ctx.fillText("威力 " + skillPower, px + W - pad, y);
      y += 20;
      // 怒气条（实时）
      ctx.textAlign = "left";
      ctx.fillStyle = "#b99a5e";
      ctx.font = "13px KaiTi, serif";
      ctx.fillText("怒气", px + pad, y);
      const bw = 126, bx = px + pad + 36;
      ctx.fillStyle = "#241a0e";
      ctx.fillRect(bx - 1, y - 5, bw + 2, 9);
      const full = rageRatio >= 1;
      if (full) {
        ctx.globalAlpha = 0.65 + 0.35 * Math.sin(animClock * 8);
        ctx.fillStyle = "#ffd700";
      } else {
        ctx.fillStyle = "#ff8c3a";
      }
      ctx.fillRect(bx, y - 4, bw * rageRatio, 7);
      ctx.globalAlpha = 1;
      ctx.fillStyle = full ? "#ffd700" : "#f0e2c0";
      ctx.font = "12px KaiTi, serif";
      ctx.fillText(full ? "已满！" : Math.floor(rageRatio * CONFIG.rage.max) + "/" + CONFIG.rage.max, bx + bw + 8, y);
      y += 18;
      // 技能简介
      ctx.fillStyle = "#d8c9a3";
      ctx.font = "13px KaiTi, serif";
      for (const line of descLines) {
        ctx.fillText(line, px + pad, y);
        y += 15;
      }
      y += 2;
      ctx.fillStyle = "#8c6d3f";
      ctx.font = "12px KaiTi, serif";
      ctx.fillText("—— 怒气攒满自动施放 ——", px + pad, y);
    }
    ctx.globalAlpha = 1;
  }

  function drawDragPreview() {
    if (!drag || !mouse.inside) return;
    const cell = cellFromPoint(mouse.x, mouse.y);
    if (!cell) return;
    const s = getCellSize();
    const fromField = drag.from === "field";
    const canMerge = findMergeTarget(drag.type, drag.level, cell.c, cell.r);
    const v = canMerge ? { ok: true } : validatePlace(drag.type, drag.level, cell.c, cell.r, fromField);
    ctx.fillStyle = canMerge
      ? "rgba(241,196,15,0.55)"
      : v.ok
        ? (unitDef(drag.type).kind === "soldier" ? "rgba(52,152,219,0.45)" : "rgba(46,204,113,0.45)")
        : "rgba(231,76,60,0.45)";
    ctx.fillRect(cell.c * s, cell.r * s, s, s);
    const def = unitDef(drag.type);
    const cx = cell.c * s + s / 2, cy = cell.r * s + s / 2;
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = def.color;
    if (def.kind === "soldier") {
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.3, 0, Math.PI * 2);
      ctx.fill();
    } else if (def.kind === "farmer") {
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(cx - s * 0.33, cy - s * 0.33, s * 0.66, s * 0.66);
    }
    if (def.ranged && def.range) {
      ctx.beginPath();
      ctx.arc(cx, cy, def.range * s, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  function draw() {
    if (shakeTime > 0) {
      ctx.save();
      ctx.translate((Math.random() * 2 - 1) * shakeMag, (Math.random() * 2 - 1) * shakeMag);
    }
    drawMap(ctx);
    drawBuildings();
    drawSoldiers();
    drawEnemies();
    drawDeaths();
    drawTracers();
    drawExplosions();
    drawParts();
    drawBullets();
    drawFxSlashes();
    drawFxFloats();
    drawWaveBanner();
    drawGateHpBar();
    drawSelectionMark();
    drawDragPreview();
    drawUnitInfoPanel();

    if (phase === "over" || phase === "win") {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = phase === "win" ? "#f1c40f" : "#e74c3c";
      ctx.font = "52px KaiTi, serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(phase === "win" ? "守城成功！" : "城破……", canvas.width / 2, canvas.height / 2 - 20);
      ctx.fillStyle = "#f0d9a0";
      ctx.font = "22px KaiTi, serif";
      let endTip;
      if (phase === "win") {
        const hasNext = CONFIG.levels.some(function (l) { return l.id === curLevelId + 1; });
        endTip = hasNext ? "点击「下一关 ▸」继续征程" : "已通全境！点击「再战一局」重守此关";
      } else {
        endTip = "点击「再战一局」重新开始";
      }
      ctx.fillText(endTip, canvas.width / 2, canvas.height / 2 + 30);
    }
    // 暂停印章：墨底压暗 + 朱红「暂停」印
    if (paused && phase !== "over" && phase !== "win") {
      ctx.fillStyle = "rgba(10,8,4,0.45)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(-0.05);
      ctx.strokeStyle = "rgba(192,57,43,0.9)";
      ctx.lineWidth = 4;
      ctx.strokeRect(-96, -46, 192, 92);
      ctx.strokeStyle = "rgba(192,57,43,0.5)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-89, -39, 178, 78);
      ctx.fillStyle = "rgba(214,69,50,0.95)";
      ctx.font = "bold 52px KaiTi, serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("暂 停", 0, 4);
      ctx.fillStyle = "rgba(240,217,160,0.75)";
      ctx.font = "16px KaiTi, serif";
      ctx.fillText("空格 / 「继续」 恢复战斗", 0, 76);
      ctx.restore();
    }
    // 主动技能瞄准：十字准星 + 作用半径圈
    if (casting && phase === "battle" && mouse.inside) {
      const cs = getCellSize();
      const meta = activeCfg(casting.id) || {};
      const rad = (meta.radius || 2) * cs;
      ctx.save();
      ctx.translate(mouse.x, mouse.y);
      ctx.strokeStyle = "rgba(255,220,120,0.9)";
      ctx.lineWidth = 1.6;
      ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(255,220,120,0.14)";
      ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(255,220,120,0.95)";
      ctx.lineWidth = 2;
      const c = 8;
      [{ a: 0 }, { a: Math.PI / 2 }, { a: Math.PI }, { a: Math.PI * 1.5 }].forEach(function (d) {
        ctx.beginPath();
        ctx.moveTo(Math.cos(d.a) * (c), Math.sin(d.a) * (c));
        ctx.lineTo(Math.cos(d.a) * (c + 14), Math.sin(d.a) * (c + 14));
        ctx.stroke();
      });
      ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    if (shakeTime > 0) ctx.restore();
  }

  // ---------- 进度存档（localStorage，隐私模式降级为内存变量） ----------
  const SAVE_KEY = "sanguo_save";
  let saveData = { unlocked: 1, best: {} }; // best[levelId] = { wave, cleared?, diff? }
  function loadProgress() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d && typeof d.unlocked === "number" && d.best) saveData = { unlocked: d.unlocked, best: d.best };
    } catch (e) { /* 保留内存默认值 */ }
  }
  function persistProgress() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(saveData)); } catch (e) {}
  }
  function recordWaveCleared() {
    const b = saveData.best[curLevelId] || { wave: 0 };
    b.wave = Math.max(b.wave, waveIndex);
    saveData.best[curLevelId] = b;
    persistProgress();
  }
  function recordLevelCleared() {
    const b = saveData.best[curLevelId] || { wave: 0 };
    b.wave = CONFIG.waves.total;
    b.cleared = true;
    b.diff = diffKey;
    saveData.best[curLevelId] = b;
    saveData.unlocked = Math.max(saveData.unlocked, Math.min(curLevelId + 1, CONFIG.levels.length));
    persistProgress();
  }

  // ---------- 首页（关卡选择） ----------
  function drawMiniMap(cv, paths) {
    const c = cv.getContext("2d");
    c.fillStyle = "#22301c";
    c.fillRect(0, 0, cv.width, cv.height);
    const cw = cv.width / CONFIG.gridCols, ch = cv.height / CONFIG.gridRows;
    // 土路（圆角折线，多路各自描一条）
    c.strokeStyle = "#8a6d42";
    c.lineWidth = Math.max(3, ch * 0.55);
    c.lineJoin = "round";
    c.lineCap = "round";
    paths.forEach(function (path) {
      c.beginPath();
      path.forEach(function (p, i) {
        const x = (p.c + 0.5) * cw, y = (p.r + 0.5) * ch;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      });
      c.stroke();
    });
    // 入口绿点
    c.fillStyle = "#7ec97e";
    paths.forEach(function (path) {
      const s = path[0];
      c.beginPath();
      c.arc((s.c + 0.5) * cw, (s.r + 0.5) * ch, Math.max(2.4, ch * 0.30), 0, Math.PI * 2);
      c.fill();
    });
    // 城门金点（所有路径同终点，画一次）
    const gate = paths[0][paths[0].length - 1];
    c.fillStyle = "#ffd97a";
    c.beginPath();
    c.arc((gate.c + 0.5) * cw, (gate.r + 0.5) * ch, Math.max(3, ch * 0.36), 0, Math.PI * 2);
    c.fill();
  }
  function renderHome() {
    levelCards.innerHTML = "";
    CONFIG.levels.forEach(function (lv) {
      const locked = lv.id > saveData.unlocked;
      const best = saveData.best[lv.id];
      const card = document.createElement("div");
      card.className = "lv-card" + (locked ? " locked" : "") + (lv.id === selectedLevelId ? " selected" : "");

      const cv = document.createElement("canvas");
      cv.className = "lv-map";
      cv.width = 180; cv.height = 102;
      drawMiniMap(cv, lv.paths);
      card.appendChild(cv);

      const nm = document.createElement("div");
      nm.className = "lv-name";
      nm.textContent = (lv.endless ? "∞" : lv.id) + " · " + lv.name;
      card.appendChild(nm);

      const ds = document.createElement("div");
      ds.className = "lv-desc";
      ds.textContent = lv.desc;
      card.appendChild(ds);

      const badge = document.createElement("span");
      if (best && best.cleared) {
        const dn = (CONFIG.difficulties[best.diff] || {}).name || "普通";
        badge.className = "lv-badge clear";
        badge.textContent = "已通关 · " + dn;
      } else if (best && best.wave > 0) {
        badge.className = "lv-badge wave";
        badge.textContent = "最高 第" + best.wave + "波";
      } else {
        badge.className = "lv-badge";
        badge.textContent = "未挑战";
      }
      card.appendChild(badge);

      if (locked) {
        const lock = document.createElement("div");
        lock.className = "lv-lock";
        lock.textContent = "🔒 通关上一关解锁";
        card.appendChild(lock);
      } else {
        card.addEventListener("click", function () {
          if (window.SFX) SFX.play("click");
          selectedLevelId = lv.id;
          renderHome();
        });
      }
      levelCards.appendChild(card);
    });
  }
  function openHome() {
    homeOpen = true;
    confirmLayer.hidden = true;
    selectedLevelId = curLevelId <= saveData.unlocked ? curLevelId : Math.min(saveData.unlocked, CONFIG.levels.length);
    renderHome();
    homeScreen.style.display = "flex";
    applyFitZoom();
  }
  function closeHome(levelId) {
    homeOpen = false;
    homeScreen.style.display = "none";
    startGame(levelId);
    applyFitZoom();
  }
  btnHomeStart.addEventListener("click", function () {
    if (selectedLevelId > saveData.unlocked) { setHint("该关卡尚未解锁"); return; }
    if (window.SFX) SFX.play("click");
    closeHome(selectedLevelId);
  });
  btnHome.addEventListener("click", function () {
    if (window.SFX) SFX.play("click");
    const fighting = phase === "battle" && enemies.some(function (e) { return !e.dead; });
    if (fighting) confirmLayer.hidden = false; // 战斗中：确认后放弃
    else openHome();
  });
  btnCfStay.addEventListener("click", function () { confirmLayer.hidden = true; });
  btnCfLeave.addEventListener("click", function () { openHome(); });
  btnMute.addEventListener("click", function () {
    if (!window.SFX || !SFX.setMuted) return;
    const m = SFX.setMuted(!SFX.isMuted());
    btnMute.textContent = m ? "音效：关" : "音效：开";
  });

  // ---------- 主循环 ----------
  let lastTime = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    if (homeOpen) { lastTime = now; return; } // 首页打开：挂起游戏，省性能
    let dt = (now - lastTime) / 1000;
    if (dt > 0.05) dt = 0.05;
    lastTime = now;
    if (!paused) { tickVisual(dt * speed); update(dt * speed); }
    draw();
  }

  // ---------- 开始 / 重开 ----------
  function startGame(levelId) {
    curLevelId = levelId || curLevelId || 1;
    const lv = CONFIG.levels.find(function (l) { return l.id === curLevelId; }) || CONFIG.levels[0];
    curLevelId = lv.id;
    curPaths = lv.paths;
    LEVEL_PATHS = curPaths;
    rebuildPathCellSet();
    invalidateMapCache();
    spawnRR = 0;
    enemies = [];
    buildings = [];
    soldiers = [];
    tracers = [];
    explosions = [];
    bullets = [];
    fxSlashes = [];
    fxFloats = [];
    waveBanner = null;
    fxDeaths = [];
    fxParts = [];
    pendingHits = [];
    inventory = new Array(CONFIG.inventorySize).fill(null);
    cardLevels = {};
    activeCds = {};
    buffs = { atkIntervalMul: 1, dmgMul: 1, hpMul: 1, bountyMul: 1, enemySlow: 1, splashFactor: 0, splashRange: 1.2, vamp: 0 };
    casting = null;
    diffKey = selDiff ? selDiff.value : "normal";
    const dc = diffConf();
    gateHp = dc.gateHp;
    grain = dc.startGrain;
    waveIndex = 0;
    phase = "ready";
    paused = false;
    speed = 1;
    clearDrag();
    selected = null;
    renderInventory();
    refreshShop(); // 进入新关卡时重新上货（下一关/重开本关）
    updateHud();
  }

  btnStart.addEventListener("click", function () {
    if (window.SFX) SFX.play("click");
    if (phase === "ready") {
      beginWave(1);
      setHint("武将攻击/受击积攒怒气，满怒自动放技能；点击单位查看详情");
    }
    else if (phase === "between") beginWave(waveIndex + 1);
    else if (phase === "over") { startGame(); beginWave(1); }
    else if (phase === "win") {
      const next = CONFIG.levels.find(function (l) { return l.id === curLevelId + 1; });
      startGame(next ? next.id : curLevelId);
      beginWave(1);
    }
  });
  btnPause.addEventListener("click", function () {
    if (phase === "battle" || phase === "between") {
      paused = !paused;
      updateHud();
    }
  });
  btnSpeed.addEventListener("click", function () {
    speed = speed === 1 ? 2 : 1;
    updateHud();
  });
  btnRefresh.addEventListener("click", function () {
    if (phase === "over" || phase === "win") { setHint("本局已结束，请先开启下一局"); return; }
    if (grain < CONFIG.shop.refreshCost) { setHint("粮草不足，刷不起商店（10 粮草/次）"); return; }
    grain -= CONFIG.shop.refreshCost;
    refreshShop();
    updateHud();
    setHint("商店已刷新");
  });

  // ---------- 鼠标 ----------
  function canvasPointFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height)
    };
  }
  window.addEventListener("mousemove", function (e) {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width, sy = canvas.height / rect.height;
    mouse.x = (e.clientX - rect.left) * sx;
    mouse.y = (e.clientY - rect.top) * sy;
    mouse.inside = e.clientX >= rect.left && e.clientX <= rect.right &&
                   e.clientY >= rect.top && e.clientY <= rect.bottom;
    if (drag) {
      dragGhost.style.left = e.clientX + "px";
      dragGhost.style.top = e.clientY + "px";
      dragGhost.style.display = mouse.inside ? "none" : "block";
    }
  });
  canvas.addEventListener("mousedown", function (e) {
    if (!activePhase() || drag) return;
    const pt = canvasPointFromEvent(e);
    // 主动技能施法瞄准中：点任意战场坐标即释放
    if (casting) {
      resolveCast(pt.x, pt.y);
      e.preventDefault();
      return;
    }
    const cell = cellFromPoint(pt.x, pt.y);
    if (!cell) return;
    const u = grabUnitAt(cell.c, cell.r);
    if (u) { startDragFromField(u); e.preventDefault(); return; }
    // 点击敌军 → 查看信息
    const en = enemyAtPoint(pt.x, pt.y);
    if (en) { selected = { kind: "enemy", ref: en, born: 0 }; if (window.SFX) SFX.play("click"); return; }
    // 点空地 → 关闭信息面板
    if (selected) selected = null;
  });
  window.addEventListener("mouseup", function (e) {
    if (drag) performDrop(e.clientX, e.clientY);
  });
  window.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { clearDrag(); selected = null; cancelCast(); closeCardModal(); }
    // 空格：战斗中快捷暂停/继续
    if (e.key === " " && (phase === "battle" || phase === "between") && !e.repeat) {
      e.preventDefault();
      paused = !paused;
      updateHud();
    }
  });
  canvas.addEventListener("contextmenu", function (e) {
    e.preventDefault();
    clearDrag();
    selected = null;
    cancelCast();
  });

  // ---------- 自适应缩放 ----------
  function applyFitZoom() {
    document.documentElement.style.zoom = "1";
    const designW = Math.max(document.body.scrollWidth || 960, 960);
    const designH = document.body.scrollHeight || 900;
    const sx = (window.innerWidth - 8) / designW;
    const sy = (window.innerHeight - 8) / designH;
    const s = Math.max(0.4, Math.min(1, sx, sy));
    document.documentElement.style.zoom = String(s);
  }
  window.addEventListener("resize", applyFitZoom);

  // ---------- 启动 ----------
  const query = new URLSearchParams(window.location.search);
  const simulateSec = parseFloat(query.get("simulate") || "0");

  if (query.has("reportheight")) {
    function reportHeight() {
      document.title = "INNER=" + window.innerHeight + " SCROLL=" + document.documentElement.scrollHeight;
    }
    reportHeight();
    setTimeout(reportHeight, 100);
    setTimeout(reportHeight, 500);
  }

  renderInventory();
  refreshShop();
  renderCardBar();
  hookCardModal();

  if (query.get("diff")) { selDiff.value = query.get("diff"); }
  const queryLevel = parseInt(query.get("level") || "1", 10);
  loadProgress();
  selectedLevelId = Math.max(1, Math.min(saveData.unlocked, CONFIG.levels.length));
  if (query.has("autostart") || simulateSec > 0) {
    homeOpen = false; // 测试通道：跳过首页直接开战（无头测试用）
    homeScreen.style.display = "none";
    startGame(queryLevel); beginWave(1);
  } else {
    renderHome(); // 首页初始渲染（徽章 / 锁定态）
  }

  // 自动化测试阵容：多种小兵 + 农民 + 武将
  if (query.has("autodef")) {
    addUnitToField("soldier.heavy", 1, 1, 3);
    addUnitToField("farmer.farmer", 1, 2, 3);
    addUnitToField("soldier.archer", 1, 3, 3);
    addUnitToField("soldier.pike", 1, 1, 2);
    addUnitToField("hero.guan", 1, 4, 4);
    addUnitToField("hero.zhaoyun", 1, 4, 2);
    addUnitToField("hero.huangzhong", 1, 7, 1);
    addUnitToField("hero.zhangfei", 1, 5, 1);
  }

  drawMap(ctx);
  updateHud();
  applyFitZoom();
  setTimeout(applyFitZoom, 80);

  if (simulateSec > 0) {
    const dt = 1 / 60;
    for (let t = 0; t < simulateSec; t += dt) {
      update(dt);
      tickVisual(dt);
    }
    draw();
    if ((phase === "over" || phase === "win") && query.has("restartAfterOver")) {
      startGame();
      draw();
    }
  } else {
    requestAnimationFrame(loop);
  }
})();


