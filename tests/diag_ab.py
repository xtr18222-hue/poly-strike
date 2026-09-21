import os, json
from playwright.sync_api import sync_playwright
URL = os.environ.get('TEST_URL', 'http://127.0.0.1:18959/?test=1')

# A/B test in the live game scene:
#  A) magenta box added DIRECTLY to bots[0] group (nesting check)
#  B) the raw (un-cloned) GLB scene with magenta material added to bots[0]
#  C) the existing cloned soldier mesh, material swapped to magenta
# All three at the same world position. Which draw?
SETUP = r'''() => {
  const T = window.THREE;
  const out = {};
  const g = window.__bots[0];
  // A: nested box inside the bot group
  const boxA = new T.Mesh(new T.BoxGeometry(0.4, 1.8, 0.4),
    new T.MeshBasicMaterial({color: 0xff0000}));
  boxA.position.set(0.8, 0.9, 0);
  g.add(boxA);
  out.a = 'nested box added';
  // C: swap the existing cloned soldier to magenta
  g.traverse(o => { if (o.isMesh) o.material = new T.MeshBasicMaterial({color: 0x0000ff}); });
  out.c = 'soldier material -> blue';
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
    # put bot0 6m ahead and hold still
    page.evaluate('Game.test.fixture("target")')
    page.wait_for_timeout(1200)
    print(json.dumps(page.evaluate(SETUP)))
    page.wait_for_timeout(600)
    page.screenshot(path=os.path.join(os.path.dirname(__file__), 'shots', 'bot-ab.png'))
    from PIL import Image
    import collections
    im = Image.open(os.path.join(os.path.dirname(__file__), 'shots', 'bot-ab.png')).convert('RGB')
    w, h = im.size
    c = collections.Counter()
    for y in range(0, h):
        for x in range(0, w):
            c[im.getpixel((x, y))] += 1
    red = sum(n for col, n in c.items() if col[0] > 150 and col[1] < 100 and col[2] < 100)
    blue = sum(n for col, n in c.items() if col[2] > 150 and col[0] < 100 and col[1] < 100)
    print('red pixels (nested box A):', red)
    print('blue pixels (soldier mesh C):', blue)
    print('ERRORS:', errors[:5])
    browser.close()
