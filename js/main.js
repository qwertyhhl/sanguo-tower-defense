// main.js —— M2：部署单位 + 战斗核心
// 功能：从底部部署栏把 塔/士兵 拖到地图上；塔远程攻击、士兵挡路对战；
//       消灭敌军掉落粮草；敌军抵达城门扣耐久。
(function () {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  // ---------- 游戏数据 ----------
  let phase = "ready";   // ready 准备中 / playing 战斗中 / over 城破
  let gateHp = CONFIG.gateHp;
  let grain = CONFIG.startGrain;
  let enemies = [];      // 场上敌军
  let towers = [];       // 场上防御设施（塔）
  let soldiers = [];     // 场上部队（士兵/武将）
  let tracers = [];      // 攻击“弹道”特效（短暂线条）
  let spawnTimer = 0;    // 距下一个敌军出生的倒计时（秒）

  // 鼠标与“选中的单位”（从部署栏拖出/点选后）
  const mouse = { x: 0, y: 0, inside: false };
  let selection = null;  // 例如 "soldier.shield"
  let dragging = false;  // 是否正按住拖动
  let hintTimer = null;

  // ---------- DOM ----------
  const hudPhase = document.getElementById("hud-phase");
  const hudGrain = document.getElementById("hud-grain");
  const btnStart = document.getElementById("btn-start");
  const deployBar = document.getElementById("deploy-bar");
  const hintEl = document.getElementById("deploy-hint");
  const cardEls = {}; // type -> DOM 卡片

  // ---------- 工具 ----------
  function updateHud() {
    hudPhase.textContent = phase === "ready" ? "准备中"
      : phase === "playing" ? "战斗中" : "城破…";
    hudGrain.textContent = grain;
    btnStart.disabled = !(phase === "ready" || phase === "over");

    // 卡片买不起就置灰
    for (const type in cardEls) {
      const def = unitDef(type);
      cardEls[type].classList.toggle("disabled", grain < def.cost);
    }
  }

  function setHint(text) {
    hintEl.textContent = text;
    if (hintTimer) clearTimeout(hintTimer);
    hintTimer = setTimeout(function () {
      hintEl.textContent = "按住下面的单位拖到地图上：塔放草地格，士兵放路上";
    }, 2500);
  }

  // 根据类型字符串拿定义，如 "tower.archer" → CONFIG.towers.archer
  function unitDef(type) {
    if (type.indexOf("tower.") === 0) return CONFIG.towers[type.slice(6)];
    if (type.indexOf("soldier.") === 0) return CONFIG.soldiers[type.slice(8)];
    return null;
  }

  // 屏幕/鼠标坐标 → 格子坐标
  function cellFromPoint(px, py) {
    const s = getCellSize();
    const col = Math.floor(px / s);
    const row = Math.floor(py / s);
    if (col < 0 || row < 0 || col >= CONFIG.gridCols || row >= CONFIG.gridRows) return null;
    return { c: col, r: row };
  }

  // 校验能否把某单位放到某格
  function validatePlace(type, col, row) {
    const def = unitDef(type);
    if (!def) return { ok: false, msg: "未知单位" };
    if (grain < def.cost) return { ok: false, msg: "粮草不足" };

    const last = CONFIG.path[CONFIG.path.length - 1];
    if (type.indexOf("soldier.") === 0) {
      if (!isPathCell(col, row)) return { ok: false, msg: "士兵要放在路上" };
      if (col === last.c && row === last.r) return { ok: false, msg: "城门口不能站人" };
      return { ok: true };
    }
    // 塔
    if (isPathCell(col, row)) return { ok: false, msg: "塔要放在草地格" };
    if (towers.some(function (t) { return t.col === col && t.row === row; })) {
      return { ok: false, msg: "这里已经有建筑了" };
    }
    return { ok: true };
  }

  // 真正放置一个单位并扣粮草
  function placeUnit(type, col, row) {
    const def = unitDef(type);
    const center = cellCenter(col, row);
    grain -= def.cost;

    if (type.indexOf("tower.") === 0) {
      towers.push({
        type: type, col: col, row: row,
        x: center.x, y: center.y,
        cd: 0
      });
    } else {
      soldiers.push({
        type: type, col: col, row: row,
        x: center.x, y: center.y,
        hp: def.hp, maxHp: def.hp,
        cd: 0
      });
    }
    setHint("已部署 " + def.name);
    selection = null;
    updateHud();
  }

  // 尝试在鼠标所在格放置当前选中的单位
  function tryPlaceAtMouse() {
    if (!selection || !mouse.inside || phase !== "playing") return;
    const cell = cellFromPoint(mouse.x, mouse.y);
    if (!cell) return;
    const v = validatePlace(selection, cell.c, cell.r);
    if (v.ok) {
      placeUnit(selection, cell.c, cell.r);
    } else {
      setHint(v.msg);
    }
  }

  // ---------- 生成部署栏卡片 ----------
  function buildCards() {
    function addCard(type) {
      const def = unitDef(type);
      const div = document.createElement("div");
      div.className = "card " + (type.indexOf("tower.") === 0 ? "tower" : "soldier");
      div.innerHTML = def.name + "<br><small>" + def.cost + " 粮草</small>";
      div.dataset.type = type;
      div.addEventListener("mousedown", function (e) {
        e.preventDefault();
        if (phase !== "playing") {
          setHint(phase === "over" ? "城破了，先点「再战一局」" : "先点「开始守城」再部署单位");
          return;
        }
        if (grain < def.cost) { setHint("粮草不足，买不起 " + def.name); return; }
        selection = type;
        dragging = true;
        updateHud();
      });
      deployBar.appendChild(div);
      cardEls[type] = div;
    }
    for (const key in CONFIG.towers) addCard("tower." + key);
    for (const key in CONFIG.soldiers) addCard("soldier." + key);
  }

  // ---------- 敌军 ----------
  function spawnEnemy() {
    const first = CONFIG.path[0];
    const pos = cellCenter(first.c, first.r);
    enemies.push({
      at: 0,                 // 当前所在/正走出的路线点下标
      x: pos.x, y: pos.y,
      hp: CONFIG.enemy.hp, maxHp: CONFIG.enemy.hp,
      fighting: false,       // 是否正被士兵挡住交战
      attackCd: 0,
      dead: false
    });
  }

  function arriveGate(e) {
    gateHp -= 1;
    if (gateHp <= 0) {
      gateHp = 0;
      phase = "over";
      btnStart.textContent = "再战一局";
      updateHud();
    }
  }

  function damageEnemy(e, dmg) {
    e.hp -= dmg;
    if (e.hp <= 0 && !e.dead) {
      e.dead = true;
      grain += CONFIG.enemy.bounty; // 消灭敌军得粮草
    }
  }

  // 某格上有哪些没死的士兵
  function soldiersOnCell(cell) {
    const out = [];
    for (const s of soldiers) {
      if (!s.dead && s.col === cell.c && s.row === cell.r) out.push(s);
    }
    return out;
  }

  // 找距离 (x,y) 最近、且在射程内的敌人（射程单位：格）
  function nearestEnemy(x, y, rangeCells) {
    const s = getCellSize();
    const rangePx = rangeCells * s;
    let best = null;
    let bestDist = Infinity;
    for (const e of enemies) {
      if (e.dead) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= rangePx && d < bestDist) {
        bestDist = d;
        best = e;
      }
    }
    return best;
  }

  // ---------- 更新逻辑 ----------
  function update(dt) {
    if (phase !== "playing") return;

    // 1) 定时出生敌军
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnEnemy();
      spawnTimer = CONFIG.enemy.spawnInterval;
    }

    updateTowers(dt);
    updateSoldiers(dt);
    updateEnemies(dt);
    updateTracers(dt);

    // 清掉死掉的单位（遍历删除放最后统一处理更安全）
    enemies = enemies.filter(function (e) { return !e.dead; });
    soldiers = soldiers.filter(function (s) { return !s.dead; });
    tracers = tracers.filter(function (t) { return t.life > 0; });

    updateHud();
  }

  // 塔：自动攻击射程内最近的敌人
  function updateTowers(dt) {
    for (const t of towers) {
      t.cd -= dt;
      if (t.cd > 0) continue;
      const def = CONFIG.towers[t.type.slice(6)];
      const target = nearestEnemy(t.x, t.y, def.range);
      if (!target) continue;
      damageEnemy(target, def.damage);
      t.cd = def.cooldown;
      tracers.push({ x1: t.x, y1: t.y, x2: target.x, y2: target.y, life: 0.12 });
    }
  }

  // 士兵：近战打面前的敌人；弓兵打射程内最近的敌人
  function updateSoldiers(dt) {
    for (const s of soldiers) {
      if (s.dead) continue;
      s.cd -= dt;
      if (s.cd > 0) continue;
      const def = CONFIG.soldiers[s.type.slice(8)];
      let target = null;

      if (def.ranged) {
        target = nearestEnemy(s.x, s.y, def.range);
      } else {
        // 近战：只打正停在本格交战的敌人
        for (const e of enemies) {
          if (e.dead || !e.fighting) continue;
          const cell = CONFIG.path[e.at];
          if (cell.c === s.col && cell.r === s.row) { target = e; break; }
        }
      }

      if (target) {
        damageEnemy(target, def.damage);
        s.cd = def.attackInterval;
        tracers.push({ x1: s.x, y1: s.y, x2: target.x, y2: target.y, life: 0.12 });
      }
    }
  }

  // 敌军：走路 / 被挡停交战 / 到城门
  function updateEnemies(dt) {
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (e.dead) continue;

      if (e.fighting) {
        // 被士兵挡住：互打
        e.attackCd -= dt;
        const defs = soldiersOnCell(CONFIG.path[e.at]);
        if (defs.length === 0) {
          e.fighting = false; // 挡路的士兵都死了，继续走
        } else if (e.attackCd <= 0) {
          defs[0].hp -= CONFIG.enemy.damage;
          if (defs[0].hp <= 0) defs[0].dead = true;
          e.attackCd = CONFIG.enemy.attackInterval;
        }
        continue;
      }

      // 走路中：如果当前格有士兵，停下交战
      const here = soldiersOnCell(CONFIG.path[e.at]);
      if (here.length > 0) {
        e.fighting = true;
        continue;
      }

      // 走到最后一个点 = 抵达城门
      if (e.at >= CONFIG.path.length - 1) {
        arriveGate(e);
        enemies.splice(i, 1);
        continue;
      }

      // 朝下一个路线点移动
      const next = CONFIG.path[e.at + 1];
      const dest = cellCenter(next.c, next.r);
      const dx = dest.x - e.x;
      const dy = dest.y - e.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const step = CONFIG.enemy.speed * getCellSize() * dt;

      if (dist <= step) {
        e.at += 1;
        e.x = dest.x;
        e.y = dest.y;
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

  function updateTracers(dt) {
    for (const t of tracers) t.life -= dt;
  }

  // ---------- 绘制 ----------
  function drawHpBar(x, y, w, h, ratio, color) {
    ctx.fillStyle = "#1c1c1c";
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = color;
    if (ratio > 0) ctx.fillRect(x, y, w * ratio, h);
  }

  function drawTowers() {
    const s = getCellSize();
    for (const t of towers) {
      const def = CONFIG.towers[t.type.slice(6)];
      ctx.fillStyle = def.color;
      ctx.fillRect(t.x - s * 0.33, t.y - s * 0.33, s * 0.66, s * 0.66);
      ctx.fillStyle = "#ffffff";
      ctx.font = s * 0.3 + "px KaiTi, serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(def.short, t.x, t.y);
    }
  }

  function drawSoldiers() {
    const s = getCellSize();
    for (const sld of soldiers) {
      if (sld.dead) continue;
      const def = CONFIG.soldiers[sld.type.slice(8)];
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.arc(sld.x, sld.y, s * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = s * 0.28 + "px KaiTi, serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(def.short, sld.x, sld.y);
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

  // 画“正在放置”的提示：目标格高亮 + 半透明单位影子
  function drawPlacement() {
    if (!selection || !mouse.inside) return;
    const cell = cellFromPoint(mouse.x, mouse.y);
    if (!cell) return;
    const s = getCellSize();
    const v = validatePlace(selection, cell.c, cell.r);

    // 高亮格子
    ctx.fillStyle = v.ok
      ? (selection.indexOf("soldier.") === 0 ? "rgba(52,152,219,0.45)" : "rgba(46,204,113,0.45)")
      : "rgba(231,76,60,0.45)";
    ctx.fillRect(cell.c * s, cell.r * s, s, s);

    // 半透明单位影子
    const def = unitDef(selection);
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = def.color;
    const cx = cell.c * s + s / 2;
    const cy = cell.r * s + s / 2;
    if (selection.indexOf("tower.") === 0) {
      ctx.fillRect(cx - s * 0.33, cy - s * 0.33, s * 0.66, s * 0.66);
      // 显示射程圈
      ctx.beginPath();
      ctx.arc(cx, cy, def.range * s, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // 画城门上方的耐久血条（颜色：绿→黄→红）
  function drawGateHpBar() {
    const s = getCellSize();
    const end = CONFIG.path[CONFIG.path.length - 1];
    const ec = cellCenter(end.c, end.r);
    const w = s * 0.9;
    const h = Math.max(6, s * 0.12);
    const x = ec.x - w / 2;
    const y = ec.y - s * 0.78;
    const ratio = Math.max(0, Math.min(1, gateHp / CONFIG.gateHp));
    drawHpBar(x, y, w, h, ratio, ratio > 0.5 ? "#4caf50" : ratio > 0.25 ? "#f1c40f" : "#e74c3c");
  }

  function draw() {
    drawMap(ctx);
    drawTowers();
    drawSoldiers();
    drawEnemies();
    drawTracers();
    drawGateHpBar();
    drawPlacement();

    // 城破提示
    if (phase === "over") {
      ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#e74c3c";
      ctx.font = "52px KaiTi, serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("城破……", canvas.width / 2, canvas.height / 2 - 20);
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
    if (phase === "playing") update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // ---------- 开始 / 重开 ----------
  function startGame() {
    enemies = [];
    towers = [];
    soldiers = [];
    tracers = [];
    gateHp = CONFIG.gateHp;
    grain = CONFIG.startGrain;
    phase = "playing";
    spawnTimer = 0;
    selection = null;
    btnStart.textContent = "战斗中…";
    updateHud();
  }

  btnStart.addEventListener("click", function () {
    if (phase === "ready" || phase === "over") startGame();
  });

  // ---------- 鼠标交互（拖放部署） ----------
  function canvasPointFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  window.addEventListener("mousemove", function (e) {
    const pt = canvasPointFromEvent(e);
    const rect = canvas.getBoundingClientRect();
    mouse.x = pt.x;
    mouse.y = pt.y;
    mouse.inside = pt.x >= 0 && pt.y >= 0 && pt.x <= rect.width && pt.y <= rect.height;
  });

  window.addEventListener("mouseup", function () {
    dragging = false;
    if (selection && mouse.inside) tryPlaceAtMouse();
  });

  window.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      selection = null;
      dragging = false;
      updateHud();
    }
  });

  canvas.addEventListener("contextmenu", function (e) {
    e.preventDefault();
    selection = null;
    dragging = false;
    updateHud();
  });

  // 选中卡片时高亮
  function refreshCardSelection() {
    for (const type in cardEls) {
      cardEls[type].classList.toggle("selected", type === selection);
    }
  }
  const origUpdateHud = updateHud;
  updateHud = function () {
    origUpdateHud();
    refreshCardSelection();
  };

  // ---------- 启动 ----------
  const query = new URLSearchParams(window.location.search);
  const simulateSec = parseFloat(query.get("simulate") || "0");

  if (query.has("autostart") || simulateSec > 0) startGame();

  // 测试参数：自动摆一组标准防守（塔+盾兵+弓兵），方便自动化验证战斗
  if (query.has("autodef")) {
    placeUnit("tower.archer", 1, 3);
    placeUnit("soldier.shield", 4, 4);
    placeUnit("soldier.archer", 7, 1);
  }

  drawMap(ctx);
  updateHud();

  if (simulateSec > 0) {
    const dt = 1 / 60;
    for (let t = 0; t < simulateSec; t += dt) {
      update(dt);
    }
    draw();
    // 测试“再战一局”：若模拟结束时已城破，重开并重画一帧
    if (phase === "over" && query.has("restartAfterOver")) {
      startGame();
      draw();
    }
  } else {
    requestAnimationFrame(loop);
  }
})();

