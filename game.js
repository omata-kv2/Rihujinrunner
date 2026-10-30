(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
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
  let stageIndex = 0;
  let deaths = Number(localStorage.getItem("unfairAdventureDeaths") || 0);
  if (!Number.isFinite(deaths) || deaths < 0) deaths = 0;
  let running = false, lastTime = 0;
  let stage, player, cameraX, hiddenRules, stats, coins, enemies, deathReason;

  function resetStage() {
    stage = STAGES[stageIndex];
    player = { x: 70, y: 390, w: 26, h: 38, vx: 0, vy: 0, onGround: false, startY: 390 };
    cameraX = 0;
    hiddenRules = chooseHiddenRules();
    stats = { run: 0, stand: 0, jumps: 0, turns: 0, alive: 0, fallStart: null, coins: 0, lastDir: 0 };
    coins = [520, 1040, 1450, 1850, 2140, 2660, 3010].map(x => ({ x, y: 420, taken: false }));
    // 地面区間ごとに敵を配置。巡回範囲を地面の内側に限定して崖から落ちない。
    enemies = stage.ground
      .filter(([x1, x2]) => x2 - x1 >= 420)
      .map(([x1, x2]) => {
        const w = 34, h = 30;
        const minX = x1 + 12, maxX = x2 - w - 12;
        const startX = Math.min(maxX, Math.max(minX, x1 + Math.min(260, (x2 - x1 - w) / 2)));
        return { x: startX, y: 450, w, h, minX, maxX, dir: 1, speed: 58 };
      });
    stageLabel.textContent = `STAGE ${String(stageIndex + 1).padStart(2, "0")} : ${stage.name}`;
    progressLabel.textContent = "0%";
    deathCountLabel.textContent = `DEATHS: ${deaths}`;
  }

  function showHome() {
    running = false;
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
    deathLog.innerHTML = `<div>死因：${escapeHtml(cause)}</div><div>ステージ：${stageIndex + 1} - ${escapeHtml(stage.name)}</div><div>到達地点：ゴールまで ${progress}%</div><div>今回の隠しルール：${hiddenRules.length}個（内容は非公開）</div><div>累計死亡回数：${deaths}</div>`;
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
    document.getElementById("clear-message").textContent = `${stage.name}を突破。死亡回数：${deaths}`;
    winScreen.classList.remove("hidden");
  }

  function update(dt) {
    stats.alive += dt;
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
    player.vy += 1450 * dt;
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    player.x = Math.max(0, Math.min(stage.width - player.w, player.x));

    // 地面と穴
    player.onGround = false;
    const feet = player.y + player.h;
    for (const [x1, x2] of stage.ground) {
      if (player.x + player.w > x1 && player.x < x2 && previousY + player.h <= 480 && feet >= 480 && player.vy >= 0) {
        player.y = 480 - player.h;
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
      if (rule.id === "run_too_long" && stats.run >= rule.threshold) return die("rule", rule.id);
      if (rule.id === "jump_too_much" && stats.jumps >= rule.threshold) return die("rule", rule.id);
      if (rule.id === "stand_too_long" && stats.stand >= rule.threshold) return die("rule", rule.id);
      if (rule.id === "turn_too_much" && stats.turns >= rule.threshold) return die("rule", rule.id);
      if (rule.id === "time_limit" && stats.alive >= rule.threshold) return die("rule", rule.id);
      if (rule.id === "fall_too_far" && stats.fallStart !== null && player.y - stats.fallStart >= rule.threshold) return die("rule", rule.id);
      if (rule.id === "coin_greed" && stats.coins >= rule.threshold) return die("rule", rule.id);
    }

    // 隠しルールとは独立したランダム即死
    if (rollIndependentDeath(dt)) return die("random", "independent");

    // 通常の死亡判定
    if (player.y > H + 90) return die("normal", "pit");
    for (const enemy of enemies) {
      if (player.x + player.w > enemy.x && player.x < enemy.x + enemy.w &&
          player.y + player.h > enemy.y && player.y < enemy.y + enemy.h) {
        return die("normal", "enemy");
      }
    }
    for (const [x, y, w, h] of stage.hazards) {
      if (player.x + player.w > x && player.x < x + w && player.y + player.h > y && player.y < y + h) return die("normal", "hazard");
    }
    if (player.x >= stage.goalX) win();
  }

  function drawBackground() {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#78b6d1"); sky.addColorStop(1, "#d8d5a0");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    // 遠景の丘
    ctx.fillStyle = "#719b78";
    for (let i = -1; i < 7; i++) {
      const x = i * 230 - (cameraX * .22 % 230);
      ctx.beginPath(); ctx.moveTo(x, 390); ctx.quadraticCurveTo(x + 110, 220, x + 230, 390); ctx.fill();
    }
    // 雲
    ctx.fillStyle = "#f1f0d8";
    for (let i = 0; i < 8; i++) {
      const x = (i * 190 - cameraX * .12) % (W + 150);
      const xx = x < -100 ? x + W + 150 : x;
      ctx.fillRect(xx, 90 + (i % 3) * 34, 62, 13);
      ctx.fillRect(xx + 14, 78 + (i % 3) * 34, 35, 13);
    }
  }

  function drawWorld() {
    ctx.save();
    ctx.translate(-cameraX, 0);
    // 地面タイル
    for (const [x1, x2] of stage.ground) {
      ctx.fillStyle = "#795238"; ctx.fillRect(x1, 480, x2 - x1, 90);
      ctx.fillStyle = "#68a34e"; ctx.fillRect(x1, 472, x2 - x1, 10);
      ctx.fillStyle = "#91c65d";
      for (let x = x1; x < x2; x += 32) ctx.fillRect(x, 472, 16, 4);
      ctx.strokeStyle = "#533b30"; ctx.lineWidth = 2;
      for (let x = x1 + 12; x < x2; x += 48) { ctx.strokeRect(x, 495, 20, 18); ctx.strokeRect(x + 18, 525, 22, 16); }
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
    ctx.fillStyle = "#55483b"; ctx.fillRect(stage.goalX, 340, 7, 140);
    ctx.fillStyle = "#e7d46a"; ctx.fillRect(stage.goalX + 7, 345, 55, 30);
    ctx.fillStyle = "#4b7f53"; ctx.fillRect(stage.goalX + 7, 345, 8, 30);
    // プレイヤー
    ctx.fillStyle = "#263a48"; ctx.fillRect(player.x, player.y, player.w, player.h);
    ctx.fillStyle = "#e9b98b"; ctx.fillRect(player.x + 5, player.y + 4, 16, 13);
    ctx.fillStyle = "#f0e4c9"; ctx.fillRect(player.x + 4, player.y + 20, 18, 13);
    ctx.fillStyle = "#9d493b"; ctx.fillRect(player.x + 3, player.y + 33, 8, 5); ctx.fillRect(player.x + 16, player.y + 33, 8, 5);
    ctx.fillStyle = "#25313a"; ctx.fillRect(player.x + 16, player.y + 8, 3, 3);
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
    stageIndex = (stageIndex + 1) % STAGES.length;
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