// map.js —— 画地图：草地 + 行军路线 + 起点/城门

// 根据画布大小算出每个格子边长（像素）
function getCellSize() {
  const canvas = document.getElementById("gameCanvas");
  return Math.min(canvas.width / CONFIG.gridCols, canvas.height / CONFIG.gridRows);
}

// 格子(列, 行) → 该格中心点的像素坐标
function cellCenter(col, row) {
  const s = getCellSize();
  return { x: col * s + s / 2, y: row * s + s / 2 };
}

// 判断某格是否在路线上（以后放置单位时要用）
function isPathCell(col, row) {
  return CONFIG.path.some(function (p) { return p.c === col && p.r === row; });
}

// 画整张地图
function drawMap(ctx) {
  const canvas = document.getElementById("gameCanvas");
  const s = getCellSize();

  // 1) 关键：每帧先把整块画布清空，再完整铺草地。
  //    这样上一帧的遮罩/文字/血条不会残留，重开后不会出现“鬼影”和线条。
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#3a6b35"; // 草地底色
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 2) 行军路线：整格铺浅色土路（整块画，不留缝）
  ctx.fillStyle = "#c9a86a";
  for (const p of CONFIG.path) {
    ctx.fillRect(p.c * s, p.r * s, s, s);
  }

  // 3) 起点：左侧绿色圆点 + “起”
  const start = CONFIG.path[0];
  const sc = cellCenter(start.c, start.r);
  ctx.fillStyle = "#27ae60";
  ctx.beginPath();
  ctx.arc(sc.x, sc.y, s * 0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = s * 0.3 + "px KaiTi, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("起", sc.x, sc.y);

  // 4) 城门：终点画一座小城楼 + “城门”字
  const end = CONFIG.path[CONFIG.path.length - 1];
  const ec = cellCenter(end.c, end.r);
  ctx.fillStyle = "#7f5539";
  ctx.fillRect(ec.x - s * 0.35, ec.y - s * 0.3, s * 0.7, s * 0.6);
  ctx.fillStyle = "#e9c46a";
  ctx.fillRect(ec.x - s * 0.14, ec.y - s * 0.12, s * 0.28, s * 0.42); // 城门洞
  ctx.fillStyle = "#ffffff";
  ctx.font = s * 0.22 + "px KaiTi, serif";
  ctx.fillText("城门", ec.x, ec.y - s * 0.5);
}
