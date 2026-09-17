const test=require('node:test'),assert=require('node:assert/strict');
test('three graphics presets have explicit bounded render budgets',()=>{
 const S=require('../settings.js');
 assert.deepEqual(Object.keys(S.PRESETS),['high','medium','performance']);
 assert.ok(S.PRESETS.performance.pixelRatio<S.PRESETS.high.pixelRatio);
 assert.ok(S.PRESETS.performance.maxPixels<=640*480);
 assert.equal(S.normalize('invalid'),'medium');
});
