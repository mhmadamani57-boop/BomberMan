(() => {
  'use strict';

  const TILE = Object.freeze({ EMPTY: 0, WALL: 1, BLOCK: 2, BOMB: 3 });
  const GRID_SIZE = 15;
  const MAX_LIVES = 3;
  const FLOOR_TEXTURE_URL = 'design/floor-tile.png';
  const DEMO_MODE = new URLSearchParams(window.location.search).has('demo');
  const COLORS = Object.freeze({
    bg: '#071543', floor: '#0b2460', grid: 'rgba(69, 211, 255, 0.16)', wall: '#1d62cf', wallDark: '#0e2c78', wallLight: '#51d6ff',
    block: '#c75e23', blockDark: '#723019', blockLight: '#ffb13e', player: '#39bfff', playerDark: '#1767d8', enemy: '#ef405c', enemyDark: '#8b1e56',
    bomb: '#0a0e24', bombLight: '#6f87af', flame: '#ffe45e', flameHot: '#fff6d0', orange: '#ff762e', cyan: '#45e4ff', pink: '#ff47d1', green: '#56efb1', text: '#ecfaff'
  });

  const $ = (id) => document.getElementById(id);
  const canvas = $('gameCanvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const arena = $('game-container');
  const floorTexture = new Image();
  let floorPattern = null;
  floorTexture.onload = () => { floorPattern = ctx.createPattern(floorTexture, 'repeat'); };
  floorTexture.onerror = () => { floorPattern = null; };
  floorTexture.src = FLOOR_TEXTURE_URL;

  let cellSize = 40;
  let boardSize = GRID_SIZE * cellSize;
  let map = [];
  let bombs = [];
  let explosions = [];
  let entities = [];
  let powerups = [];
  let particles = [];
  let exitPos = { x: -1, y: -1, revealed: false };
  let gameState = 'START';
  let currentLevel = 1;
  let score = 0;
  let bestScore = readBestScore();
  let animationId = 0;
  let lastTime = 0;
  let bombId = 0;
  let respawnTimer = null;
  let shakeMs = 0;
  let demoClock = 0;
  let soundEnabled = true;
  let audioContext = null;

  const player = {
    x: 1.12, y: 1.12, width: 0.76, height: 0.76, speed: 4.15, maxBombs: 1, flameLength: 2,
    lives: MAX_LIVES, direction: 'down', moving: false, invulnerableMs: 0, dead: false, escapeBombId: null, anim: 0
  };

  const keys = { up: false, down: false, left: false, right: false };

  function readBestScore() {
    try { return Number(localStorage.getItem('bomberman-best-score') || 0); } catch { return 0; }
  }

  function saveBestScore() {
    if (score <= bestScore) return;
    bestScore = score;
    try { localStorage.setItem('bomberman-best-score', String(bestScore)); } catch { /* storage can be disabled */ }
  }

  function calculateLayout() {
    const horizontal = window.innerWidth - 28;
    const vertical = window.innerHeight - (window.innerWidth <= 700 ? 205 : 175);
    const maxBoard = Math.max(300, Math.min(horizontal, vertical, 640));
    cellSize = Math.max(20, Math.floor(maxBoard / GRID_SIZE));
    boardSize = cellSize * GRID_SIZE;
    document.documentElement.style.setProperty('--board-size', `${boardSize}px`);
    canvas.width = boardSize;
    canvas.height = boardSize;
  }

  function setScreen(screenId, visible) { $(screenId).classList.toggle('hidden', !visible); }

  function init() {
    calculateLayout();
    window.addEventListener('resize', calculateLayout, { passive: true });
    bindKeyboard();
    bindButtons();
    bindTouchControls();
    if (window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0) $('mobile-controls').style.display = 'flex';
    updateHUD();
    updateArenaStatus('READY // INSERT COIN');
    render();
    if (DEMO_MODE) window.setTimeout(() => resetGame(), 450);
    animationId = requestAnimationFrame(gameLoop);
  }

  function resetGame() {
    clearInput();
    currentLevel = 1;
    score = 0;
    player.lives = MAX_LIVES;
    player.maxBombs = 1;
    player.flameLength = 2;
    startLevel();
    playTone(220, 0.08, 'sine');
  }

  function startLevel() {
    clearInput();
    player.x = 1.12; player.y = 1.12; player.dead = false; player.escapeBombId = null; player.invulnerableMs = 1800; player.anim = 0;
    bombs = []; explosions = []; entities = []; powerups = []; particles = []; exitPos = { x: -1, y: -1, revealed: false };
    generateMap();
    spawnEnemies();
    gameState = 'PLAYING';
    demoClock = 0;
    hideAllScreens();
    updateArenaStatus(`SECTOR ${String(currentLevel).padStart(2, '0')} // LIVE`);
    updateHUD();
  }

  function generateMap() {
    map = Array.from({ length: GRID_SIZE }, (_, y) => Array.from({ length: GRID_SIZE }, (_, x) => {
      if (x === 0 || y === 0 || x === GRID_SIZE - 1 || y === GRID_SIZE - 1 || (x % 2 === 0 && y % 2 === 0)) return TILE.WALL;
      if ((x <= 2 && y <= 2) || (x === 3 && y === 1) || (x === 1 && y === 3)) return TILE.EMPTY;
      return Math.random() < Math.min(0.58 + (currentLevel - 1) * 0.015, 0.7) ? TILE.BLOCK : TILE.EMPTY;
    }));

    const reachable = floodFill(1, 1);
    const blockCandidates = [];
    const powerCandidates = [];
    for (let y = 1; y < GRID_SIZE - 1; y++) {
      for (let x = 1; x < GRID_SIZE - 1; x++) {
        if (map[y][x] !== TILE.BLOCK) continue;
        const nearReachable = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].some(([nx, ny]) => reachable.has(`${nx},${ny}`));
        if (nearReachable && !(x < 4 && y < 4)) blockCandidates.push({ x, y });
      }
    }
    shuffle(blockCandidates);
    const fallbackExit = { x: GRID_SIZE - 2, y: GRID_SIZE - 2 };
    if (!blockCandidates.length && map[fallbackExit.y][fallbackExit.x] === TILE.EMPTY) map[fallbackExit.y][fallbackExit.x] = TILE.BLOCK;
    exitPos = blockCandidates.pop() || fallbackExit;
    exitPos.revealed = false;
    shuffle(blockCandidates);
    const upgrades = Math.min(3, blockCandidates.length);
    for (let i = 0; i < upgrades; i++) {
      const pos = blockCandidates[i];
      powerups.push({ x: pos.x, y: pos.y, type: i % 2 === 0 ? 'bomb' : 'flame', revealed: false, pulse: Math.random() * Math.PI * 2 });
    }
  }

  function floodFill(startX, startY) {
    const result = new Set([`${startX},${startY}`]);
    const queue = [[startX, startY]];
    while (queue.length) {
      const [x, y] = queue.shift();
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= GRID_SIZE || ny >= GRID_SIZE || map[ny][nx] !== TILE.EMPTY) continue;
        const key = `${nx},${ny}`;
        if (!result.has(key)) { result.add(key); queue.push([nx, ny]); }
      }
    }
    return result;
  }

  function spawnEnemies() {
    const reachable = [...floodFill(1, 1)].map((key) => key.split(',').map(Number)).filter(([x, y]) => x > 4 || y > 4);
    shuffle(reachable);
    const count = Math.min(2 + currentLevel, 7);
    for (const [x, y] of reachable) {
      if (entities.length >= count) break;
      if (distance(x + .5, y + .5, player.x + .38, player.y + .38) < 5) continue;
      entities.push({ x: x + .15, y: y + .15, width: .7, height: .7, speed: 1.28 + currentLevel * .12, axis: Math.random() > .5 ? 'h' : 'v', dir: Math.random() > .5 ? 1 : -1, phase: Math.random() * 10, turnCooldown: 0 });
    }
  }

  function shuffle(array) { for (let i = array.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [array[i], array[j]] = [array[j], array[i]]; } return array; }
  function distance(x1, y1, x2, y2) { return Math.hypot(x1 - x2, y1 - y2); }
  function getCell(x, y) { if (x < 0 || y < 0 || x >= GRID_SIZE || y >= GRID_SIZE) return TILE.WALL; return map[y][x]; }
  function bombAt(x, y) { return bombs.find((bomb) => bomb.x === x && bomb.y === y); }
  function isWalkableCell(x, y) { return getCell(x, y) === TILE.EMPTY; }
  function rectIntersect(x1, y1, w1, h1, x2, y2, w2, h2) { return x2 < x1 + w1 && x2 + w2 > x1 && y2 < y1 + h1 && y2 + h2 > y1; }

  function checkMapCollision(x, y, width, height, allowPlayerEscape = false) {
    const inset = .08;
    const corners = [[x + inset, y + inset], [x + width - inset, y + inset], [x + inset, y + height - inset], [x + width - inset, y + height - inset]];
    for (const [px, py] of corners) {
      const cx = Math.floor(px), cy = Math.floor(py);
      const tile = getCell(cx, cy);
      if (tile === TILE.WALL || tile === TILE.BLOCK) return true;
      if (tile === TILE.BOMB && !allowPlayerEscape) return true;
      if (tile === TILE.BOMB && allowPlayerEscape) {
        const bomb = bombAt(cx, cy);
        const centerOutside = Math.floor(x + width / 2) !== cx || Math.floor(y + height / 2) !== cy;
        if (!bomb || (player.escapeBombId !== bomb.id && !centerOutside)) return true;
      }
    }
    return false;
  }

  function updatePlayer(dt) {
    if (player.dead) return;
    const speed = player.speed * dt / 1000;
    let dx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    let dy = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
    player.moving = Boolean(dx || dy);
    if (dx || dy) {
      player.anim += dt * .012;
      if (Math.abs(dx) > Math.abs(dy)) player.direction = dx > 0 ? 'right' : 'left'; else player.direction = dy > 0 ? 'down' : 'up';
      if (dx && dy) { const len = Math.hypot(dx, dy); dx /= len; dy /= len; }
      movePlayerAxis(dx * speed, 0);
      movePlayerAxis(0, dy * speed);
    }
    if (player.escapeBombId !== null) {
      const safeBomb = bombs.find((bomb) => bomb.id === player.escapeBombId);
      if (!safeBomb || Math.floor(player.x + player.width / 2) !== safeBomb.x || Math.floor(player.y + player.height / 2) !== safeBomb.y) player.escapeBombId = null;
    }
    if (player.invulnerableMs > 0) player.invulnerableMs -= dt;
    collectPowerups();
    const px = Math.floor(player.x + player.width / 2), py = Math.floor(player.y + player.height / 2);
    if (exitPos.revealed && px === exitPos.x && py === exitPos.y && entities.length === 0 && explosions.length === 0) levelComplete();
  }

  function movePlayerAxis(dx, dy) {
    if (!dx && !dy) return;
    const nextX = player.x + dx, nextY = player.y + dy;
    if (!checkMapCollision(nextX, nextY, player.width, player.height, true)) { player.x = nextX; player.y = nextY; return; }
    if (dx && !checkMapCollision(player.x, nextY, player.width, player.height, true)) player.y = nextY;
    if (dy && !checkMapCollision(nextX, player.y, player.width, player.height, true)) player.x = nextX;
    player.x = Math.max(.06, Math.min(GRID_SIZE - player.width - .06, player.x));
    player.y = Math.max(.06, Math.min(GRID_SIZE - player.height - .06, player.y));
  }

  function collectPowerups() {
    const px = Math.floor(player.x + player.width / 2), py = Math.floor(player.y + player.height / 2);
    for (let i = powerups.length - 1; i >= 0; i--) {
      const power = powerups[i];
      if (!power.revealed || power.x !== px || power.y !== py) continue;
      if (power.type === 'bomb') player.maxBombs++;
      else player.flameLength++;
      score += 75; spawnText(power.x + .5, power.y + .25, power.type === 'bomb' ? 'BOMB +1' : 'FLAME +1', COLORS.green); spawnBurst(power.x + .5, power.y + .5, COLORS.green, 10); powerups.splice(i, 1); updateHUD(); playTone(620, .1, 'triangle');
    }
  }

  function placeBomb() {
    if (gameState !== 'PLAYING' || player.dead) return;
    if (bombs.length >= player.maxBombs) { spawnText(player.x + .4, player.y, 'ARMORY FULL', COLORS.yellow); return; }
    const x = Math.floor(player.x + player.width / 2), y = Math.floor(player.y + player.height / 2);
    if (getCell(x, y) !== TILE.EMPTY || bombAt(x, y)) return;
    const bomb = { id: ++bombId, x, y, timer: 2850, flameLength: player.flameLength, pulse: 0 };
    map[y][x] = TILE.BOMB; bombs.push(bomb); player.escapeBombId = bomb.id; updateHUD(); playTone(110, .09, 'square');
  }

  function updateBombs(dt) {
    for (let i = bombs.length - 1; i >= 0; i--) {
      bombs[i].timer -= dt; bombs[i].pulse += dt * .012;
      if (bombs[i].timer <= 0) explodeBomb(i);
    }
  }

  function explodeBomb(index) {
    const bomb = bombs.splice(index, 1)[0];
    map[bomb.y][bomb.x] = TILE.EMPTY;
    const explosion = { cells: [{ x: bomb.x, y: bomb.y, kind: 'center' }], age: 0, life: 520, didDamage: false };
    const dirs = [{ dx: 0, dy: -1, axis: 'v' }, { dx: 0, dy: 1, axis: 'v' }, { dx: -1, dy: 0, axis: 'h' }, { dx: 1, dy: 0, axis: 'h' }];
    for (const dir of dirs) {
      for (let step = 1; step <= bomb.flameLength; step++) {
        const x = bomb.x + dir.dx * step, y = bomb.y + dir.dy * step, tile = getCell(x, y);
        if (tile === TILE.WALL) break;
        const isEnd = step === bomb.flameLength;
        if (tile === TILE.BLOCK) {
          map[y][x] = TILE.EMPTY; explosion.cells.push({ x, y, kind: isEnd ? `${dir.axis}-end` : dir.axis });
          revealAt(x, y); score += 10; spawnBurst(x + .5, y + .5, COLORS.blockLight, 12); break;
        }
        if (tile === TILE.BOMB) {
          const chain = bombAt(x, y); if (chain) chain.timer = Math.min(chain.timer, 45); break;
        }
        explosion.cells.push({ x, y, kind: isEnd ? `${dir.axis}-end` : dir.axis });
      }
    }
    explosions.push(explosion); shakeMs = Math.max(shakeMs, 150); spawnBurst(bomb.x + .5, bomb.y + .5, COLORS.orange, 18); updateHUD(); playTone(72, .13, 'sawtooth');
  }

  function revealAt(x, y) {
    if (exitPos.x === x && exitPos.y === y) { exitPos.revealed = true; spawnText(x + .5, y, 'EXIT FOUND', COLORS.green); }
    for (const power of powerups) if (power.x === x && power.y === y) { power.revealed = true; spawnText(x + .5, y, power.type === 'bomb' ? 'BOMB CORE' : 'FLAME CORE', COLORS.cyan); }
  }

  function updateExplosions(dt) {
    for (let i = explosions.length - 1; i >= 0; i--) {
      const explosion = explosions[i]; explosion.age += dt; explosion.life -= dt;
      if (!explosion.didDamage && explosion.age < 170) { explosion.didDamage = true; applyExplosionDamage(explosion); }
      if (explosion.life <= 0) explosions.splice(i, 1);
    }
  }

  function applyExplosionDamage(explosion) {
    for (const cell of explosion.cells) {
      for (let i = entities.length - 1; i >= 0; i--) {
        const enemy = entities[i];
        if (!rectIntersect(cell.x, cell.y, 1, 1, enemy.x, enemy.y, enemy.width, enemy.height)) continue;
        entities.splice(i, 1); score += 150; spawnText(enemy.x + .3, enemy.y, '150', COLORS.yellow); spawnBurst(enemy.x + .45, enemy.y + .45, COLORS.enemy, 18);
      }
      if (!player.dead && player.invulnerableMs <= 0 && rectIntersect(cell.x, cell.y, 1, 1, player.x + .16, player.y + .16, player.width - .32, player.height - .32)) killPlayer();
    }
    updateHUD();
  }

  function updateEnemies(dt) {
    for (const enemy of entities) {
      enemy.phase += dt * .006; enemy.turnCooldown -= dt;
      const speed = enemy.speed * dt / 1000;
      const dx = enemy.axis === 'h' ? enemy.dir * speed : 0, dy = enemy.axis === 'v' ? enemy.dir * speed : 0;
      if (!checkMapCollision(enemy.x + dx, enemy.y + dy, enemy.width, enemy.height, false)) { enemy.x += dx; enemy.y += dy; }
      else chooseEnemyDirection(enemy);
      if (enemy.turnCooldown <= 0 && Math.random() < .018) chooseEnemyDirection(enemy);
      if (!player.dead && player.invulnerableMs <= 0 && rectIntersect(enemy.x, enemy.y, enemy.width, enemy.height, player.x + .18, player.y + .18, player.width - .36, player.height - .36)) killPlayer();
    }
  }

  function chooseEnemyDirection(enemy) {
    const cx = Math.floor(enemy.x + enemy.width / 2), cy = Math.floor(enemy.y + enemy.height / 2);
    const options = [];
    if (isWalkableCell(cx + 1, cy)) options.push({ axis: 'h', dir: 1 });
    if (isWalkableCell(cx - 1, cy)) options.push({ axis: 'h', dir: -1 });
    if (isWalkableCell(cx, cy + 1)) options.push({ axis: 'v', dir: 1 });
    if (isWalkableCell(cx, cy - 1)) options.push({ axis: 'v', dir: -1 });
    if (options.length) Object.assign(enemy, options[Math.floor(Math.random() * options.length)]);
    else enemy.dir *= -1;
    enemy.x = Math.round(enemy.x * 2) / 2; enemy.y = Math.round(enemy.y * 2) / 2; enemy.turnCooldown = 240;
  }

  function killPlayer() {
    if (player.dead || player.invulnerableMs > 0) return;
    player.dead = true; clearInput(); spawnBurst(player.x + .38, player.y + .38, COLORS.player, 24); spawnText(player.x + .25, player.y, 'SYSTEM HIT', COLORS.danger || '#ff557a'); shakeMs = 380; playTone(55, .22, 'sawtooth');
    respawnTimer = window.setTimeout(() => {
      player.lives--;
      if (player.lives <= 0) gameOver();
      else { player.x = 1.12; player.y = 1.12; player.dead = false; player.invulnerableMs = 3000; player.escapeBombId = null; updateHUD(); }
    }, 900);
  }

  function gameOver() {
    if (respawnTimer) { clearTimeout(respawnTimer); respawnTimer = null; }
    gameState = 'GAMEOVER'; player.dead = true; saveBestScore(); $('final-score').textContent = `FINAL SCORE: ${String(score).padStart(6, '0')}`; setScreen('game-over-screen', true); updateArenaStatus('SIGNAL LOST // REBOOT REQUIRED'); updateHUD();
  }

  function levelComplete() {
    if (gameState !== 'PLAYING') return;
    gameState = 'LEVELCOMPLETE'; score += 1000 + currentLevel * 125; updateArenaStatus('EXIT SIGNAL CONFIRMED // SECTOR CLEAR'); saveBestScore(); $('level-summary').textContent = `SECTOR ${String(currentLevel).padStart(2, '0')} COMPLETE // +${1000 + currentLevel * 125}`; setScreen('level-complete-screen', true); updateHUD(); playTone(520, .18, 'triangle');
  }

  function updateHUD() {
    $('score-display').textContent = String(score).padStart(6, '0'); $('best-display').textContent = String(Math.max(bestScore, score)).padStart(6, '0');
    $('lives-display').innerHTML = Array.from({ length: MAX_LIVES }, (_, index) => `<span class="${index < player.lives ? '' : 'empty-heart'}">♥</span>`).join('');
    $('bomb-display').textContent = `${Math.max(0, player.maxBombs - bombs.length)} / ${player.maxBombs}`; $('level-display').textContent = String(currentLevel).padStart(2, '0');
    const progress = Math.max(0, Math.min(1, 1 - (entities.length / Math.max(1, 2 + currentLevel)))); $('progress-fill').style.width = `${Math.round(progress * 100)}%`;
  }

  function updateArenaStatus(text) { $('arena-status').textContent = text; }
  function hideAllScreens() { setScreen('start-screen', false); setScreen('pause-screen', false); setScreen('game-over-screen', false); setScreen('level-complete-screen', false); }

  function togglePause() {
    if (gameState === 'PLAYING') { gameState = 'PAUSED'; setScreen('pause-screen', true); updateArenaStatus('SYSTEM HOLD // PAUSED'); }
    else if (gameState === 'PAUSED') { gameState = 'PLAYING'; setScreen('pause-screen', false); updateArenaStatus(`SECTOR ${String(currentLevel).padStart(2, '0')} // LIVE`); lastTime = performance.now(); }
  }

  function bindKeyboard() {
    window.addEventListener('keydown', (event) => {
      const key = event.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) event.preventDefault();
      if (key === 'w' || key === 'arrowup') keys.up = true;
      if (key === 's' || key === 'arrowdown') keys.down = true;
      if (key === 'a' || key === 'arrowleft') keys.left = true;
      if (key === 'd' || key === 'arrowright') keys.right = true;
      if (event.code === 'Space' && !event.repeat) placeBomb();
      if ((key === 'p' || key === 'escape') && !event.repeat) togglePause();
      if (key === 'm' && !event.repeat) toggleSound();
    }, { passive: false });
    window.addEventListener('keyup', (event) => {
      const key = event.key.toLowerCase();
      if (key === 'w' || key === 'arrowup') keys.up = false;
      if (key === 's' || key === 'arrowdown') keys.down = false;
      if (key === 'a' || key === 'arrowleft') keys.left = false;
      if (key === 'd' || key === 'arrowright') keys.right = false;
    });
    window.addEventListener('blur', clearInput);
  }

  function bindButtons() {
    $('start-btn').addEventListener('click', resetGame); $('restart-btn').addEventListener('click', resetGame); $('next-level-btn').addEventListener('click', () => { currentLevel++; startLevel(); }); $('resume-btn').addEventListener('click', togglePause); $('pause-btn').addEventListener('click', togglePause); $('sound-btn').addEventListener('click', toggleSound);
  }

  function bindTouchControls() {
    const controls = [['btn-up', 'up'], ['btn-down', 'down'], ['btn-left', 'left'], ['btn-right', 'right']];
    for (const [id, direction] of controls) {
      const button = $(id);
      const press = (event) => { event.preventDefault(); keys[direction] = true; button.classList.add('active'); button.setPointerCapture?.(event.pointerId); };
      const release = (event) => { event.preventDefault(); keys[direction] = false; button.classList.remove('active'); };
      button.addEventListener('pointerdown', press, { passive: false }); button.addEventListener('pointerup', release, { passive: false }); button.addEventListener('pointercancel', release, { passive: false }); button.addEventListener('pointerleave', release, { passive: false });
    }
    $('btn-bomb-mobile').addEventListener('pointerdown', (event) => { event.preventDefault(); placeBomb(); });
  }

  function clearInput() { keys.up = keys.down = keys.left = keys.right = false; document.querySelectorAll('.control-btn.active').forEach((button) => button.classList.remove('active')); }
  function toggleSound() { soundEnabled = !soundEnabled; $('sound-btn').classList.toggle('is-muted', !soundEnabled); $('sound-btn').textContent = soundEnabled ? '♪' : '×'; if (soundEnabled) playTone(440, .06, 'sine'); }
  function playTone(frequency, duration, type) { if (!soundEnabled) return; try { audioContext ||= new (window.AudioContext || window.webkitAudioContext)(); const oscillator = audioContext.createOscillator(); const gain = audioContext.createGain(); oscillator.type = type; oscillator.frequency.value = frequency; gain.gain.setValueAtTime(.035, audioContext.currentTime); gain.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + duration); oscillator.connect(gain).connect(audioContext.destination); oscillator.start(); oscillator.stop(audioContext.currentTime + duration); } catch { /* audio is an enhancement only */ } }

  function spawnBurst(x, y, color, amount = 8) { for (let i = 0; i < amount; i++) { const angle = Math.random() * Math.PI * 2, speed = 18 + Math.random() * 55; particles.push({ x: x * cellSize, y: y * cellSize, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 18, life: .42 + Math.random() * .48, maxLife: 1, size: 2 + Math.random() * 3, color, gravity: 72 }); } trimParticles(); }
  function spawnText(x, y, text, color) { particles.push({ x: x * cellSize, y: y * cellSize, vx: 0, vy: -28, life: 1.05, maxLife: 1, size: Math.max(11, cellSize * .25), color, text, gravity: 0 }); trimParticles(); }
  function trimParticles() { if (particles.length > 280) particles.splice(0, particles.length - 280); }
  function updateParticles(dt) { const seconds = dt / 1000; for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.x += p.vx * seconds; p.y += p.vy * seconds; p.vy += p.gravity * seconds; p.life -= seconds; if (p.life <= 0) particles.splice(i, 1); } }

  function roundedRect(context, x, y, width, height, radius) { const r = Math.min(radius, width / 2, height / 2); context.beginPath(); context.moveTo(x + r, y); context.arcTo(x + width, y, x + width, y + height, r); context.arcTo(x + width, y + height, x, y + height, r); context.arcTo(x, y + height, x, y, r); context.arcTo(x, y, x + width, y, r); context.closePath(); }
  function glowCircle(x, y, radius, color, alpha = .3) { ctx.save(); ctx.globalAlpha = alpha; ctx.shadowColor = color; ctx.shadowBlur = radius * .9; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, radius * .32, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = COLORS.bg; ctx.fillRect(0, 0, boardSize, boardSize);
    if (floorPattern) { ctx.globalAlpha = .62; ctx.fillStyle = floorPattern; ctx.fillRect(0, 0, boardSize, boardSize); ctx.globalAlpha = 1; } else { ctx.fillStyle = COLORS.floor; ctx.fillRect(0, 0, boardSize, boardSize); }
    ctx.save();
    if (shakeMs > 0) ctx.translate((Math.random() - .5) * 6, (Math.random() - .5) * 6);
    drawFloorGrid();
    for (let y = 0; y < GRID_SIZE; y++) for (let x = 0; x < GRID_SIZE; x++) drawTile(x, y, map[y]?.[x]);
    drawExitAndPowerups(); drawBombs(); drawEnemies(); drawPlayer(); drawExplosions(); drawParticles();
    ctx.restore();
    if (shakeMs > 0) shakeMs = Math.max(0, shakeMs - 16);
  }

  function drawFloorGrid() { ctx.strokeStyle = COLORS.grid; ctx.lineWidth = 1; ctx.globalAlpha = .7; for (let i = 0; i <= GRID_SIZE; i++) { const p = i * cellSize + .5; ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, boardSize); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(boardSize, p); ctx.stroke(); } ctx.globalAlpha = 1; }

  function drawTile(x, y, tile) { if (tile === TILE.EMPTY || tile === TILE.BOMB || tile === undefined) return; const px = x * cellSize, py = y * cellSize, pad = Math.max(2, cellSize * .08);
    ctx.save(); ctx.shadowColor = tile === TILE.WALL ? 'rgba(31, 121, 255, .42)' : 'rgba(255, 111, 39, .22)'; ctx.shadowBlur = 7;
    const gradient = ctx.createLinearGradient(px, py, px + cellSize, py + cellSize);
    if (tile === TILE.WALL) { gradient.addColorStop(0, COLORS.wallLight); gradient.addColorStop(.14, COLORS.wall); gradient.addColorStop(1, COLORS.wallDark); } else { gradient.addColorStop(0, COLORS.blockLight); gradient.addColorStop(.18, COLORS.block); gradient.addColorStop(1, COLORS.blockDark); }
    roundedRect(ctx, px + pad, py + pad, cellSize - pad * 2, cellSize - pad * 2, Math.max(3, cellSize * .13)); ctx.fillStyle = gradient; ctx.fill(); ctx.shadowBlur = 0;
    ctx.strokeStyle = tile === TILE.WALL ? 'rgba(115,229,255,.55)' : 'rgba(255,194,86,.54)'; ctx.lineWidth = 1; ctx.stroke();
    if (tile === TILE.BLOCK) { ctx.strokeStyle = 'rgba(93, 33, 28, .72)'; ctx.lineWidth = Math.max(1, cellSize * .045); ctx.beginPath(); ctx.moveTo(px + cellSize * .25, py + cellSize * .28); ctx.lineTo(px + cellSize * .75, py + cellSize * .72); ctx.moveTo(px + cellSize * .75, py + cellSize * .28); ctx.lineTo(px + cellSize * .25, py + cellSize * .72); ctx.stroke(); ctx.fillStyle = 'rgba(255, 230, 138, .35)'; ctx.fillRect(px + pad * 1.5, py + pad * 1.5, cellSize - pad * 3, Math.max(1, cellSize * .045)); }
    else { ctx.fillStyle = 'rgba(137, 241, 255, .42)'; ctx.fillRect(px + pad * 1.5, py + pad * 1.5, cellSize - pad * 3, Math.max(2, cellSize * .08)); ctx.fillStyle = 'rgba(5, 14, 62, .45)'; ctx.fillRect(px + cellSize * .23, py + cellSize * .7, cellSize * .54, Math.max(1, cellSize * .05)); }
    ctx.restore();
  }

  function drawExitAndPowerups() { const now = performance.now();
    if (exitPos.revealed) { const px = exitPos.x * cellSize, py = exitPos.y * cellSize, pulse = 1 + Math.sin(now * .006) * .08; ctx.save(); ctx.shadowColor = COLORS.green; ctx.shadowBlur = 14; ctx.fillStyle = 'rgba(42, 225, 158, .27)'; roundedRect(ctx, px + 4, py + 4, cellSize - 8, cellSize - 8, 7); ctx.fill(); ctx.strokeStyle = COLORS.green; ctx.lineWidth = 2; ctx.stroke(); ctx.translate(px + cellSize / 2, py + cellSize / 2); ctx.scale(pulse, pulse); ctx.fillStyle = COLORS.green; ctx.font = `900 ${Math.max(9, cellSize * .2)}px Courier New`; ctx.textAlign = 'center'; ctx.fillText('EXIT', 0, 4); ctx.restore(); }
    for (const power of powerups) { if (!power.revealed) continue; const px = (power.x + .5) * cellSize, py = (power.y + .5) * cellSize + Math.sin(now * .004 + power.pulse) * 2; ctx.save(); ctx.shadowColor = power.type === 'bomb' ? COLORS.cyan : COLORS.orange; ctx.shadowBlur = 13; ctx.fillStyle = power.type === 'bomb' ? 'rgba(69,228,255,.18)' : 'rgba(255,118,46,.2)'; ctx.beginPath(); ctx.arc(px, py, cellSize * .29, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = power.type === 'bomb' ? COLORS.cyan : COLORS.orange; ctx.font = `900 ${Math.max(15, cellSize * .4)}px Arial`; ctx.textAlign = 'center'; ctx.fillText(power.type === 'bomb' ? '✦' : '✹', px, py + cellSize * .14); ctx.restore(); }
  }

  function drawBombs() { for (const bomb of bombs) { const px = (bomb.x + .5) * cellSize, py = (bomb.y + .53) * cellSize, scale = 1 + Math.sin(bomb.pulse) * .06, ratio = Math.max(0, Math.min(1, 1 - bomb.timer / 2850)); ctx.save(); ctx.translate(px, py); ctx.scale(scale, scale); ctx.shadowColor = ratio > .7 ? COLORS.orange : 'rgba(10,14,36,.9)'; ctx.shadowBlur = 13; const gradient = ctx.createRadialGradient(-cellSize * .13, -cellSize * .16, cellSize * .04, 0, 0, cellSize * .38); gradient.addColorStop(0, '#829ac2'); gradient.addColorStop(.16, COLORS.bombLight); gradient.addColorStop(.22, '#1a294c'); gradient.addColorStop(1, COLORS.bomb); ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(0, 0, cellSize * .34, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; ctx.strokeStyle = `rgba(255, ${Math.floor(210 - ratio * 90)}, 79, .75)`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, cellSize * .39, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio); ctx.stroke(); ctx.strokeStyle = COLORS.orange; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -cellSize * .29); ctx.quadraticCurveTo(cellSize * .04, -cellSize * .46, cellSize * .16, -cellSize * .38); ctx.stroke(); if (Math.floor(performance.now() / 110) % 2 === 0) glowCircle(cellSize * .18, -cellSize * .39, 9, COLORS.yellow, .65); ctx.restore(); } }

  function drawEnemies() { for (const enemy of entities) { const px = enemy.x * cellSize, py = enemy.y * cellSize, w = enemy.width * cellSize, h = enemy.height * cellSize, bob = Math.sin(enemy.phase) * 1.7; ctx.save(); ctx.translate(0, bob); ctx.shadowColor = 'rgba(255, 48, 111, .55)'; ctx.shadowBlur = 12; const gradient = ctx.createRadialGradient(px + w * .3, py + h * .23, 1, px + w * .5, py + h * .5, w * .6); gradient.addColorStop(0, '#ff8a72'); gradient.addColorStop(.32, COLORS.enemy); gradient.addColorStop(1, COLORS.enemyDark); ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(px + w / 2, py + h / 2, Math.min(w, h) * .44, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.beginPath(); ctx.arc(px + w * .35, py + h * .39, Math.max(2, w * .1), 0, Math.PI * 2); ctx.arc(px + w * .65, py + h * .39, Math.max(2, w * .1), 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#26102c'; const look = enemy.axis === 'h' ? enemy.dir * 1.3 : 0; ctx.beginPath(); ctx.arc(px + w * .35 + look, py + h * .39, Math.max(1.3, w * .045), 0, Math.PI * 2); ctx.arc(px + w * .65 + look, py + h * .39, Math.max(1.3, w * .045), 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = 'rgba(44, 9, 44, .75)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px + w * .27, py + h * .27); ctx.lineTo(px + w * .43, py + h * .31); ctx.moveTo(px + w * .57, py + h * .31); ctx.lineTo(px + w * .73, py + h * .27); ctx.stroke(); ctx.fillStyle = COLORS.enemyDark; ctx.fillRect(px + w * .18, py + h * .81, w * .24, h * .08); ctx.fillRect(px + w * .58, py + h * .81, w * .24, h * .08); ctx.restore(); } }

  function drawPlayer() { if (player.dead || (player.invulnerableMs > 0 && Math.floor(performance.now() / 90) % 2 === 0)) return; const px = player.x * cellSize, py = player.y * cellSize, w = player.width * cellSize, h = player.height * cellSize, bob = player.moving ? Math.sin(player.anim) * 2 : 0; ctx.save(); ctx.translate(0, bob); ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(px + w / 2, py + h * .92, w * .42, h * .13, 0, 0, Math.PI * 2); ctx.fill(); ctx.shadowColor = 'rgba(47, 210, 255, .65)'; ctx.shadowBlur = 13; const body = ctx.createLinearGradient(px, py, px + w, py + h); body.addColorStop(0, '#a9f5ff'); body.addColorStop(.27, COLORS.player); body.addColorStop(1, COLORS.playerDark); ctx.fillStyle = body; roundedRect(ctx, px + w * .12, py + h * .36, w * .76, h * .56, 7); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = '#f4fdff'; roundedRect(ctx, px + w * .08, py - h * .01, w * .84, h * .5, 8); ctx.fill(); ctx.fillStyle = '#10254f'; roundedRect(ctx, px + w * .18, py + h * .13, w * .64, h * .2, 4); ctx.fill(); ctx.fillStyle = COLORS.cyan; ctx.globalAlpha = .8; ctx.fillRect(px + w * .25, py + h * .16, w * .24, Math.max(1, h * .04)); ctx.globalAlpha = 1; ctx.strokeStyle = '#f7ffff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px + w / 2, py); ctx.lineTo(px + w / 2, py - h * .15); ctx.stroke(); ctx.fillStyle = COLORS.pink; ctx.shadowColor = COLORS.pink; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(px + w / 2, py - h * .18, Math.max(2, w * .075), 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = '#f8ffff'; if (player.direction === 'down') { ctx.fillRect(px + w * .29, py + h * .22, Math.max(2, w * .07), Math.max(2, h * .07)); ctx.fillRect(px + w * .63, py + h * .22, Math.max(2, w * .07), Math.max(2, h * .07)); } else { const eyeX = player.direction === 'right' ? .68 : player.direction === 'left' ? .25 : .47; ctx.fillRect(px + w * eyeX, py + h * .22, Math.max(2, w * .07), Math.max(2, h * .07)); } ctx.fillStyle = COLORS.playerDark; ctx.fillRect(px + w * .14, py + h * .86, w * .25, h * .08); ctx.fillRect(px + w * .61, py + h * .86, w * .25, h * .08); ctx.restore(); }

  function drawExplosions() { for (const explosion of explosions) { const fade = Math.max(0, Math.min(1, explosion.life / 520)); for (const cell of explosion.cells) { const px = cell.x * cellSize, py = cell.y * cellSize, cx = px + cellSize / 2, cy = py + cellSize / 2; ctx.save(); ctx.globalAlpha = fade; ctx.shadowColor = COLORS.orange; ctx.shadowBlur = 17; ctx.fillStyle = COLORS.orange; ctx.fillRect(px + cellSize * .16, py + cellSize * .16, cellSize * .68, cellSize * .68); ctx.fillStyle = COLORS.flame; ctx.fillRect(px + cellSize * .27, py + cellSize * .06, cellSize * .46, cellSize * .88); ctx.fillRect(px + cellSize * .06, py + cellSize * .27, cellSize * .88, cellSize * .46); ctx.fillStyle = COLORS.flameHot; ctx.beginPath(); ctx.arc(cx, cy, cellSize * .23, 0, Math.PI * 2); ctx.fill(); ctx.restore(); } } }

  function drawParticles() { ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; for (const p of particles) { ctx.globalAlpha = Math.max(0, p.life / p.maxLife); if (p.text) { ctx.font = `900 ${p.size}px Courier New`; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(4, 10, 31, .9)'; ctx.strokeText(p.text, p.x, p.y); ctx.fillStyle = p.color; ctx.fillText(p.text, p.x, p.y); } else { ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 7; ctx.fillRect(p.x, p.y, p.size, p.size); } } ctx.restore(); }

  function updateDemo(dt) { if (!DEMO_MODE || gameState !== 'PLAYING') return; player.invulnerableMs = 1000; const previous = Math.floor(demoClock / 1200); demoClock += dt; const phase = Math.floor(demoClock / 1200) % 4; clearInput(); if (phase === 0) keys.right = true; if (phase === 1) keys.down = true; if (phase === 2) keys.left = true; if (phase === 3) keys.up = true; if (Math.floor(demoClock / 1200) !== previous || bombs.length === 0) placeBomb(); }

  function gameLoop(timestamp) {
    const dt = Math.min(50, Math.max(0, timestamp - lastTime || 16)); lastTime = timestamp;
    if (gameState === 'PLAYING') { updateDemo(dt); updatePlayer(dt); updateBombs(dt); updateExplosions(dt); updateEnemies(dt); }
    updateParticles(dt); render(); animationId = requestAnimationFrame(gameLoop);
  }

  window.addEventListener('load', init, { once: true });
})();
