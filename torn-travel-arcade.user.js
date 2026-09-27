// ==UserScript==
// @name         Torn Travel Arcade
// @namespace    https://github.com/rootfellen/torn-travel-arcade
// @version      1.1.0
// @description  Adds a small Snake / 2048 arcade to the Travel page so long flights aren't so boring. No network requests, no automation, never touches your travel.
// @author       0o0o0
// @license      MIT
// @homepageURL  https://github.com/rootfellen/torn-travel-arcade
// @supportURL   https://github.com/rootfellen/torn-travel-arcade/issues
// @downloadURL  https://raw.githubusercontent.com/rootfellen/torn-travel-arcade/main/torn-travel-arcade.user.js
// @updateURL    https://raw.githubusercontent.com/rootfellen/torn-travel-arcade/main/torn-travel-arcade.user.js
// @match        https://www.torn.com/page.php?sid=travel*
// @match        https://torn.com/page.php?sid=travel*
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==

/*
 * Torn Travel Arcade
 * -------------------
 * A closed-by-default floating button on the Travel page. Click it to open
 * a small panel with two offline games (Snake, 2048) to kill time on long
 * flights. It never sends a network request, never reads or writes any
 * Torn data beyond its own high scores, and never clicks or submits
 * anything on the page. Purely decorative, same category as a page skin
 * or a countdown timer script.
 */

