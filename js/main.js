// main.js —— M4：完整战斗系统
// 商店买单位 → 拖上场；合成升级；塔/农民/士兵/武将；
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
  let animClock = 0;    // 全局动画时钟（待机呼吸用）
  let shakeTime = 0;    // 屏幕震动剩余时间
  let shakeMag = 0;
  let inventory = new Array(CONFIG.inventorySize).fill(null);
  let uidCounter = 1;
  let placeSeqCounter = 0; // 场上单位部署顺序（越小越先上场，升星时优先保留）
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

  const dragGhost = document.createElement("div");
  dragGhost.style.cssText =
    "position:fixed;left:0;top:0;display:none;pointer-events:none;z-index:999;" +
    "padding:3px 10px;border-radius:10px;color:#fff;font-size:14px;" +
    "border:2px solid rgba(255,255,255,0.9);box-shadow:0 2px 8px rgba(0,0,0,0.5);" +
    "transform:translate(-50%,-50%);white-space:nowrap;";
  document.body.appendChild(dragGhost);

  // ---------- 工具 ----------
  function unitDef(type) {
    if (type.indexOf("tower.") === 0) return CONFIG.towers[type.slice(6)];
    if (type.indexOf("farmer.") === 0) return CONFIG.farmers[type.slice(7)];
    if (type.indexOf("hero.") === 0) return CONFIG.heroes[type.slice(5)];
    if (type.indexOf("soldier.") === 0) return CONFIG.soldiers[type.slice(8)];
    return null;
  }
  function statMul(level) { return Math.pow(CONFIG.levelGrowth, level - 1); }
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

  // 统计同款同等级棋子数量（备战区 + 场上武将/农民/塔一并计入）
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
  // 合并：幸存者升 1 级，其余同款同等级消失（备战区清槽、场上武将阵亡、场上塔/农民移除）
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
  // 某点周围 rad 格内的己方武将（任意方向，供全向交战判定）
  function soldiersNear(x, y, rad) {
    const out = [];
    const r = rad * getCellSize();
    for (const s of soldiers) {
      if (s.dead) continue;
      if (Math.hypot(s.x - x, s.y - y) <= r) out.push(s);
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
      if (isPathCell(col, row)) return { ok: false, msg: "塔/农民要放在草地格" };
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
        hp: def.hp * statMul(level), maxHp: def.hp * statMul(level),
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
      // 点击整张卡片即可购买（含按钮区域；按钮不另绑事件，避免冒泡重复触发）
      div.addEventListener("click", function () { buyFromShop(item.type, i); });
      const btn = document.createElement("button");
      btn.textContent = "购买 " + def.cost + " 粮草";
      shopButtons.push(btn);
      div.innerHTML = "<div class='sc-name'>" + def.name + "</div>" +
                      "<div class='sc-lv'>1 级</div>";
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
    if (idx < 0) { setHint("背包已满（5 格），先部署或合成腾位置"); return; }
    grain -= def.cost;
    inventory[idx] = { type: type, level: 1 };
    shopStock[index] = null;
    setHint("已购入 " + def.name + " → 放入背包第 " + (idx + 1) + " 格");
    if (window.SFX) SFX.play("buy");
    autoMergeInventory(); // 凑满 3 个自动升星
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
  function spawnEnemy(isBoss) {
    const p = spawnRR % curPaths.length;   // 轮询分路：公平分配到各入口
    spawnRR++;
    const first = curPaths[p][0];
    const pos = cellCenter(first.c, first.r);
    if (isBoss) {
      const scale = 1 + 0.1 * (waveIndex - 1);
      enemies.push({
        path: p, at: 0, x: pos.x, y: pos.y,
        hp: CONFIG.boss.hp * scale, maxHp: CONFIG.boss.hp * scale,
        isBoss: true,
        fighting: false, attackCd: 0, dead: false, flash: 0,
        stunTime: 0, ampTime: 0, ampMul: 1,
        age: 0, walkPhase: Math.random() * Math.PI * 2, lungeT: 0, lungeDir: 0
      });
    } else {
      enemies.push({
        path: p, at: 0, x: pos.x, y: pos.y,
        hp: CONFIG.enemy.hp * waveHpMul, maxHp: CONFIG.enemy.hp * waveHpMul,
        isBoss: false,
        fighting: false, attackCd: 0, dead: false, flash: 0,
        slowMul: 1, slowTime: 0, dotDmg: 0, dotInterval: 0, dotTime: 0, dotTimer: 0,
        stunTime: 0, ampTime: 0, ampMul: 1,
        age: 0, walkPhase: Math.random() * Math.PI * 2, lungeT: 0, lungeDir: 0
      });
    }
  }
  function arriveGate(e) {
    gateHp -= e.isBoss ? 10 : 1;
    if (window.SFX) SFX.play("alarm");
    const end = gateCell();
    const ec = cellCenter(end.c, end.r);
    addFloat(ec.x, ec.y - getCellSize() * 0.6, "-" + (e.isBoss ? 10 : 1) + "耐", "#ff5252", 0.22, 0.8);
    addSparks(ec.x, ec.y, 5, "#ff5252", 110);
    if (gateHp <= 0) { gateHp = 0; phase = "over"; if (window.SFX) SFX.play("lose"); updateHud(); }
  }
  function damageEnemy(e, dmg) {
    if (e.ampTime > 0) dmg *= (e.ampMul || 1);   // 易伤：伤害加深
    e.hp -= dmg;
    if (dmg > 0 && !e.dead) e.flash = 0.1; // 受击闪白
    if (dmg > 0 && !e.dead) addFloat(e.x, e.y - getCellSize() * 0.5, String(Math.round(dmg)), "#ffffff", 0.16, 0.5);
    if (e.hp <= 0 && !e.dead) {
      e.dead = true;
      const bounty = e.isBoss ? CONFIG.boss.bounty : CONFIG.enemy.bounty;
      grain += bounty;
      addFloat(e.x, e.y, "+" + bounty + "粮", "#ffd700", 0.24, 0.8);
      const cs = getCellSize();
      addDeathFx(e.x, e.y, e.isBoss ? cs * CONFIG.boss.radiusMul : cs * 0.26,
        e.isBoss ? CONFIG.boss.color : CONFIG.enemy.color, e.isBoss, e.isBoss ? "将" : null);
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
    announce("第 " + n + " 波 · 来袭", "#ff8c6a");
    // 波次间不再自动刷新商店（商店始终保留当前上架，需手动刷新）→ 锁定已无意义
    updateHud();
  }
  function onWaveCleared() {
    const bonus = CONFIG.waves.bonusBase + waveIndex * CONFIG.waves.bonusPerWave;
    grain += bonus;
    if (window.SFX) SFX.play("coin");
    setHint("第 " + waveIndex + " 波守住！奖励 " + bonus + " 粮草");
    recordWaveCleared(); // 存档：最高波次
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

    // 出生
    if (waveToSpawn > 0) {
      waveSpawnTimer -= dt;
      if (waveSpawnTimer <= 0) {
        if (waveBossPending) { spawnEnemy(true); waveBossPending = false; }
        else { spawnEnemy(false); }
        waveToSpawn--;
        waveSpawnTimer = CONFIG.enemy.spawnInterval;
      }
    }

    updateBuildings(dt);
    updateSoldiers(dt);
    updateHeroSkills(dt);
    updateEnemies(dt);

    enemies = enemies.filter(function (e) { return !e.dead; });
    soldiers = soldiers.filter(function (s) { return !s.dead; });

    if (waveToSpawn <= 0 && enemies.length === 0 && phase === "battle") onWaveCleared();
    updateHud();
  }

  // 建筑：塔攻击 / 农民产粮
  function updateBuildings(dt) {
    for (const b of buildings) {
      const def = unitDef(b.type);
      if (def.kind === "farmer") {
        b.timer -= dt;
        if (b.timer <= 0) {
          const got = def.produce[b.level - 1];
          grain += got;
          b.timer = def.produceInterval;
          b.bounceT = 0.45;   // 产粮欢快弹跳
          addFloat(b.x, b.y - getCellSize() * 0.5, "+" + got + "粮", "#ffd700", 0.18, 0.7);
        }
        continue;
      }
      b.cd -= dt;
      if (b.cd > 0) continue;
      const dmg = def.damage * statMul(b.level);
      if (def.splash > 0) {
        // 投石车：溅射
        const target = nearestEnemy(b.x, b.y, def.range);
        if (!target) continue;
        damageEnemy(target, dmg);
        const s = getCellSize();
        for (const e of enemies) {
          if (e.dead || e === target) continue;
          const dx = e.x - target.x, dy = e.y - target.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist <= def.splash * s) damageEnemy(e, dmg * def.splashFactor);
        }
        addExplosion(target.x, target.y, def.splash * s, 0.35);
        addBullet(b.x, b.y, target, def.color);
        b.recoilT = 0.12;
        addShake(0.15, 2);
        if (window.SFX) SFX.play("boom");
        b.cd = def.cooldown;
      } else if (def.dotDmg) {
        // 火攻台：伤害 + 减速 + 灼烧
        const target = nearestEnemy(b.x, b.y, def.range);
        if (!target) continue;
        damageEnemy(target, dmg);
        applySlow(target, def.slowMul, def.slowDur);
        applyDot(target, def.dotDmg * statMul(b.level), def.dotInterval, def.dotDur);
        addBullet(b.x, b.y, target, def.color);
        b.recoilT = 0.12;
        if (window.SFX) SFX.play("fire");
        b.cd = def.cooldown;
      } else {
        // 连弩台
        const target = nearestEnemy(b.x, b.y, def.range);
        if (!target) continue;
        damageEnemy(target, dmg);
        addBullet(b.x, b.y, target, def.color);
        b.recoilT = 0.12;
        b.cd = def.cooldown;
      }
    }
  }

  function updateSoldiers(dt) {
    for (const s of soldiers) {
      if (s.dead) continue;
      const def = unitDef(s.type);

      if (def.ranged) {
        // 远程：站桩射击（射击后坐动画）
        s.cd -= dt;
        if (s.cd <= 0) {
          const target = nearestEnemy(s.x, s.y, def.range);
          if (target) {
            damageEnemy(target, def.damage * statMul(s.level));
            gainRage(s, CONFIG.rage.perAttack);
            s.cd = def.attackInterval;
            s.animDur = 0.22;
            s.animT = s.animDur;
            s.animDir = Math.atan2(target.y - s.y, target.x - s.x);
            addBullet(s.x, s.y, target, def.color);
          }
        }
        continue;
      }

      // 近战：全向寻敌（真实距离判定，四周任意方向的敌人都可交战，不限同一条路）
      // 活动范围以驻守格（放置位置）为锚点、engage 格为半径，绝不追到出生点
      const cs = getCellSize();
      const homePt = cellCenter(s.homeC, s.homeR);

      // 1) 交战：身边 1.5 格内最近的敌人（任意方向、任意路径）
      let target = null, bestD = Infinity;
      for (const e of enemies) {
        if (e.dead) continue;
        const d = Math.hypot(e.x - s.x, e.y - s.y);
        if (d <= cs * 1.5 && d < bestD) { bestD = d; target = e; }
      }
      if (target) {
        s.cd -= dt;
        if (s.cd <= 0) {
          damageEnemy(target, def.damage * statMul(s.level));
          gainRage(s, CONFIG.rage.perAttack);
          s.cd = def.attackInterval;
          s.animDur = Math.max(0.18, Math.min(0.34, def.attackInterval * 0.6));
          s.animT = s.animDur;
          s.animDir = Math.atan2(target.y - s.y, target.x - s.x);
          addSlash(s.x, s.y, s.animDir, def.hero ? "#ffd700" : "#ffffff");
          addSparks(target.x, target.y, 3, "#ffffff", 90);
          if (def.hero) addShake(0.08, 1);
        }
        continue; // 交战距离内保持原位
      }

      // 2) 追击：锚点圈（engage 格）内最近的敌人 → 沿路径格逐格逼近，不踩草地
      const engage = def.engage || 2;
      const reach = engage * cs;
      let far = null, bestFar = Infinity;
      for (const e of enemies) {
        if (e.dead) continue;
        const d = Math.hypot(e.x - homePt.x, e.y - homePt.y);
        if (d <= reach + cs * 1.5 && d < bestFar) { bestFar = d; far = e; }
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
            // 与其他武将保持间距，不互相重叠
            let blocked = false;
            for (const o of soldiers) {
              if (o === s || o.dead) continue;
              if (Math.hypot(o.x - nx, o.y - ny) < cs * 0.6) { blocked = true; break; }
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

      // 状态：眩晕 / 易伤 / 减速 / 灼烧 / 受击闪白 / 行走相位
      if (e.stunTime > 0) e.stunTime -= dt;
      if (e.ampTime > 0) e.ampTime -= dt;
      if (e.slowTime > 0) e.slowTime -= dt;
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

      // 交战判定：身边 1.5 格内有武将（任意方向，不限同一条路）→ 停下与其交战（与武将寻敌对称）
      const defs = soldiersNear(e.x, e.y, 1.5);
      if (defs.length > 0) e.fighting = true;

      if (e.fighting) {
        e.attackCd -= dt;
        if (defs.length === 0) {
          e.fighting = false;
        } else if (e.attackCd <= 0) {
          if (e.isBoss) {
            for (const d of defs) {
              d.hp -= CONFIG.boss.damage;
              d.hitFlash = 0.1;
              gainRage(d, CONFIG.rage.perHurt);
              if (d.hp <= 0) killSoldier(d);
            }
          } else {
            defs[0].hp -= CONFIG.enemy.damage;
            defs[0].hitFlash = 0.1;
            gainRage(defs[0], CONFIG.rage.perHurt);
            if (defs[0].hp <= 0) killSoldier(defs[0]);
          }
          e.attackCd = e.isBoss ? CONFIG.boss.attackInterval : CONFIG.enemy.attackInterval;
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
      const spd = (e.slowTime > 0 ? e.slowMul : 1) * (e.isBoss ? CONFIG.boss.speed : CONFIG.enemy.speed);
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
        continue;
      }
      // 塔：开火后坐压缩（纵向压扁、横向鼓起）
      let sqx = 1, sqy = 1;
      const rp = b.recoilT > 0 ? b.recoilT / 0.12 : 0;
      if (rp > 0) { sqy = 1 - 0.16 * rp; sqx = 1 + 0.08 * rp; }
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.scale(pop * sqx, pop * sqy);
      ctx.fillStyle = "rgba(0,0,0,0.10)";
      ctx.beginPath(); ctx.arc(0, 0, s * 0.42, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = def.color;
      ctx.fillRect(-s * 0.33, -s * 0.33, s * 0.66, s * 0.66);
      ctx.strokeStyle = "rgba(20,10,0,0.6)"; ctx.lineWidth = 2;
      ctx.strokeRect(-s * 0.33, -s * 0.33, s * 0.66, s * 0.66);
      ctx.fillStyle = "#fff";
      ctx.font = s * 0.26 + "px KaiTi, serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(def.short + (b.level > 1 ? b.level : ""), 0, 0);
      ctx.restore();
      // 炮口火光（刚开火的一瞬）
      if (rp > 0.55) {
        ctx.globalAlpha = (rp - 0.55) / 0.45 * 0.8;
        ctx.fillStyle = "#ffe9b0";
        ctx.beginPath(); ctx.arc(b.x, b.y, s * 0.2 + (1 - rp) * s * 0.18, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
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
      if (sld.animT > 0 && sld.animDur > 0) {
        const p = 1 - sld.animT / sld.animDur;
        const lunge = Math.sin(p * Math.PI);      // 去-回
        const dirMul = def.ranged ? -0.55 : 1;    // 远程后坐，近战突刺
        ox += Math.cos(sld.animDir) * lunge * s * 0.2 * dirMul;
        oy += Math.sin(sld.animDir) * lunge * s * 0.2 * dirMul;
        if (def.ranged) { sx = 1 - 0.08 * lunge; sy = 1 + 0.06 * lunge; }
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
      const r = e.isBoss ? s * CONFIG.boss.radiusMul : s * 0.26;

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
      ctx.fillStyle = e.isBoss ? CONFIG.boss.color : CONFIG.enemy.color;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(20,10,0,0.6)"; ctx.lineWidth = 2; ctx.stroke();
      if (e.isBoss) {
        // Boss 金色呼吸光环
        const aura = 0.3 + 0.25 * Math.sin(animClock * 3);
        ctx.strokeStyle = "rgba(255,215,0," + aura.toFixed(3) + ")";
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, r * 1.22, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = "#fff";
        ctx.font = s * 0.3 + "px KaiTi, serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("将", 0, 0);
      }
      if (e.flash > 0) {
        ctx.globalAlpha = Math.min(1, e.flash / 0.1) * 0.7;
        ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();

      if (e.hp < e.maxHp) {
        const w = e.isBoss ? s * 0.9 : s * 0.56;
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
      const r = (e.isBoss ? s * CONFIG.boss.radiusMul : s * 0.26) + 5;
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

  // 选中标记：金色/红色虚线旋转圆环
  function drawSelectionMark() {
    if (!selected || !selectionAlive()) return;
    const u = selected.ref;
    const s = getCellSize();
    let r;
    if (selected.kind === "enemy") {
      r = (u.isBoss ? s * CONFIG.boss.radiusMul : s * 0.26) + 6;
    } else {
      const def = unitDef(u.type);
      r = def.kind === "soldier" ? s * 0.42 : s * 0.48;
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
      name = isBoss ? "敌方将领" : "敌兵";
      tag = isBoss ? "BOSS" : "敌军";
      iconColor = isBoss ? CONFIG.boss.color : CONFIG.enemy.color;
      iconChar = isBoss ? "将" : "兵";
      rows.push({ label: "生命", bar: u.hp / u.maxHp, text: Math.ceil(u.hp) + "/" + Math.ceil(u.maxHp) });
      rows.push({ label: "攻击", value: (isBoss ? CONFIG.boss.damage : CONFIG.enemy.damage) + "（每 " + (isBoss ? CONFIG.boss.attackInterval : CONFIG.enemy.attackInterval) + " 秒）" });
      rows.push({ label: "赏金", value: (isBoss ? CONFIG.boss.bounty : CONFIG.enemy.bounty) + " 粮草" });
      if (isBoss) rows.push({ label: "破城", value: "冲入城门扣 10 耐久" });
      else rows.push({ label: "行军", value: "速度 " + CONFIG.enemy.speed.toFixed(1) + " 格/秒" });
    } else {
      const def = unitDef(u.type);
      name = def.name;
      lv = u.level;
      iconColor = def.color;
      iconChar = def.short;
      iconSquare = def.kind === "tower";
      if (def.kind === "soldier") {
        tag = "武将 · " + (def.ranged ? "远程" : "近战");
        const mul = statMul(u.level);
        rows.push({ label: "生命", bar: Math.max(0, u.hp / u.maxHp), text: Math.ceil(u.hp) + "/" + Math.ceil(u.maxHp) });
        rows.push({ label: "攻击", value: Math.round(def.damage * mul) + "（每 " + def.attackInterval + " 秒）" });
        rows.push({ label: "射程", value: def.ranged ? def.range + " 格" : (def.engage || 2) + " 格" });
        if (def.skill) {
          skill = def.skill;
          rageRatio = Math.max(0, Math.min(1, u.rage / CONFIG.rage.max));
          skillPower = Math.round((skill.damage || 0) * (skill.count || 1) * mul);
        }
      } else if (def.kind === "tower") {
        tag = "塔";
        const mul = statMul(u.level);
        rows.push({ label: "伤害", value: Math.round(def.damage * mul) + "（每 " + def.cooldown + " 秒）" });
        rows.push({ label: "射程", value: def.range + " 格" });
        if (def.splash > 0) rows.push({ label: "特性", value: "溅射 " + def.splash + " 格" });
        if (def.dotDmg) rows.push({ label: "特性", value: "减速 " + Math.round((1 - def.slowMul) * 100) + "% + 灼烧" });
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
    if ((def.kind === "tower" || def.ranged) && def.range) {
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
    inventory = new Array(CONFIG.inventorySize).fill(null);
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
    if (e.key === "Escape") { clearDrag(); selected = null; }
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
  });

  // ---------- 自适应缩放 ----------
  function applyFitZoom() {
    document.documentElement.style.zoom = "1";
    const designH = document.body.scrollHeight || 900;
    const sx = (window.innerWidth - 8) / 960;
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

  // 自动化测试阵容：多种塔 + 士兵 + 武将
  if (query.has("autodef")) {
    addUnitToField("tower.archer", 1, 1, 3);
    addUnitToField("farmer.farmer", 1, 2, 3);
    addUnitToField("tower.catapult", 1, 3, 3);
    addUnitToField("tower.fire", 1, 1, 2);
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


