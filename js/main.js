// 三国守城 - M0 项目骨架
// 目标：先把页面跑起来。M1 开始才会用游戏循环往画布里画地图和敌军。
(function () {
  "use strict";

  // 1. 拿到画布和画笔
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  // 2. 画布尺寸（M1 的地图网格会基于它计算）
  const W = canvas.width;   // 960
  const H = canvas.height;  // 540

  // 3. 铺一层“草地”底色，证明画布能正常工作（以后会被地图替换）
  ctx.fillStyle = "#3a6b35";
  ctx.fillRect(0, 0, W, H);

  // 4. 画布中央写一行提示字（以后会被游戏内容替换）
  ctx.fillStyle = "#ffe9b0";
  ctx.font = "28px KaiTi, STKaiti, serif";
  ctx.textAlign = "center";
  ctx.fillText("M0：画布就绪，等待守城…", W / 2, H / 2);

  // 说明：M0 阶段还不需要 requestAnimationFrame；M1 再引入游戏循环。
})();
