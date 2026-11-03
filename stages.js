// ランダムステージ生成。seedが同じなら同じ地形・背景・ステージ名を再現する。
const STAGE_GROUND_Y = 430;

function generateRandomStage(seed) {
  let state = seed >>> 0;
  const rand = () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min, max) => min + Math.floor(rand() * (max - min + 1));
  const pick = list => list[Math.floor(rand() * list.length)];
  const overlaps = (a1, a2, b1, b2, padding = 0) =>
    a1 < b2 + padding && a2 > b1 - padding;

  const width = int(3600, 4500);
  const goalX = width - 125;
  const background = pick([
    "battlefield", "black_hole", "tropical_beach", "historical_site", "grassland"
  ]);

  const terrainByBackground = {
    battlefield: ["廃戦場", "山地", "平原"],
    black_hole: ["宇宙の果て"],
    tropical_beach: ["ビーチ", "海岸"],
    historical_site: ["元収容所", "廃墟"],
    grassland: ["平原", "草原", "山地"]
  };
  const adjectivesByTerrain = {
    "廃戦場": ["荒廃した", "破壊された", "暗い", "歴史的な"],
    "山地": ["神秘の", "凍てついた", "誰も知らない", "ヨーロッパの"],
    "平原": ["平和な", "果てしない", "ヨーロッパの", "神秘の"],
    "宇宙の果て": ["神秘の", "暗い", "果てしない", "忘れられた"],
    "ビーチ": ["平和な", "神秘の", "暗い"],
    "海岸": ["沈んだ", "平和な", "暗い", "神秘の"],
    "元収容所": ["歴史的な", "忘れられた", "暗い"],
    "廃墟": ["破壊された", "忘れられた", "汚染された"],
    "草原": ["平和な", "果てしない", "ヨーロッパの", "神秘の"]
  };
  const terrain = pick(terrainByBackground[background]);
  const name = pick(adjectivesByTerrain[terrain]) + terrain;

  // 1) 地面を基準に生成。
  // 2) 奈落穴を先に確定し、地面区間から差し引く。
  const pits = [];
  const pitCount = int(2, 4);
  let attempts = 0;
  while (pits.length < pitCount && attempts++ < 120) {
    const pw = int(90, 165);
    const px = int(520, width - 560 - pw);
    if (px < 360 || px + pw > goalX - 300) continue;
    if (pits.some(p => overlaps(px, px + pw, p.x, p.x + p.w, 190))) continue;
    pits.push({ x: px, w: pw });
  }
  pits.sort((a, b) => a.x - b.x);
  const ground = [];
  let cursor = 0;
  for (const pit of pits) {
    if (pit.x > cursor) ground.push([cursor, pit.x]);
    cursor = pit.x + pit.w;
  }
  if (cursor < width) ground.push([cursor, width]);

  const isFlatSafe = (x, w, padding = 0) =>
    x >= 300 && x + w <= goalX - 260 &&
    ground.some(([a, b]) => x >= a + padding && x + w <= b - padding);

  // 3) 山：地面上に0〜3個。奈落・スポーン・ゴールから離す。
  const hills = [];
  const hillCount = int(0, 3);
  attempts = 0;
  while (hills.length < hillCount && attempts++ < 160) {
    const hw = int(180, 300);
    const hx = int(390, width - 500 - hw);
    if (!isFlatSafe(hx, hw, 8)) continue;
    if (hills.some(h => overlaps(hx, hx + hw, h.x - 28, h.x + h.w + 28))) continue;
    const angle = int(10, 45);
    const height = Math.max(24, Math.min(150, Math.tan(angle * Math.PI / 180) * (hw / 2)));
    hills.push({ x: hx, w: hw, h: Math.round(height), angle });
  }

  // 4) アイテムボックス：山・穴・安全地帯を避けて3個を目標に配置。
  const itemBoxes = [];
  attempts = 0;
  while (itemBoxes.length < 3 && attempts++ < 220) {
    const bx = int(380, width - 450);
    const bw = 28;
    if (!isFlatSafe(bx, bw, 20)) continue;
    if (hills.some(h => overlaps(bx, bx + bw, h.x - 25, h.x + h.w + 25))) continue;
    if (itemBoxes.some(b => overlaps(bx, bx + bw, b[0] - 170, b[0] + 198))) continue;
    itemBoxes.push([bx, STAGE_GROUND_Y - 130]);
  }

  // 5) 浮島：最後に生成。ボックス・山・スポーン・ゴールを避ける。
  const platforms = [];
  attempts = 0;
  const platformTarget = int(4, 7);
  while (platforms.length < platformTarget && attempts++ < 260) {
    const pw = int(95, 155);
    const px = int(350, width - 420 - pw);
    const py = int(245, 350);
    if (px < 280 || px + pw > goalX - 230) continue;
    if (pits.some(p => overlaps(px, px + pw, p.x, p.x + p.w, 12))) continue;
    if (hills.some(h => overlaps(px, px + pw, h.x, h.x + h.w, 8) && py > STAGE_GROUND_Y - h.h - 30)) continue;
    if (itemBoxes.some(b => overlaps(px, px + pw, b[0] - 30, b[0] + 60) && Math.abs(py - b[1]) < 55)) continue;
    if (platforms.some(p => overlaps(px, px + pw, p[0] - 45, p[0] + p[2] + 45) && Math.abs(py - p[1]) < 65)) continue;
    platforms.push([px, py, pw]);
  }

  // トゲは地面上に配置。スポーン・ゴール・山・ボックスから距離を取る。
  const hazards = [];
  const hazardTarget = int(3, 5);
  attempts = 0;
  while (hazards.length < hazardTarget && attempts++ < 180) {
    const hw = int(38, 58);
    const hx = int(420, width - 430 - hw);
    if (!isFlatSafe(hx, hw, 5)) continue;
    if (hills.some(h => overlaps(hx, hx + hw, h.x - 15, h.x + h.w + 15))) continue;
    if (itemBoxes.some(b => overlaps(hx, hx + hw, b[0] - 70, b[0] + 100))) continue;
    if (hazards.some(h => overlaps(hx, hx + hw, h[0] - 90, h[0] + h[2] + 90))) continue;
    hazards.push([hx, STAGE_GROUND_Y - 28, hw, 28]);
  }

  // コインも毎回位置を変える。穴・山の内部には置かない。
  const coins = [];
  attempts = 0;
  while (coins.length < 7 && attempts++ < 200) {
    const cx = int(340, width - 260);
    if (!ground.some(([a, b]) => cx > a + 35 && cx < b - 35)) continue;
    if (hills.some(h => cx > h.x && cx < h.x + h.w)) continue;
    if (coins.some(c => Math.abs(c[0] - cx) < 125)) continue;
    coins.push([cx, STAGE_GROUND_Y - 35]);
  }

  return {
    seed: seed >>> 0,
    name,
    background,
    width,
    ground,
    pits,
    hills,
    platforms,
    hazards,
    itemBoxes,
    coins,
    goalX
  };
}
