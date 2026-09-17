"""Read actual radar pixels at world-to-map positions; no screenshot guesswork."""
import os
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(channel='msedge',headless=True);page=b.new_page(service_workers='block')
 page.goto(os.environ.get('TEST_URL','http://127.0.0.1:18957/')+'?test=1');page.wait_for_function('window.Game');page.locator('#fallback').check();page.locator('#start').click();page.evaluate("Game.test.fixture('target')");page.wait_for_timeout(150)
 def pixel(x,z):return page.locator('#radar').evaluate('(c,p)=>Array.from(c.getContext("2d").getImageData(85+p[0]*2,85+p[1]*2,1,1).data)',[x,z])
 assert pixel(0,20)[:3]==[217,245,119],pixel(0,20)
 assert pixel(0,14)[:3]==[255,115,94],pixel(0,14)
 page.evaluate('Game.test.place(4,20)');page.wait_for_timeout(150);assert pixel(4,20)[:3]==[217,245,119]
 # Wall-occluded bots are still tracked, matching the always-active radar requirement.
 page.evaluate('Game.test.place(-30,-30)');page.wait_for_timeout(150);assert pixel(0,14)[:3]==[255,115,94]
 print('PASS radar pixels track player movement and live bot world coordinates');b.close()
