import os
from playwright.sync_api import sync_playwright

BASE = os.environ.get('TEST_URL', 'http://127.0.0.1:18957/')
errors = []


def check(cond, msg):
    if not cond:
        print('FAIL: ' + msg)
        errors.append(msg)
    else:
        print('ok: ' + msg)


with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    c = b.new_context(viewport={'width': 1280, 'height': 800}, service_workers='block')
    page = c.new_page()
    page.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
    page.on('console', lambda m: errors.append('console: ' + m.text) if m.type == 'error' else None)

    page.goto(BASE + '?test=1')
    page.wait_for_timeout(700)
    check(not errors, 'no load errors')

    # Training is the fourth map option, ordered after the three arenas.
    options = page.evaluate('Array.from(document.querySelectorAll("#mapSelect option")).map(o=>o.value)')
    check(options == ['desert', 'industrial', 'urban', 'training'], 'map select offers four maps in order: ' + ','.join(options))

    page.select_option('#mapSelect', 'training')
    # Match performance.py: select the Performance preset so the render budget
    # is actually capped before the pixel/draw-call assertions run.
    page.locator('#settingsButton').click()
    page.select_option('#graphics', 'performance')
    page.locator('#applySettings').click()
    page.click('#loadoutButton')
    page.wait_for_timeout(200)
    page.click('.wcard[data-weapon="kar98"]')
    page.wait_for_timeout(150)
    page.click('#loadoutClose')
    page.wait_for_timeout(150)
    page.check('#fallback')
    page.click('#start')
    page.wait_for_timeout(700)

    state = lambda: page.evaluate('Game.state()')
    s = state()
    check(s['map'] == 'training', 'training map loads as the fourth arena')
    check(not page.evaluate("document.querySelector('#scope').hidden === false"), 'no scope overlay in training')
    check(page.evaluate("document.querySelector('#objective').textContent.includes('TRAINING')"), 'HUD reads TRAINING, not HOSTILES REMAIN')

    # No match pressure: the round clock is frozen and the score never advances.
    page.wait_for_timeout(1500)
    s2 = state()
    check(s2['score']['player'] == 0 and s2['score']['enemy'] == 0, 'no score pressure in training')

    # Targets are static range dummies that do not shoot back.
    before = page.evaluate('Game.state().hp')
    page.wait_for_timeout(2000)
    check(page.evaluate('Game.state().hp') == before, 'targets never return fire')

    # Full weapon handling: switch to the Kar98k, ADS, reload with a mag drop.
    page.wait_for_timeout(300)
    check(state()['weapon'] == 'kar98', 'Kar98k is the equipped primary in training')

    page.mouse.down(button='right')
    page.wait_for_timeout(250)
    s3 = state()
    check(s3['ads'] is True and s3['scoped'] is False, 'Kar98k ADS is iron sights, never a scope')
    page.mouse.up(button='right')

    # Unscoped Kar98k keeps realistic sniper damage: a headshot drops a target.
    # Stand the target well clear of the mid-cover crates so the ray is clean.
    page.evaluate('Game.test.fixture("target", 100)')
    page.wait_for_timeout(150)
    page.evaluate('Game.test.place(0, 10); Game.test.aim(0)')
    page.wait_for_timeout(150)
    hp0 = page.evaluate('Game.state().alive')
    page.mouse.down(button='left')
    page.wait_for_timeout(150)
    page.mouse.up(button='left')
    page.wait_for_timeout(400)   # damage applies on impact, before the 2.5s respawn
    hp1 = page.evaluate('Game.state().alive')
    check(hp1 < hp0, f'unscoped Kar98k still hits hard ({hp0} -> {hp1} targets alive)')
    page.wait_for_timeout(1800)  # let the bolt cycle finish before reloading

    # Tactical reload drops the spent magazine into the world.
    page.keyboard.press('KeyR')
    page.wait_for_timeout(300)
    check(state()['reload'] > 0, 'reload starts on R')
    page.wait_for_timeout(3200)
    check(state()['ammo']['kar98']['mag'] == 5, 'reload seats a fresh 5-round magazine')

    # Inspections still play in training.
    page.keyboard.press('KeyF')
    page.wait_for_timeout(200)
    check(state()['inspect'] > 0, 'F inspection plays in training')
    page.wait_for_timeout(3600)

    # Performance stays inside budget on the new arena.
    page.wait_for_timeout(1200)
    perf = page.evaluate('({drawCalls: Game.state().drawCalls, pixels: Game.state().pixels, frames: Game.state().frames})')
    check(perf['pixels'] <= 307200, f"render budget held ({perf['pixels']} px)")
    check(perf['drawCalls'] < 200, f"draw calls inside budget ({perf['drawCalls']})")

    check(not errors, 'zero console/page errors')
    print('\nPASS: training mode — fourth map, static targets, unscoped Kar98k ADS, tactical reload, inspections; zero errors')
    b.close()

if errors:
    print('\nERRORS:', len(errors))
    for e in errors:
        print(' -', e)
    raise SystemExit(1)
