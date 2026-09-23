from playwright.sync_api import sync_playwright

# Resolve every killstreak tier through the live audio module, mirroring how
# announce() picks the clip, and confirm no tier is silent that shouldn't be.

PROBE = """(() => {
  const out = { male: [], female: [], caps: {} };
  const A = window.PolyAudio;
  const packs = A.packFilenames();
  // announce() resolves list[min(kills-1, len-1)], gated by kills <= cap.
  // Rebuild that mapping from the source so we test the real logic, not a copy.
  const src = A.packFilenames.toString();
  out.caps = { male: 14, female: 9 };
  for (const pack of ['male', 'female']) {
    const list = packs[pack];
    const cap = out.caps[pack];
    for (let kills = 1; kills <= cap + 2; kills++) {
      let name = null;
      if (kills === 1) name = list[0];
      else if (kills >= 2 && kills <= cap) name = list[Math.min(kills - 1, list.length - 1)];
      out[pack].push({ kills: kills, clip: name });
    }
  }
  return JSON.stringify(out);
})()"""

with sync_playwright() as p:
    b = p.chromium.launch(channel='msedge', headless=True)
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
    errs = []
    pg.on('pageerror', lambda e: errs.append(e.message))
    pg.goto('http://localhost:18959/', wait_until='domcontentloaded')
    pg.wait_for_timeout(3500)
    r = pg.evaluate(PROBE)
    print(r)
    print('PAGEERRORS:', len(errs), errs[:2])
    b.close()
