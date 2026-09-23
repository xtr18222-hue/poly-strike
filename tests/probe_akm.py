from playwright.sync_api import sync_playwright

PROBE = """(() => {
  const w = window.__models['akm']; if (!w) return 'NO MODEL';
  w.updateMatrixWorld(true);
  const inMag = new Set();
  if (w.userData.mag) w.userData.mag.traverse(o => { if (o.isMesh) inMag.add(o); });
  const body = new THREE.Box3();
  w.traverse(o => {
    if (!o.isMesh || !o.visible || inMag.has(o)) return;
    const b = new THREE.Box3().setFromObject(o);
    if (!b.isEmpty()) body.union(b);
  });
  const rows = [];
  w.traverse(o => {
    if (!o.isMesh) return;
    const cb = new THREE.Box3().setFromObject(o);
    if (cb.isEmpty()) return;
    const dy = Math.max(body.min.y - cb.max.y, cb.min.y - body.max.y, 0);
    const dx = Math.max(body.min.x - cb.max.x, cb.min.x - body.max.x, 0);
    if (dy < 0.004 && dx < 0.004) return;
    rows.push((o.visible ? 'V ' : 'H ') + o.name + (inMag.has(o) ? ' [MAG]' : '')
      + ' p=' + (o.parent && o.parent.name)
      + ' y[' + cb.min.y.toFixed(3) + ',' + cb.max.y.toFixed(3) + ']'
      + ' dy=' + dy.toFixed(3) + ' dx=' + dx.toFixed(3));
  });
  return 'body.y[' + body.min.y.toFixed(3) + ',' + body.max.y.toFixed(3) + ']\\n' + rows.join('\\n');
})()"""

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True, args=[
        "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    pg = b.new_page(viewport={"width": 1280, "height": 720})
    pg.goto("http://127.0.0.1:18959/index.html?test=1", wait_until="domcontentloaded")
    pg.wait_for_timeout(7000)
    pg.click("#start")
    pg.wait_for_timeout(3000)
    print(pg.evaluate(PROBE))
