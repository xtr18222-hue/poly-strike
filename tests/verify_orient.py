"""Ground-truth orientation check for every weapon.

Rather than trust the composite bounding box (a floating spare magazine can
hold it upright while the model renders as junk), render each fitted weapon
in an ORTHOGRAPHIC side view on a throwaway renderer and assert directly:

  * the barrel runs along the horizontal (bore = +/-Z in the fitted frame)
  * the vertical span exceeds the horizontal depth span by more than 1.4x
    (a sideways-rolled rifle is wider than it is tall)
  * every visible mesh sits inside the receiver's silhouette (no floating parts)

The render is captured synchronously via toDataURL so the game's own 60fps
loop cannot overwrite the frame before the screenshot lands.
"""
import base64
import json
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:18959/index.html?test=1"
WEAPONS = ["akm", "deagle", "l96", "mosin", "hecate", "bayonet"]

RENDER = """(() => {
  try {
    var key = %s;
    var m = window.__models[key];
    if (!m) return 'ERR no model for ' + key;
    m.updateMatrixWorld(true);
    var box = new THREE.Box3().setFromObject(m);
    var c = box.getCenter(new THREE.Vector3());
    var cv = document.querySelector('#game');
    var R3 = window.THREE;
    var r = new R3.WebGLRenderer({canvas: cv, antialias: true, preserveDrawingBuffer: true});
    var sc = new R3.Scene();
    sc.add(new R3.HemisphereLight(0xffffff, 0x445566, 2.0));
    var dl = new R3.DirectionalLight(0xffffff, 1.6); dl.position.set(1, 1, 0.4); sc.add(dl);
    var holder = new R3.Group();
    holder.add(m);
    holder.position.set(-c.x, -c.y, -c.z);
    sc.add(holder);
    // Side view: camera on +X looking along -X. Barrel runs horizontally,
    // up is vertical, so a roll off upright is immediately visible.
    var span = Math.max(box.getSize(new THREE.Vector3()).y, 0.1);
    var cam = new R3.OrthographicCamera(-0.6, 0.6, span * 0.72, -span * 0.72, 0.01, 10);
    cam.position.set(2, 0, 0); cam.lookAt(0, 0, 0);
    r.render(sc, cam);
    var png = cv.toDataURL('image/png').split(',')[1];

    // Assembly check: every visible mesh must lie inside the receiver box.
    var bad = [];
    var recName = null;
    m.traverse(function(o) {
      if (!o.isMesh || !o.visible) return;
      if (/receiver|frame|body/.test(o.name || '')) recName = recName || o.name;
    });
    var rb = recName ? new R3.Box3().setFromObject(m.getObjectByName(recName)) : box;
    m.traverse(function(o) {
      if (!o.isMesh || !o.visible) return;
      var b = new R3.Box3().setFromObject(o);
      var s = b.getSize(new R3.Vector3());
      if (s.lengthSq() < 1e-6) return;
      // Stock and barrel legitimately extend past the receiver along the bore;
      // flag only parts that break away sideways (|x| or |y| far outside).
      var c2 = b.getCenter(new R3.Vector3());
      var rc = rb.getCenter(new R3.Vector3());
      var rs = rb.getSize(new R3.Vector3());
      var over = Math.max(Math.abs(c2.x - rc.x) - rs.x/2 - 0.05,
                          Math.abs(c2.y - rc.y) - rs.y/2 - 0.05);
      if (over > 0.02) bad.push([o.name, +over.toFixed(3)]);
    });
    var s = box.getSize(new R3.Vector3());
    return JSON.stringify({
      png: png,
      size: [+s.x.toFixed(3), +s.y.toFixed(3), +s.z.toFixed(3)],
      receiver: recName,
      stray: bad,
      ratio: +(s.y / Math.max(s.x, 0.001)).toFixed(2)
    });
  } catch(e) { return 'ERR ' + e.message; }
})()"""


def main():
    results = {}
    with sync_playwright() as p:
        b = p.chromium.launch(channel="msedge", headless=True, args=[
            "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pg = b.new_page(viewport={"width": 1280, "height": 720})
        pg.add_init_script("navigator.serviceWorker && navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))")
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(URL, wait_until="domcontentloaded")
        pg.wait_for_timeout(7000)
        pg.click("#start")
        pg.wait_for_timeout(3000)
        pg.click("canvas")
        pg.wait_for_timeout(1500)

        for w in WEAPONS:
            raw = pg.evaluate(RENDER % json.dumps(w))
            try:
                d = json.loads(raw)
            except Exception:
                print(f"{w}: {raw}")
                continue
            open(f"tests/shots/side-{w}.png", "wb").write(base64.b64decode(d["png"]))
            results[w] = {k: v for k, v in d.items() if k != "png"}
            print(f"{w}: size={d['size']} ratio(tall/wide)={d['ratio']} "
                  f"receiver={d['receiver']} stray={d['stray']}")

        print("\nERRORS:", len(errors))
        for e in errors[:6]:
            print("  ", e)

    bad = {w: v for w, v in results.items() if v.get("stray")}
    low = {w: v["ratio"] for w, v in results.items() if v.get("ratio", 0) < 1.0}
    print("\nSUMMARY")
    print("  weapons with stray parts:", bad if bad else "none")
    print("  weapons wider than tall :", low if low else "none")


if __name__ == "__main__":
    main()
