"""Verify the trainer switching system end-to-end in the browser:
static targets on entry, switch toggles live bots, damage stops on toggle back.
Mirrors the deploy flow used by tests/training.py."""
import sys, json
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:18959/'

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL + '?test=1')
    pg.wait_for_timeout(900)

    pg.select_option('#mapSelect', 'training')
    pg.click('#start')
    pg.wait_for_timeout(1500)
    st = pg.evaluate("window.Game ? window.Game.state() : null")

    checks = {}
    checks['entered_training'] = bool(st and st.get('map') == 'training' and st.get('running'))
    checks['phase_live'] = bool(st and st.get('phase') == 'live')
    checks['mode_static_on_entry'] = pg.evaluate("window.__match ? window.__match.mode === 'static' : false")

    # 1. Targets must stay put over half a second in static mode.
    before = pg.evaluate("window.__bots ? JSON.stringify(window.__bots.map(b=>[b.position.x,b.position.z])) : null")
    pg.wait_for_timeout(500)
    after = pg.evaluate("window.__bots ? JSON.stringify(window.__bots.map(b=>[b.position.x,b.position.z])) : null")
    checks['targets_static_on_entry'] = before == after

    # 2. The switch box exists and is raycastable.
    checks['switch_present'] = bool(pg.evaluate("""
      () => { try { return !!(window.__arena && [...window.__arena.hitMeshes].find(h=>h.userData.switchMesh)); } catch(e){ return false; } }
    """))

    # 3. Toggle: static -> active.
    checks['toggle_to_active'] = pg.evaluate("window.__match ? window.__match.toggleMode() === 'active' : false")

    # 4. Active mode must deal damage over ~5s (the bots are really shooting).
    hp0 = pg.evaluate("window.Game.state().hp")
    pg.wait_for_timeout(5000)
    hp1 = pg.evaluate("window.Game.state().hp")
    checks['active_bots_deal_damage'] = hp1 < hp0

    # 5. Toggle back: targets freeze and the damage stops.
    checks['toggle_to_static'] = pg.evaluate("window.__match ? window.__match.toggleMode() === 'static' : false")
    pg.wait_for_timeout(500)
    hp2 = pg.evaluate("window.Game.state().hp")
    checks['damage_stops_after_toggle'] = hp2 >= hp1 - 0.01

    # 6. HUD objective line reflects the mode.
    obj = pg.evaluate("document.querySelector('#objective').textContent")
    checks['hud_mentions_switch'] = 'SWITCH' in obj.upper()

    print(json.dumps({'checks': checks, 'errors': errs, 'hp': [hp0, hp1, hp2],
                      'objective': obj}, indent=1))
    ok = all(checks.values()) and not errs
    print('ALL PASS' if ok else 'FAILURES')
    b.close()
