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
    hard:   { name: "困难", startGrain: 1000, gateHp: 18, hpMul: 1.32, countMul: 1.3 }
  },

  inventorySize: 5,
  popCap: 20,
  maxLevel: 3,
  mergeNeed: 3,        // 升星所需同款同等级数量（凑满自动合成）
  levelGrowth: 1.8,

  // 商店：随机上架（己方小兵 / 农民 / 武将）
  shop: {
    size: 5,
    refreshCost: 10,
    pool: [
      { type: "soldier.pike", weight: 3 },
      { type: "soldier.archer", weight: 2 },
      { type: "soldier.heavy", weight: 2 },
      { type: "farmer.farmer", weight: 2 },
      { type: "hero.guan", weight: 1 },
      { type: "hero.zhaoyun", weight: 1 },
      { type: "hero.zhangfei", weight: 1 },
      { type: "hero.zhuge", weight: 1 }
    ]
  },

  waves: {
    total: 10,
    prepTime: 0,          // 波间不停顿：上一波清场后立刻开下一波
    baseCount: 8,         // 每波基础士兵数量（较原先 4 提升一倍，敌潮更厚）
    countPerWave: 3,      // 每波新增数量（逐波加厚）
    hpGrowth: 0.25,
    bonusBase: 20,
    bonusPerWave: 5,
    bossEvery: 5
  },

  enemy: {
    hp: 30, damage: 8, attackInterval: 1.0,
    attackRange: 1.0, bounty: 4, spawnInterval: 0.6, color: "#c0392b",
    radiusMul: 0.26, speedMul: 1.0,
    // 每次放兵数量：基数为 1（少量、逐点错峰，避免所有出生点同时爆）；次/频率随波次在 main.js 递增
    spawnBatch: 1,
    // 速度随波次递增：speed 为第 1 波基础速度，每波 +speedPerWave，最高封顶 maxSpeed(1.3)
    speed: 0.9,
    maxSpeed: 1.3,
    speedPerWave: 0.05
  },

  // 敌军小兵兵种：可按需增删。minWave 从第几波开始出现；weight 出场权重（越大越常见）。
  // 生成的敌人会取用本表字段覆盖 enemy 基础值（hp 再叠加波次血量倍率）。
  enemyTypes: [
    { name: "轻步兵",  ch: "步", minWave: 1, weight: 10, hp: 30,  dmg: 8,  attackInterval: 1.0, attackRange: 1.0, bounty: 4,  radiusMul: 0.26, speedMul: 1.0,  color: "#c0392b" },
    { name: "重甲兵",  ch: "甲", minWave: 3, weight: 5,  hp: 90,  dmg: 14, attackInterval: 1.2, attackRange: 1.0, bounty: 7,  radiusMul: 0.33, speedMul: 0.8,  color: "#c0392b" },
    { name: "弓射手",  ch: "弓", minWave: 4, weight: 4,  hp: 20,  dmg: 13, attackInterval: 1.7, attackRange: 2.8, bounty: 6,  radiusMul: 0.23, speedMul: 0.75, color: "#c0392b" }
  ],

  boss: {
    hp: 1500, speed: 0.9, damage: 25, attackInterval: 1.6,
    bounty: 100, color: "#7d3cff", radiusMul: 0.42,
    ch: "将", skill: { id: "summon", cd: 9, num: 3 }
  },

  // 敌军 Boss 表：按登场回合轮换（第 5 波出第 1 个，之后每 bossEvery 波换一个，循环）。
  // skill 参数含义见 castBossSkill()：
  //   summon 召唤 / shield 护盾+回血 / enrage 狂暴+践踏 / fury 全能（召唤+狂暴+践踏）
  bosses: [
    { name: "山贼头目·张梁", ch: "梁", hp: 1500, speed: 0.9, damage: 25, attackInterval: 1.6, bounty: 100, color: "#c0392b",  radiusMul: 0.42,
      skill: { id: "summon", cd: 9, num: 3 } },
    { name: "黄巾力士·管亥", ch: "亥", hp: 2000, speed: 0.85, damage: 30, attackInterval: 1.4, bounty: 120, color: "#e67e22", radiusMul: 0.45,
      skill: { id: "shield", cd: 12, dur: 5, heal: 200 } },
    { name: "西凉悍将·华雄", ch: "雄", hp: 2600, speed: 1.0, damage: 28, attackInterval: 1.2, bounty: 140, color: "#8e44ad", radiusMul: 0.46,
      skill: { id: "enrage", cd: 11, dur: 6, atkMul: 1.6, spdMul: 1.4, stomp: true, range: 2.0, stompDmg: 30 } },
    { name: "无双战神·吕布", ch: "吕", hp: 3400, speed: 1.1, damage: 36, attackInterval: 1.0, bounty: 180, color: "#d63031", radiusMul: 0.5,
      skill: { id: "fury", cd: 10, dur: 5, summon: 2, atkMul: 1.5, stomp: true, range: 2.2, stompDmg: 40 } }
  ],

  // 己方小兵：商店购买、放路上、参与 3 张合成升星（与武将同机制，无技能、纯数值）
  // 数值说明同武将：range 远程射程 / engage 近战追击半径 / atkRange 近战攻击距离 / moveSpeed 移速；weapon 决定挥击动画
  soldiers: {
    pike: { name: "枪兵", short: "枪", kind: "soldier", cost: 70,
      hp: 200, damage: 20, attackInterval: 1.0,
      range: 0, ranged: false, engage: 1, atkRange: 1.6, moveSpeed: 3.2,
      color: "#5d6d7e", weapon: "spear" },
    archer: { name: "弓兵", short: "弓", kind: "soldier", cost: 80,
      hp: 160, damage: 24, attackInterval: 1.4,
      range: 3, ranged: true, engage: 0, moveSpeed: 2.8,
      color: "#8e6b23", weapon: "bow" },
    heavy: { name: "重盾兵", short: "盾", kind: "soldier", cost: 110,
      hp: 460, damage: 14, attackInterval: 1.3,
      range: 0, ranged: false, engage: 1, atkRange: 1.1, moveSpeed: 2.4,
      color: "#5a4a3f" }
  },

  farmers: {
    farmer: { name: "农民", short: "农", kind: "farmer", cost: 40,
      produce: [5, 10, 20], produceInterval: 5, color: "#d4a017" }
  },

  // 技能卡：击杀敌人掉落。
  //   被动卡 —— 获得后本局对「所有友军」全局生效一整局（可叠加），永不卸载。
  //   主动卡 —— 落入战场右侧的主动栏，战斗中先点卡片再点场地手动释放，有独立冷却。
  // 数值叠加字段：atkIntervalMul/dmgMul/hpMul/bountyMul/enemySlow 为累乘（默认1），
  //             splashFactor/vamp 为累加（默认0），splashRange 取最大。
  skillCards: {
    dropChance: 0.07,      // 击杀普通小兵掉卡概率
    bossDrop: true,        // Boss 必掉（受上限约束）
    maxPassive: 10,        // 被动卡上限
    maxActive: 3,          // 主动卡栏位（满了新掉被动侧优先，待办简化）
    // 升星数值倍率：合格3张同★合成升★1级。效果按星级加成——
    //   ★1＝基础值，每升1★再乘 STAR_BOOST 倍（★2＝×1.6，★3＝×2.56）。
    //   数值只在升星时提升，可按喜好自行调整 STAR_BOOST。
    starBoost: 1.6,
    passive: [
      { id: "atkspeed", name: "如虎添翼", short: "速", desc: "全军攻速 +25%",
        color: "#e67e22", weight: 8, atkIntervalMul: 0.8 },
      { id: "power", name: "力拔山兮", short: "力", desc: "全军攻击力 +20%",
        color: "#c0392b", weight: 8, dmgMul: 1.25 },
      { id: "hp", name: "铜墙铁壁", short: "甲", desc: "全军生命上限 +25%（含已有单位）",
        color: "#2980b9", weight: 7, hpMul: 1.25 },
      { id: "splash", name: "横扫千军", short: "溅", desc: "全军攻击附带 15% 溅射",
        color: "#8e44ad", weight: 5, splashFactor: 0.15, splashRange: 1.2 },
      { id: "vamp", name: "噬血成性", short: "嗜", desc: "全军攻击吸血 15%",
        color: "#e74c3c", weight: 5, vamp: 0.1 },
      { id: "bounty", name: "广积粮", short: "粮", desc: "击杀赏金 +25%",
        color: "#f1c40f", weight: 4, bountyMul: 1.25 },
      { id: "slowenemy", name: "陷阵寒霜", short: "寒", desc: "敌军全场减速 15%",
        color: "#5dade2", weight: 4, enemySlow: 0.85 }
    ],
    active: [
      { id: "thunder", name: "落雷天罚", short: "雷", desc: "目标 2 格内敌军受 200 伤害并眩晕 1.5 秒",
        color: "#9b59b6", cd: 20, radius: 2, dmg: 200, stun: 1.5 },
      { id: "rain", name: "万箭齐发", short: "箭", desc: "目标点 4 格范围敌军各受 80 伤害",
        color: "#d35400", cd: 18, radius: 4, dmg: 80 },
      { id: "freeze", name: "定军山", short: "定", desc: "全场敌军减速 50%，持续 4 秒",
        color: "#3498db", cd: 28, slowMul: 0.5, slowDur: 4 },
      { id: "healwall", name: "甘泉琼浆", short: "愈", desc: "全队立即回复 200 点生命",
        color: "#2ecc71", cd: 25, heal: 200 },
      { id: "grainfest", name: "五谷丰登", short: "丰", desc: "立即获得 120 粮草",
        color: "#f39c12", cd: 30, grain: 120 }
    ]
  },

  // 武将怒气：攻击 / 受击积攒，攒满自动释放技能
  rage: { max: 100, perAttack: 10, perHurt: 15 },

  // 小兵已移除；部队类 = 武将（kind:"soldier" 表示放路径格，参与合成）；skill 由怒气触发
  // 数值说明（均可自行调整）：
  //   range     —— 远程武将攻击射程（格）；近战固定 0
  //   engage    —— 近战追击半径（格）：以驻守格为锚心、沿路径格追击的最大距离；远程固定 0
  //   atkRange  —— 近战攻击距离（格）：武将身边多远（欧氏距离）内的敌人可被攻击/逼停
  //   moveSpeed —— 移动速度（格/秒）
  heroes: {
    guan: { name: "关羽", short: "羽", kind: "soldier", hero: true, cost: 200,
      hp: 700, damage: 40, attackInterval: 1.0,
      range: 0, ranged: false, engage: 2, atkRange: 2, moveSpeed: 3.5,
      color: "#1e8449", weapon: "saber",
      skill: { name: "青龙偃月", type: "aoe", radius: 2, damage: 150,
        desc: "青龙刀横扫千军，重创周围 2 格内所有敌军。" } },
    zhaoyun: { name: "赵云", short: "云", kind: "soldier", hero: true, cost: 200,
      hp: 500, damage: 22, attackInterval: 0.45,
      range: 0, ranged: false, engage: 2, atkRange: 2, moveSpeed: 4.2,
      color: "#2471a3", weapon: "spear",
      skill: { name: "七探盘蛇", type: "multihit", count: 5, damage: 40, range: 5,
        desc: "银枪连刺如盘蛇出洞，对最近的敌军连击 5 次。" } },
    zhangfei: { name: "张飞", short: "飞", kind: "soldier", hero: true, cost: 200,
      hp: 1100, damage: 30, attackInterval: 1.2,
      range: 0, ranged: false, engage: 2, atkRange: 1, moveSpeed: 3.2,
      color: "#943126", weapon: "spear",
      skill: { name: "燕人咆哮", type: "roar", radius: 2.5, damage: 80, stunDur: [1.5, 2, 2.5],
        desc: "当阳桥头一声吼，震慑 2.5 格内敌军并眩晕 1.5~2.5 秒（时长随等级提升）。" } },
    zhuge: { name: "诸葛亮", short: "亮", kind: "soldier", hero: true, cost: 200,
      hp: 350, damage: 18, attackInterval: 1.3,
      range: 3.5, ranged: true, engage: 0, moveSpeed: 3,
      color: "#1a5276", weapon: "fan",
      skill: { name: "八阵风云", type: "storm", radius: 5, damage: 100, ampMul: 1.35, ampDur: 4,
        desc: "布下八阵风云，覆盖 5 格范围，大范围杀伤并使敌军易伤：所受伤害 +35%，持续 4 秒。" } }
  }
};
