// config.js —— 所有可调数值（M4 版）
// 改这里 = 改平衡，不动逻辑。

const CONFIG = {
  gridCols: 16,
  gridRows: 9,

  // 行军路线（列c/行r，蛇形）
  path: [
    { c: 0, r: 4 }, { c: 1, r: 4 }, { c: 2, r: 4 }, { c: 3, r: 4 }, { c: 4, r: 4 },
    { c: 4, r: 3 }, { c: 4, r: 2 }, { c: 4, r: 1 },
    { c: 5, r: 1 }, { c: 6, r: 1 }, { c: 7, r: 1 }, { c: 8, r: 1 }, { c: 9, r: 1 },
    { c: 9, r: 2 }, { c: 9, r: 3 }, { c: 9, r: 4 }, { c: 9, r: 5 }, { c: 9, r: 6 }, { c: 9, r: 7 },
    { c: 10, r: 7 }, { c: 11, r: 7 }, { c: 12, r: 7 },
    { c: 12, r: 6 }, { c: 12, r: 5 }, { c: 12, r: 4 },
    { c: 13, r: 4 }, { c: 14, r: 4 }, { c: 15, r: 4 }
  ],

  gateHp: 20,
  startGrain: 100,

  // 难度预设（开局选择）
  difficulties: {
    easy:   { name: "简单", startGrain: 150, gateHp: 25, hpMul: 0.7,  countMul: 0.8 },
    normal: { name: "普通", startGrain: 100, gateHp: 20, hpMul: 1,    countMul: 1 },
    hard:   { name: "困难", startGrain: 80,  gateHp: 15, hpMul: 1.4,  countMul: 1.3 }
  },

  inventorySize: 5,
  popCap: 20,
  maxLevel: 3,
  levelGrowth: 1.8,

  shop: {
    size: 5,
    refreshCost: 10,
    pool: [
      { type: "soldier.shield", weight: 3 },
      { type: "soldier.archer", weight: 2 },
      { type: "soldier.spear", weight: 2 },
      { type: "tower.archer", weight: 2 },
      { type: "tower.catapult", weight: 2 },
      { type: "tower.fire", weight: 2 },
      { type: "farmer.farmer", weight: 2 },
      { type: "hero.guan", weight: 1 },
      { type: "hero.zhaoyun", weight: 1 },
      { type: "hero.huangzhong", weight: 1 },
      { type: "hero.zhangfei", weight: 1 },
      { type: "hero.zhouyu", weight: 1 },
      { type: "hero.zhuge", weight: 1 }
    ]
  },

  waves: {
    total: 10,
    prepTime: 8,
    baseCount: 4,
    countPerWave: 2,
    hpGrowth: 0.25,
    bonusBase: 20,
    bonusPerWave: 5,
    bossEvery: 5
  },

  enemy: {
    hp: 30, speed: 2.2, damage: 8, attackInterval: 1.0,
    bounty: 4, spawnInterval: 1.2, color: "#c0392b"
  },

  // 敌将 Boss（第 5、10 波出现）：范围践踏，克制堆兵
  boss: {
    hp: 1500, speed: 0.9, damage: 25, attackInterval: 1.6,
    bounty: 100, color: "#7d3cff", radiusMul: 0.42
  },

  // ===== 建筑类 =====
  towers: {
    archer: { name: "连弩台", short: "弩", kind: "tower", cost: 50,
      damage: 10, range: 2.5, cooldown: 0.6, color: "#2980b9", splash: 0 },
    catapult: { name: "投石车", short: "石", kind: "tower", cost: 120,
      damage: 25, range: 3, cooldown: 2.0, color: "#8e44ad",
      splash: 1.2, splashFactor: 0.6 },
    fire: { name: "火攻台", short: "火", kind: "tower", cost: 100,
      damage: 6, range: 2.5, cooldown: 1.4, color: "#e67e22",
      splash: 0,
      slowMul: 0.6, slowDur: 3,   // 减速 40%（速度×0.6），持续 3 秒
      dotDmg: 5, dotInterval: 0.5, dotDur: 3 } // 灼烧
  },

  farmers: {
    farmer: { name: "农民", short: "农", kind: "farmer", cost: 40,
      produce: [5, 10, 20], produceInterval: 5, color: "#d4a017" }
  },

  // ===== 部队类 =====
  soldiers: {
    shield: { name: "盾兵", short: "盾", kind: "soldier", cost: 40,
      hp: 200, damage: 12, attackInterval: 1.0,
      range: 0, ranged: false, engage: 1, moveSpeed: 3,
      color: "#7f8c8d" },
    archer: { name: "弓兵", short: "弓", kind: "soldier", cost: 60,
      hp: 60, damage: 14, attackInterval: 0.8,
      range: 3, ranged: true, engage: 0, moveSpeed: 3,
      color: "#229954" },
    spear: { name: "枪兵", short: "枪", kind: "soldier", cost: 55,
      hp: 140, damage: 22, attackInterval: 1.0,
      range: 0, ranged: false, engage: 2, moveSpeed: 3.2,
      color: "#16a085" }
  },

  // ===== 武将（6 位）=====
  heroes: {
    guan: { name: "关羽", short: "关", kind: "soldier", hero: true, cost: 200,
      hp: 700, damage: 40, attackInterval: 1.0,
      range: 0, ranged: false, engage: 5, moveSpeed: 3.5,
      color: "#1e8449",
      skill: { type: "aoe", radius: 2, damage: 150, cooldown: 12 } },
    zhaoyun: { name: "赵云", short: "赵", kind: "soldier", hero: true, cost: 200,
      hp: 500, damage: 22, attackInterval: 0.45,
      range: 0, ranged: false, engage: 6, moveSpeed: 4.2,
      color: "#2471a3",
      skill: { type: "multihit", count: 5, damage: 40, cooldown: 9 } },
    huangzhong: { name: "黄忠", short: "黄", kind: "soldier", hero: true, cost: 200,
      hp: 400, damage: 45, attackInterval: 1.1,
      range: 4, ranged: true, engage: 0, moveSpeed: 3,
      color: "#b7950b",
      skill: { type: "snipe", damage: 300, range: 5, cooldown: 12 } },
    zhangfei: { name: "张飞", short: "张", kind: "soldier", hero: true, cost: 200,
      hp: 1100, damage: 30, attackInterval: 1.2,
      range: 0, ranged: false, engage: 5, moveSpeed: 3.2,
      color: "#943126",
      skill: { type: "roar", radius: 2.5, damage: 80, slowMul: 0.5, slowDur: 3, cooldown: 14 } },
    zhouyu: { name: "周瑜", short: "瑜", kind: "soldier", hero: true, cost: 200,
      hp: 380, damage: 20, attackInterval: 1.2,
      range: 3.5, ranged: true, engage: 0, moveSpeed: 3,
      color: "#ca6f1e",
      skill: { type: "fire", radius: 2.5, damage: 220, slowMul: 0.6, slowDur: 2.5, cooldown: 14 } },
    zhuge: { name: "诸葛亮", short: "亮", kind: "soldier", hero: true, cost: 200,
      hp: 350, damage: 18, attackInterval: 1.3,
      range: 3.5, ranged: true, engage: 0, moveSpeed: 3,
      color: "#1a5276",
      skill: { type: "storm", radius: 5, damage: 100, slowMul: 0.6, slowDur: 2.5, cooldown: 16 } }
  }
};

