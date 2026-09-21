import os, json, base64
from playwright.sync_api import sync_playwright
URL = os.environ.get('TEST_URL', 'http://127.0.0.1:18959/?test=1')

# readPixels returns the cleared buffer when preserveDrawingBuffer is false,
# so capture with a synchronous grab *inside* the frame loop instead: hook the
# game's render, read the framebuffer immediately, then settle.
BODY = r'''() => {
  const cv = document.getElementById('game');
  const gl = cv.getContext('webgl2') || cv.getContext('webgl');
  const w = cv.width, h = cv.height;
  const buf = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  const arr = Array.from(buf);
  return {w, h, arr};
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
    # teleport bot0 point-blank in front of the camera and face it
    page.evaluate('Game.test.bot(0, 0, 30); Game.test.aim(0);')
    page.wait_for_timeout(2500)
    info = page.evaluate(BODY)
    w, h = info['w'], info['h']
    arr = info['arr']
    # write PNG from the raw RGBA (flip vertically)
    from PIL import Image
    im = Image.frombytes('RGBA', (w, h), bytes(arr))
    im = im.transpose(Image.FLIP_TOP_BOTTOM)
    im = im.convert('RGB')
    out = os.path.join(os.path.dirname(__file__), 'shots', 'fb-grab.png')
    im.save(out)
    import collections
    c = collections.Counter()
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            c[im.getpixel((x, y))] += 1
    print('canvas', w, h, 'distinct', len(c))
    for col, n in c.most_common(12):
        print('  ', col, n)
    print('ERRORS:', errors[:5])
    browser.close()
