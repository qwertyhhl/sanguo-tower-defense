// main.js —— M3：商店 + 背包 + 合成 + 农民 + 10 波完整流程（可玩 MVP）
// 玩法：商店买单位 → 进 5 格背包 → 拖到场上（塔/农民放草地，士兵放路上）
//       同类型同等级单位拖一起 = 合成升级（上限 3 级）→ 守住 10 波胜利
(function () {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  // ---------- 游戏状态 ----------
  let phase = "ready";      // ready 准备 / between 备战 / battle 进攻中 / over 城破 / win 胜利
  let gateHp = CONFIG.gateHp;
  let grain = CONFIG.startGrain;
  let waveIndex = 0;        // 当前波数（0 = 还没开始）
  let waveToSpawn = 0;      // 这一波还剩几个没出生
  let waveSpawnTimer = 0;   // 波内出生倒计时
  let waveHpMul = 1;        // 本波敌军血量倍率
  let prepTimer = 0;        // 备战倒计时
  let enemies = [];
  let buildings = [];       // 非路径格建筑：塔 / 农民
  let soldiers = [];        // 路径格部队
  let tracers = [];
  let inventory = new Array(CONFIG.inventorySize).fill(null);
  let uidCounter = 1;

  // 拖拽状态：从背包或场上拿起一个单位
  let drag = null;          // { type, level, from:'inv'|'field', slot?, uid? }
  const mouse = { x: 0, y: 0, inside: false };
  let hintTimer = null;

  // ---------- DOM ----------
  const hudWave = document.getElementById("hud-wave");
  const hudGrain = document.getElementById("hud-grain");
  const hudPop = document.getElementById("hud-pop");
  const hudPhase = document.getElementById("hud-phase");
  const btnStart = document.getElementById("btn-start");
  const shopItems = document.getElementById("shop-items");
  const btnRefresh = document.getElementById("btn-refresh");
  const inventoryBar = document.getElementById("inventory-bar");
  const hintEl = document.getElementById("deploy-hint");

  // ---------- 基础工具 ----------
  function unitDef(type) {
    if (type.indexOf("tower.") === 0) return CONFIG.towers[type.slice(6)];
    if (type.indexOf("farmer.") === 0) return CONFIG.farmers[type.slice(7)];
    if (type.indexOf("soldier.") === 0) return CONFIG.soldiers[type.slice(8)];
    return null;
  }
  function statMul(level) { return Math.pow(CONFIG.levelGrowth, level - 1); }
  function fieldCount() { return buildings.length + soldiers.length; }
  function freeSlot() { for (let i = 0; i < inventory.length; i++) if (!inventory[i]) return i; return -1; }
  function activePhase() { return phase === "battle" || phase === "between"; }

  function setHint(text) {
    hintEl.textContent = text;
    if (hintTimer) clearTimeout(hintTimer);
    hintTimer = setTimeout(function () {
      hintEl.textContent = "商店买单位 → 拖到地图部署；同类型同等级拖一起可合成升级";
    }, 2600);
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
  }

  // ---------- 地图格子工具 ----------
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

  // 校验能否放置：addsPop=true 表示会占用新人口
  function validatePlace(type, level, col, row, fromField) {
    const def = unitDef(type);
    if (!def) return { ok: false, msg: "未知单位" };
    if (col === CONFIG.path[CONFIG.path.length - 1].c && row === CONFIG.path[CONFIG.path.length - 1].r) {
      return { ok: false, msg: "城门口不能放单位" };
    }
    if (def.kind === "soldier") {
      if (!isPathCell(col, row)) return { ok: false, msg: "士兵要放在路上" };
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
        uid: uid, type: type, level: level, col: col, row: row,
        x: center.x, y: center.y,
        hp: def.hp * statMul(level), maxHp: def.hp * statMul(level),
        cd: 0, dead: false
      });
    } else {
      buildings.push({
        uid: uid, type: type, level: level, col: col, row: row,
        x: center.x, y: center.y, cd: 0,
        timer: def.produceInterval // 农民生产计时（塔忽略）
      });
    }
  }
  function removeFieldUid(uid) {
    for (let i = buildings.length - 1; i >= 0; i--) if (buildings[i].uid === uid) { buildings.splice(i, 1); return; }
    for (let i = soldiers.length - 1; i >= 0; i--) if (soldiers[i].uid === uid) { soldiers.splice(i, 1); return; }
  }

  // 在格子上找同类型同等级的单位（用于合成）
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
  // 抓取时：格子上任意一个部队/建筑
  function grabUnitAt(col, row) {
    for (const s of soldiers) if (!s.dead && s.col === col && s.row === row) return s;
    return buildingAt(col, row);
  }

  // ---------- 商店 ----------
  let shopStock = []; // [{type}...]

  function pickRandomType() {
    const total = CONFIG.shop.pool.reduce(function (sum, p) { return sum + p.weight; }, 0);
    let r = Math.random() * total;
    for (const p of CONFIG.shop.pool) {
      r -= p.weight;
      if (r <= 0) return p.type;
    }
    return CONFIG.shop.pool[0].type;
  }
  function refreshShop() {
    shopStock = [];
    const chosen = [];
    for (let i = 0; i < CONFIG.shop.size; i++) {
      let t = pickRandomType();
      while (chosen.indexOf(t) >= 0) t = pickRandomType(); // 尽量不重复
      chosen.push(t);
      shopStock.push({ type: t });
    }
    renderShop();
  }
  function renderShop() {
    shopItems.innerHTML = "";
    for (const item of shopStock) {
      const def = unitDef(item.type);
      const div = document.createElement("div");
      div.className = "shop-card";
      const btn = document.createElement("button");
      btn.textContent = "购买 " + def.cost + " 粮草";
      btn.disabled = grain < def.cost || freeSlot() < 0;
      btn.addEventListener("click", function () { buyFromShop(item.type); });
      div.innerHTML = def.name + "（1 级）";
      div.appendChild(btn);
      shopItems.appendChild(div);
    }
    btnRefresh.disabled = grain < CONFIG.shop.refreshCost;
  }
  function buyFromShop(type) {
    const def = unitDef(type);
    if (grain < def.cost) { setHint("粮草不足"); return; }
    const idx = freeSlot();
    if (idx < 0) { setHint("背包已满（5 格），先部署或合成腾位置"); return; }
    grain -= def.cost;
    inventory[idx] = { type: type, level: 1 };
    setHint("已购入 " + def.name + " → 放入背包第 " + (idx + 1) + " 格");
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
          if (!activePhase()) {
            setHint(phase === "ready" ? "先点「开始守城」再部署" : "游戏已结束，先点「再战一局」");
            return;
          }
          startDragFromInv(i);
        });
      } else {
        div.innerHTML = "<span class='empty'>空</span>";
      }
      inventoryBar.appendChild(div);
    }
  }

  // ---------- 拖拽 ----------
  function startDragFromInv(slot) {
    const u = inventory[slot];
    if (!u) return;
    drag = { type: u.type, level: u.level, from: "inv", slot: slot };
  }
  function startDragFromField(unit) {
    drag = { type: unit.type, level: unit.level, from: "field", uid: unit.uid };
  }
  function clearDrag() { drag = null; }

  function removeDragSource() {
    if (!drag) return;
    if (drag.from === "inv") {
      inventory[drag.slot] = null;
      renderInventory();
    } else {
      removeFieldUid(drag.uid);
    }
  }

  // 松开鼠标：决定“放到哪 / 合成 / 取消”
  function performDrop(clientX, clientY) {
    if (!drag) return;
    const d = drag;

    // 1) 松在背包格子上？
    const el = document.elementFromPoint(clientX, clientY);
    const slotEl = el && el.closest ? el.closest(".slot") : null;
    if (slotEl) {
      const idx = parseInt(slotEl.dataset.index, 10);
      const tgt = inventory[idx];
      if (d.from === "inv" && d.slot === idx) { clearDrag(); return; } // 放回原格

      if (tgt && tgt.type === d.type && tgt.level === d.level) {
        if (d.level >= CONFIG.maxLevel) { setHint("已满级，不能再合成"); clearDrag(); return; }
        removeDragSource();
        inventory[idx] = { type: d.type, level: d.level + 1 };
        setHint("合成成功！" + unitDef(d.type).name + " → Lv" + (d.level + 1));
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

    // 2) 松在画布格子上？
    const rect = canvas.getBoundingClientRect();
    const cell = cellFromPoint(clientX - rect.left, clientY - rect.top);
    if (cell) {
      const tgt = findMergeTarget(d.type, d.level, cell.c, cell.r);
      if (tgt) {
        if (d.level >= CONFIG.maxLevel) { setHint("已满级，不能再合成"); clearDrag(); return; }
        if (d.from === "field" && d.uid === tgt.uid) { clearDrag(); return; } // 原地放下
        removeDragSource();
        removeFieldUid(tgt.uid);
        addUnitToField(d.type, d.level + 1, cell.c, cell.r);
        setHint("合成成功！" + unitDef(d.type).name + " → Lv" + (d.level + 1));
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

    // 3) 其它地方：取消
    clearDrag();
  }

  // ---------- 敌军与波次 ----------
  function spawnEnemy() {
    const first = CONFIG.path[0];
    const pos = cellCenter(first.c, first.r);
    enemies.push({
      at: 0, x: pos.x, y: pos.y,
      hp: CONFIG.enemy.hp * waveHpMul, maxHp: CONFIG.enemy.hp * waveHpMul,
      fighting: false, attackCd: 0, dead: false
    });
  }
  function arriveGate(e) {
    gateHp -= 1;
    if (gateHp <= 0) {
      gateHp = 0;
      phase = "over";
      updateHud();
    }
  }
  function damageEnemy(e, dmg) {
    e.hp -= dmg;
    if (e.hp <= 0 && !e.dead) {
      e.dead = true;
      grain += CONFIG.enemy.bounty;
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

  function waveCount(n) { return CONFIG.waves.baseCount + (n - 1) * CONFIG.waves.countPerWave; }

  function beginWave(n) {
    waveIndex = n;
    phase = "battle";
    waveToSpawn = waveCount(n);
    waveSpawnTimer = 0.3;
    waveHpMul = 1 + CONFIG.waves.hpGrowth * (n - 1);
    updateHud();
  }

  function onWaveCleared() {
    const bonus = CONFIG.waves.bonusBase + waveIndex * CONFIG.waves.bonusPerWave;
    grain += bonus;
    setHint("第 " + waveIndex + " 波守住！奖励 " + bonus + " 粮草");
    if (waveIndex >= CONFIG.waves.total) {
      phase = "win";
    } else {
      phase = "between";
      prepTimer = CONFIG.waves.prepTime;
    }
    updateHud();
  }

  // ---------- 每帧更新 ----------
  function update(dt) {
    if (phase === "between") {
      prepTimer -= dt;
      if (prepTimer <= 0) beginWave(waveIndex + 1);
      updateHud();
      return;
    }
    if (phase !== "battle") return;

    // 出生本波敌军
    if (waveToSpawn > 0) {
      waveSpawnTimer -= dt;
      if (waveSpawnTimer <= 0) {
        spawnEnemy();
        waveToSpawn--;
        waveSpawnTimer = CONFIG.enemy.spawnInterval;
      }
    }

    updateBuildings(dt);
    updateSoldiers(dt);
    updateEnemies(dt);
    updateTracers(dt);

    enemies = enemies.filter(function (e) { return !e.dead; });
    soldiers = soldiers.filter(function (s) { return !s.dead; });
    tracers = tracers.filter(function (t) { return t.life > 0; });

    // 本波结束判定：全出生完 + 场上没有敌人（死的/进城的都算清完）
    if (waveToSpawn <= 0 && enemies.length === 0 && phase === "battle") {
      onWaveCleared();
    }
    updateHud();
  }

  function updateBuildings(dt) {
    for (const b of buildings) {
      const def = unitDef(b.type);
      if (def.kind === "farmer") {
        // 农民产粮
        b.timer -= dt;
        if (b.timer <= 0) {
          grain += def.produce[b.level - 1];
          b.timer = def.produceInterval;
        }
        continue;
      }
      // 塔自动攻击
      b.cd -= dt;
      if (b.cd > 0) continue;
      const target = nearestEnemy(b.x, b.y, def.range);
      if (!target) continue;
      damageEnemy(target, def.damage * statMul(b.level));
      b.cd = def.cooldown;
      tracers.push({ x1: b.x, y1: b.y, x2: target.x, y2: target.y, life: 0.12 });
    }
  }

  function updateSoldiers(dt) {
    for (const s of soldiers) {
      if (s.dead) continue;
      s.cd -= dt;
      if (s.cd > 0) continue;
      const def = unitDef(s.type);
      const dmg = def.damage * statMul(s.level);
      let target = null;
      if (def.ranged) {
        target = nearestEnemy(s.x, s.y, def.range);
      } else {
        for (const e of enemies) {
          if (e.dead || !e.fighting) continue;
          const cell = CONFIG.path[e.at];
          if (cell.c === s.col && cell.r === s.row) { target = e; break; }
        }
      }
      if (target) {
        damageEnemy(target, dmg);
        s.cd = def.attackInterval;
        tracers.push({ x1: s.x, y1: s.y, x2: target.x, y2: target.y, life: 0.12 });
      }
    }
  }

  function updateEnemies(dt) {
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (e.dead) continue;

      if (e.fighting) {
        e.attackCd -= dt;
        const defs = soldiersOnCell(CONFIG.path[e.at]);
        if (defs.length === 0) {
          e.fighting = false;
        } else if (e.attackCd <= 0) {
          defs[0].hp -= CONFIG.enemy.damage;
          if (defs[0].hp <= 0) defs[0].dead = true;
          e.attackCd = CONFIG.enemy.attackInterval;
        }
        continue;
      }

      const here = soldiersOnCell(CONFIG.path[e.at]);
      if (here.length > 0) { e.fighting = true; continue; }

      if (e.at >= CONFIG.path.length - 1) {
        arriveGate(e);
        enemies.splice(i, 1);
        continue;
      }

      const next = CONFIG.path[e.at + 1];
      const dest = cellCenter(next.c, next.r);
      const dx = dest.x - e.x, dy = dest.y - e.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const step = CONFIG.enemy.speed * getCellSize() * dt;
      if (dist <= step) {
        e.at += 1;
        e.x = dest.x; e.y = dest.y;
        if (e.at >= CONFIG.path.length - 1) {
          arriveGate(e);
          enemies.splice(i, 1);
          continue;
        }
        if (soldiersOnCell(CONFIG.path[e.at]).length > 0) e.fighting = true;
      } else {
        e.x += (dx / dist) * step;
        e.y += (dy / dist) * step;
      }
    }
  }

  function updateTracers(dt) { for (const t of tracers) t.life -= dt; }

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
      ctx.fillStyle = def.color;
      if (def.kind === "farmer") {
        ctx.beginPath();
        ctx.arc(b.x, b.y, s * 0.3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(b.x - s * 0.33, b.y - s * 0.33, s * 0.66, s * 0.66);
      }
      ctx.fillStyle = "#ffffff";
      ctx.font = s * 0.26 + "px KaiTi, serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(def.short + (b.level > 1 ? b.level : ""), b.x, b.y);
    }
  }

  function drawSoldiers() {
    const s = getCellSize();
    for (const sld of soldiers) {
      if (sld.dead) continue;
      const def = unitDef(sld.type);
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.arc(sld.x, sld.y, s * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = s * 0.26 + "px KaiTi, serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(def.short + (sld.level > 1 ? sld.level : ""), sld.x, sld.y);
      if (sld.hp < sld.maxHp) {
        drawHpBar(sld.x - s * 0.3, sld.y - s * 0.48, s * 0.6, 5,
          Math.max(0, sld.hp / sld.maxHp), "#4caf50");
      }
    }
  }

  function drawEnemies() {
    const s = getCellSize();
    ctx.fillStyle = CONFIG.enemy.color;
    for (const e of enemies) {
      if (e.dead) continue;
      ctx.beginPath();
      ctx.arc(e.x, e.y, s * 0.26, 0, Math.PI * 2);
      ctx.fill();
      if (e.hp < e.maxHp) {
        drawHpBar(e.x - s * 0.28, e.y - s * 0.45, s * 0.56, 5,
          Math.max(0, e.hp / e.maxHp), "#e74c3c");
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

  function drawGateHpBar() {
    const s = getCellSize();
    const end = CONFIG.path[CONFIG.path.length - 1];
    const ec = cellCenter(end.c, end.r);
    const w = s * 0.9, h = Math.max(6, s * 0.12);
    const x = ec.x - w / 2, y = ec.y - s * 0.78;
    const ratio = Math.max(0, Math.min(1, gateHp / CONFIG.gateHp));
    drawHpBar(x, y, w, h, ratio, ratio > 0.5 ? "#4caf50" : ratio > 0.25 ? "#f1c40f" : "#e74c3c");
  }

  // 拖拽预览：目标格高亮 + 半透明影子
  function drawDragPreview() {
    if (!drag || !mouse.inside) return;
    const cell = cellFromPoint(mouse.x, mouse.y);
    if (!cell) return;
    const s = getCellSize();
    const fromField = drag.from === "field";
    // 能合成吗？
    const canMerge = findMergeTarget(drag.type, drag.level, cell.c, cell.r);
    const v = canMerge ? { ok: true } : validatePlace(drag.type, drag.level, cell.c, cell.r, fromField);
    ctx.fillStyle = canMerge
      ? "rgba(241,196,15,0.55)"            // 金色 = 可合成
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
      ctx.beginPath();
      ctx.arc(cx, cy, def.range * s, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function draw() {
    drawMap(ctx);
    drawBuildings();
    drawSoldiers();
    drawEnemies();
    drawTracers();
    drawGateHpBar();
    drawDragPreview();

    if (phase === "over" || phase === "win") {
      ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
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
  }

  // ---------- 游戏循环 ----------
  let lastTime = 0;
  function loop(now) {
    let dt = (now - lastTime) / 1000;
    if (dt > 0.05) dt = 0.05;
    lastTime = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // ---------- 开始 / 重开 ----------
  function startGame() {
    enemies = [];
    buildings = [];
    soldiers = [];
    tracers = [];
    inventory = new Array(CONFIG.inventorySize).fill(null);
    gateHp = CONFIG.gateHp;
    grain = CONFIG.startGrain;
    waveIndex = 0;
    phase = "ready";
    drag = null;
    renderInventory();
    renderShop();
    updateHud();
  }

  btnStart.addEventListener("click", function () {
    if (phase === "ready") beginWave(1);
    else if (phase === "between") beginWave(waveIndex + 1);
    else if (phase === "over" || phase === "win") { startGame(); beginWave(1); }
  });

  btnRefresh.addEventListener("click", function () {
    if (grain < CONFIG.shop.refreshCost) { setHint("粮草不足，刷不起商店"); return; }
    grain -= CONFIG.shop.refreshCost;
    refreshShop();
    updateHud();
    setHint("商店已刷新");
  });

  // ---------- 鼠标交互 ----------
  function canvasPointFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  window.addEventListener("mousemove", function (e) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
    mouse.inside = mouse.x >= 0 && mouse.y >= 0 && mouse.x <= rect.width && mouse.y <= rect.height;
  });

  // 从场上“拿起”单位
  canvas.addEventListener("mousedown", function (e) {
    if (!activePhase() || drag) return;
    const pt = canvasPointFromEvent(e);
    const cell = cellFromPoint(pt.x, pt.y);
    if (!cell) return;
    const u = grabUnitAt(cell.c, cell.r);
    if (u) {
      startDragFromField(u);
      e.preventDefault();
    }
  });

  window.addEventListener("mouseup", function (e) {
    if (drag) performDrop(e.clientX, e.clientY);
  });

  window.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { drag = null; }
  });
  canvas.addEventListener("contextmenu", function (e) {
    e.preventDefault();
    drag = null;
  });

  // ---------- 启动 ----------
  const query = new URLSearchParams(window.location.search);
  const simulateSec = parseFloat(query.get("simulate") || "0");

  renderInventory();
  refreshShop();

  if (query.has("autostart") || simulateSec > 0) { startGame(); beginWave(1); }

  // 自动化测试：直接摆标准防守（跳过商店/背包）
  if (query.has("autodef")) {
    addUnitToField("tower.archer", 1, 1, 3);
    addUnitToField("farmer.farmer", 1, 2, 3);
    addUnitToField("soldier.shield", 1, 4, 4);
    addUnitToField("soldier.archer", 1, 7, 1);
  }

  drawMap(ctx);
  updateHud();

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
