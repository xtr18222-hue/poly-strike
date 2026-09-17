/* Explicit budgets, no post-processing or shadow-map allocations. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PolySettings=api;})(typeof self!=='undefined'?self:this,()=>{
 const PRESETS=Object.freeze({
  high:Object.freeze({pixelRatio:1.5,maxPixels:1920*1080,far:170,hudHz:15,effects:true}),
  medium:Object.freeze({pixelRatio:1,maxPixels:1280*720,far:120,hudHz:10,effects:true}),
  performance:Object.freeze({pixelRatio:.65,maxPixels:640*480,far:90,hudHz:8,effects:false})
 });
 const normalize=value=>Object.hasOwn(PRESETS,value)?value:'medium';
 function resolution(width,height,dpr,preset){const p=PRESETS[normalize(preset)];const ratio=Math.min(dpr||1,p.pixelRatio,Math.sqrt(p.maxPixels/Math.max(1,width*height)));return {width:Math.max(1,Math.floor(width*ratio)),height:Math.max(1,Math.floor(height*ratio)),ratio};}
 return {PRESETS,normalize,resolution};
});
