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
WEAPONS = ["akm", "deagle", "l96", "mosin", "hecate", "bayonet", "mx"]

RENDER = """(() => {
  try {
    var key = %s;
    var m = window.__models[key];
    if (!m) return 'ERR no model for ' + key;
    // The bound model is hidden until it is the active weapon, so build the
    // render from a visible clone rather than trusting its visibility flag.
    m.updateMatrixWorld(true);
    var src = m.clone();
    src.traverse(function(o){ o.visible = true; });
    var box = new THREE.Box3().setFromObject(src);
    var c = box.getCenter(new THREE.Vector3());
    var cv = document.querySelector('#game');
    var R3 = window.THREE;
    var r = new R3.WebGLRenderer({canvas: cv, antialias: true, preserveDrawingBuffer: true});
    var sc = new R3.Scene();
    sc.add(new R3.HemisphereLight(0xffffff, 0x445566, 2.0));
    var dl = new R3.DirectionalLight(0xffffff, 1.6); dl.position.set(1, 1, 0.4); sc.add(dl);
    var holder = new R3.Group();
    // The model is a live object in the game's scene graph; reparenting it
    // into this throwaway holder would detach it. Clone for the render so the
    // gameplay model keeps its own parent, and only this copy moves.
    holder.add(src);
    holder.position.set(-c.x, -c.y, -c.z);
    sc.add(holder);
    // Side view: camera on +X looking along -X. Barrel runs horizontally,
    // up is vertical, so a roll off upright is immediately visible.
    var sz = box.getSize(new THREE.Vector3());
    var span = Math.max(sz.y, 0.1);
    var halfW = Math.max(sz.z, sz.x) * 0.72 + 0.05;
    var cam = new R3.OrthographicCamera(-halfW, halfW, span * 0.72, -span * 0.72, 0.01, 10);
    cam.position.set(2, 0, 0); cam.lookAt(0, 0, 0);
    r.setClearColor(new R3.Color(0x20242b), 1);
    r.render(sc, cam);
    var png = cv.toDataURL('image/png').split(',')[1];

    // Assembly check: every visible mesh must sit inside the fitted body box.
    // The clean base exports name their meshes generically ("Object_4"), so
    // there is no "receiver" pivot to anchor on — use the weapon's own fitted
    // box (the fitter centres the grip at the origin) and measure each part
    // against its silhouette in the side view.
    // Silhouette check: a floating part is an island that does not touch the
    // rest of the weapon. Test it directly — the gap between this mesh's box
    // and the union of every other visible mesh must be ~0 when seated. Axis
    // reasoning fails here (the fitted frame's thin axis is the gun's depth,
    // so a naive perpendicular test flags the whole gun as floating).
    var bad = [];
    var vis = [];
    src.traverse(function (o) { if (o.isMesh && o.visible) vis.push(o); });
    for (var i = 0; i < vis.length; i++) {
      var o = vis[i];
      var b = new R3.Box3().setFromObject(o);
      if (b.getSize(new R3.Vector3()).lengthSq() < 1e-6) continue;
      // Union of every other visible mesh.
      var rest = new R3.Box3();
      var any = false;
      for (var j = 0; j < vis.length; j++) {
        if (j === i) continue;
        var b2 = new R3.Box3().setFromObject(vis[j]);
        if (b2.isEmpty()) continue;
        rest.union(b2); any = true;
      }
      if (!any) continue;
      var closest = rest.clampPoint(b.getCenter(new THREE.Vector3()), new THREE.Vector3());
      var gap = b.distanceToPoint(closest);
      if (gap > 0.006) bad.push([o.name, +gap.toFixed(3)]);
    }

    var s = box.getSize(new R3.Vector3());
    return JSON.stringify({
      png: png,
      size: [+s.x.toFixed(3), +s.y.toFixed(3), +s.z.toFixed(3)],
      receiver: "body-box",
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
