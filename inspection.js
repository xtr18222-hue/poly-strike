/* Deterministic C2-eased inspection paths. Radians and metres. */
(function(root,f){if(typeof module==='object'&&module.exports)module.exports=f();else root.PolyInspection=f();})(globalThis,()=>{
 const durations={ak47:2.6,deagle:2.3,awp:3.2,knife:1.5};
 const smooth=t=>t*t*t*(10+t*(-15+6*t));
 function pose(key,t,variant=0){t=Math.max(0,Math.min(1,t));const e=smooth(t),w=Math.sin(Math.PI*e),b=w*w,p={dx:0,dy:0,dz:0,rx:0,ry:0,rz:0,handleA:0,handleB:0,blade:0};
 if(key==='awp'){p.dx=-.12*b;p.dy=.13*b*Math.cos(Math.PI*e);p.rx=-.25*b*Math.cos(Math.PI*e);p.ry=.42*b;p.rz=-.12*b;}
 else if(key==='knife'){const sign=variant===0?1:-1;p.dx=-.07*b;p.dy=.055*b;p.rz=sign*2*Math.PI*e;p.handleA=sign*Math.PI*2*b;p.handleB=-sign*Math.PI*2*b;p.blade=sign*.35*b;}
 else{p.dx=-.12*b;p.dy=(key==='ak47'?.2:.22)*b;p.dz=-.08*b;p.rx=.22*b;p.ry=-.35*b;p.rz=(key==='ak47'?1:-1)*Math.PI*2*e;}
 return p;
 }
 return {durations,pose};
});
