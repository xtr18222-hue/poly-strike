import os, json, base64
from playwright.sync_api import sync_playwright
URL = os.environ.get('TEST_URL', 'http://127.0.0.1:18959/?test=1')

# Read raw pixels from the game canvas around the screen center, where the
# 1.9m bot should project (~167px tall at 6m). Definitive: no vision model,
# no overlay ambiguity.
BODY = r'''() => {
  const cv = document.getElementById('game');
  const gl = cv.getContext('webgl') || cv.getContext('webgl2');
  const w = cv.width, h = cv.height;
  const out = {canvas: [w, h]};
  if (!gl) { out.err = 'no webgl context'; return out; }
  // read the center 9x9 block of pixels (device pixels)
  const x0 = Math.floor(w / 2) - 4, y0 = Math.floor(h / 2) - 4;
  const px = new Uint8Array(9 * 9 * 4);
  gl.readPixels(x0, y0, 9, 9, gl.RGBA, gl.UNSIGNED_BYTE, px);
  out.centerBlock = [];
  for (let yy = 8; yy >= 0; yy--) {
    const row = [];
    for (let xx = 0; xx < 9; xx++) {
      const i = (yy * 9 + xx) * 4;
      row.push([px[i], px[i+1], px[i+2]]);
    }
    out.centerBlock.push(row);
  }
  // also sample a vertical strip 60px above/below centre to catch the 167px figure
  const strip = [];
  for (let dy = -80; dy <= 80; dy += 20) {
    const s = new Uint8Array(4);
    gl.readPixels(Math.floor(w/2), Math.floor(h/2) + dy, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, s);
    strip.push([dy, s[0], s[1], s[2]]);
  }
  out.strip = strip;
  return out;
}'''

with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 800}, device_scale_factor=1)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)[:200]))
    page.goto(URL)
    page.wait_for_timeout(2500)
    for _ in range(60):
        if page.evaluate('window.PolyAsset && PolyAsset.progress().soldier'):
            break
        page.wait_for_timeout(300)
    page.locator('#start').click()
    page.wait_for_function('window.Game && Game.state().running')
    page.wait_for_timeout(4000)
    page.evaluate('Game.test.fixture("target")')
    page.wait_for_timeout(1500)
    info = page.evaluate(BODY)
    print('canvas size:', info.get('canvas'), 'err:', info.get('err'))
    print('center 9x9 block (top row first):')
    for row in info.get('centerBlock', []):
        print('  ', row)
    print('vertical strip [dy, r, g, b]:')
    for s in info.get('strip', []):
        print('  ', s)
    print('ERRORS:', errors[:5])
    browser.close()
