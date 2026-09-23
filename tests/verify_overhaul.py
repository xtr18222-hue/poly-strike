"""Live verification of the overhaul: hands-free viewmodel, removed inspection,
top-down camera, Pro FPS bot animations, and no console errors.

Run with:  uv run --with playwright python tests/verify_overhaul.py
"""
import json, sys, time
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:18959/index.html?test=1"

def main():
    with sync_playwright() as p:
        b = p.chromium.launch(channel="msedge", headless=True, args=[
            "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pg = b.new_page(viewport={"width": 1280, "height": 720})
        # The service worker caches with ignoreSearch:true, so ?test=1 still
        # serves the PREVIOUS deployment's assets. Unregister before first load.
        pg.add_init_script("navigator.serviceWorker && navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))")
        errors = []
        pg.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        pg.goto(URL, wait_until="domcontentloaded")
        pg.wait_for_timeout(6000)

        # Standard maps only: the code-entry test maps were removed, so the
        # smoke check deploys on the default arena straight from the menu.
        def ev(expr):
            return pg.evaluate(f"(() => {{ try {{ return {expr}; }} catch(e) {{ return 'ERR '+e.message; }} }})()")

        ev("document.querySelector('#start').click()")
        pg.wait_for_timeout(5000)

        st = ev("JSON.stringify(window.Game ? window.Game.state() : null)")
        st = json.loads(st) if st and st != "null" else {}
        print("running:", st.get("running"), "| map:", st.get("map"),
              "| phase:", st.get("phase"), "| drawCalls:", st.get("drawCalls"))
        print("weapon:", st.get("weapon"), "| inventory:", st.get("inventory"))

        # --- hands-free viewmodel ---
        vm = ev("""(() => {
          const vs = window.__viewScene; if (!vs) return 'no viewScene';
          const m = window.__models[window.Game.state().weapon];
          if (!m) return 'no model';
          m.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(m);
          const s = box.getSize(new THREE.Vector3());
          // Fitted weapon lies along Y after the -90deg pose pitch, so once the
          // pose is applied the long axis should be forward (Z).
          return {visible: m.visible, size: [s.x,s.y,s.z].map(v=>+v.toFixed(3)),
                  rot: [+m.rotation.x.toFixed(3),+m.rotation.y.toFixed(3),+m.rotation.z.toFixed(3)],
                  pos: [+m.position.x.toFixed(3),+m.position.y.toFixed(3),+m.position.z.toFixed(3)]};
        })()""")
        print("viewmodel:", json.dumps(vm))

        # --- bot animation suite ---
        bots = ev("""(() => {
          const out = [];
          for (const g of (window.__bots||[])) {
            const mx = g.userData.mixer;
            let name = null, t = null;
            g.traverse(o => { if (o.name && o.name.startsWith('clip:')) name = o.name; });
            if (mx) { const a = mx._actions ? mx._actions[0] : null;
                      if (a) t = +a.time.toFixed(2); }
            out.push({clip: name, time: t, armed: !!g.userData.mixer});
          }
          return JSON.stringify(out);
        })()""")
        print("bots:", bots)

        # --- top-down toggle ---
        # Headless: clicking the canvas first takes focus/pointer lock, or a
        # window blur pauses the match before the keydown handler can run.
        pg.mouse.click(640, 360)
        pg.wait_for_timeout(400)
        pg.keyboard.press("KeyT")
        pg.wait_for_timeout(1200)
        print("topDown after T:", ev("window.Game.state().topDown"))
        cam = ev("""(() => {
          const c = window.__cam || null;
          return c ? [+c.position.x.toFixed(1), +c.position.y.toFixed(1), +c.position.z.toFixed(1)] : 'no cam';
        })()""")
        print("cam while top-down:", cam)
        pg.keyboard.press("KeyT")
        pg.wait_for_timeout(800)
        print("topDown after 2nd T:", ev("window.Game.state().topDown"))

        # --- inspection gone ---
        print("PolyInspection gone:", ev("typeof window.PolyInspection === 'undefined'"))

        pg.wait_for_timeout(1500)
        print("\nERRORS:", len(errors))
        for e in errors[:10]: print("  ", e)
        pg.screenshot(path="tests/verify_overhaul.png")
        print("screenshot: tests/verify_overhaul.png")
        b.close()
        return 1 if errors else 0

sys.exit(main())
