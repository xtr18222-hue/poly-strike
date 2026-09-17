import os,json,time
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE=os.environ.get('TEST_URL','http://127.0.0.1:18957/')
results=[]
with sync_playwright() as p:
 b=p.chromium.launch(channel='msedge',headless=True);page=b.new_page(viewport={'width':1280,'height':800},service_workers='block');errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)));page.goto(BASE+'?test=1');page.wait_for_function('window.Game')
 page.locator('#settingsButton').click();page.select_option('#graphics','performance');page.locator('#applySettings').click();page.locator('#fallback').check()
 for mapid in ['desert','industrial','urban']:
  page.select_option('#mapSelect',mapid);page.locator('#start').click();page.wait_for_timeout(5500)
  data=page.evaluate('''()=>new Promise(resolve=>{const times=[],start=performance.now();let last=start;function frame(now){times.push(now-last);last=now;if(now-start<5000)requestAnimationFrame(frame);else{times.sort((a,b)=>a-b);resolve({fps:times.length*1000/(now-start),p95:times[Math.floor(times.length*.95)],state:Game.state(),jsHeap:performance.memory?.usedJSHeapSize});}}requestAnimationFrame(frame);})''')
  data['map']=mapid;results.append(data)
  assert data['fps']>=55,('near-60Hz target on this machine',data)
  assert data['state']['drawCalls']<180 and data['state']['pixels']<=307200
  page.screenshot(path=str(Path(__file__).parent/f'{mapid}-performance.png'))
  page.keyboard.press('Escape');page.locator('#toMenu').click()
 assert not errors,errors
 print(json.dumps({'hardware':'local Windows Edge, headless 1280x800, Performance Mode; not a 1GB device emulation','results':results,'errors':errors}))
 Path(__file__).with_name('performance-results.json').write_text(json.dumps(results,indent=2))
 b.close()
