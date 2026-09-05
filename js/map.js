// map.js —— 画地图：草地斑驳 + 行军土路 + 起点/城门 + 暗角
// 底图（草斑/路缘/车辙/砖缝/暗角）预渲染到离屏画布缓存，每帧只做一次 drawImage。
// LEVEL_PATHS 由 main.js 在开局/切关时赋值（多路线：所有路径末格 = 城门格）。

let LEVEL_PATHS = []; // 当前关的所有路径

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

// 判断某格是否在任意一条路线上
function isPathCell(col, row) {
  for (const path of LEVEL_PATHS) {
    for (const p of path) {
      if (p.c === col && p.r === row) return true;
    }
  }
  return false;
}

// 确定性伪随机（同一格同一盐值每帧结果一致 → 斑驳纹理不闪烁）
function cellNoise(c, r, k) {
  let h = (c * 374761393 + r * 668265263 + k * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

let _bg = null; // 底图缓存

function buildBackground() {
  const canvas = document.getElementById("gameCanvas");
  const off = document.createElement("canvas");
  off.width = canvas.width;
  off.height = canvas.height;
  const c = off.getContext("2d");
  const s = getCellSize();

  // 1) 草地底色
  c.fillStyle = "#3a6b35";
  c.fillRect(0, 0, off.width, off.height);

  // 2) 草地斑驳：深浅两色小色块，确定性随机铺撒
  for (let col = 0; col < CONFIG.gridCols; col++) {
    for (let row = 0; row < CONFIG.gridRows; row++) {
      if (isPathCell(col, row)) continue;
      for (let k = 0; k < 3; k++) {
        const n1 = cellNoise(col, row, k);
        const n2 = cellNoise(col, row, k + 10);
        const n3 = cellNoise(col, row, k + 20);
        c.fillStyle = n2 > 0.5 ? "rgba(255,255,255,0.045)" : "rgba(0,0,0,0.07)";
        c.fillRect(col * s + n1 * s * 0.8, row * s + n2 * s * 0.8,
          s * (0.12 + n3 * 0.22), s * (0.08 + n1 * 0.14));
      }
    }
  }

  if (LEVEL_PATHS.length > 0) {
    // 3) 行军土路（共享格去重，只画一次）
    const seen = new Set();
    const pathCells = [];
    for (const path of LEVEL_PATHS) {
      for (const p of path) {
        const key = p.c + "," + p.r;
        if (!seen.has(key)) { seen.add(key); pathCells.push(p); }
      }
    }
    for (const p of pathCells) {
      c.fillStyle = "#c9a86a";
      c.fillRect(p.c * s, p.r * s, s, s);
    }
    // 路块石板缝（内缩描边，相邻块间形成暗缝）
    c.strokeStyle = "rgba(90,64,32,0.35)";
    c.lineWidth = 2;
    for (const p of pathCells) {
      c.strokeRect(p.c * s + 1, p.r * s + 1, s - 2, s - 2);
    }
    // 路面碎石（深浅点缀）
    for (const p of pathCells) {
      for (let k = 0; k < 4; k++) {
        const n1 = cellNoise(p.c, p.r, k + 40);
        const n2 = cellNoise(p.c, p.r, k + 50);
        c.fillStyle = k % 2 ? "rgba(255,244,214,0.16)" : "rgba(74,52,26,0.16)";
        c.beginPath();
        c.arc(p.c * s + s * (0.2 + n1 * 0.6), p.r * s + s * (0.2 + n2 * 0.6),
          s * 0.035 + n1 * s * 0.03, 0, Math.PI * 2);
        c.fill();
      }
    }

    // 4) 起点：每个入口一个绿色圆点 + “起”
    c.textAlign = "center";
    c.textBaseline = "middle";
    const startSeen = new Set();
    for (const path of LEVEL_PATHS) {
      const start = path[0];
      const key = start.c + "," + start.r;
      if (startSeen.has(key)) continue;
      startSeen.add(key);
      const sc = cellCenter(start.c, start.r);
      c.fillStyle = "#27ae60";
      c.beginPath();
      c.arc(sc.x, sc.y, s * 0.28, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = "rgba(20,10,0,0.4)";
      c.lineWidth = 2;
      c.stroke();
      c.fillStyle = "#ffffff";
      c.font = s * 0.3 + "px KaiTi, serif";
      c.fillText("起", sc.x, sc.y);
    }

    // 5) 城门：城墙 + 砖缝 + 城楼顶檐 + 门洞 + “城门”字（所有路径共用末格，只画一次）
    const end = LEVEL_PATHS[0][LEVEL_PATHS[0].length - 1];
    const ec = cellCenter(end.c, end.r);
    c.fillStyle = "#7f5539";
    c.fillRect(ec.x - s * 0.35, ec.y - s * 0.3, s * 0.7, s * 0.6);
    c.strokeStyle = "rgba(0,0,0,0.2)";
    c.lineWidth = 1;
    for (let i = 1; i <= 2; i++) {
      const yy = ec.y - s * 0.3 + (s * 0.6 / 3) * i;
      c.beginPath();
      c.moveTo(ec.x - s * 0.35, yy);
      c.lineTo(ec.x + s * 0.35, yy);
      c.stroke();
    }
    c.fillStyle = "#5a3a20";
    c.fillRect(ec.x - s * 0.4, ec.y - s * 0.36, s * 0.8, s * 0.07);
    c.fillStyle = "#e9c46a";
    c.fillRect(ec.x - s * 0.14, ec.y - s * 0.12, s * 0.28, s * 0.42);
    c.fillStyle = "#ffffff";
    c.font = s * 0.22 + "px KaiTi, serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("城门", ec.x, ec.y - s * 0.5);
  }

  // 6) 暗角：四周轻微压暗，聚焦中央战场
  const vg = c.createRadialGradient(off.width / 2, off.height / 2, off.height * 0.45,
    off.width / 2, off.height / 2, off.height * 0.95);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(10,8,4,0.38)");
  c.fillStyle = vg;
  c.fillRect(0, 0, off.width, off.height);

  return off;
}

// 切关时使底图缓存失效
function invalidateMapCache() {
  _bg = null;
}

// 画整张地图（每帧调用：清屏 + 贴缓存底图）
function drawMap(ctx) {
  const canvas = document.getElementById("gameCanvas");
  if (!_bg || _bg.width !== canvas.width || _bg.height !== canvas.height) {
    _bg = buildBackground();
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(_bg, 0, 0);
}
