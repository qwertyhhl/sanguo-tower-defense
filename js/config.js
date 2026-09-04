// config.js —— 所有可调数值都放这里（M3 版）
// 改这里的数字 = 改难度/表现，不用动其他代码。

const CONFIG = {
  // 地图网格：16 列 × 9 行
  gridCols: 16,
  gridRows: 9,

  // 敌军行军路线（格子坐标：列 c，行 r；相邻格子首尾相连）
  // 起点在左侧 (0,4)，蛇形走到右侧城门 (15,4)
  path: [
    { c: 0, r: 4 }, { c: 1, r: 4 }, { c: 2, r: 4 }, { c: 3, r: 4 }, { c: 4, r: 4 },
    { c: 4, r: 3 }, { c: 4, r: 2 }, { c: 4, r: 1 },
    { c: 5, r: 1 }, { c: 6, r: 1 }, { c: 7, r: 1 }, { c: 8, r: 1 }, { c: 9, r: 1 },
    { c: 9, r: 2 }, { c: 9, r: 3 }, { c: 9, r: 4 }, { c: 9, r: 5 }, { c: 9, r: 6 }, { c: 9, r: 7 },
    { c: 10, r: 7 }, { c: 11, r: 7 }, { c: 12, r: 7 },
    { c: 12, r: 6 }, { c: 12, r: 5 }, { c: 12, r: 4 },
    { c: 13, r: 4 }, { c: 14, r: 4 }, { c: 15, r: 4 }   // 最后一个 = 城门
  ],

  // 城门耐久
  gateHp: 20,

  // 经济 / 背包 / 人口
  startGrain: 100,      // 初始粮草（设计默认）
  inventorySize: 5,     // 背包格数
  popCap: 20,           // 场上人口上限（塔+农民+士兵+武将）
  maxLevel: 3,          // 合成等级上限（1+1=2，2+2=3）
  levelGrowth: 1.8,     // 每升 1 级，攻击/血量 ×1.8（示例，可调）

  // 商店
  shop: {
    size: 3,            // 每次随机上架几件
    refreshCost: 10,    // 刷新花费
    pool: [             // 商品池（type + 权重）
      { type: "soldier.shield", weight: 3 },
      { type: "soldier.archer", weight: 2 },
      { type: "tower.archer", weight: 2 },
      { type: "farmer.farmer", weight: 2 }
    ]
  },

  // 波次
  waves: {
    total: 10,
    prepTime: 8,        // 两波之间的准备时间（秒）
    baseCount: 4,       // 第 1 波敌人数量基数
    countPerWave: 2,    // 每波增加的数量
    hpGrowth: 0.25,     // 每波血量成长系数
    bonusBase: 20,      // 每波守住的保底奖励
    bonusPerWave: 5     // 每波额外奖励
  },

  // 敌军步兵（M3 先只用一种敌人，数量/血量随波次成长）
  enemy: {
    hp: 30,
    speed: 2.2,
    damage: 8,
    attackInterval: 1.0,
    bounty: 4,
    spawnInterval: 1.2,
    color: "#c0392b"
  },

  // 防御设施（塔）：放在非路径格
  towers: {
    archer: {
      name: "连弩台", short: "弩", kind: "tower",
      cost: 50, damage: 10, range: 2.5, cooldown: 0.6,
      color: "#2980b9"
    }
  },

  // 农民：放在非路径格，自动产粮草
  farmers: {
    farmer: {
      name: "农民", short: "农", kind: "farmer",
      cost: 40,
      produce: [5, 10, 20], // 1/2/3 级每 5 秒产粮
      produceInterval: 5,
      color: "#d4a017"
    }
  },

  // 部队（士兵/武将）：放在路径格，与敌人正面对抗
  soldiers: {
    shield: {
      name: "盾兵", short: "盾", kind: "soldier",
      cost: 40, hp: 200, damage: 12, attackInterval: 1.0,
      range: 0, ranged: false,
      color: "#7f8c8d"
    },
    archer: {
      name: "弓兵", short: "弓", kind: "soldier",
      cost: 60, hp: 60, damage: 14, attackInterval: 0.8,
      range: 3, ranged: true,
      color: "#229954"
    }
  }
};
