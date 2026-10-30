// 隠しルールと独立ランダム即死の抽選。
const HIDDEN_RULE_POOL = [
  { id: "run_too_long", label: "連続走行", threshold: 7.5 },
  { id: "jump_too_much", label: "ジャンプ回数", threshold: 9 },
  { id: "stand_too_long", label: "静止時間", threshold: 5.5 },
  { id: "turn_too_much", label: "方向転換", threshold: 13 },
  { id: "time_limit", label: "滞在時間", threshold: 58 },
  { id: "fall_too_far", label: "落下距離", threshold: 205 },
  { id: "coin_greed", label: "コイン取得", threshold: 5 }
];

function chooseHiddenRules() {
  const pool = [...HIDDEN_RULE_POOL];
  const count = 4 + Math.floor(Math.random() * 3); // 4〜6個
  const chosen = [];
  while (chosen.length < count && pool.length) {
    chosen.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return chosen;
}

function rollIndependentDeath(deltaSeconds) {
  // 1秒あたり約0.8%。隠しルールとは独立した抽選。
  return Math.random() < 1 - Math.pow(1 - 0.008, deltaSeconds);
}