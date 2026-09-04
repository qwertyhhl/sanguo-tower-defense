// main.js —— M1：地图路线 + 敌军移动
// 学习点：游戏循环(requestAnimationFrame)、deltaTime、沿路线点移动
(function () {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  // ---------- 游戏数据 ----------
  let phase = "ready";  // ready 准备中 / playing 战斗中 / over 城破
  let gateHp = CONFIG.gateHp;
  let enemies = [];     // 场上所有敌军
  let spawnTimer = 0;   // 距下一个敌军出生的倒计时（秒）

  // ---------- DOM 引用 ----------
  const hudHp = document.getElementById("hud-gate-hp");
  const hudCount = document.getElementById("hud-enemy-count");
  const hudPhase = document.getElementById("hud-phase");
  const btnStart = document.getElementById("btn-start");

  // 刷新顶部状态栏
  function updateHud() {
    hudHp.textContent = gateHp;
    hudCount.textContent = enemies.length;
    hudPhase.textContent = phase === "ready" ? "准备中"
      : phase === "playing" ? "战斗中" : "城破…";
  }

  // 出生一个敌军：站在路线起点
  function spawnEnemy() {
    const first = CONFIG.path[0];
    const pos = cellCenter(first.c, first.r);
    enemies.push({
      pos: pos,           // 当前像素位置
      waypointIndex: 0    // 正走向第几个路线点（0 = 已在起点）
    });
    updateHud(); // 敌军数量变化后立刻刷新 HUD
  }

  // ---------- 游戏循环 ----------
  let lastTime = 0; // 上一帧的时间

  function loop(now) {
    // deltaTime：这一帧距离上一帧过了多少秒
    let dt = (now - lastTime) / 1000;
    if (dt > 0.05) dt = 0.05; // 从后台切回来时别让敌人“瞬移”
    lastTime = now;

    if (phase === "playing") {
      update(dt);
    }
    draw();
    requestAnimationFrame(loop); // 请求浏览器下一帧再叫我一次
  }

  // 每帧更新：出生敌军 + 让敌军沿路线走
  function update(dt) {
    // 1) 定时出生
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnEnemy();
      spawnTimer = CONFIG.enemy.spawnInterval;
    }

    // 2) 移动：每个敌人走向下一个路线点（倒着遍历，删除时安全）
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      const next = CONFIG.path[e.waypointIndex + 1]; // 下一个要去的格子

      if (!next) {
        // 没有下一个点 = 走到了终点 → 抵达城门，扣耐久
        gateHp -= 1;
        enemies.splice(i, 1);
        if (gateHp <= 0) {
          gateHp = 0;
          phase = "over";
          btnStart.textContent = "再战一局";
          btnStart.disabled = false;
        }
        updateHud();
        continue;
      }

      // 朝下一个格子中心走；本帧能走的像素 = 每秒格数 × 格子边长 × dt
      const dest = cellCenter(next.c, next.r);
      const dx = dest.x - e.pos.x;
      const dy = dest.y - e.pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const step = CONFIG.enemy.speed * getCellSize() * dt;

      if (dist <= step) {
        // 已经到达：站到目标格中心，指向下一个点
        e.pos.x = dest.x;
        e.pos.y = dest.y;
        e.waypointIndex += 1;
      } else {
        // 还没到：朝目标方向走 step 像素
        e.pos.x += (dx / dist) * step;
        e.pos.y += (dy / dist) * step;
      }
    }
  }

  // 每帧绘制
  function draw() {
    drawMap(ctx);

    // 画敌军：红色圆（M2 会换成不同兵种和血条）
    ctx.fillStyle = CONFIG.enemy.color;
    for (const e of enemies) {
      ctx.beginPath();
      ctx.arc(e.pos.x, e.pos.y, getCellSize() * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }

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

  // ---------- 按钮：开始 / 再战 ----------
  function startGame() {
    enemies = [];
    gateHp = CONFIG.gateHp;
    phase = "playing";
    spawnTimer = 0;
    btnStart.textContent = "战斗中…";
    btnStart.disabled = true;
    updateHud();
  }

  btnStart.addEventListener("click", function () {
    if (phase === "ready" || phase === "over") {
      startGame();
    }
  });

  // 调试开关：地址栏加 ?autostart=1 可自动开局（方便自动化测试，正常游玩可忽略）
  if (new URLSearchParams(window.location.search).has("autostart")) {
    startGame();
  }

  // ---------- 启动 ----------
  drawMap(ctx);
  updateHud();
  requestAnimationFrame(loop);
})();


