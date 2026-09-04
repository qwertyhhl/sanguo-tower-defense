// config.js —— 所有可调数值都放这里（M2 版）
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

  // 初始粮草（M2 先给足 150，方便三种单位各试一个；M3 商店接管后按设计改回 100）
  startGrain: 150,

  // 敌军步兵（M2 先用一种敌人测试战斗）
  enemy: {
    hp: 30,
    speed: 2.2,          // 每秒走过几格
    damage: 8,           // 每次攻击伤害
    attackInterval: 1.0, // 攻击间隔（秒）
    bounty: 4,           // 消灭后掉落的粮草
    spawnInterval: 1.5,  // 每隔几秒来一个
    color: "#c0392b"
  },

  // 防御设施（塔）：放在非路径格
  towers: {
    archer: {
      name: "连弩台", short: "弩",
      cost: 50, damage: 10, range: 2.5, cooldown: 0.6,
      color: "#2980b9"
    }
  },

  // 部队（士兵/武将）：放在路径格，与敌人正面对抗
  soldiers: {
    shield: {
      name: "盾兵", short: "盾",
      cost: 40, hp: 200, damage: 12, attackInterval: 1.0,
      range: 0, ranged: false,          // 近战：只打停在面前的敌人
      color: "#7f8c8d"
    },
    archer: {
      name: "弓兵", short: "弓",
      cost: 60, hp: 60, damage: 14, attackInterval: 0.8,
      range: 3, ranged: true,           // 远程：打射程内最近的敌人
      color: "#229954"
    }
  }
};
