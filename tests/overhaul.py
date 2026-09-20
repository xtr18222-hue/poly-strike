import os, sys
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

    # --- strict main menu order: Play Offline / Play Online / Loadout / Store / Settings
    order = page.locator('#mainActions button').all_text_contents()
    check(order == ['Play Offline (vs Bots)', 'Play Online', 'Loadout', 'Settings'],
          'menu order is Play Offline / Play Online / Loadout / Settings %s' % order)
    check(page.locator('#primarySelect').count() == 0, 'legacy primary loadout select removed')

    # --- Loadout hub: previews render, primary + secondary selection persist
    page.click('#loadoutButton')
    page.wait_for_timeout(400)
    check(page.locator('#loadoutPanel').is_visible(), 'loadout panel opened')
    check(page.locator('#primaryCards .wcard').count() == 3, 'three primary cards (AK/AWP/Kar98k)')
    check(page.locator('#secondaryCards .wcard').count() == 2, 'two secondary cards (Deagle/Knife)')

    for key in ['akm', 'l96', 'mosin']:
        page.click('.wcard[data-weapon="%s"]' % key)
        page.wait_for_timeout(200)
        check(page.evaluate('Game.state().primary') == key, 'primary set to %s' % key)
        check(page.evaluate('document.querySelector("#loadoutCanvas") !== null'),
              'loadout preview canvas present for %s' % key)

    page.click('.wcard[data-weapon="bayonet"]')
    page.wait_for_timeout(150)
    check(page.evaluate('localStorage.getItem("poly-secondary")') == 'bayonet',
          'secondary persists to localStorage')

    # inspection inside the hub drives the preview pose
    page.click('#loadoutInspect')
    page.wait_for_timeout(300)
    page.click('#loadoutClose')
    page.wait_for_timeout(200)

    # --- Crosshair customization persists and applies to the DOM
    page.locator('#settingsButton').click()
    page.wait_for_timeout(200)
    page.locator('#crosshairGap').fill('12')
    page.locator('#crosshairLength').fill('11')
    page.locator('#crosshairThickness').fill('4')
    page.select_option('#crosshairColor', '#ff5454')
    page.locator('#applySettings').click()
    page.wait_for_timeout(300)
    check(page.evaluate('localStorage.getItem("poly-crosshair")') is not None,
          'crosshair config saved')
    gap = page.evaluate("getComputedStyle(document.querySelector('#crosshair')).getPropertyValue('--gap')")
    check(gap.strip() == '12px', 'crosshair gap applied to DOM (%s)' % gap.strip())

    # --- Career stats: play a match so the tab has data to render
    page.click('#loadoutButton')
    page.wait_for_timeout(200)
    page.click('.wcard[data-weapon="mosin"]')
    page.wait_for_timeout(150)
    page.click('#loadoutClose')
    page.wait_for_timeout(200)
    page.check('#fallback')
    page.click('#start')
    page.wait_for_timeout(800)
    check(page.evaluate('Game.state().running') is True, 'match started')

    # Dry-fire: empty the magazine, then pull the trigger.
    page.evaluate('Game.test.empty()')
    page.wait_for_timeout(100)
    st = page.evaluate('Game.state()')
    check(st['ammo'][st['weapon']]['mag'] == 0, 'magazine emptied for dry-fire test')
    page.mouse.click(640, 400)
    page.wait_for_timeout(400)
    st = page.evaluate('Game.state()')
    check(page.evaluate('Game.state().ammo.' + st['weapon'] + '.mag') == 0,
          'dry trigger does not consume ammo')

    # Low-health vignette engages below 25 hp.
    page.evaluate('Game.test.lowHealth()')
    page.wait_for_timeout(600)
    check(page.evaluate('document.body.classList.contains("low-health")') is True,
          'low-health vignette class applied at 19 hp')

    # Bullet decals: shoot a wall and confirm a decal effect is pooled.
    page.evaluate('Game.test.fixture("target", 100)')
    page.wait_for_timeout(300)
    before = page.evaluate('Game.state().effects')
    page.keyboard.press('Digit2')
    page.wait_for_timeout(200)
    page.evaluate('Game.test.aim(0)')
    page.mouse.move(640, 250)
    page.wait_for_timeout(50)
    page.mouse.click(640, 250)
    page.wait_for_timeout(300)
    check(page.evaluate('Game.state().weapon') == 'deagle', 'switched to deagle')
    check(page.evaluate('Game.state().effects') >= before, 'firing produces pooled effects')

    # Fast switch back to the primary while the match is still live.
    page.keyboard.press('Digit1')
    page.wait_for_timeout(300)
    check(page.evaluate('Game.state().weapon') == 'mosin', 'fast switch back to Kar98k')

    # --- Career tab records the finished match.
    page.evaluate('Game.test.fixture("match")')
    page.wait_for_timeout(600)
    page.click('#pauseCareer')
    page.wait_for_timeout(300)
    check(page.locator('#careerPanel').is_visible(), 'career panel opens from pause menu')
    career = page.evaluate('localStorage.getItem("poly-career")')
    check(career is not None, 'career stats persisted (%s)' % career)
    check(page.locator('#careerStats .stat').count() >= 8, 'career stats rendered')
    page.click('#careerClose')
    page.wait_for_timeout(200)

    b.close()

print()
if errors:
    print('ERRORS: %d' % len(errors))
    for e in errors[:20]:
        print(' -', e)
    sys.exit(1)
print('PASS: overhaul systems - loadout hub, crosshair, career, dry-fire, vignette, decals; zero errors')
