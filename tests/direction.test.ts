// The human's brief as data (direction.set), feature states (part.borrow + sprites) and the assertions that prove
// "both eyes open while waving, wink at 3.6 s": sprite state at a time and matchesBaseline at a time.
import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import {createHash} from 'node:crypto';
import {VectorDocument} from '../packages/core/document.js';import {verifyMotion} from '../packages/core/verify.js';import {critique} from '../packages/core/critique.js';
import {AgentService} from '../packages/agent/service.js';import {fileWorkspace} from '../packages/cli/agent.js';import {closeRenderer} from '../packages/server/render.js';

// Approved art winks (a chevron); the "smile" sibling of the design system draws the same eye open.
const approved='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g id="face"><circle id="eye-left" cx="30" cy="40" r="5" fill="#412213"/><path id="eye-wink" d="M62 36L72 40L62 44" stroke="#412213" stroke-width="3" fill="none"/></g></svg>';
const smile='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g id="Group"><circle id="Vector_1" cx="30" cy="40" r="5" fill="#412213"/><circle id="Vector_2" cx="67" cy="40" r="5" fill="#412213" data-name="Vector"/></g></svg>';
const borrow={type:'part.borrow' as const,id:'eye-open',parent:'face',svg:smile,ids:['Vector_2']};
const winkAt=(m:VectorDocument,t:number)=>m.apply([{type:'sprite.define',sprite:{id:'eyes',name:'Ojos',variants:{wink:['eye-wink'],open:['eye-open']},initial:'open'}},{type:'sprite.keyframe',id:'eyes',state:'open',time:0},{type:'sprite.keyframe',id:'eyes',state:'wink',time:t}]);

test('part.borrow copies the drawing hidden, with prefixed ids, and refuses a different artboard or paint servers',()=>{
 const m=new VectorDocument(approved);m.project.duration=4;m.apply([borrow]);
 const g=m.index.get('eye-open')!,c=m.index.get('eye-open--Vector_2')!;assert.equal(g.getAttribute('opacity'),'0');assert.equal(c.getAttribute('fill'),'#412213');assert.equal(c.getAttribute('cx'),'67');
 assert.equal(c.parentNode,g);assert.equal(g.parentNode,m.index.get('face'));assert.ok(!m.index.has('Vector_2'));
 assert.throws(()=>new VectorDocument(approved).apply([{...borrow,svg:smile.replace('0 0 100 100','0 0 200 200')}]),/artboard/);
 assert.throws(()=>new VectorDocument(approved).apply([{...borrow,svg:smile.replace('fill="#412213" data-name','fill="url(#g)" data-name')}]),/url/);
 const aligned=new VectorDocument(approved);aligned.apply([{...borrow,svg:smile.replace('0 0 100 100','0 0 200 200'),align:{to:'eye-wink'}}]);assert.match(aligned.index.get('eye-open')!.getAttribute('transform')??'',/translate/);
});

test('state assertions say which sprite variant shows when, and survive reopening the SVG',()=>{
 const m=new VectorDocument(approved);m.project.duration=4;m.apply([borrow]);winkAt(m,3);
 const r=verifyMotion(m,[{type:'state',part:'eyes',state:'open',during:[0,2.9]},{type:'state',part:'eyes',state:'wink',at:3.2},{type:'state',part:'eyes',state:'wink',at:1}],p=>({ids:[p]}));
 assert.deepEqual(r.results.map(x=>x.status),['passed','passed','failed']);
 const again=new VectorDocument(m.toSVG());assert.equal(verifyMotion(again,[{type:'state',part:'eyes',state:'wink',at:3.5}],p=>({ids:[p]})).results[0].status,'passed');
 assert.equal(verifyMotion(m,[{type:'state',part:'eyes',state:'closed',at:1}],p=>({ids:[p]})).results[0].status,'not_evaluated');
});

