// sound.js —— 轻量音效（Web Audio 合成，无需素材）
// 首次点击页面时自动初始化；浏览器一般要求用户操作后才允许出声。
(function () {
  "use strict";
  const Sfx = {};
  let ctx = null;

  function ensure() {
    if (!ctx) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) ctx = new AC();
      } catch (e) { ctx = null; }
    }
    if (ctx && ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  // 简单音调
  function tone(freq, dur, type, vol, delay, slideTo) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol || 0.08, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.03);
  }

  // 噪声（爆炸/打击感）
  function noise(dur, vol) {
    if (!ensure()) return;
    const t0 = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 800;
    const g = ctx.createGain();
    g.gain.value = vol || 0.12;
    src.connect(f);
    f.connect(g);
    g.connect(ctx.destination);
    src.start(t0);
  }

  Sfx.init = function () { ensure(); };

  Sfx.play = function (name) {
    if (!ensure()) return;
    switch (name) {
      case "click": tone(700, 0.05, "sine", 0.06); break;
      case "buy": tone(990, 0.07, "sine", 0.07); break;
      case "coin": tone(1200, 0.06, "sine", 0.06); tone(1600, 0.09, "sine", 0.06, 0.07); break;
      case "merge": tone(660, 0.08, "triangle", 0.08); tone(990, 0.12, "triangle", 0.08, 0.09); break;
      case "boom": noise(0.22, 0.16); tone(130, 0.2, "triangle", 0.12, 0, 45); break;
      case "fire": tone(480, 0.35, "sawtooth", 0.05, 0, 160); noise(0.15, 0.06); break;
      case "shoot": tone(880, 0.05, "square", 0.04); break;
      case "alarm": tone(220, 0.16, "square", 0.07); tone(180, 0.22, "square", 0.07, 0.18); break;
      case "win": tone(523, 0.14, "triangle", 0.09); tone(659, 0.14, "triangle", 0.09, 0.14); tone(784, 0.3, "triangle", 0.09, 0.28); break;
      case "lose": tone(330, 0.25, "sawtooth", 0.08, 0, 150); tone(210, 0.4, "sawtooth", 0.08, 0.22, 70); break;
    }
  };

  // 首次用户操作时初始化（满足浏览器自动播放限制）
  window.addEventListener("pointerdown", function once() {
    Sfx.init();
    window.removeEventListener("pointerdown", once);
  });

  window.SFX = Sfx;
})();
