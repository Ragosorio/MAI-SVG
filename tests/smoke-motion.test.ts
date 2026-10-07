import test from 'node:test';import assert from 'node:assert/strict';
import {flowField,FLUID_PRESETS} from '../packages/core/modifiers.js';
import type {Modifier} from '../packages/core/model.js';
test('smoke anchors emitter, rises locally with distinct pockets and closes fractional-speed loop',()=>{
 const m:Modifier={id:'s',name:'smoke',enabled:true,rest:{},kind:'flow',preset:'smoke',targets:['smoke'],params:{...FLUID_PRESETS.smoke.params,speedFactor:.6},direction:{x:0,y:-1},anchor:{x:50,y:100},bounds:{x:0,y:0,width:100,height:100}};
 const field=flowField(m,9);
 const emitter=field.fn({x:50,y:100},2);assert.ok(Math.hypot(emitter.x,emitter.y)<1e-12);
 let upward=0,sideways=0;const ys:number[]=[];
 for(let i=0;i<32;i++){const v=field.fn({x:50,y:35},i*9/32);upward+=-v.y;sideways+=Math.abs(v.x);ys.push(v.y);assert.ok(Number.isFinite(v.x)&&Number.isFinite(v.y));}
 assert.ok(upward>sideways*2,'upward lift should dominate lateral sway');assert.ok(Math.max(...ys)-Math.min(...ys)>1,'pockets vary over time');
 assert.notDeepEqual(field.fn({x:35,y:20},2),field.fn({x:65,y:60},2));
 const tip=field.fn({x:50,y:0},2);assert.ok(Math.hypot(tip.x,tip.y)<1e-12,'tip must not be cut by the extraction clip');
 const a=field.fn({x:30,y:20},0),b=field.fn({x:30,y:20},9);assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<1e-8);
});
