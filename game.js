(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const GROUND_Y = 430;
  const PLAYER_BASE_H = 30;

  // 巨大化アイテム画像：ファイル名を変更する場合は、この行を書き換える。
  const POWERUP_IMAGE_PATH = "assets/maple_powerup.png";
  const powerupImage = new Image();
  powerupImage.src = POWERUP_IMAGE_PATH;

  // ステージ背景画像。ファイルは assets/ にまとめてある。
  const BACKGROUND_PATHS = {
    battlefield: "assets/battlefield.jpg",
    black_hole: "assets/black_hole.jpg",
    tropical_beach: "assets/tropical_beach.jpg",
    historical_site: "assets/historical_site.jpg",
    grassland: "assets/grassland.jpg"
  };
  const backgroundImages = {};
  for (const [key, path] of Object.entries(BACKGROUND_PATHS)) {
    const image = new Image();
    image.src = path;
    backgroundImages[key] = image;
  }
  const homeScreen = document.getElementById("home-screen");
  const deathScreen = document.getElementById("death-screen");
  const winScreen = document.getElementById("win-screen");
  const hud = document.getElementById("hud");
  const deathMessage = document.getElementById("death-message");
  const deathLog = document.getElementById("death-log");
  const stageLabel = document.getElementById("stage-label");
  const progressLabel = document.getElementById("progress-label");
  const deathCountLabel = document.getElementById("death-count-label");

  const keys = new Set();
  let stageNumber = 1;
  let currentStage = null;
  let deaths = Number(localStorage.getItem("unfairAdventureDeaths") || 0);
  if (!Number.isFinite(deaths) || deaths < 0) deaths = 0;
  let running = false, lastTime = 0;
  let stage, player, cameraX, hiddenRules, stats, coins, enemies, itemBoxes, fallingItems, deathReason;

  function resetStage() {
    if (!currentStage) {
      const seed = Math.floor(Math.random() * 0xFFFFFFFF) >>> 0;
      currentStage = generateRandomStage(seed);
    }
    stage = currentStage;
    player = { x: 70, y: GROUND_Y - PLAYER_BASE_H, w: 24, h: PLAYER_BASE_H, big: false, invulnerable: 0, vx: 0, vy: 0, onGround: false, startY: GROUND_Y - PLAYER_BASE_H };
    cameraX = 0;
    hiddenRules = chooseHiddenRules();
    stats = { run: 0, stand: 0, jumps: 0, turns: 0, alive: 0, fallStart: null, coins: 0, lastDir: 0, neutralizedRules: new Set(), powerups: 0 };
    coins = (stage.coins || []).map(([x, y]) => ({ x, y, taken: false }));
    itemBoxes = (stage.itemBoxes || []).map(([x, y]) => ({ x, y, w: 28, h: 28, used: false }));
    fallingItems = [];
    // 地面区間ごとに敵を配置。巡回範囲を地面の内側に限定して崖から落ちない。
    enemies = stage.ground
      .filter(([x1, x2]) => x2 - x1 >= 420)
      .map(([x1, x2]) => {
        const w = 34, h = 30;
        const minX = x1 + 12, maxX = x2 - w - 12;
        const startX = Math.min(maxX, Math.max(minX, x1 + Math.min(260, (x2 - x1 - w) / 2)));
        return { x: startX, y: GROUND_Y - h, w, h, minX, maxX, dir: 1, speed: 58 };
      })
      .filter(enemy => !(stage.hills || []).some(hill =>
        enemy.x + enemy.w > hill.x - 30 && enemy.x < hill.x + hill.w + 30
      ));
    stageLabel.textContent = `STAGE ${String(stageNumber).padStart(2, "0")} : ${stage.name}`;
    progressLabel.textContent = "0%";
    deathCountLabel.textContent = `DEATHS: ${deaths}`;
  }

  function showHome() {
    running = false;
    currentStage = null;
    document.getElementById("game-shell").classList.remove("game-active");
    homeScreen.classList.remove("hidden");
    deathScreen.classList.add("hidden");
    winScreen.classList.add("hidden");
    hud.style.display = "none";
    draw();
  }

  function startGame() {
    document.getElementById("game-shell").classList.add("game-active");
    homeScreen.classList.add("hidden");
    deathScreen.classList.add("hidden");
    winScreen.classList.add("hidden");
    hud.style.display = "flex";
    resetStage();
    running = true;
    lastTime = performance.now();
    requestAnimationFrame(loop);
  }

  function die(type, detail) {
    if (!running) return;
    running = false;
    document.getElementById("game-shell").classList.remove("game-active");
    deaths++;
    localStorage.setItem("unfairAdventureDeaths", String(deaths));
    deathCountLabel.textContent = `DEATHS: ${deaths}`;
    const random = type === "random";
    const message = random
      ? RANDOM_DEATH_MESSAGES[Math.floor(Math.random() * RANDOM_DEATH_MESSAGES.length)]
      : type === "rule"
        ? RULE_DEATH_MESSAGES[detail] || "隠されたルールに違反した。"
        : NORMAL_DEATH_MESSAGES[detail] || NORMAL_DEATH_MESSAGES.unknown;
    deathMessage.textContent = message;
    const cause = random ? "独立ランダム即死" : type === "rule" ? `隠しルール：${hiddenRules.find(r => r.id === detail)?.label || detail}` : detail === "enemy" ? "キモかった…" : `通常の死亡：${detail}`;
    const progress = Math.min(100, Math.floor((player.x / stage.goalX) * 100));
    deathLog.innerHTML = `<div>死因：${escapeHtml(cause)}</div><div>ステージ：${stageNumber} - ${escapeHtml(stage.name)}</div><div>到達地点：ゴールまで ${progress}%</div><div>ステージシード：${stage.seed}</div><div>今回の隠しルール：${hiddenRules.length}個（内容は非公開）</div><div>累計死亡回数：${deaths}</div>`;
    // 死亡ログを明示的に表示してから死亡画面を開く
    deathLog.hidden = false;
    deathLog.style.display = "block";
    deathLog.style.visibility = "visible";
    deathScreen.classList.remove("hidden");
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
  }

  function win() {
    running = false;
    document.getElementById("game-shell").classList.remove("game-active");
    document.getElementById("clear-message").textContent = `${stage.name}を突破。死亡回数：${deaths}／シード：${stage.seed}`;
    winScreen.classList.remove("hidden");
  }

  function growPlayer() {
    if (player.big) return;
    const feet = player.y + player.h;
    player.big = true;
    player.h = PLAYER_BASE_H * 2;
    player.y = feet - player.h;
  }

  function shrinkPlayer() {
    if (!player.big) return;
    const feet = player.y + player.h;
    player.big = false;
    player.h = PLAYER_BASE_H;
    player.y = feet - player.h;
    player.invulnerable = 2;
  }

  // 乱数即死と奈落死だけは、巨大化・無敵時間でも防げない。
  // その他の即死判定は巨大化中または無敵時間中なら一度だけ無効化する。
  function handleFatal(type, detail, ruleId = null) {
    if (type === "random" || detail === "pit") {
      die(type, detail);
      return true;
    }
    if (player.big) {
      shrinkPlayer();
      if (ruleId) stats.neutralizedRules.add(ruleId);
      return false;
    }
    if (player.invulnerable > 0) {
      if (ruleId) stats.neutralizedRules.add(ruleId);
      return false;
    }
    die(type, detail);
    return true;
  }

  function update(dt) {
    stats.alive += dt;
    player.invulnerable = Math.max(0, player.invulnerable - dt);
    const left = keys.has("ArrowLeft") || keys.has("KeyA");
    const right = keys.has("ArrowRight") || keys.has("KeyD");
    const jump = keys.has("Space") || keys.has("ArrowUp") || keys.has("KeyW");
    const dir = (right ? 1 : 0) - (left ? 1 : 0);

    if (dir) {
      stats.run += dt;
      stats.stand = 0;
      if (stats.lastDir && stats.lastDir !== dir) stats.turns++;
      stats.lastDir = dir;
    } else {
      stats.stand += dt;
      stats.run = 0;
    }

    player.vx = dir * 230;
    if (jump && player.onGround && !player.jumpLock) {
      player.vy = -540;
      player.onGround = false;
      player.jumpLock = true;
      stats.jumps++;
    }
    if (!jump) player.jumpLock = false;

    const previousY = player.y;
    const wasGroundedBeforeMove = player.onGround;
    player.vy += 1450 * dt;
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    player.x = Math.max(0, Math.min(stage.width - player.w, player.x));

    // 地面と穴
    player.onGround = false;
    const feet = player.y + player.h;
    for (const [x1, x2] of stage.ground) {
      if (player.x + player.w > x1 && player.x < x2 && previousY + player.h <= GROUND_Y && feet >= GROUND_Y && player.vy >= 0) {
        player.y = GROUND_Y - player.h;
        player.vy = 0;
        player.onGround = true;
      }
    }
    // 山の斜面：三角形の表面を細かく分割したのと同等の高さ関数で判定する。
    const playerCenterX = player.x + player.w / 2;
    for (const hill of (stage.hills || [])) {
      if (playerCenterX < hill.x || playerCenterX > hill.x + hill.w) continue;
      const half = hill.w / 2;
      const distanceFromPeak = Math.abs(playerCenterX - (hill.x + half));
      const surfaceY = GROUND_Y - hill.h * (1 - distanceFromPeak / half);
      const previousFeet = previousY + player.h;
      const currentFeet = player.y + player.h;
      if (player.vy >= 0 && currentFeet >= surfaceY && (previousFeet <= surfaceY || wasGroundedBeforeMove || player.onGround)) {
        player.y = surfaceY - player.h;
        player.vy = 0;
        player.onGround = true;
      }
    }

    // 空中足場
    for (const [x, y, width] of stage.platforms) {
      if (player.x + player.w > x && player.x < x + width && previousY + player.h <= y && feet >= y && player.vy >= 0) {
        player.y = y - player.h;
        player.vy = 0;
        player.onGround = true;
      }
    }

    // アイテムボックスは下からジャンプで叩くと一度だけ中身を出す。
    for (const box of itemBoxes) {
      const boxBottom = box.y + box.h;
      if (!box.used && player.vy < 0 && previousY >= boxBottom && player.y <= boxBottom &&
          player.x + player.w > box.x && player.x < box.x + box.w) {
        box.used = true;
        player.y = boxBottom + 1;
        player.vy = 0;
        const kind = Math.random() < 0.5 ? "coin" : "giant";
        fallingItems.push({ kind, x: box.x + (box.w - 20) / 2, y: boxBottom + 3, w: 20, h: 22, vy: 12, age: 0, landed: false });
      }
    }

    // アイテムはゆっくり落下し、地面の上で止まる。
    for (const item of fallingItems) {
      item.age += dt;
      if (!item.landed) {
        item.vy = Math.min(48, item.vy + 26 * dt);
        item.y += item.vy * dt;
        const hasGround = stage.ground.some(([x1, x2]) => item.x + item.w / 2 > x1 && item.x + item.w / 2 < x2);
        if (hasGround && item.y + item.h >= GROUND_Y) {
          item.y = GROUND_Y - item.h;
          item.vy = 0;
          item.landed = true;
        }
      }
    }

    // アイテム取得。巨大化アイテムは隠しルールの対象になる場合がある。
    for (const item of fallingItems) {
      if (item.taken || item.age < 0.25) continue;
      const pickup = item.kind === "giant"
        ? { x: item.x + 10 - 21, y: item.y + 11 - 14, w: 42, h: 28 }
        : item;
      const overlap = player.x < pickup.x + pickup.w && player.x + player.w > pickup.x &&
        player.y < pickup.y + pickup.h && player.y + player.h > pickup.y;
      if (!overlap) continue;
      item.taken = true;
      if (item.kind === "coin") {
        stats.coins++;
      } else {
        stats.powerups++;
        const forbiddenRule = hiddenRules.find(rule => rule.id === "powerup_too_much" && !stats.neutralizedRules.has(rule.id));
        if (forbiddenRule) {
          if (handleFatal("rule", forbiddenRule.id, forbiddenRule.id)) return;
        } else {
          growPlayer();
        }
      }
    }
    fallingItems = fallingItems.filter(item => !item.taken && item.y < H + 40);

    // 敵は地面の区間内だけを往復する。トゲの判定はプレイヤーにのみ適用。
    for (const enemy of enemies) {
      enemy.x += enemy.dir * enemy.speed * dt;
      if (enemy.x <= enemy.minX) { enemy.x = enemy.minX; enemy.dir = 1; }
      if (enemy.x >= enemy.maxX) { enemy.x = enemy.maxX; enemy.dir = -1; }
    }

    // 落下距離の監視
    if (!player.onGround && stats.fallStart === null) stats.fallStart = player.y;
    if (player.onGround) stats.fallStart = null;

    // コイン
    for (const coin of coins) {
      if (!coin.taken && Math.abs((player.x + player.w/2) - coin.x) < 23 && Math.abs((player.y + player.h/2) - coin.y) < 30) {
        coin.taken = true; stats.coins++;
      }
    }

    cameraX = Math.max(0, Math.min(stage.width - W, player.x - W * .36));
    progressLabel.textContent = `${Math.min(100, Math.floor(player.x / stage.goalX * 100))}%`;

    for (const rule of hiddenRules) {
      if (stats.neutralizedRules.has(rule.id)) continue;
      const triggered =
        (rule.id === "run_too_long" && stats.run >= rule.threshold) ||
        (rule.id === "jump_too_much" && stats.jumps >= rule.threshold) ||
        (rule.id === "stand_too_long" && stats.stand >= rule.threshold) ||
        (rule.id === "turn_too_much" && stats.turns >= rule.threshold) ||
        (rule.id === "time_limit" && stats.alive >= rule.threshold) ||
        (rule.id === "fall_too_far" && stats.fallStart !== null && player.y - stats.fallStart >= rule.threshold) ||
        (rule.id === "coin_greed" && stats.coins >= rule.threshold);
      if (triggered && handleFatal("rule", rule.id, rule.id)) return;
    }

    // 隠しルールとは独立したランダム即死
    if (rollIndependentDeath(dt)) return die("random", "independent");

    // 通常の死亡判定
    if (player.y > H + 90) return handleFatal("normal", "pit");
    if (player.invulnerable <= 0) {
      for (const enemy of enemies) {
        if (player.x + player.w > enemy.x && player.x < enemy.x + enemy.w &&
            player.y + player.h > enemy.y && player.y < enemy.y + enemy.h) {
          if (handleFatal("normal", "enemy")) return;
        }
      }
      for (const [x, y, w, h] of stage.hazards) {
        if (player.x + player.w > x && player.x < x + w && player.y + player.h > y && player.y < y + h) {
          if (handleFatal("normal", "hazard")) return;
        }
      }
    }
    if (player.x >= stage.goalX) win();
  }

  function drawBackground() {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#78b6d1");
    sky.addColorStop(1, "#d8d5a0");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    const image = stage ? backgroundImages[stage.background] : null;
    if (image && image.complete && image.naturalWidth > 0) {
      ctx.drawImage(image, 0, 0, W, H);
      // 地形とプレイヤーが背景に埋もれないよう、ごく薄い暗幕を重ねる。
      ctx.fillStyle = "rgba(10, 14, 18, .12)";
      ctx.fillRect(0, 0, W, H);
    } else {
      ctx.fillStyle = "#719b78";
      for (let i = -1; i < 7; i++) {
        const x = i * 230 - (cameraX * .22 % 230);
        ctx.beginPath();
        ctx.moveTo(x, 390);
        ctx.quadraticCurveTo(x + 110, 220, x + 230, 390);
        ctx.fill();
      }
      ctx.fillStyle = "#f1f0d8";
      for (let i = 0; i < 8; i++) {
        const x = (i * 190 - cameraX * .12) % (W + 150);
        const xx = x < -100 ? x + W + 150 : x;
        ctx.fillRect(xx, 90 + (i % 3) * 34, 62, 13);
        ctx.fillRect(xx + 14, 78 + (i % 3) * 34, 35, 13);
      }
    }
  }

  function drawWorld() {
    ctx.save();
    ctx.translate(-cameraX, 0);
    // 地面タイル
    for (const [x1, x2] of stage.ground) {
      ctx.fillStyle = "#795238"; ctx.fillRect(x1, GROUND_Y, x2 - x1, 110);
      ctx.fillStyle = "#68a34e"; ctx.fillRect(x1, GROUND_Y - 8, x2 - x1, 10);
      ctx.fillStyle = "#91c65d";
      for (let x = x1; x < x2; x += 32) ctx.fillRect(x, GROUND_Y - 8, 16, 4);
      ctx.strokeStyle = "#533b30"; ctx.lineWidth = 2;
      for (let x = x1 + 12; x < x2; x += 48) { ctx.strokeRect(x, GROUND_Y + 15, 20, 18); ctx.strokeRect(x + 18, GROUND_Y + 45, 22, 16); }
    }
    // 山：三角形の斜面。斜面角度はステージ生成時に10〜45度で決定。
    for (const hill of (stage.hills || [])) {
      ctx.fillStyle = "#795238";
      ctx.beginPath();
      ctx.moveTo(hill.x, GROUND_Y);
      ctx.lineTo(hill.x + hill.w / 2, GROUND_Y - hill.h);
      ctx.lineTo(hill.x + hill.w, GROUND_Y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#68a34e";
      ctx.lineWidth = 8;
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(hill.x, GROUND_Y);
      ctx.lineTo(hill.x + hill.w / 2, GROUND_Y - hill.h);
      ctx.lineTo(hill.x + hill.w, GROUND_Y);
      ctx.stroke();
      ctx.strokeStyle = "#91c65d";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(hill.x + 5, GROUND_Y - 2);
      ctx.lineTo(hill.x + hill.w / 2, GROUND_Y - hill.h + 5);
      ctx.lineTo(hill.x + hill.w - 5, GROUND_Y - 2);
      ctx.stroke();
    }

    // 足場
    for (const [x, y, width] of stage.platforms) {
      ctx.fillStyle = "#795238"; ctx.fillRect(x, y, width, 13);
      ctx.fillStyle = "#79b957"; ctx.fillRect(x, y, width, 6);
      ctx.fillStyle = "#b0d779"; ctx.fillRect(x + 5, y + 2, width - 10, 2);
    }
    // トゲ
    for (const [x, y, w, h] of stage.hazards) {
      ctx.fillStyle = "#d9d9c7";
      for (let sx = x; sx < x + w; sx += 14) {
        ctx.beginPath(); ctx.moveTo(sx, y + h); ctx.lineTo(sx + 7, y); ctx.lineTo(sx + 14, y + h); ctx.fill();
      }
      ctx.fillStyle = "#9b3434"; ctx.fillRect(x, y + h - 4, w, 4);
    }
    // アイテムボックス
    for (const box of itemBoxes) {
      ctx.fillStyle = box.used ? "#8b7954" : "#d99535";
      ctx.fillRect(box.x, box.y, box.w, box.h);
      ctx.fillStyle = box.used ? "#665b48" : "#f6d36e";
      ctx.fillRect(box.x + 3, box.y + 3, box.w - 6, box.h - 6);
      ctx.fillStyle = box.used ? "#8b7954" : "#75431f";
      ctx.font = "bold 21px monospace"; ctx.textAlign = "center";
      ctx.fillText(box.used ? "·" : "?", box.x + box.w / 2, box.y + 22);
    }
    // ボックスから出てくるアイテム
    for (const item of fallingItems) {
      if (item.kind === "coin") {
        ctx.fillStyle = "#f3c94e"; ctx.beginPath(); ctx.ellipse(item.x + 10, item.y + 11, 7, 10, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#fff0a3"; ctx.fillRect(item.x + 8, item.y + 5, 3, 7);
      } else {
        // 背景透過PNGの架空の巨大化リーフ。画像ファイル名は POWERUP_IMAGE_PATH で変更できる。
        if (powerupImage.complete && powerupImage.naturalWidth > 0) {
          ctx.save();
          ctx.imageSmoothingEnabled = false;
          // 元画像の比率（3:2）を維持。ボックスから左右にはみ出して表示する。
          const leafW = 54;
          const leafH = 36;
          ctx.drawImage(
            powerupImage,
            item.x + item.w / 2 - leafW / 2,
            item.y + item.h / 2 - leafH / 2,
            leafW,
            leafH
          );
          ctx.restore();
        } else {
          // 画像読み込み前・読み込み失敗時の簡易表示
          ctx.fillStyle = "#56bd35";
          ctx.beginPath();
          ctx.ellipse(item.x + item.w / 2, item.y + item.h / 2, 8, 11, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // コイン
    for (const coin of coins) if (!coin.taken) {
      ctx.fillStyle = "#f3c94e"; ctx.beginPath(); ctx.ellipse(coin.x, coin.y, 7, 10, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff0a3"; ctx.fillRect(coin.x - 2, coin.y - 6, 3, 7);
    }
    // 地面歩行型の敵（禍々しい小型モンスター）
    for (const enemy of enemies) {
      ctx.fillStyle = "#211827";
      ctx.fillRect(enemy.x + 5, enemy.y + 9, 25, 18);
      ctx.fillStyle = "#49304f";
      ctx.fillRect(enemy.x + 2, enemy.y + 13, 30, 14);
      ctx.fillRect(enemy.x + 8, enemy.y + 3, 18, 13);
      // 角
      ctx.fillStyle = "#17131d";
      ctx.beginPath(); ctx.moveTo(enemy.x + 8, enemy.y + 8); ctx.lineTo(enemy.x + 4, enemy.y - 5); ctx.lineTo(enemy.x + 15, enemy.y + 5); ctx.fill();
      ctx.beginPath(); ctx.moveTo(enemy.x + 25, enemy.y + 8); ctx.lineTo(enemy.x + 31, enemy.y - 5); ctx.lineTo(enemy.x + 20, enemy.y + 5); ctx.fill();
      // 目と口
      ctx.fillStyle = "#ff3b54";
      ctx.fillRect(enemy.x + 10, enemy.y + 11, 5, 4);
      ctx.fillRect(enemy.x + 21, enemy.y + 11, 5, 4);
      ctx.fillStyle = "#09090d";
      ctx.fillRect(enemy.x + 13, enemy.y + 21, 10, 3);
      ctx.fillStyle = "#d7c7d9";
      ctx.fillRect(enemy.x + 15, enemy.y + 21, 2, 3);
      ctx.fillRect(enemy.x + 20, enemy.y + 21, 2, 3);
      // 足
      ctx.fillStyle = "#17131d";
      ctx.fillRect(enemy.x + 8, enemy.y + 26, 6, 4);
      ctx.fillRect(enemy.x + 23, enemy.y + 26, 6, 4);
    }
    // ゴール旗
    ctx.fillStyle = "#55483b"; ctx.fillRect(stage.goalX, 290, 7, GROUND_Y - 290);
    ctx.fillStyle = "#e7d46a"; ctx.fillRect(stage.goalX + 7, 295, 55, 30);
    ctx.fillStyle = "#4b7f53"; ctx.fillRect(stage.goalX + 7, 295, 8, 30);
    // プレイヤー：巨大化中は縦方向だけ2倍に引き伸ばす。
    ctx.save();
    if (player.invulnerable > 0 && Math.floor(performance.now() / 100) % 2 === 0) ctx.globalAlpha = 0.42;
    ctx.translate(player.x, player.y);
    ctx.scale(1, player.big ? 2 : 1);
    ctx.fillStyle = "#263a48"; ctx.fillRect(0, 0, player.w, PLAYER_BASE_H);
    ctx.fillStyle = "#e9b98b"; ctx.fillRect(5, 3, 14, 10);
    ctx.fillStyle = "#f0e4c9"; ctx.fillRect(4, 15, 16, 10);
    ctx.fillStyle = "#9d493b"; ctx.fillRect(3, 26, 7, 4); ctx.fillRect(15, 26, 7, 4);
    ctx.fillStyle = "#25313a"; ctx.fillRect(15, 6, 3, 3);
    ctx.restore();
    ctx.restore();
  }

  function draw() {
    drawBackground();
    if (stage && player) drawWorld();
  }

  function loop(now) {
    if (!running) { draw(); return; }
    const dt = Math.min(.04, (now - lastTime) / 1000 || 0);
    lastTime = now;
    update(dt);
    draw();
    if (running) requestAnimationFrame(loop);
  }

  document.getElementById("start-button").addEventListener("click", startGame);
  document.getElementById("reset-record-button").addEventListener("click", () => {
    if (!window.confirm("累計死亡回数を0にリセットします。よろしいですか？")) return;
    deaths = 0;
    localStorage.removeItem("unfairAdventureDeaths");
    deathCountLabel.textContent = "DEATHS: 0";
  });
  document.getElementById("retry-button").addEventListener("click", startGame);
  document.getElementById("quit-button").addEventListener("click", showHome);
  document.getElementById("home-button").addEventListener("click", showHome);
  document.getElementById("next-button").addEventListener("click", () => {
    stageNumber++;
    currentStage = null;
    startGame();
  });

  window.addEventListener("keydown", e => {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "Space"].includes(e.code)) e.preventDefault();
    keys.add(e.code);
  });
  window.addEventListener("keyup", e => keys.delete(e.code));
  window.addEventListener("blur", () => keys.clear());
  document.addEventListener("contextmenu", e => e.preventDefault());
  document.addEventListener("selectstart", e => e.preventDefault());
  document.addEventListener("dragstart", e => e.preventDefault());

  document.querySelectorAll("#touch-controls button").forEach(button => {
    const key = button.dataset.key;
    const down = e => { e.preventDefault(); keys.add(key); };
    const up = e => { e.preventDefault(); keys.delete(key); };
    button.addEventListener("pointerdown", down);
    button.addEventListener("pointerup", up);
    button.addEventListener("pointercancel", up);
    button.addEventListener("pointerleave", up);
  });

  showHome();
})();