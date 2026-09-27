// Browser tests: loads the script into a mock Travel page (no real network) and checks behaviour.
// Run: npm test
const { chromium } = require('playwright');
const path = require('path');
const script = require('fs').readFileSync(path.join(__dirname, '..', 'torn-travel-arcade.user.js'), 'utf8');
const results = [];
const ok = (name, cond) => results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}`);

(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

  // ---------------------------------------------------------- core behaviour
  {

  const ctx = await b.newContext();
  const p = await ctx.newPage();
  await p.route('https://www.torn.com/**', r => r.fulfill({ contentType: 'text/html', body: `<!doctype html><html><body>
    <div class="content-wrapper"><h4>Travel</h4><button id="travel">TRAVEL</button></div>
    <input id="chatbox" type="text">
    <script>document.addEventListener('keydown', e => { window.leaked = (window.leaked||0)+1; }, true);</script>
    </body></html>` }));
  await p.goto('https://www.torn.com/page.php?sid=travel');
  await p.addScriptTag({ content: script });
  await p.waitForTimeout(50);

  ok('toggle button present, panel hidden by default', await p.isVisible('#tta-toggle') && !(await p.isVisible('#tta-panel')));
  await p.click('#tta-toggle');
  ok('panel opens on click', await p.isVisible('#tta-panel'));
  ok('snake tab active by default with canvas', await p.isVisible('#tta-snake-canvas'));

  window_leaked_before = await p.evaluate(() => window.leaked || 0);
  await p.keyboard.press('ArrowRight');
  await p.waitForTimeout(20);
  const leaked1 = await p.evaluate(() => window.leaked || 0);
  ok('arrow key while panel open does not leak to page', leaked1 === window_leaked_before);

  // let snake run several steps
  await p.waitForTimeout(700);
  const snakeLen1 = await p.evaluate(() => document.querySelectorAll('#tta-snake-canvas').length);
  ok('snake canvas still alive after running', snakeLen1 === 1);

  // switch to 2048 and test a move + merge
  await p.click('#tta-tab-2048');
  ok('2048 tab shows grid, snake hidden', await p.isVisible('.tta-grid2048'));
  const before = await p.$$eval('.tta-grid2048 .tta-cell', els => els.map(e => e.textContent));
  const filled = before.filter(v => v !== '').length;
  ok('2048 starts with exactly two tiles', filled === 2);

  // force a deterministic merge scenario via internal state is not exposed; just press many lefts and confirm score can increase
  let scoreIncreased = false;
  for (let i = 0; i < 30 && !scoreIncreased; i++) {
    await p.keyboard.press(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'][i % 4]);
    await p.waitForTimeout(15);
    const scoreText = await p.$eval('#tta-2048-wrap', el => el.parentElement.querySelector('.tta-stats span').textContent);
    if (/Score: [1-9]/.test(scoreText)) scoreIncreased = true;
  }
  ok('2048 score increases after moves (merges happen)', scoreIncreased);

  // typing in a real input must not be hijacked
  await p.fill('#chatbox', '');
  await p.focus('#chatbox');
  await p.keyboard.type('wasd');
  const chatVal = await p.inputValue('#chatbox');
  ok('typing in a real input field is not hijacked', chatVal === 'wasd');

  // close panel; snake loop should stop consuming frames (best-effort check: no crash, toggle hides)
  await p.click('#tta-toggle');
  ok('panel closes', !(await p.isVisible('#tta-panel')));
  await p.keyboard.press('ArrowUp');
  const leaked2 = await p.evaluate(() => window.leaked || 0);
  ok('keys pass through to page normally when panel closed', leaked2 > leaked1);

  // double injection guard
  await p.addScriptTag({ content: script });
  ok('double injection -> still exactly one toggle button', (await p.$$('#tta-toggle')).length === 1);

  // no network calls ever made by the script
  let requests = 0;
  p.on('request', () => { requests++; });
  await p.click('#tta-toggle');
  await p.waitForTimeout(300);
  ok('no network requests triggered by using it', requests === 0);
  }

  // -------------------------------------------------------------- dragging
  {
  const HTML = `<!doctype html><html><body>
    <div class="content-wrapper"><h4>Travel</h4><button id="travel">TRAVEL</button></div>
    </body></html>`;

  const ctx = await b.newContext();
  const p = await ctx.newPage();
  await p.route('https://www.torn.com/**', r => r.fulfill({ contentType: 'text/html', body: HTML }));
  await p.goto('https://www.torn.com/page.php?sid=travel');
  await p.addScriptTag({ content: script });
  await p.waitForTimeout(50);

  // --- plain click still opens the panel (no false "drag" detected) ---
  const btnBox1 = await p.locator('#tta-toggle').boundingBox();
  await p.mouse.move(btnBox1.x + btnBox1.width/2, btnBox1.y + btnBox1.height/2);
  await p.mouse.down();
  await p.mouse.up();
  ok('plain click (no movement) still opens panel', await p.isVisible('#tta-panel'));
  await p.click('#tta-toggle'); // close it again (plain click toggles closed)
  ok('plain click again closes it', !(await p.isVisible('#tta-panel')));

  // --- dragging the toggle button moves it and does NOT open the panel ---
  const btnBox2 = await p.locator('#tta-toggle').boundingBox();
  const startX = btnBox2.x + btnBox2.width/2, startY = btnBox2.y + btnBox2.height/2;
  await p.mouse.move(startX, startY);
  await p.mouse.down();
  await p.mouse.move(startX - 150, startY - 200, { steps: 10 });
  await p.mouse.up();
  ok('dragging toggle does not open the panel', !(await p.isVisible('#tta-panel')));
  const btnBox3 = await p.locator('#tta-toggle').boundingBox();
  ok('toggle actually moved', Math.abs(btnBox3.x - btnBox2.x) > 100);
  const savedToggle = await p.evaluate(() => JSON.parse(localStorage.getItem('tta_toggle_pos')));
  ok('toggle position saved to localStorage', savedToggle && Math.round(savedToggle.x) === Math.round(btnBox3.x));

  // --- reload the page: button should reappear at the saved position, not the default corner ---
  await p.reload();
  await p.addScriptTag({ content: script });
  await p.waitForTimeout(50);
  const btnBox4 = await p.locator('#tta-toggle').boundingBox();
  ok('position remembered after reload', Math.abs(btnBox4.x - btnBox3.x) < 2 && Math.abs(btnBox4.y - btnBox3.y) < 2);

  // --- dragging the panel by its header moves it, and does not close it ---
  await p.click('#tta-toggle');
  await p.waitForTimeout(30);
  const panelBox1 = await p.locator('#tta-panel').boundingBox();
  const headBox = await p.locator('.tta-head').boundingBox();
  await p.mouse.move(headBox.x + 20, headBox.y + 10);
  await p.mouse.down();
  await p.mouse.move(headBox.x - 100, headBox.y + 120, { steps: 10 });
  await p.mouse.up();
  ok('panel still open after dragging its header', await p.isVisible('#tta-panel'));
  const panelBox2 = await p.locator('#tta-panel').boundingBox();
  ok('panel actually moved', Math.abs(panelBox2.x - panelBox1.x) > 50);

  // --- a drag that ends over the close button must NOT close the panel ---
  const panelBox3 = await p.locator('#tta-panel').boundingBox();
  const closeBox = await p.locator('.tta-close').boundingBox();
  await p.mouse.move(headBox.x + 20, headBox.y + 10);
  await p.mouse.down();
  await p.mouse.move(closeBox.x + 2, closeBox.y + 2, { steps: 10 });
  await p.mouse.up();
  ok('drag ending on the close button does not close the panel', await p.isVisible('#tta-panel'));

  // --- a real (non-drag) click on close still closes it ---
  const closeBox2 = await p.locator('.tta-close').boundingBox();
  await p.mouse.move(closeBox2.x + closeBox2.width/2, closeBox2.y + closeBox2.height/2);
  await p.mouse.down();
  await p.mouse.up();
  await p.waitForTimeout(30);
  const stillVisible = await p.isVisible('#tta-panel');
  if (stillVisible) {
    const cls = await p.evaluate(() => document.getElementById('tta-panel').className);
    console.log('DEBUG panel class after close click:', JSON.stringify(cls));
  }
  ok('plain click on close button still closes the panel', !stillVisible);
  if (stillVisible) {
    // force-close so the rest of the suite can still run and report
    await p.evaluate(() => document.getElementById('tta-panel').classList.add('tta-hidden'));
  }

  // --- dragging near the edge clamps on-screen (doesn't fly off past the viewport) ---
  await p.click('#tta-toggle');
  const headBox2 = await p.locator('.tta-head').boundingBox();
  await p.mouse.move(headBox2.x + 20, headBox2.y + 10);
  await p.mouse.down();
  await p.mouse.move(-500, -500, { steps: 10 }); // try to drag off top-left
  await p.mouse.up();
  const panelBox4 = await p.locator('#tta-panel').boundingBox();
  ok('dragging off-screen clamps within the viewport', panelBox4.x >= 0 && panelBox4.y >= 0);

  // --- backdrop: shows blurring the page while open, hides when closed ---
  ok('backdrop visible while panel is open', await p.isVisible('#tta-backdrop'));
  await p.click('#tta-snake-canvas'); // click inside the panel content (snake tab is active at this point)
  ok('clicking inside the panel does not close it', await p.isVisible('#tta-panel'));
  const vp = p.viewportSize();
  await p.mouse.click(10, vp.height - 10); // bottom-left: clear of both the clamped panel (top-left) and the toggle button (dragged toward top-right earlier)
  ok('clicking the backdrop closes the panel', !(await p.isVisible('#tta-panel')));
  ok('backdrop hides along with the panel', !(await p.isVisible('#tta-backdrop')));
  }

  // ---------------------------------------------------- touch / D-pad controls
  {
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  await p.route('https://www.torn.com/**', r => r.fulfill({ contentType: 'text/html', body: `<!doctype html><html><body>
    <div class="content-wrapper"><h4>Travel</h4><button id="travel">TRAVEL</button></div>
    </body></html>` }));
  await p.goto('https://www.torn.com/page.php?sid=travel');
  await p.addScriptTag({ content: script });
  await p.waitForTimeout(50);
  await p.click('#tta-toggle');

  ok('on-screen D-pad is visible for the active game (snake)', await p.isVisible('#tta-snake-canvas ~ .tta-dpad, .tta-dpad'));

  // --- 2048: D-pad button actually moves/merges tiles, same as a key press ---
  await p.click('#tta-tab-2048');
  const before2048 = await p.$$eval('.tta-grid2048 .tta-cell', els => els.map(e => e.textContent));
  let dpadMoved = false;
  for (let i = 0; i < 20 && !dpadMoved; i++) {
    const dirs = ['tta-dpad-left', 'tta-dpad-right', 'tta-dpad-up', 'tta-dpad-down'];
    await p.click('#tta-2048-wrap ~ .tta-dpad .' + dirs[i % 4]);
    await p.waitForTimeout(15);
    const now = await p.$$eval('.tta-grid2048 .tta-cell', els => els.map(e => e.textContent));
    if (JSON.stringify(now) !== JSON.stringify(before2048)) dpadMoved = true;
  }
  ok('2048 D-pad button moves tiles', dpadMoved);

  // --- snake: D-pad press changes pending direction without throwing ---
  await p.click('#tta-tab-snake');
  await p.click('.tta-dpad-down');
  await p.waitForTimeout(120);
  ok('snake still running after using the D-pad', (await p.$$('#tta-snake-canvas')).length === 1);

  // --- swipe gesture on the snake canvas area applies a direction (no crash, canvas alive) ---
  const canvasBox = await p.locator('#tta-snake-canvas').boundingBox();
  await p.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    const mk = (type, cx, cy) => new Touch({ identifier: 1, target: el, clientX: cx, clientY: cy });
    el.dispatchEvent(new TouchEvent('touchstart', { touches: [mk('touchstart', x, y)], bubbles: true }));
    el.dispatchEvent(new TouchEvent('touchend', { changedTouches: [mk('touchend', x + 60, y)], bubbles: true }));
  }, { x: canvasBox.x + canvasBox.width / 2, y: canvasBox.y + canvasBox.height / 2 });
  await p.waitForTimeout(120);
  ok('swipe gesture on the game area does not crash the game', (await p.$$('#tta-snake-canvas')).length === 1);
  }

  console.log(results.join('\n'));
  if (results.some((r) => r.startsWith('FAIL'))) process.exitCode = 1;
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
