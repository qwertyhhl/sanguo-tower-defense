// config.js —— 所有可调数值（无小兵版：部队=武将）
const CONFIG = {
  gridCols: 16,
  gridRows: 9,

  // 关卡：难度随关号递增（路数 1→6、来敌方向 1→8 面、单路长度递减）
  // 所有路径末格 = 城门格；每路长度控制在 12~21 格（敌速 2.2 格/秒 → 行程 5.5~9.5 秒，不远不近）
  levels: [
    { id: 1, name: "第一关", desc: "初出茅庐，官道绕山，直抵中央城门。",
      paths: [[
        { c: 0, r: 4 }, { c: 1, r: 4 }, { c: 2, r: 4 }, { c: 3, r: 4 }, { c: 4, r: 4 },
        { c: 4, r: 3 }, { c: 4, r: 2 }, { c: 4, r: 1 },
        { c: 5, r: 1 }, { c: 6, r: 1 }, { c: 7, r: 1 }, { c: 8, r: 1 }, { c: 9, r: 1 }, { c: 10, r: 1 }, { c: 11, r: 1 },
        { c: 11, r: 2 }, { c: 11, r: 3 }, { c: 11, r: 4 },
        { c: 10, r: 4 }, { c: 9, r: 4 }, { c: 8, r: 4 }
      ]] },
    { id: 2, name: "第二关", desc: "官道在前分岔为二，北上或南下，会猎虎牢。",
      paths: [
        [ // A 北上
          { c: 0, r: 4 }, { c: 1, r: 4 }, { c: 2, r: 4 }, { c: 3, r: 4 },
          { c: 3, r: 3 }, { c: 3, r: 2 }, { c: 3, r: 1 },
          { c: 4, r: 1 }, { c: 5, r: 1 }, { c: 6, r: 1 }, { c: 7, r: 1 }, { c: 8, r: 1 }, { c: 9, r: 1 },
          { c: 9, r: 2 }, { c: 9, r: 3 }, { c: 9, r: 4 },
          { c: 10, r: 4 }, { c: 11, r: 4 }, { c: 12, r: 4 }
        ],
        [ // B 南下
          { c: 0, r: 4 }, { c: 1, r: 4 }, { c: 2, r: 4 }, { c: 3, r: 4 },
          { c: 3, r: 5 }, { c: 3, r: 6 }, { c: 3, r: 7 },
          { c: 4, r: 7 }, { c: 5, r: 7 }, { c: 6, r: 7 }, { c: 7, r: 7 }, { c: 8, r: 7 }, { c: 9, r: 7 },
          { c: 9, r: 6 }, { c: 9, r: 5 }, { c: 9, r: 4 },
          { c: 10, r: 4 }, { c: 11, r: 4 }, { c: 12, r: 4 }
        ]
      ] },
    { id: 3, name: "第三关", desc: "西路绕山而来，东北、东南两翼齐袭，三面会猎。",
      paths: [
        [ // A 西路：绕山 S 形进中央城
          { c: 0, r: 4 }, { c: 1, r: 4 }, { c: 2, r: 4 }, { c: 3, r: 4 }, { c: 4, r: 4 },
          { c: 4, r: 3 }, { c: 4, r: 2 }, { c: 4, r: 1 },
          { c: 5, r: 1 }, { c: 6, r: 1 }, { c: 7, r: 1 },
          { c: 7, r: 2 }, { c: 7, r: 3 }, { c: 7, r: 4 },
          { c: 8, r: 4 }
        ],
        [ // B 东北路：沿北境西行 → 折向南下进城
          { c: 15, r: 0 }, { c: 14, r: 0 }, { c: 13, r: 0 }, { c: 12, r: 0 }, { c: 11, r: 0 }, { c: 10, r: 0 }, { c: 9, r: 0 },
          { c: 9, r: 1 }, { c: 9, r: 2 }, { c: 9, r: 3 }, { c: 9, r: 4 },
          { c: 8, r: 4 }
        ],
        [ // C 东南路：沿南境西行 → 折向北上进城
          { c: 15, r: 8 }, { c: 14, r: 8 }, { c: 13, r: 8 }, { c: 12, r: 8 }, { c: 11, r: 8 }, { c: 10, r: 8 }, { c: 9, r: 8 },
          { c: 9, r: 7 }, { c: 9, r: 6 }, { c: 9, r: 5 }, { c: 9, r: 4 },
          { c: 8, r: 4 }
        ]
      ] },
    { id: 4, name: "第四关", desc: "西、东两路绕山，北、南两路穿阵，四路并进。",
      paths: [
        [ // A 西路：绕山 S 形进中央城
          { c: 0, r: 4 }, { c: 1, r: 4 }, { c: 2, r: 4 }, { c: 3, r: 4 }, { c: 4, r: 4 },
          { c: 4, r: 3 }, { c: 4, r: 2 }, { c: 4, r: 1 },
          { c: 5, r: 1 }, { c: 6, r: 1 }, { c: 7, r: 1 },
          { c: 7, r: 2 }, { c: 7, r: 3 }, { c: 7, r: 4 },
          { c: 8, r: 4 }
        ],
        [ // B 北路：沿北境横穿 → 南下进城
          { c: 1, r: 0 }, { c: 2, r: 0 }, { c: 3, r: 0 }, { c: 4, r: 0 }, { c: 5, r: 0 }, { c: 6, r: 0 },
          { c: 6, r: 1 }, { c: 6, r: 2 }, { c: 6, r: 3 }, { c: 8, r: 4 }
        ],
        [ // C 南路：沿南境横穿 → 北上进城
          { c: 1, r: 8 }, { c: 2, r: 8 }, { c: 3, r: 8 }, { c: 4, r: 8 }, { c: 5, r: 8 }, { c: 6, r: 8 },
          { c: 6, r: 7 }, { c: 6, r: 6 }, { c: 6, r: 5 }, { c: 6, r: 4 },
          { c: 7, r: 4 }, { c: 8, r: 4 }
        ],
        [ // D 东路：绕山折行进中央城
          { c: 15, r: 4 }, { c: 14, r: 4 }, { c: 13, r: 4 }, { c: 12, r: 4 },
          { c: 12, r: 3 }, { c: 12, r: 2 }, { c: 12, r: 1 },
          { c: 11, r: 1 }, { c: 10, r: 1 }, { c: 9, r: 1 },
          { c: 9, r: 2 }, { c: 9, r: 3 }, { c: 9, r: 4 },
          { c: 8, r: 4 }
        ]
      ] },
    { id: 5, name: "第五关", desc: "两翼大环合抱，北南穿阵，东路直插，五路会猎孤城。",
      paths: [
        [ // A 西·北环：左入 → 沿北侧绕行半圈 → 东侧南下进城
          { c: 0, r: 3 }, { c: 1, r: 3 }, { c: 2, r: 3 }, { c: 3, r: 3 },
          { c: 3, r: 2 }, { c: 3, r: 1 },
          { c: 4, r: 1 }, { c: 5, r: 1 }, { c: 6, r: 1 }, { c: 7, r: 1 }, { c: 8, r: 1 }, { c: 9, r: 1 }, { c: 10, r: 1 },
          { c: 10, r: 2 }, { c: 10, r: 3 }, { c: 10, r: 4 },
          { c: 9, r: 4 }, { c: 8, r: 4 }
        ],
        [ // B 西·南环：左入 → 沿南侧绕行半圈 → 东侧北上进城
          { c: 0, r: 5 }, { c: 1, r: 5 }, { c: 2, r: 5 }, { c: 3, r: 5 },
          { c: 3, r: 6 }, { c: 3, r: 7 },
          { c: 4, r: 7 }, { c: 5, r: 7 }, { c: 6, r: 7 }, { c: 7, r: 7 }, { c: 8, r: 7 }, { c: 9, r: 7 }, { c: 10, r: 7 },
          { c: 10, r: 6 }, { c: 10, r: 5 }, { c: 10, r: 4 },
          { c: 9, r: 4 }, { c: 8, r: 4 }
        ],
        [ // C 北路：沿北境横穿 → 中路南下进城
          { c: 1, r: 0 }, { c: 2, r: 0 }, { c: 3, r: 0 }, { c: 4, r: 0 }, { c: 5, r: 0 },
          { c: 5, r: 1 }, { c: 5, r: 2 }, { c: 5, r: 3 }, { c: 5, r: 4 },
          { c: 6, r: 4 }, { c: 7, r: 4 }, { c: 8, r: 4 }
        ],
        [ // D 南路：沿南境横穿 → 中路北上进城
          { c: 1, r: 8 }, { c: 2, r: 8 }, { c: 3, r: 8 }, { c: 4, r: 8 }, { c: 5, r: 8 },
          { c: 5, r: 7 }, { c: 5, r: 6 }, { c: 5, r: 5 }, { c: 5, r: 4 },
          { c: 6, r: 4 }, { c: 7, r: 4 }, { c: 8, r: 4 }
        ],
        [ // E 东路：沿北境西行 → 东侧南下进城
          { c: 15, r: 0 }, { c: 14, r: 0 }, { c: 13, r: 0 }, { c: 12, r: 0 },
          { c: 12, r: 1 }, { c: 12, r: 2 }, { c: 12, r: 3 }, { c: 12, r: 4 },
          { c: 11, r: 4 }, { c: 10, r: 4 }, { c: 9, r: 4 }, { c: 8, r: 4 }
        ]
      ] },
    { id: 6, name: "无尽模式", desc: "六路大军自八方进逼中央孤城，波数无终，敌势无限增强。", endless: true,
      paths: [
        [ // A 西·北小绕：左入 → 绕北坡 → 南下进城
          { c: 0, r: 4 }, { c: 1, r: 4 }, { c: 2, r: 4 }, { c: 3, r: 4 }, { c: 4, r: 4 },
          { c: 4, r: 3 }, { c: 4, r: 2 }, { c: 4, r: 1 },
          { c: 5, r: 1 }, { c: 6, r: 1 },
          { c: 7, r: 2 }, { c: 7, r: 3 }, { c: 7, r: 4 },
          { c: 8, r: 4 }
        ],
        [ // B 西·南小绕：左入 → 绕南坡 → 北上进城
          { c: 0, r: 4 }, { c: 1, r: 4 }, { c: 2, r: 4 }, { c: 3, r: 4 }, { c: 4, r: 4 },
          { c: 4, r: 5 }, { c: 4, r: 6 }, { c: 4, r: 7 },
          { c: 5, r: 7 }, { c: 6, r: 7 },
          { c: 7, r: 6 }, { c: 7, r: 5 }, { c: 7, r: 4 },
          { c: 8, r: 4 }
        ],
        [ // C 北路：沿北境横穿 → 南下进城
          { c: 1, r: 0 }, { c: 2, r: 0 }, { c: 3, r: 0 }, { c: 4, r: 0 }, { c: 5, r: 0 }, { c: 6, r: 0 },
          { c: 6, r: 1 }, { c: 6, r: 2 }, { c: 6, r: 3 }, { c: 6, r: 4 },
          { c: 7, r: 4 }, { c: 8, r: 4 }
        ],
        [ // D 南路：沿南境横穿 → 北上进城
          { c: 1, r: 8 }, { c: 2, r: 8 }, { c: 3, r: 8 }, { c: 4, r: 8 }, { c: 5, r: 8 }, { c: 6, r: 8 },
          { c: 6, r: 7 }, { c: 6, r: 6 }, { c: 6, r: 5 }, { c: 6, r: 4 },
          { c: 7, r: 4 }, { c: 8, r: 4 }
        ],
        [ // E 东北路：沿北境西行 → 东侧南下进城
          { c: 15, r: 0 }, { c: 14, r: 0 }, { c: 13, r: 0 }, { c: 12, r: 0 }, { c: 11, r: 0 }, { c: 10, r: 0 },
          { c: 10, r: 1 }, { c: 10, r: 2 }, { c: 10, r: 3 }, { c: 10, r: 4 },
          { c: 9, r: 4 }, { c: 8, r: 4 }
        ],
        [ // F 东南路：沿南境西行 → 东侧北上进城
          { c: 15, r: 8 }, { c: 14, r: 8 }, { c: 13, r: 8 }, { c: 12, r: 8 }, { c: 11, r: 8 }, { c: 10, r: 8 },
          { c: 10, r: 7 }, { c: 10, r: 6 }, { c: 10, r: 5 }, { c: 10, r: 4 },
          { c: 9, r: 4 }, { c: 8, r: 4 }
        ]
      ] }
  ],

  gateHp: 20,
  startGrain: 1000,

  difficulties: {
    easy:   { name: "简单", startGrain: 1000, gateHp: 25, hpMul: 0.7,  countMul: 0.8 },
    normal: { name: "普通", startGrain: 1000, gateHp: 20, hpMul: 1,    countMul: 1 },
    hard:   { name: "困难", startGrain: 1000, gateHp: 15, hpMul: 1.4,  countMul: 1.3 }
  },

  inventorySize: 5,
  popCap: 20,
  maxLevel: 3,
  mergeNeed: 3,        // 升星所需同款同等级数量（凑满自动合成）
  levelGrowth: 1.8,

  // 商店：随机上架（已无小兵：塔 / 农民 / 武将）
  shop: {
    size: 5,
    refreshCost: 10,
    pool: [
      { type: "tower.archer", weight: 3 },
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
    prepTime: 0,          // 波间不停顿（上波打完立刻开下一波）
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

  boss: {
    hp: 1500, speed: 0.9, damage: 25, attackInterval: 1.6,
    bounty: 100, color: "#7d3cff", radiusMul: 0.42
  },

  towers: {
    archer: { name: "连弩台", short: "弩", kind: "tower", cost: 50,
      damage: 10, range: 2.5, cooldown: 0.6, color: "#2980b9", splash: 0 },
    catapult: { name: "投石车", short: "石", kind: "tower", cost: 120,
      damage: 25, range: 3, cooldown: 2.0, color: "#8e44ad",
      splash: 1.2, splashFactor: 0.6 },
    fire: { name: "火攻台", short: "火", kind: "tower", cost: 100,
      damage: 6, range: 2.5, cooldown: 1.4, color: "#e67e22",
      splash: 0,
      slowMul: 0.6, slowDur: 3,
      dotDmg: 5, dotInterval: 0.5, dotDur: 3 }
  },

  farmers: {
    farmer: { name: "农民", short: "农", kind: "farmer", cost: 40,
      produce: [5, 10, 20], produceInterval: 5, color: "#d4a017" }
  },

  // 武将怒气：攻击 / 受击积攒，攒满自动释放技能
  rage: { max: 100, perAttack: 10, perHurt: 15 },

  // 小兵已移除；部队类 = 武将（kind:"soldier" 表示放路径格，参与合成）；skill 由怒气触发
  heroes: {
    guan: { name: "关羽", short: "羽", kind: "soldier", hero: true, cost: 200,
      hp: 700, damage: 40, attackInterval: 1.0,
      range: 0, ranged: false, engage: 2, moveSpeed: 3.5,
      color: "#1e8449",
      skill: { name: "青龙偃月", type: "aoe", radius: 2, damage: 150,
        desc: "青龙刀横扫千军，重创周围 2 格内所有敌军。" } },
    zhaoyun: { name: "赵云", short: "云", kind: "soldier", hero: true, cost: 200,
      hp: 500, damage: 22, attackInterval: 0.45,
      range: 0, ranged: false, engage: 2, moveSpeed: 4.2,
      color: "#2471a3",
      skill: { name: "七探盘蛇", type: "multihit", count: 5, damage: 40, range: 5,
        desc: "银枪连刺如盘蛇出洞，对最近的敌军连击 5 次。" } },
    huangzhong: { name: "黄忠", short: "忠", kind: "soldier", hero: true, cost: 200,
      hp: 400, damage: 45, attackInterval: 1.1,
      range: 4, ranged: true, engage: 0, moveSpeed: 3,
      color: "#b7950b",
      skill: { name: "百步穿杨", type: "snipe", damage: 300, range: 5,
        desc: "锁定 5 格内血量最高的敌军，一箭重创之。" } },
    zhangfei: { name: "张飞", short: "飞", kind: "soldier", hero: true, cost: 200,
      hp: 1100, damage: 30, attackInterval: 1.2,
      range: 0, ranged: false, engage: 2, moveSpeed: 3.2,
      color: "#943126",
      skill: { name: "燕人咆哮", type: "roar", radius: 2.5, damage: 80, stunDur: [1.5, 2, 2.5],
        desc: "当阳桥头一声吼，震慑 2.5 格内敌军并眩晕 1.5~2.5 秒（时长随等级提升）。" } },
    zhouyu: { name: "周瑜", short: "瑜", kind: "soldier", hero: true, cost: 200,
      hp: 380, damage: 20, attackInterval: 1.2,
      range: 3.5, ranged: true, engage: 0, moveSpeed: 3,
      color: "#ca6f1e",
      skill: { name: "火烧赤壁", type: "fire", radius: 2.5, damage: 220, slowMul: 0.6, slowDur: 2.5,
        desc: "借东风纵火，焚烧 2.5 格内敌军并使其减速。" } },
    zhuge: { name: "诸葛亮", short: "亮", kind: "soldier", hero: true, cost: 200,
      hp: 350, damage: 18, attackInterval: 1.3,
      range: 3.5, ranged: true, engage: 0, moveSpeed: 3,
      color: "#1a5276",
      skill: { name: "八阵风云", type: "storm", radius: 5, damage: 100, ampMul: 1.35, ampDur: 4,
        desc: "布下八阵风云，覆盖 5 格范围，大范围杀伤并使敌军易伤：所受伤害 +35%，持续 4 秒。" } }
  }
};