(function () {
  'use strict';

  if (window.__ttaLoaded) return;
  window.__ttaLoaded = true;

  const PREFIX = 'tta_';
  const GAME_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'W', 'A', 'S', 'D', ' ']);
  const DIR_MAP = {
    ArrowUp: 'up', w: 'up', W: 'up',
    ArrowDown: 'down', s: 'down', S: 'down',
    ArrowLeft: 'left', a: 'left', A: 'left',
    ArrowRight: 'right', d: 'right', D: 'right',
  };

  // ------------------------------------------------------------------ utils
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, String(v));
    }
    for (const c of [].concat(children)) {
      if (c == null) continue;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  }

  function readBest(key) {
    try {
      const v = Number(localStorage.getItem(PREFIX + 'best_' + key));
      return Number.isFinite(v) && v >= 0 ? v : 0;
    } catch (_) {
      return 0;
    }
  }
  function writeBest(key, value) {
    try { localStorage.setItem(PREFIX + 'best_' + key, String(Math.round(value))); } catch (_) { /* ignore */ }
  }

  // ------------------------------------------------------------- dragging
  const TOGGLE_POS_KEY = PREFIX + 'toggle_pos';
  const PANEL_POS_KEY = PREFIX + 'panel_pos';

  function readPos(key) {
    try {
      const raw = JSON.parse(localStorage.getItem(key) || 'null');
      if (raw && Number.isFinite(raw.x) && Number.isFinite(raw.y)) return raw;
    } catch (_) { /* ignore */ }
    return null;
  }
  function writePos(key, x, y) {
    try { localStorage.setItem(key, JSON.stringify({ x: Math.round(x), y: Math.round(y) })); } catch (_) { /* ignore */ }
  }
  function clampToViewport(x, y, w, h) {
    const margin = 4;
    const maxX = Math.max(margin, window.innerWidth - w - margin);
    const maxY = Math.max(margin, window.innerHeight - h - margin);
    return { x: Math.min(Math.max(x, margin), maxX), y: Math.min(Math.max(y, margin), maxY) };
  }

  /** Positions `target` from a saved location, if one exists, clamped to fit the current window. */
  function applyStoredPos(target, storageKey) {
    const saved = readPos(storageKey);
    if (!saved) return;
    const rect = target.getBoundingClientRect();
    const pos = clampToViewport(saved.x, saved.y, rect.width, rect.height);
    target.style.left = pos.x + 'px';
    target.style.top = pos.y + 'px';
    target.style.right = 'auto';
    target.style.bottom = 'auto';
  }

  function reclampIfPositioned(target, storageKey) {
    if (!target || !target.style.left) return; // still on its default CSS corner, nothing to clamp
    const rect = target.getBoundingClientRect();
    const pos = clampToViewport(rect.left, rect.top, rect.width, rect.height);
    if (Math.round(pos.x) !== Math.round(rect.left) || Math.round(pos.y) !== Math.round(rect.top)) {
      target.style.left = pos.x + 'px';
      target.style.top = pos.y + 'px';
      writePos(storageKey, pos.x, pos.y);
    }
  }

  /**
   * Lets `handle` drag `target` around the viewport with pointer events (mouse,
   * touch and pen all use the same API), saving the new position to
   * localStorage. Mutates the given `state.dragged` flag so callers can tell a
   * drag apart from a plain click and swallow the click that follows a drag.
   */
  function makeDraggable(target, handle, storageKey, state) {
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    handle.style.touchAction = 'none';
    handle.style.cursor = 'grab';

    handle.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      state.dragged = false;
      // Let a press on a nested interactive control (e.g. the panel's close
      // button) behave normally instead of starting a drag: capturing the
      // pointer on `handle` would otherwise redirect its own click away from
      // that control.
      if (e.target !== handle && e.target.closest && e.target.closest('button, a, input, textarea, select')) return;
      pointerId = e.pointerId;
      const rect = target.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      startX = e.clientX;
      startY = e.clientY;
      try { handle.setPointerCapture(pointerId); } catch (_) { /* ignore */ }
      handle.style.cursor = 'grabbing';
      document.body.classList.add('tta-no-select');
    });

    handle.addEventListener('pointermove', (e) => {
      if (pointerId === null || e.pointerId !== pointerId) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!state.dragged && Math.hypot(dx, dy) < 4) return;
      state.dragged = true;
      const rect = target.getBoundingClientRect();
      const pos = clampToViewport(startLeft + dx, startTop + dy, rect.width, rect.height);
      target.style.left = pos.x + 'px';
      target.style.top = pos.y + 'px';
      target.style.right = 'auto';
      target.style.bottom = 'auto';
    });

    const endDrag = (e) => {
      if (pointerId === null || e.pointerId !== pointerId) return;
      try { handle.releasePointerCapture(pointerId); } catch (_) { /* ignore */ }
      pointerId = null;
      handle.style.cursor = 'grab';
      document.body.classList.remove('tta-no-select');
      if (state.dragged) {
        const rect = target.getBoundingClientRect();
        writePos(storageKey, rect.left, rect.top);
      }
    };
    handle.addEventListener('pointerup', endDrag);
    handle.addEventListener('pointercancel', endDrag);
  }

  // -------------------------------------------------------------------- CSS
  if (!document.getElementById('tta-style')) {
    const style = el('style', { id: 'tta-style' });
    style.textContent = `
      body.tta-no-select{user-select:none;-webkit-user-select:none}
      #tta-toggle{position:fixed;right:16px;bottom:16px;z-index:2147483000;width:48px;height:48px;
        border-radius:50%;border:2px solid #444;background:#222;color:#fff;font-size:22px;
        box-shadow:0 2px 8px rgba(0,0,0,.4);}
      #tta-toggle:hover{background:#333}
      #tta-backdrop{position:fixed;inset:0;z-index:2147482999;background:rgba(8,8,12,.55);
        backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
      #tta-backdrop.tta-hidden{display:none}
      #tta-panel{position:fixed;right:16px;bottom:72px;z-index:2147483000;width:280px;
        background:#1c1c1c;color:#eee;border:1px solid #444;border-radius:10px;
        font:13px/1.4 Arial,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.5);overflow:hidden;}
      #tta-panel.tta-hidden{display:none}
      .tta-head{display:flex;align-items:center;justify-content:space-between;
        padding:8px 10px;background:#151515;border-bottom:1px solid #333}
      .tta-head strong{font-size:13px;pointer-events:none}
      .tta-close{background:none;border:0;color:#999;font-size:16px;cursor:pointer;line-height:1}
      .tta-close:hover{color:#fff}
      .tta-tabs{display:flex;gap:4px;padding:8px 10px 0}
      .tta-tab{flex:1;background:#2a2a2a;border:1px solid #3a3a3a;color:#ccc;border-radius:5px 5px 0 0;
        padding:5px 0;cursor:pointer;font-size:12px}
      .tta-tab.tta-active{background:#333;color:#fff;border-bottom-color:#333}
      .tta-body{padding:10px;display:flex;flex-direction:column;align-items:center;gap:6px}
      .tta-stats{display:flex;justify-content:space-between;width:100%;font-size:12px;color:#bbb}
      .tta-hint{font-size:11px;color:#888;text-align:center}
      #tta-snake-canvas{background:#101010;border:1px solid #333;border-radius:4px;display:block}
      .tta-grid2048{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;width:212px;
        background:#2a2a2a;padding:6px;border-radius:6px}
      .tta-cell{aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;
        border-radius:4px;background:#3a3a3a;color:#eee;font-weight:bold;font-size:16px}
      .tta-v2{background:#5b5b8f}.tta-v4{background:#5b7a8f}.tta-v8{background:#4f8f6a}
      .tta-v16{background:#8f8f4f}.tta-v32{background:#8f6a4f}.tta-v64{background:#8f4f4f}
      .tta-v128{background:#a0526e;font-size:14px}.tta-v256{background:#a05299;font-size:14px}
      .tta-v512{background:#7952a0;font-size:14px}.tta-v1024{background:#5254a0;font-size:13px}
      .tta-v2048{background:#c9a227;color:#111;font-size:13px}.tta-vbig{background:#e8d97a;color:#111;font-size:12px}
      .tta-btn{background:#333;border:1px solid #4a4a4a;color:#eee;border-radius:5px;
        padding:5px 10px;cursor:pointer;font-size:12px}
      .tta-btn:hover{background:#3d3d3d}
      .tta-overlay{position:absolute;inset:0;background:rgba(0,0,0,.6);display:flex;
        align-items:center;justify-content:center;color:#fff;font-weight:bold;border-radius:4px}
      .tta-canvas-wrap{position:relative;touch-action:none}
      .tta-dpad{display:grid;grid-template-columns:36px 36px 36px;grid-template-rows:36px 36px 36px;
        gap:3px;margin-top:2px}
      .tta-dpad button{grid-area:auto;background:#333;border:1px solid #4a4a4a;color:#eee;
        border-radius:6px;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;
        touch-action:manipulation;user-select:none}
      .tta-dpad button:hover{background:#3d3d3d}
      .tta-dpad button:active{background:#4a4a4a}
      .tta-dpad-up{grid-column:2;grid-row:1}
      .tta-dpad-left{grid-column:1;grid-row:2}
      .tta-dpad-mid{grid-column:2;grid-row:2;background:none;border:none;cursor:default}
      .tta-dpad-right{grid-column:3;grid-row:2}
      .tta-dpad-down{grid-column:2;grid-row:3}
    `;
    document.head.appendChild(style);
  }

  // ---------------------------------------------------------------- state
  let panelOpen = false;
  let activeGame = 'snake';

  // ================================================================ SNAKE
  const SNAKE_COLS = 16;
  const SNAKE_ROWS = 16;
  const SNAKE_CELL = 14;

  const snake = {
    canvas: null,
    ctx: null,
    body: [],
    dir: { x: 1, y: 0 },
    pendingDir: null,
    food: { x: 0, y: 0 },
    score: 0,
    best: readBest('snake'),
    stepMs: 140,
    lastMove: 0,
    gameOver: false,
    rafId: null,
  };

  function snakeReset() {
    const midX = Math.floor(SNAKE_COLS / 2);
    const midY = Math.floor(SNAKE_ROWS / 2);
    snake.body = [{ x: midX - 1, y: midY }, { x: midX - 2, y: midY }, { x: midX - 3, y: midY }];
    snake.dir = { x: 1, y: 0 };
    snake.pendingDir = null;
    snake.score = 0;
    snake.stepMs = 140;
    snake.gameOver = false;
    snakePlaceFood();
    snakeDraw();
    ensureSnakeLoop();
  }

  function snakePlaceFood() {
    const free = [];
    for (let x = 0; x < SNAKE_COLS; x++) {
      for (let y = 0; y < SNAKE_ROWS; y++) {
        if (!snake.body.some((s) => s.x === x && s.y === y)) free.push({ x, y });
      }
    }
    snake.food = free.length ? free[Math.floor(Math.random() * free.length)] : { x: 0, y: 0 };
  }

  function snakeStep() {
    if (snake.pendingDir) {
      const nd = snake.pendingDir;
      const isReverse = nd.x === -snake.dir.x && nd.y === -snake.dir.y;
      if (!isReverse) snake.dir = nd;
      snake.pendingDir = null;
    }
    const head = snake.body[0];
    const next = { x: head.x + snake.dir.x, y: head.y + snake.dir.y };

    if (next.x < 0 || next.x >= SNAKE_COLS || next.y < 0 || next.y >= SNAKE_ROWS ||
        snake.body.some((s) => s.x === next.x && s.y === next.y)) {
      snake.gameOver = true;
      if (snake.score > snake.best) { snake.best = snake.score; writeBest('snake', snake.best); }
      return;
    }

    snake.body.unshift(next);
    if (next.x === snake.food.x && next.y === snake.food.y) {
      snake.score += 1;
      snake.stepMs = Math.max(70, 140 - snake.score * 2);
      snakePlaceFood();
    } else {
      snake.body.pop();
    }
  }

  function snakeDraw() {
    const ctx = snake.ctx;
    if (!ctx) return;
    ctx.fillStyle = '#101010';
    ctx.fillRect(0, 0, SNAKE_COLS * SNAKE_CELL, SNAKE_ROWS * SNAKE_CELL);

    ctx.fillStyle = '#e64545';
    ctx.fillRect(snake.food.x * SNAKE_CELL + 1, snake.food.y * SNAKE_CELL + 1, SNAKE_CELL - 2, SNAKE_CELL - 2);

    snake.body.forEach((seg, i) => {
      ctx.fillStyle = i === 0 ? '#7be07b' : '#4caf50';
      ctx.fillRect(seg.x * SNAKE_CELL + 1, seg.y * SNAKE_CELL + 1, SNAKE_CELL - 2, SNAKE_CELL - 2);
    });

    updateStatsRow('snake', snake.score, snake.best);
  }

  function ensureSnakeLoop() {
    if (snake.rafId != null) return;
    if (!panelOpen || activeGame !== 'snake' || document.hidden || snake.gameOver) return;
    snake.lastMove = performance.now();
    const loop = (ts) => {
      if (!panelOpen || activeGame !== 'snake' || document.hidden || snake.gameOver) {
        snake.rafId = null;
        if (snake.gameOver) snakeDrawGameOver();
        return;
      }
      if (ts - snake.lastMove >= snake.stepMs) {
        snake.lastMove = ts;
        snakeStep();
        snakeDraw();
        if (snake.gameOver) { snakeDrawGameOver(); snake.rafId = null; return; }
      }
      snake.rafId = requestAnimationFrame(loop);
    };
    snake.rafId = requestAnimationFrame(loop);
  }

  function snakeDrawGameOver() {
    const ctx = snake.ctx;
    if (!ctx) return;
    ctx.fillStyle = 'rgba(0,0,0,.6)';
    ctx.fillRect(0, 0, SNAKE_COLS * SNAKE_CELL, SNAKE_ROWS * SNAKE_CELL);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Game over', (SNAKE_COLS * SNAKE_CELL) / 2, (SNAKE_ROWS * SNAKE_CELL) / 2 - 6);
    ctx.font = '11px Arial';
    ctx.fillText('Space or Restart to play again', (SNAKE_COLS * SNAKE_CELL) / 2, (SNAKE_ROWS * SNAKE_CELL) / 2 + 12);
  }

  function buildSnakeView() {
    const wrap = el('div', { class: 'tta-canvas-wrap' });
    snake.canvas = el('canvas', {
      id: 'tta-snake-canvas', width: String(SNAKE_COLS * SNAKE_CELL), height: String(SNAKE_ROWS * SNAKE_CELL),
    });
    snake.ctx = snake.canvas.getContext('2d');
    wrap.appendChild(snake.canvas);
    snakeReset();
    return wrap;
  }

  // ================================================================= 2048
  const t2 = {
    grid: [],
    score: 0,
    best: readBest('2048'),
    gameOver: false,
    won: false,
    cells: [],
  };

  function t2Reset() {
    t2.grid = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
    t2.score = 0;
    t2.gameOver = false;
    t2.won = false;
    t2SpawnTile();
    t2SpawnTile();
    t2Render();
  }

  function t2SpawnTile() {
    const free = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if (t2.grid[r][c] === 0) free.push([r, c]);
    if (!free.length) return;
    const [r, c] = free[Math.floor(Math.random() * free.length)];
    t2.grid[r][c] = Math.random() < 0.9 ? 2 : 4;
  }

  function t2SlideLeftLine(arr) {
    const nums = arr.filter((v) => v !== 0);
    const result = [];
    let gained = 0;
    for (let i = 0; i < nums.length; i++) {
      if (i < nums.length - 1 && nums[i] === nums[i + 1]) {
        const merged = nums[i] * 2;
        result.push(merged);
        gained += merged;
        i++;
      } else {
        result.push(nums[i]);
      }
    }
    while (result.length < 4) result.push(0);
    const moved = result.some((v, i) => v !== arr[i]);
    return { line: result, gained, moved };
  }

  function t2Move(direction) {
    if (t2.gameOver) return;
    let moved = false;
    let gained = 0;

    if (direction === 'left' || direction === 'right') {
      for (let r = 0; r < 4; r++) {
        const src = direction === 'left' ? t2.grid[r] : t2.grid[r].slice().reverse();
        const res = t2SlideLeftLine(src);
        t2.grid[r] = direction === 'left' ? res.line : res.line.slice().reverse();
        moved = moved || res.moved;
        gained += res.gained;
      }
    } else {
      for (let c = 0; c < 4; c++) {
        const col = [t2.grid[0][c], t2.grid[1][c], t2.grid[2][c], t2.grid[3][c]];
        const src = direction === 'up' ? col : col.slice().reverse();
        const res = t2SlideLeftLine(src);
        const line = direction === 'up' ? res.line : res.line.slice().reverse();
        for (let r = 0; r < 4; r++) t2.grid[r][c] = line[r];
        moved = moved || res.moved;
        gained += res.gained;
      }
    }

    if (!moved) return;
    t2.score += gained;
    if (t2.score > t2.best) { t2.best = t2.score; writeBest('2048', t2.best); }
    t2SpawnTile();
    if (!t2.won && t2.grid.some((row) => row.some((v) => v >= 2048))) t2.won = true;
    if (!t2HasMoves()) t2.gameOver = true;
    t2Render();
  }

  function t2HasMoves() {
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (t2.grid[r][c] === 0) return true;
        if (c < 3 && t2.grid[r][c] === t2.grid[r][c + 1]) return true;
        if (r < 3 && t2.grid[r][c] === t2.grid[r + 1][c]) return true;
      }
    }
    return false;
  }

  function t2ClassFor(v) {
    if (v === 0) return 'tta-cell';
    if (v > 2048) return 'tta-cell tta-vbig';
    return 'tta-cell tta-v' + v;
  }

  function t2Render() {
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const cell = t2.cells[r][c];
        const v = t2.grid[r][c];
        cell.textContent = v === 0 ? '' : String(v);
        cell.className = t2ClassFor(v);
      }
    }
    updateStatsRow('2048', t2.score, t2.best);
    let overlay = document.getElementById('tta-2048-overlay');
    if (t2.gameOver || t2.won) {
      if (!overlay) {
        overlay = el('div', { id: 'tta-2048-overlay', class: 'tta-overlay' });
        document.getElementById('tta-2048-wrap').appendChild(overlay);
      }
      overlay.textContent = t2.gameOver ? 'Game over' : '2048! Keep going or Restart';
      overlay.style.display = 'flex';
      if (t2.won && !t2.gameOver) overlay.style.background = 'rgba(0,0,0,.35)';
    } else if (overlay) {
      overlay.remove();
    }
  }

  function buildT2View() {
    const wrap = el('div', { id: 'tta-2048-wrap', class: 'tta-canvas-wrap' });
    const grid = el('div', { class: 'tta-grid2048' });
    t2.cells = [];
    for (let r = 0; r < 4; r++) {
      const row = [];
      for (let c = 0; c < 4; c++) {
        const cell = el('div', { class: 'tta-cell' });
        grid.appendChild(cell);
        row.push(cell);
      }
      t2.cells.push(row);
    }
    wrap.appendChild(grid);
    t2Reset();
    return wrap;
  }

  // ------------------------------------------------------------- panel UI
  const statsEls = {};
  function updateStatsRow(game, score, best) {
    const s = statsEls[game];
    if (!s) return;
    s.score.textContent = 'Score: ' + score;
    s.best.textContent = 'Best: ' + best;
  }

  function buildStatsRow(game) {
    const scoreEl = el('span', { text: 'Score: 0' });
    const bestEl = el('span', { text: 'Best: ' + readBest(game) });
    statsEls[game] = { score: scoreEl, best: bestEl };
    return el('div', { class: 'tta-stats' }, [scoreEl, bestEl]);
  }

  let snakeView = null;
  let t2View = null;
  let snakeBody = null;
  let t2Body = null;

  function showTab(game) {
    activeGame = game;
    document.getElementById('tta-tab-snake').classList.toggle('tta-active', game === 'snake');
    document.getElementById('tta-tab-2048').classList.toggle('tta-active', game === '2048');
    snakeBody.style.display = game === 'snake' ? 'flex' : 'none';
    t2Body.style.display = game === '2048' ? 'flex' : 'none';
    if (game === 'snake') ensureSnakeLoop();
  }

  function restartActive() {
    if (activeGame === 'snake') snakeReset();
    else t2Reset();
  }

  // On-screen arrow pad, always visible: gives touch devices (Torn PDA has no
  // physical keyboard) a way to play without needing a swipe gesture.
  function buildDpad() {
    const mk = (cls, dir, glyph) => el('button', {
      class: 'tta-dpad-' + cls, type: 'button', text: glyph,
      onclick: () => applyDirection(dir),
    });
    return el('div', { class: 'tta-dpad' }, [
      mk('up', 'up', '▲'),
      mk('left', 'left', '◀'),
      el('span', { class: 'tta-dpad-mid' }),
      mk('right', 'right', '▶'),
      mk('down', 'down', '▼'),
    ]);
  }

  const panelDragState = { dragged: false };

  function buildPanel() {
    const closeBtn = el('button', {
      class: 'tta-close', type: 'button', text: '✕', title: 'Close',
      onclick: (e) => {
        if (panelDragState.dragged) { panelDragState.dragged = false; e.preventDefault(); e.stopPropagation(); return; }
        closePanel();
      },
    });
    const head = el('div', { class: 'tta-head', title: 'Drag to move' }, [el('strong', { text: '🎮 Travel Arcade' }), closeBtn]);

    const tabSnake = el('button', { id: 'tta-tab-snake', class: 'tta-tab tta-active', type: 'button', text: 'Snake', onclick: () => showTab('snake') });
    const tab2048 = el('button', { id: 'tta-tab-2048', class: 'tta-tab', type: 'button', text: '2048', onclick: () => showTab('2048') });
    const tabs = el('div', { class: 'tta-tabs' }, [tabSnake, tab2048]);

    snakeView = buildSnakeView();
    addSwipeControl(snakeView);
    const snakeStats = buildStatsRow('snake');
    snakeBody = el('div', { class: 'tta-body' }, [snakeView, buildDpad(), snakeStats,
      el('div', { class: 'tta-hint', text: 'Arrow keys / WASD, swipe, or the arrows above' })]);

    t2View = buildT2View();
    addSwipeControl(t2View);
    const t2Stats = buildStatsRow('2048');
    t2Body = el('div', { class: 'tta-body', style: 'display:none' }, [t2View, buildDpad(), t2Stats,
      el('div', { class: 'tta-hint', text: 'Arrow keys / WASD, swipe, or the arrows above' })]);

    const restartBtn = el('button', { class: 'tta-btn', type: 'button', text: 'Restart', onclick: restartActive });
    const footer = el('div', { class: 'tta-body', style: 'padding-top:0' }, [restartBtn]);

    const panel = el('div', { id: 'tta-panel', class: 'tta-hidden', role: 'dialog', 'aria-label': 'Travel Arcade' },
      [head, tabs, snakeBody, t2Body, footer]);
    makeDraggable(panel, head, PANEL_POS_KEY, panelDragState);
    return panel;
  }

  let panelEl = null;
  let backdropEl = null;
  let builtOnce = false;

  function openPanel() {
    if (!builtOnce) {
      backdropEl = el('div', { id: 'tta-backdrop', class: 'tta-hidden', onclick: closePanel });
      document.body.appendChild(backdropEl);
      panelEl = buildPanel();
      document.body.appendChild(panelEl);
      builtOnce = true;
    }
    backdropEl.classList.remove('tta-hidden');
    panelEl.classList.remove('tta-hidden');
    // Only measurable (getBoundingClientRect) once visible, so this runs after unhiding.
    // Re-applying the same saved value on every open is harmless.
    applyStoredPos(panelEl, PANEL_POS_KEY);
    panelOpen = true;
    if (activeGame === 'snake') ensureSnakeLoop();
  }

  function closePanel() {
    if (panelEl) panelEl.classList.add('tta-hidden');
    if (backdropEl) backdropEl.classList.add('tta-hidden');
    panelOpen = false;
  }

  function togglePanel() {
    if (panelOpen) closePanel();
    else openPanel();
  }

  // --------------------------------------------------------------- mount
  const toggleDragState = { dragged: false };
  let toggleBtnEl = null;

  function mount() {
    if (document.getElementById('tta-toggle')) return;
    const btn = el('button', {
      id: 'tta-toggle', type: 'button', title: 'Travel Arcade: play a quick game while you fly (drag to move)',
      text: '🎮',
    });
    btn.addEventListener('click', (e) => {
      if (toggleDragState.dragged) { toggleDragState.dragged = false; e.preventDefault(); e.stopPropagation(); return; }
      togglePanel();
    });
    document.body.appendChild(btn);
    toggleBtnEl = btn;
    applyStoredPos(btn, TOGGLE_POS_KEY);
    makeDraggable(btn, btn, TOGGLE_POS_KEY, toggleDragState);
  }
  mount();
  new MutationObserver(mount).observe(document.body, { childList: true });

  // Keep both the button and the panel on-screen if the window is resized
  // (e.g. rotating a phone) after being dragged somewhere.
  window.addEventListener('resize', () => {
    reclampIfPositioned(toggleBtnEl, TOGGLE_POS_KEY);
    reclampIfPositioned(panelEl, PANEL_POS_KEY);
  });

  // -------------------------------------------------------------- input
  // Only intercepts keys while the panel is open, and never while the
  // player is typing in a real text field elsewhere on the page.
  // Shared by the keyboard, the on-screen D-pad and swipe gestures, so
  // Torn PDA (no physical keyboard) can play exactly the same way.
  function applyDirection(dir) {
    if (!panelOpen) return;
    if (activeGame === 'snake') {
      const vec = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }[dir];
      snake.pendingDir = vec;
      if (snake.gameOver) snakeReset();
    } else {
      t2Move(dir);
    }
  }

  window.addEventListener('keydown', (e) => {
    if (!panelOpen) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (!GAME_KEYS.has(e.key)) return;

    e.preventDefault();
    e.stopPropagation();

    if (e.key === ' ') { restartActive(); return; }
    const dir = DIR_MAP[e.key];
    if (dir) applyDirection(dir);
  }, true);

  // --------------------------------------------------------- touch/swipe
  /** Swipe on a game area to move, for touch devices (Torn PDA, tablets). */
  function addSwipeControl(area) {
    let sx = 0;
    let sy = 0;
    let tracking = false;
    area.style.touchAction = 'none';
    area.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      tracking = true;
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
    }, { passive: true });
    area.addEventListener('touchend', (e) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return; // too small to count as a swipe
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      applyDirection(dir);
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) ensureSnakeLoop();
  });
})();