test('direction stores the brief, validates musts, flags untested ones and round-trips',()=>{
 const m=new VectorDocument(approved);const direction={brief:'Dos ojos abiertos saludando; guiña a los 3 s; lo demás creativo',source:'user' as const,latitude:'Todo lo demás',
  musts:[{id:'wink',text:'Guiña a los 3 s',assertions:[{type:'state' as const,part:'eyes',state:'wink',at:3.1}]},{id:'wave',text:'Saluda'}]};
 m.apply([{type:'direction.set',direction}]);assert.deepEqual(new VectorDocument(m.toSVG()).project.direction,direction);
 assert.ok(critique(m).deterministic.findings.some(f=>f.code==='MAI_DIRECTION_UNTESTED'&&f.message.includes('Saluda')));
 for(const bad of [{...direction,brief:''},{...direction,musts:[{id:'a',text:'x'},{id:'a',text:'y'}]},{...direction,extra:1},{...direction,musts:[{id:'a',text:'x',assertions:[{type:'state',part:'eyes'}]}]}])
  assert.throws(()=>new VectorDocument(approved).apply([{type:'direction.set',direction:bad as never}]));
 m.apply([{type:'direction.set',direction:null}]);assert.equal(m.project.direction,undefined);
});

test('motion.verify reports every must; matchesBaseline renders the approved art at a time',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'mai-direction-'));
 try{await writeFile(join(dir,'approved.svg'),approved);await writeFile(join(dir,'smile.svg'),smile);
  const m=new VectorDocument(approved);m.project.duration=4;m.project.loop=false;
  m.apply([{type:'semantic.label',node:{id:'face',role:'head',label:'Cara',targets:['face'],status:'confirmed',source:'agent'}},
   {type:'baseline.add',baseline:{id:'approved',label:'Aprobado',source:{kind:'file',path:'approved.svg'},sha256:createHash('sha256').update(approved).digest('hex'),revision:0,approval:'unreviewed',createdAt:new Date(0).toISOString()}}]);
  const ws={...fileWorkspace(m.toSVG(),'scene.svg'),root:dir},svc=new AgentService(ws);
  // The agent can borrow from a project file through ops.apply's resolver (offline it still resolves; applying needs a session).
  const [resolved]=await svc.resolveOps([{type:'part.borrow',id:'eye-open',parent:'face',ids:['Vector_2'],file:'smile.svg'} as never]);assert.equal((resolved as {svg:string}).svg,smile);
  await assert.rejects(svc.resolveOps([{type:'part.borrow',id:'x',ids:['a'],file:'../smile.svg'} as never]),(e:{code?:string})=>e.code==='INVALID_ARGUMENT');
  const doc=ws.model();doc.apply([{...borrow},]);winkAt(doc,3);
  doc.apply([{type:'direction.set',direction:{brief:'Ojos abiertos y guiño a los 3 s',musts:[{id:'open',text:'Ojos abiertos al inicio',assertions:[{type:'state',part:'eyes',state:'open',during:[0,2.5]}]},
   {id:'wink',text:'Termina guiñando como el aprobado',assertions:[{type:'matchesBaseline',part:'face',at:3.5}]},{id:'free',text:'Lo demás creativo'}]}}]);
  const r=await svc.call('motion.verify',{}) as {passed:boolean;direction:{id:string;status:string}[]};
  assert.deepEqual(r.direction.map(x=>[x.id,x.status]),[['open','passed'],['wink','passed'],['free','untested']]);
  const early=await svc.call('motion.verify',{assertions:[{type:'matchesBaseline',part:'face',at:1}]}) as {results:{status:string;measured:{mae:number}}[]};
  assert.equal(early.results[0].status,'failed');assert.ok(early.results[0].measured.mae>0);
  // A breathing parent moves the face in world space; relativeTo compares it inside the parent held at rest.
  doc.apply([{type:'pose',id:'face',pose:{pivotX:50,pivotY:50}},{type:'keyframe',target:'face',property:'scaleY',time:0,value:1},{type:'keyframe',target:'face',property:'scaleY',time:3.5,value:1.2},{type:'keyframe',target:'face',property:'scaleY',time:4,value:1}]);
  const world=await svc.call('motion.verify',{assertions:[{type:'matchesBaseline',part:'eye-wink',at:3.5}]}) as {results:{status:string}[]};
  const local=await svc.call('motion.verify',{assertions:[{type:'matchesBaseline',part:'eye-wink',at:3.5,relativeTo:'face'}]}) as {results:{status:string}[]};
  assert.equal(world.results[0].status,'failed');assert.equal(local.results[0].status,'passed');
 }finally{await closeRenderer();await rm(dir,{recursive:true,force:true});}
});
