from playwright.sync_api import sync_playwright

CARD_CLICK = """(() => {
  const el = document.querySelector('.wcard[data-weapon=%s]');
  if (!el) return 'NO CARD';
  el.click();
  return 'ok';
})()"""

STATE = """(() => {
  const key = '%s';
  const m = window.__loadoutModels[key];
  if (!m) return JSON.stringify({key: key, err: 'NO MODEL'});
  let mn = 0, vis = 0, hid = [];
  m.traverse(o => {
    if (o.isMesh) {
      mn++;
      if (o.visible) vis++;
      else hid.push(o.name);
    }
  });
  return JSON.stringify({key: key, meshes: mn, visible: vis, hidden: hid,
                         name: document.querySelector('#loadoutName').textContent,
                         desc: document.querySelector('#loadoutDesc').textContent});
})()"""

with sync_playwright() as p:
    b = p.chromium.launch(channel='msedge', headless=True)
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
    errs = []
    pg.on('pageerror', lambda e: errs.append(e.message))
    pg.goto('http://localhost:18959/', wait_until='domcontentloaded')
    pg.wait_for_timeout(4500)
    pg.click('#loadoutButton')
    pg.wait_for_timeout(1500)
    for k in ['akm', 'l96', 'mosin', 'hecate', 'mx', 'deagle', 'bayonet']:
        pg.evaluate(CARD_CLICK % k)
        pg.wait_for_timeout(450)
        print(pg.evaluate(STATE % k))
    print('PAGEERRORS:', len(errs), errs[:3])
    b.close()
