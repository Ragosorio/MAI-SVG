// F3: mai.motion-plan/v2 is the main authoring path — any core operation, motion assertions as tests, draft evaluation
// (filmstrip + critique) and a deterministic loop status, all in one atomic, dry-runnable, undoable transaction.
import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {existsSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {studio,buildFixture,port} from '../scripts/fixtures/mini-character.js';
import {closeRenderer} from '../packages/server/render.js';

const v2=(inspect:Record<string,unknown>,extra:Record<string,unknown>={})=>({protocol:'mai.motion-plan/v2',requestId:`req-${Math.random().toString(36).slice(2,10)}`,sessionId:String(inspect.sessionId),documentId:String(inspect.documentId),expectedRevision:Number(inspect.revision),mode:'dry-run',label:'Frasco vivo',
 commands:[{id:'flask',type:'ops',ops:[{type:'pose',id:'flask',pose:{pivotX:160,pivotY:190}},{type:'acting.beat',target:'flask',property:'rotation',start:.3,duration:2,action:14,id:'tilt'},{type:'signal.add',signal:{id:'flask-drift',output:{target:'flask',property:'y',layer:'pose'},source:{kind:'drift',amplitude:1.5,period:2}}}]}],
 assertions:[{type:'energy',part:'#flask',min:.5}],evaluation:{filmstrip:{count:6,sampling:'significant'},critique:true},validation:{times:[0,2],required:['structural'],preview:false},provenance:{kind:'user-direction',text:'Que el frasco se sienta vivo'},...extra});

test('v2 dry-run evaluates the draft (filmstrip, critique, assertions) without changing the scene; commit applies, saves the tests, and undo restores',async()=>{
 const root=await mkdtemp(join(tmpdir(),'mai-v2-'));const p=await port();const s=await studio(root,p);
 try{await buildFixture(s.call,s.post);const inspect=await s.call('scene.inspect');
  const dry=await s.call('plan.execute',{plan:v2(inspect)}) as Record<string,any>;assert.equal(dry.ok,true,JSON.stringify(dry.error));assert.equal(dry.status,'prepared');assert.equal(dry.revision,inspect.revision);
  assert.ok(existsSync(dry.evaluation.filmstrip.sheet.path),'draft filmstrip');assert.ok(Array.isArray(dry.evaluation.critique.findings));assert.equal(dry.verify.passed,true);assert.equal(typeof dry.loop.shouldContinue,'boolean');
  assert.deepEqual(dry.changes[0].operations,['pose','acting.beat','signal.add']);
  const done=await s.call('plan.execute',{plan:v2(inspect,{mode:'commit'})}) as Record<string,any>;assert.equal(done.ok,true,JSON.stringify(done.error));assert.equal(done.status,'committed');assert.equal(done.revision,Number(inspect.revision)+1);
  const state=await (await fetch(`${s.url}/api/state`)).json();assert.deepEqual(state.project.assertions,[{type:'energy',part:'#flask',min:.5}],'assertions saved as regression tests');assert.ok(state.project.signals.some((x:{id:string})=>x.id==='flask-drift'));
  const verified=await s.call('motion.verify',{}) as Record<string,any>;assert.equal(verified.passed,true,'saved tests re-run on the scene');
  await s.call('history.undo',{expectedRevision:done.revision,token:done.transaction.undoToken});const after=await (await fetch(`${s.url}/api/state`)).json();assert.equal(after.project.assertions,undefined);assert.ok(!(after.project.signals??[]).length);
 }finally{await s.app.close();await closeRenderer();await rm(root,{recursive:true,force:true});}
});

test('v2 gates: a failing verify gate commits nothing and says what it measured; a mistyped op field is rejected with its path',async()=>{
 const root=await mkdtemp(join(tmpdir(),'mai-v2g-'));const p=await port();const s=await studio(root,p);
 try{await buildFixture(s.call,s.post);const inspect=await s.call('scene.inspect');
  const failed=await s.call('plan.execute',{plan:v2(inspect,{mode:'commit',assertions:[{type:'still',part:'#flask',maxSpeed:.01}],validation:{times:[0],required:['structural','verify'],preview:false}})}) as Record<string,any>;
  assert.equal(failed.ok,false);assert.equal(failed.error.code,'VERIFY_FAILED');assert.ok(failed.error.verify.failed.length>=1);
  const state=await (await fetch(`${s.url}/api/state`)).json();assert.equal(state.revision,inspect.revision,'nothing committed');
  const typo=await s.call('plan.execute',{plan:v2(inspect,{commands:[{id:'x',type:'ops',ops:[{type:'keyframe',target:'flask',property:'rotation',time:1,value:5,ease:'linear'}]}]})}) as Record<string,any>;
  assert.equal(typo.ok,false);assert.equal(typo.error.code,'INVALID_ARGUMENT');assert.match(String(typo.error.path),/commands\.0\.ops\.0/);assert.ok(typo.error.accepted.includes('easing'));
 }finally{await s.app.close();await closeRenderer();await rm(root,{recursive:true,force:true});}
});

test('variations: branch two directions as evaluated drafts, compare them side by side, promote one; the other goes stale',async()=>{
 const root=await mkdtemp(join(tmpdir(),'mai-var-'));const p=await port();const s=await studio(root,p);
 try{await buildFixture(s.call,s.post);const inspect=await s.call('scene.inspect');const rev=Number(inspect.revision);
  const pivot={type:'pose',id:'flask',pose:{pivotX:160,pivotY:190}};
  const subtle=await s.call('variation.branch',{name:'subtle',commands:[{id:'a',type:'ops',ops:[pivot,{type:'acting.beat',target:'flask',property:'rotation',start:.2,duration:2,action:6}]}]}) as Record<string,any>;
  const elastic=await s.call('variation.branch',{name:'elastic',commands:[{id:'a',type:'ops',ops:[pivot,{type:'acting.beat',target:'flask',property:'rotation',start:.2,duration:2,action:22,bounces:2}]}]}) as Record<string,any>;
  assert.equal(subtle.ok,true,JSON.stringify(subtle.error));assert.ok(existsSync(subtle.branch.filmstrip));assert.equal((await (await fetch(`${s.url}/api/state`)).json()).revision,rev,'branching never commits');
  const cmp=await s.call('variation.compare',{branches:[subtle.branch.id,elastic.branch.id]}) as Record<string,any>;assert.ok(existsSync(cmp.sheet.path));assert.equal(cmp.branches.length,2);assert.equal(cmp.sheet.rows,2);
  const prom=await s.call('variation.promote',{branch:elastic.branch.id,expectedRevision:rev}) as Record<string,any>;assert.equal(prom.ok,true,JSON.stringify(prom.error));assert.equal(prom.receipt.revision,rev+1);
  const list=await s.call('variation.list') as Record<string,any>;assert.deepEqual(list.branches.map((b:{name:string;stale:boolean})=>[b.name,b.stale]),[['subtle',true]]);
  const stale=await s.call('variation.promote',{branch:subtle.branch.id,expectedRevision:rev+1}) as Record<string,any>;assert.equal(stale.error.code,'STALE_BRANCH');
  assert.deepEqual((await s.call('variation.discard',{branches:[subtle.branch.id]}) as Record<string,any>).discarded,[subtle.branch.id]);
 }finally{await s.app.close();await closeRenderer();await rm(root,{recursive:true,force:true});}
});
