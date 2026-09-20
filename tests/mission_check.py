"""Mission board: winning a match registers progress, and the board resets
when the wall-clock hour bucket rolls over."""
import os, json
from playwright.sync_api import sync_playwright

URL = 'http://127.0.0.1:18959/'
OUT = os.environ['LOCALAPPDATA'] + r'\Temp\ps-shots'


def progress(txt):
    out = {}
    for line in txt.split('\n'):
        line = line.strip()
        if '/' in line and 'Reward' not in line and line:
            out[line.split('Reward')[0].strip()[:22]] = line.strip()[-10:]
    return out


with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL + '?test=1')
    pg.wait_for_timeout(1000)

    # Clean slate.
    pg.evaluate("localStorage.removeItem('poly-missions')")
    pg.evaluate("localStorage.removeItem('poly-mission-hour')")

    # 1. Board renders from the menu with a countdown.
    pg.click('#storeButton')
    pg.wait_for_timeout(300)
    txt0 = pg.evaluate("document.querySelector('#missionList').textContent")
    clock0 = pg.evaluate("document.querySelector('#missionClock') ? document.querySelector('#missionClock').textContent : ''")
    pg.click('#storeClose')
    pg.wait_for_timeout(200)

    # 2. Win a full match; recordCareer must push 'matches'/'wins'. The 'match'
    #    fixture puts the score at 4-0 and ends the round in the player's favour,
    #    so the end phase has to tick down (~4s) before matchover fires.
    pg.click('#start')
    pg.wait_for_timeout(900)
    pg.evaluate("window.Game.test.fixture('match')")
    for _ in range(9):
        pg.wait_for_timeout(1000)
        if pg.evaluate("window.Game.state().phase === 'matchover'"):
            break
    saved = pg.evaluate("localStorage.getItem('poly-missions') || '{}'")
    data = json.loads(saved)
    wins_after = data.get('wins3', {}).get('p', 0)
    matches_after = data.get('matches5', {}).get('p', 0)

    # 3. Return to the menu (the fixture ends the match) and reset the hour
    #    bucket to the past so the board must wipe on next open.
    pg.evaluate("localStorage.setItem('poly-mission-hour', '0')")
    pg.evaluate("localStorage.setItem('poly-missions', JSON.stringify({wins3:{p:2}, kills20:{p:7}}))")
    # Menu is visible again after the match ends (pause panel shows), so use
    # the store hook directly instead of a click that may race the overlay.
    pg.evaluate("document.querySelector('#pause') && (document.querySelector('#pause').hidden = true)")
    pg.evaluate("document.querySelector('#menu') && (document.querySelector('#menu').hidden = true)")
    pg.wait_for_timeout(200)
    txt2 = pg.evaluate("""
      () => {
        const b = document.querySelector('#storeButton');
        if (b && b.offsetParent !== null) { b.click(); }
        else { window.__renderMissions ? window.__renderMissions() : 0; }
        return document.querySelector('#missionList').textContent;
      }
    """)
    p2 = progress(txt2)
    print('clock:', clock0)
    print('wins3 after a win:', wins_after, ' matches5:', matches_after)
    print('after hour reset:', json.dumps(p2))

    checks = {
        'board_renders': bool(txt0.strip()),
        'shows_countdown': ':' in clock0,
        'win_registers_progress': wins_after >= 1,
        'match_play_registers': matches_after >= 1,
        'hourly_reset_clears_progress': bool(p2) and all('0 / ' in v for v in p2.values()),
    }
    pg.screenshot(path=OUT + r'\shot-missions.png')
    print(json.dumps({'checks': checks, 'errors': errs}, indent=1))
    print('ALL PASS' if all(checks.values()) and not errs else 'FAILURES')
    b.close()
