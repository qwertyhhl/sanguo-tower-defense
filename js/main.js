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
  let shakeTime = 0;    // 屏幕震动剩余时间
  let shakeMag = 0;
  let inventory = new Array(CONFIG.inventorySize).fill(null);
  let uidCounter = 1;

  let drag = null;
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
  const btnLock = document.getElementById("btn-lock");
  const inventoryBar = document.getElementById("inventory-bar");
  const hintEl = document.getElementById("deploy-hint");

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
  function addSlash(x, y, dir, color) {
    fxSlashes.push({ x: x, y: y, dir: dir, color: color || "#ffffff", life: 0.2, ttl: 0.2 });
  }
  function addBullet(x, y, target, color) {
    bullets.push({ x: x, y: y, tx: target.x, ty: target.y, color: color, life: 0.4, ttl: 0.4 });
  }
  function fieldCount() { return buildings.length + soldiers.length; }
  function freeSlot() { for (let i = 0; i < inventory.length; i++) if (!inventory[i]) return i; return -1; }
  function activePhase() { return phase === "ready" || phase === "battle" || phase === "between"; }
  function diffConf() { return CONFIG.difficulties[diffKey] || CONFIG.difficulties.normal; }
  function findPathIndex(col, row) {
    for (let i = 0; i < CONFIG.path.length; i++) {
      if (CONFIG.path[i].c === col && CONFIG.path[i].r === row) return i;
    }
    return -1;
  }

  function setHint(text) {
    if (!hintEl) return;
    hintEl.textContent = text;
    if (hintTimer) clearTimeout(hintTimer);
    hintTimer = setTimeout(function () { hintEl.textContent = ""; }, 2600);
  }

  function updateHud() {
    hudWave.textContent = waveIndex + "/" + CONFIG.waves.total;
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
    else if (phase === "over" || phase === "win") btnStart.textContent = "再战一局";
    else btnStart.textContent = "进攻中…";

    btnPause.textContent = paused ? "继续" : "暂停";
    btnPause.classList.toggle("active", paused);
    btnSpeed.textContent = "速度 ×" + speed;

    btnLock.textContent = shopLocked ? "已锁定" : "锁定";
    btnLock.classList.toggle("locked", shopLocked);
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
  function soldiersOnCell(cell) {
    const out = [];
    for (const s of soldiers) if (!s.dead && s.col === cell.c && s.row === cell.r) out.push(s);
    return out;
  }
  // 某路线点是否有己方士兵/武将（用于“相邻格对战”，禁止踩进对方格子）
  function soldierOnPathIndex(idx) {
    if (idx < 0 || idx >= CONFIG.path.length) return false;
    return soldiersOnCell(CONFIG.path[idx]).length > 0;
  }

  function validatePlace(type, level, col, row, fromField) {
    const def = unitDef(type);
    if (!def) return { ok: false, msg: "未知单位" };
    const last = CONFIG.path[CONFIG.path.length - 1];
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
      const pi = findPathIndex(col, row);
      soldiers.push({
        uid: uid, type: type, level: level,
        col: col, row: row, x: center.x, y: center.y,
        curPath: pi, homePath: pi,
        hp: def.hp * statMul(level), maxHp: def.hp * statMul(level),
        cd: 0, skillCd: 0, dead: false, hitFlash: 0, recoilT: 0, animT: 0, animDur: 0, animDir: 0
      });
    } else {
      buildings.push({
        uid: uid, type: type, level: level,
        col: col, row: row, x: center.x, y: center.y,
        cd: 0, timer: def.produceInterval || def.cooldown
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
  let shopLocked = false;

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
      const btn = document.createElement("button");
      btn.textContent = "购买 " + def.cost + " 粮草";
      btn.disabled = grain < def.cost || freeSlot() < 0;
      btn.addEventListener("click", function () { buyFromShop(item.type, i); });
      div.innerHTML = "<div class='sc-name'>" + def.name + "</div>" +
                      "<div class='sc-lv'>1 级</div>";
      div.appendChild(btn);
      shopItems.appendChild(div);
    }
    btnRefresh.disabled = false;
  }
  function buyFromShop(type, index) {
    if (phase === "over" || phase === "win") { setHint("游戏已结束，先点「再战一局」"); return; }
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
          if (!activePhase()) { setHint("游戏已结束，先点「再战一局」"); return; }
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
    drag = { type: unit.type, level: unit.level, from: "field", uid: unit.uid };
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
      if (phase === "over" || phase === "win") { setHint("游戏已结束，先点「再战一局」"); clearDrag(); return; }
      const sdef = unitDef(d.type);
      const value = sdef.cost * Math.pow(2, d.level - 1);
      removeDragSource();
      grain += value;
      setHint("已出售 " + sdef.name + " Lv" + d.level + " → +" + value + " 粮草");
      if (window.SFX) SFX.play("coin");
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
        if (d.level >= CONFIG.maxLevel) { setHint("已满级，不能再合成"); clearDrag(); return; }
        removeDragSource();
        inventory[idx] = { type: d.type, level: d.level + 1 };
        setHint("合成成功！" + unitDef(d.type).name + " → Lv" + (d.level + 1));
        if (window.SFX) SFX.play("merge");
        renderInventory(); updateHud();
        clearDrag(); return;
      }
      if (!tgt) {
        removeDragSource();
        inventory[idx] = { type: d.type, level: d.level };
        renderInventory(); updateHud();
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
      const tgt = findMergeTarget(d.type, d.level, cell.c, cell.r);
      if (tgt) {
        if (d.level >= CONFIG.maxLevel) { setHint("已满级，不能再合成"); clearDrag(); return; }
        if (d.from === "field" && d.uid === tgt.uid) { clearDrag(); return; }
        removeDragSource();
        removeFieldUid(tgt.uid);
        addUnitToField(d.type, d.level + 1, cell.c, cell.r);
        setHint("合成成功！" + unitDef(d.type).name + " → Lv" + (d.level + 1));
        if (window.SFX) SFX.play("merge");
        updateHud();
        clearDrag(); return;
      }
      const v = validatePlace(d.type, d.level, cell.c, cell.r, d.from === "field");
      if (v.ok) {
        removeDragSource();
        addUnitToField(d.type, d.level, cell.c, cell.r);
        setHint("已部署 " + unitDef(d.type).name);
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
    const first = CONFIG.path[0];
    const pos = cellCenter(first.c, first.r);
    if (isBoss) {
      const scale = 1 + 0.1 * (waveIndex - 1);
      enemies.push({
        at: 0, x: pos.x, y: pos.y,
        hp: CONFIG.boss.hp * scale, maxHp: CONFIG.boss.hp * scale,
        isBoss: true,
        fighting: false, attackCd: 0, dead: false, flash: 0
      });
    } else {
      enemies.push({
        at: 0, x: pos.x, y: pos.y,
        hp: CONFIG.enemy.hp * waveHpMul, maxHp: CONFIG.enemy.hp * waveHpMul,
        isBoss: false,
        fighting: false, attackCd: 0, dead: false, flash: 0,
        slowMul: 1, slowTime: 0, dotDmg: 0, dotInterval: 0, dotTime: 0, dotTimer: 0
      });
    }
  }
  function arriveGate(e) {
    gateHp -= e.isBoss ? 10 : 1;
    if (window.SFX) SFX.play("alarm");
    if (gateHp <= 0) { gateHp = 0; phase = "over"; if (window.SFX) SFX.play("lose"); updateHud(); }
  }
  function damageEnemy(e, dmg) {
    e.hp -= dmg;
    if (dmg > 0 && !e.dead) e.flash = 0.1; // 受击闪白
    if (dmg > 0 && !e.dead) addFloat(e.x, e.y - getCellSize() * 0.5, String(Math.round(dmg)), "#ffffff", 0.16, 0.5);
    if (e.hp <= 0 && !e.dead) {
      e.dead = true;
      const bounty = e.isBoss ? CONFIG.boss.bounty : CONFIG.enemy.bounty;
      grain += bounty;
      addFloat(e.x, e.y, "+" + bounty + "粮", "#ffd700", 0.24, 0.8);
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
    if (!shopLocked) refreshShop();
    updateHud();
  }
  function onWaveCleared() {
    const bonus = CONFIG.waves.bonusBase + waveIndex * CONFIG.waves.bonusPerWave;
    grain += bonus;
    if (window.SFX) SFX.play("coin");
    setHint("第 " + waveIndex + " 波守住！奖励 " + bonus + " 粮草");
    if (phase === "win" && window.SFX) SFX.play("win");
    if (waveIndex >= CONFIG.waves.total) phase = "win";
    else { phase = "between"; prepTimer = CONFIG.waves.prepTime; }
    updateHud();
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
    updateTracers(dt);
    updateExplosions(dt);
    updateFx(dt);

    enemies = enemies.filter(function (e) { return !e.dead; });
    soldiers = soldiers.filter(function (s) { return !s.dead; });
    tracers = tracers.filter(function (t) { return t.life > 0; });
    explosions = explosions.filter(function (x) { return x.life > 0; });
    bullets = bullets.filter(function (b) { return b.life > 0; });
    fxSlashes = fxSlashes.filter(function (f) { return f.life > 0; });
    fxFloats = fxFloats.filter(function (f) { return f.life > 0; });

    if (waveToSpawn <= 0 && enemies.length === 0 && phase === "battle") onWaveCleared();
    updateHud();
  }

  // 建筑：塔攻击 / 农民产粮
  function updateBuildings(dt) {
    for (const b of buildings) {
      const def = unitDef(b.type);
      if (b.recoilT > 0) b.recoilT -= dt;
      if (def.kind === "farmer") {
        b.timer -= dt;
        if (b.timer <= 0) {
          grain += def.produce[b.level - 1];
          b.timer = def.produceInterval;
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
        explosions.push({ x: target.x, y: target.y, life: 0.35, radius: def.splash * s });
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

  // 沿路径朝目标格子走一格
  function moveUnitToward(s, targetPathIndex, def, dt) {
    if (targetPathIndex < 0 || targetPathIndex >= CONFIG.path.length) return;
    const dest = cellCenter(CONFIG.path[targetPathIndex].c, CONFIG.path[targetPathIndex].r);
    const dx = dest.x - s.x, dy = dest.y - s.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const step = (def.moveSpeed || 3) * getCellSize() * dt;
    if (dist <= step) {
      s.curPath = targetPathIndex;
      s.x = dest.x; s.y = dest.y;
      s.col = CONFIG.path[targetPathIndex].c;
      s.row = CONFIG.path[targetPathIndex].r;
    } else {
      s.x += (dx / dist) * step;
      s.y += (dy / dist) * step;
    }
  }

  function updateSoldiers(dt) {
    for (const s of soldiers) {
      if (s.dead) continue;
      const def = unitDef(s.type);
      if (s.recoilT > 0) s.recoilT -= dt;
      if (s.animT > 0) s.animT -= dt;

      if (def.ranged) {
        // 远程：站桩射击
        s.cd -= dt;
        if (s.cd <= 0) {
          const target = nearestEnemy(s.x, s.y, def.range);
          if (target) {
            damageEnemy(target, def.damage * statMul(s.level));
            s.cd = def.attackInterval;
            s.recoilT = 0.14;
            s.animDir = Math.atan2(target.y - s.y, target.x - s.x);
            addBullet(s.x, s.y, target, def.color);
          }
        }
        continue;
      }

      // 近战（含出击武将）：同格或相邻格（路径距离≤1）即可攻击，不踏入敌人所在格
      let target = null, bestD = 10;
      for (const e of enemies) {
        if (e.dead) continue;
        const d = Math.abs(e.at - s.curPath);
        if (d < bestD) { bestD = d; target = e; }
      }
      if (target && bestD <= 1) {
        s.cd -= dt;
        if (s.cd <= 0) {
          damageEnemy(target, def.damage * statMul(s.level));
          s.cd = def.attackInterval;
          s.animDur = Math.max(0.18, Math.min(0.34, def.attackInterval * 0.6));
          s.animT = s.animDur;
          s.animDir = Math.atan2(target.y - s.y, target.x - s.x);
          addSlash(s.x, s.y, s.animDir, def.hero ? "#ffd700" : "#ffffff");
          if (def.hero) addShake(0.08, 1);
        }
        continue; // 已在交战距离，保持原位（相邻格），不重叠
      }

      // 敌人较远（距离≥2）时：迎击/出击前进（但前方格子被自己人占着就排队）
      const reach = def.engage || 0;
      let far = null, bestFar = Infinity;
      for (const e of enemies) {
        if (e.dead) continue;
        const d = Math.abs(e.at - s.curPath);
        if (d > 1 && d <= reach && d < bestFar) { bestFar = d; far = e; }
      }
      if (far) {
        const stepIdx = far.at > s.curPath ? s.curPath + 1 : s.curPath - 1;
        if (!soldierOnPathIndex(stepIdx)) moveUnitToward(s, stepIdx, def, dt);
      } else if (s.curPath !== s.homePath) {
        // 回位
        const stepIdx = s.curPath > s.homePath ? s.curPath - 1 : s.curPath + 1;
        moveUnitToward(s, stepIdx, def, dt);
      }
    }
  }

  // 武将技能（自动施放）
  function updateHeroSkills(dt) {
    for (const s of soldiers) {
      if (s.dead) continue;
      const def = unitDef(s.type);
      if (!def.hero || !def.skill) continue;
      s.skillCd -= dt;
      if (s.skillCd > 0) continue;
      const sk = def.skill;
      const dmgMul = statMul(s.level);
      const sCell = getCellSize();

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
        if (list.length === 0) continue;
        for (const e of list) damageEnemy(e, sk.damage * dmgMul);
        if (sk.slowMul) for (const e of list) applySlow(e, sk.slowMul, sk.slowDur);
        explosions.push({ x: s.x, y: s.y, life: 0.4, radius: sk.radius * sCell });
        if (window.SFX) SFX.play("boom");
        addShake(0.15, 2);
        s.skillCd = sk.cooldown;
      } else if (sk.type === "multihit") {
        const target = nearestEnemy(s.x, s.y, sk.range || 5);
        if (!target) continue;
        damageEnemy(target, sk.damage * sk.count * dmgMul);
        explosions.push({ x: target.x, y: target.y, life: 0.25, radius: 0.6 * sCell });
        if (window.SFX) SFX.play("shoot");
        addShake(0.08, 1);
        s.skillCd = sk.cooldown;
      } else if (sk.type === "snipe") {
        let target = null, bestHp = -1;
        for (const e of enemies) {
          if (e.dead) continue;
          const dx = e.x - s.x, dy = e.y - s.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist <= (sk.range || 5) * sCell && e.hp > bestHp) { bestHp = e.hp; target = e; }
        }
        if (!target) continue;
        damageEnemy(target, sk.damage * dmgMul);
        tracers.push({ x1: s.x, y1: s.y, x2: target.x, y2: target.y, life: 0.2 });
        explosions.push({ x: target.x, y: target.y, life: 0.3, radius: 0.7 * sCell });
        addShake(0.1, 1.5);
        s.skillCd = sk.cooldown;
      }
    }
  }

  function updateEnemies(dt) {
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (e.dead) continue;

      // 状态：减速 / 灼烧 / 受击闪白
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

      if (e.fighting) {
        e.attackCd -= dt;
        // 敌军停在自己格子，防守方在“下一格（e.at+1）”相邻交战
        const foeCell = CONFIG.path[e.at + 1] || CONFIG.path[e.at];
        const defs = soldiersOnCell(foeCell);
        if (defs.length === 0) {
          e.fighting = false;
        } else if (e.attackCd <= 0) {
          if (e.isBoss) {
            for (const d of defs) {
              d.hp -= CONFIG.boss.damage;
              d.hitFlash = 0.1;
              if (d.hp <= 0) d.dead = true;
            }
          } else {
            defs[0].hp -= CONFIG.enemy.damage;
            defs[0].hitFlash = 0.1;
            if (defs[0].hp <= 0) defs[0].dead = true;
          }
          e.attackCd = e.isBoss ? CONFIG.boss.attackInterval : CONFIG.enemy.attackInterval;
        }
        continue;
      }

      // 下一格被己方占领 → 在本格停下，隔一格交战（不重叠）
      const nextIdx = e.at + 1;
      if (nextIdx < CONFIG.path.length && soldierOnPathIndex(nextIdx)) {
        e.fighting = true;
        continue;
      }
      // 意外同格（例如己方追击途中）也按交战处理
      if (soldierOnPathIndex(e.at)) { e.fighting = true; continue; }

      if (e.at >= CONFIG.path.length - 1) { arriveGate(e); enemies.splice(i, 1); continue; }

      const next = CONFIG.path[e.at + 1];
      const dest = cellCenter(next.c, next.r);
      const dx = dest.x - e.x, dy = dest.y - e.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const spd = (e.slowTime > 0 ? e.slowMul : 1) * (e.isBoss ? CONFIG.boss.speed : CONFIG.enemy.speed);
      const step = spd * getCellSize() * dt;
      if (dist <= step) {
        e.at += 1;
        e.x = dest.x; e.y = dest.y;
        if (e.at >= CONFIG.path.length - 1) { arriveGate(e); enemies.splice(i, 1); continue; }
        if (soldierOnPathIndex(e.at)) e.fighting = true;
      } else {
        e.x += (dx / dist) * step;
        e.y += (dy / dist) * step;
      }
    }
  }

  function updateTracers(dt) { for (const t of tracers) t.life -= dt; }
  function updateExplosions(dt) { for (const x of explosions) x.life -= dt; }
  function updateFx(dt) {
    // 飞行弹丸：追踪目标点（必中，视觉延迟）
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
    for (const f of fxSlashes) f.life -= dt;
    for (const f of fxFloats) { f.life -= dt; f.y -= 26 * dt; }
    if (shakeTime > 0) shakeTime -= dt; else shakeMag = 0;
  }

  // ---------- 绘制 ----------
  function drawHpBar(x, y, w, h, ratio, color) {
    ctx.fillStyle = "#1c1c1c";
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = color;
    if (ratio > 0) ctx.fillRect(x, y, w * ratio, h);
  }
  function weaponFor(type) {
    if (type === "soldier.shield") return "shield";
    if (type === "soldier.archer" || type === "hero.huangzhong") return "bow";
    if (type === "soldier.spear" || type === "hero.zhaoyun") return "spear";
    if (type === "hero.guan") return "guandao";
    if (type === "hero.zhangfei") return "serpent";
    if (type === "hero.zhouyu") return "sword";
    if (type === "hero.zhuge") return "fan";
    if (type === "farmer.farmer") return "hoe";
    return "sword";
  }
  // 火柴人绘制：x,y 为格子中心；s 为格子边长；opt={hero,enemy,boss,level,dir}
  function stickFigure(x, y, s, def, weapon, opt) {
    const color = (opt && opt.enemy) ? "#1c1c1c" : "#1c1c1c";
    const sash = (opt && opt.boss) ? "#6a2f8f" : (opt && opt.enemy) ? "#a03030" : (def ? def.color : "#7a7a7a");
    const dir = (opt && opt.dir < 0) ? -1 : 1;
    const k = (opt && opt.boss) ? s * 1.3 : s; // Boss 更大
    const gy = y + s * 0.32; // 脚底
    // 影子
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath(); ctx.ellipse(x, gy + s * 0.04, k * 0.22, k * 0.05, 0, 0, Math.PI * 2); ctx.fill();

    ctx.save();
    ctx.translate(x, gy);
    ctx.scale(dir * (k / s), k / s); // 以 s 为单位的坐标系，y 向上为负
    const lw = Math.max(2, s * 0.06);
    ctx.lineCap = "round";
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    function seg(x1, y1, x2, y2, w, col) {
      ctx.strokeStyle = col || color;
      ctx.lineWidth = w || lw;
      ctx.beginPath(); ctx.moveTo(x1 * s, y1 * s); ctx.lineTo(x2 * s, y2 * s); ctx.stroke();
    }
    // 腿
    seg(0, -0.30, -0.10, 0, lw * 0.9);
    seg(0, -0.30, 0.12, 0, lw * 0.9);
    // 身体
    seg(0, -0.30, 0, -0.58, lw);
    // 腰饰（阵营色）
    ctx.fillStyle = sash;
    ctx.fillRect(-0.13 * s, -0.34 * s, 0.26 * s, 0.05 * s);
    // 后臂
    seg(0, -0.56, -0.22, -0.52, lw * 0.85);
    // 头
    ctx.beginPath(); ctx.arc(0, -0.68 * s, 0.10 * s, 0, Math.PI * 2); ctx.stroke();
    // 头饰（阵营色带）
    ctx.strokeStyle = sash; ctx.lineWidth = lw * 0.8;
    ctx.beginPath(); ctx.moveTo(-0.10 * s, -0.74 * s); ctx.lineTo(0.10 * s, -0.74 * s); ctx.stroke();
    // 武将金色星标
    if (opt && opt.hero) {
      ctx.fillStyle = "#ffd700";
      ctx.font = (s * 0.16) + "px KaiTi, serif";
      ctx.textAlign = "center";
      ctx.fillText("★", 0, -0.86 * s);
    }
    // 前臂（持武器）
    const hx = 0.24, hy = -0.56;
    seg(0, -0.56, hx, hy, lw * 0.85);
    // —— 武器 ——
    if (weapon === "spear" || weapon === "serpent" || weapon === "guandao") {
      const shaftCol = weapon === "guandao" ? "#3e5a20" : weapon === "serpent" ? "#2a2a2a" : "#b08968";
      seg(hx, hy, 1.0, -0.92, lw * 0.8, shaftCol);
      ctx.fillStyle = weapon === "guandao" ? "#e7efe0" : "#dfe6ec";
      ctx.strokeStyle = "#1c140c"; ctx.lineWidth = 1.5;
      // 枪/刀头
      ctx.beginPath(); ctx.moveTo(1.0 * s, -0.92 * s);
      if (weapon === "guandao") {
        ctx.lineTo(1.18 * s, -0.80 * s); ctx.lineTo(1.0 * s, -0.72 * s);
      } else {
        ctx.lineTo(1.10 * s, -0.78 * s); ctx.lineTo(0.94 * s, -0.86 * s);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // 红缨
      ctx.fillStyle = "#c33";
      ctx.beginPath(); ctx.arc(0.90 * s, -0.86 * s, 0.05 * s, 0, Math.PI * 2); ctx.fill();
    } else if (weapon === "shield") {
      seg(hx, hy, 0.55, -0.55, lw * 0.85);
      const sx0 = 0.58, sy0 = -0.48;
      ctx.fillStyle = "#caa15a"; ctx.strokeStyle = "#1c140c"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx0 * s, sy0 * s, 0.22 * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#5a3510"; ctx.beginPath(); ctx.arc(sx0 * s, sy0 * s, 0.07 * s, 0, Math.PI * 2); ctx.fill();
      seg(-0.22, -0.52, -0.5, -0.95, lw * 0.9, "#cfd6dd"); // 刀
    } else if (weapon === "bow") {
      seg(hx, hy, 0.55, -0.68, lw * 0.85);
      ctx.strokeStyle = "#8a5a28"; ctx.lineWidth = lw * 0.8;
      ctx.beginPath(); ctx.arc(0.55 * s, -0.68 * s, 0.26 * s, -1.1, 1.1); ctx.stroke();
      ctx.strokeStyle = "#e8e0cc"; ctx.lineWidth = lw * 0.4;
      ctx.beginPath(); ctx.moveTo(0.33 * s, -0.52 * s); ctx.lineTo(0.55 * s, -0.68 * s); ctx.lineTo(0.36 * s, -0.86 * s); ctx.stroke();
    } else if (weapon === "sword" || weapon === "greatsword") {
      const big = weapon === "greatsword";
      seg(hx, hy, 1.0, -1.02, (big ? lw * 1.6 : lw * 0.9), "#cfd6dd");
      ctx.strokeStyle = "#1c140c"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(1.0 * s, -1.02 * s); ctx.lineTo(1.06 * s, -0.94 * s); ctx.stroke();
    } else if (weapon === "fan") {
      seg(hx, hy, 0.6, -0.72, lw * 0.85);
      ctx.fillStyle = "rgba(240,235,220,0.9)"; ctx.strokeStyle = "#8c7a55"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(0.66 * s, -0.74 * s, 0.13 * s, 0.16 * s, -0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else if (weapon === "hoe") {
      seg(hx, hy, 0.62, -0.95, lw * 0.85, "#b08968");
      ctx.strokeStyle = "#b8b8b8"; ctx.lineWidth = lw * 0.8;
      ctx.beginPath(); ctx.moveTo(0.52 * s, -1.02 * s); ctx.lineTo(0.72 * s, -0.92 * s); ctx.stroke();
    }
    ctx.restore();
  }
  function drawBuildings() {
    const s = getCellSize();
    for (const b of buildings) {
      const def = unitDef(b.type);
      if (def.kind === "farmer") {
        stickFigure(b.x, b.y, s, def, "hoe", { dir: 1 });
        if (b.level > 1) {
          ctx.fillStyle = "#ffd700";
          ctx.font = s * 0.18 + "px KaiTi, serif";
          ctx.textAlign = "center";
          ctx.fillText("Lv" + b.level, b.x, b.y - s * 0.55);
        }
        continue;
      }
      // 塔：底座 + 主体
      const sc = b.recoilT > 0 ? 0.92 : 1;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.scale(sc, sc);
      ctx.fillStyle = "#6b4a26";
      ctx.fillRect(-s * 0.42, s * 0.10, s * 0.84, s * 0.22);
      ctx.fillStyle = def.color;
      ctx.fillRect(-s * 0.33, -s * 0.32, s * 0.66, s * 0.5);
      ctx.strokeStyle = "#1c140c"; ctx.lineWidth = 2;
      ctx.strokeRect(-s * 0.33, -s * 0.32, s * 0.66, s * 0.5);
      ctx.fillStyle = "#ffffff";
      ctx.font = s * 0.28 + "px KaiTi, serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(def.short + (b.level > 1 ? b.level : ""), 0, -s * 0.06);
      ctx.restore();
      if (b.level > 1) {
        ctx.fillStyle = "#ffd700";
        ctx.font = s * 0.18 + "px KaiTi, serif";
        ctx.textAlign = "center";
        ctx.fillText("Lv" + b.level, b.x, b.y - s * 0.52);
      }
    }
  }
  function drawSoldiers() {
    const s = getCellSize();
    for (const sld of soldiers) {
      if (sld.dead) continue;
      const def = unitDef(sld.type);
      const dir = (sld.animDir && Math.cos(sld.animDir) < -0.2) ? -1 : 1;
      stickFigure(sld.x, sld.y, s, def, weaponFor(sld.type), { hero: !!def.hero, dir: dir });
      if (sld.level > 1) {
        ctx.fillStyle = "#ffd700";
        ctx.font = s * 0.16 + "px KaiTi, serif";
        ctx.textAlign = "center";
        ctx.fillText("Lv" + sld.level, sld.x, sld.y - s * 0.52);
      }
      if (sld.hp < sld.maxHp) {
        drawHpBar(sld.x - s * 0.3, sld.y - s * 0.62, s * 0.6, 4,
          Math.max(0, sld.hp / sld.maxHp), def.hero ? "#ffd700" : "#4caf50");
      }
    }
  }
  function drawEnemies() {
    const s = getCellSize();
    for (const e of enemies) {
      if (e.dead) continue;
      // 朝向：按敌军行进方向（下一个路线点）
      let edir = 1;
      if (e.at + 1 < CONFIG.path.length) {
        const nx = cellCenter(CONFIG.path[e.at + 1].c, CONFIG.path[e.at + 1].r).x;
        edir = nx >= e.x ? 1 : -1;
      }
      stickFigure(e.x, e.y, s, null, e.isBoss ? "greatsword" : "sword", { enemy: true, boss: !!e.isBoss, dir: edir });
      if (e.isBoss) {
        ctx.fillStyle = "#fff";
        ctx.font = s * 0.2 + "px KaiTi, serif";
        ctx.textAlign = "center";
        ctx.fillText("将", e.x, e.y - s * 0.8);
      }
      if (e.hp < e.maxHp) {
        const w = e.isBoss ? s * 0.9 : s * 0.56;
        drawHpBar(e.x - w / 2, e.y - s * (e.isBoss ? 0.85 : 0.62), w, 4,
          Math.max(0, e.hp / e.maxHp), "#e74c3c");
      }
      if (e.dotTime > 0 || e.slowTime > 0) {
        ctx.fillStyle = "rgba(255,140,0,0.95)";
        ctx.font = s * 0.18 + "px KaiTi, serif";
        ctx.fillText(e.slowTime > 0 ? "冻" : "烧", e.x + s * 0.3, e.y - s * 0.6);
      }
    }
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
      ctx.globalAlpha = Math.max(0, Math.min(1, x.life / 0.4));
      ctx.strokeStyle = "#ff9800";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x.x, x.y, x.radius * (1 - x.life / 0.4 + 0.2), 0, Math.PI * 2);
      ctx.stroke();
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
      ctx.fillStyle = b.color;
      ctx.fillRect(-s * 0.16, -s * 0.045, s * 0.32, s * 0.09);
      ctx.restore();
    }
  }
  function drawFxSlashes() {
    const s = getCellSize();
    for (const f of fxSlashes) {
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.dir);
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life / 0.2));
      ctx.strokeStyle = f.color;
      ctx.lineWidth = s * 0.08;
      ctx.beginPath();
      ctx.arc(s * 0.15, 0, s * 0.55, -0.8, 0.8);
      ctx.stroke();
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
  function drawGateHpBar() {
    const s = getCellSize();
    const end = CONFIG.path[CONFIG.path.length - 1];
    const ec = cellCenter(end.c, end.r);
    const w = s * 0.9, h = Math.max(6, s * 0.12);
    const x = ec.x - w / 2, y = ec.y - s * 0.78;
    const ratio = Math.max(0, Math.min(1, gateHp / CONFIG.gateHp));
    drawHpBar(x, y, w, h, ratio, ratio > 0.5 ? "#4caf50" : ratio > 0.25 ? "#f1c40f" : "#e74c3c");
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
    drawTracers();
    drawExplosions();
    drawBullets();
    drawFxSlashes();
    drawFxFloats();
    drawGateHpBar();
    drawDragPreview();

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
      ctx.fillText("点击「再战一局」重新开始", canvas.width / 2, canvas.height / 2 + 30);
    }
    if (shakeTime > 0) ctx.restore();
  }

  // ---------- 主循环 ----------
  let lastTime = 0;
  function loop(now) {
    let dt = (now - lastTime) / 1000;
    if (dt > 0.05) dt = 0.05;
    lastTime = now;
    if (!paused) update(dt * speed);
    draw();
    requestAnimationFrame(loop);
  }

  // ---------- 开始 / 重开 ----------
  function startGame() {
    enemies = [];
    buildings = [];
    soldiers = [];
    tracers = [];
    explosions = [];
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
    renderInventory();
    renderShop();
    updateHud();
  }

  btnStart.addEventListener("click", function () {
    if (window.SFX) SFX.play("click");
    if (phase === "ready") beginWave(1);
    else if (phase === "between") beginWave(waveIndex + 1);
    else if (phase === "over" || phase === "win") { startGame(); beginWave(1); }
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
    if (phase === "over" || phase === "win") { setHint("游戏已结束，先点「再战一局」"); return; }
    if (grain < CONFIG.shop.refreshCost) { setHint("粮草不足，刷不起商店（10 粮草/次）"); return; }
    grain -= CONFIG.shop.refreshCost;
    refreshShop();
    updateHud();
    setHint("商店已刷新");
  });
  btnLock.addEventListener("click", function () {
    shopLocked = !shopLocked;
    updateHud();
    setHint(shopLocked ? "商店已锁定：下一波不会自动刷新" : "商店已解锁：下一波开始时自动刷新");
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
    if (u) { startDragFromField(u); e.preventDefault(); }
  });
  window.addEventListener("mouseup", function (e) {
    if (drag) performDrop(e.clientX, e.clientY);
  });
  window.addEventListener("keydown", function (e) {
    if (e.key === "Escape") clearDrag();
  });
  canvas.addEventListener("contextmenu", function (e) {
    e.preventDefault();
    clearDrag();
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
  if (query.has("autostart") || simulateSec > 0) { startGame(); beginWave(1); }

  // 自动化测试阵容：多种塔 + 士兵 + 武将
  if (query.has("autodef")) {
    addUnitToField("tower.archer", 1, 1, 3);
    addUnitToField("farmer.farmer", 1, 2, 3);
    addUnitToField("tower.catapult", 1, 3, 3);
    addUnitToField("tower.fire", 1, 1, 2);
    addUnitToField("soldier.shield", 1, 4, 4);
    addUnitToField("soldier.spear", 1, 4, 2);
    addUnitToField("soldier.archer", 1, 7, 1);
    addUnitToField("hero.guan", 1, 5, 1);
  }

  drawMap(ctx);
  updateHud();
  applyFitZoom();
  setTimeout(applyFitZoom, 80);

  if (simulateSec > 0) {
    const dt = 1 / 60;
    for (let t = 0; t < simulateSec; t += dt) {
      update(dt);
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


