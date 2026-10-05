// S0 regressions for the agent surface (docs/AGENT-FOUNDATION.md F01, F03, F04, F05, F08).
import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve as resolvePath} from 'node:path';
import {VectorDocument} from '../packages/core/document.js';
import {OPERATION_TYPES} from '../packages/core/model.js';
import {resolve} from '../packages/agent/address.js';
import {AgentService,validate} from '../packages/agent/service.js';
import {TOOLS} from '../packages/agent/registry.js';
import {fileWorkspace} from '../packages/cli/agent.js';
import {closeRenderer} from '../packages/server/render.js';
const face='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g"><stop offset="0" stop-color="#ff0000"/></linearGradient></defs><g id="face"><path id="mouth" fill="#ff0000" d="M10 10L30 10L30 30L10 30Z"/><path id="cheek" fill="url(#g)" d="M40 40L50 40L50 50Z"/></g><path id="other" fill="#00ff00" d="M50 50L60 50L60 60Z"/></svg>';
const blocked=(m:VectorDocument,ops:unknown[])=>{const before=m.toSVG();assert.throws(()=>m.apply(ops as never),(e:{code?:string})=>e.code==='IDENTITY_BLOCKED');assert.equal(m.toSVG(),before,'transaction must roll back completely');};
test('F01: protection covers indirect routes (drivers, params, clips, ancestors, modifiers) and rolls back',()=>{
 const m=new VectorDocument(face);m.apply([{type:'keyframe',target:'other',property:'fill',time:0,value:'#00ff00'},{type:'keyframe',target:'other',property:'fill',time:2,value:'#0000ff'},{type:'clip.define',clip:{id:'c',name:'c',start:0,end:2}}]);
 m.apply([{type:'identity.protect',ids:['mouth']}]);
 blocked(m,[{type:'attributes',id:'mouth',attrs:{fill:'#0000ff'}}]);
 blocked(m,[{type:'expression.driver',driver:{id:'recolor',param:'color',target:'mouth',property:'fill',points:[[0,'#ff0000'],[1,'#0000ff']]}},{type:'param.set',params:{color:1}}]);
 blocked(m,[{type:'clip.place',clip:'c',at:0,targets:{other:'mouth'}}]);
 blocked(m,[{type:'attributes',id:'face',attrs:{fill:'#123456'}}]);
 blocked(m,[{type:'pose',id:'face',pose:{scaleY:.5}}]);
 blocked(m,[{type:'modifier.add',modifier:{id:'w',kind:'wave',targets:['mouth'],params:{amplitude:5}}}]);
 m.apply([{type:'pose',id:'mouth',pose:{x:3}}]);m.apply([{type:'attributes',id:'other',attrs:{fill:'#000000'}}]);
 assert.ok(!m.frame(0).includes('fill="#0000ff"')||!m.frame(0).match(/id="mouth"[^>]*fill="#0000ff"/));
});
test('F01: a driver created before protection cannot be exploited afterwards; deformable parts accept expression warps',()=>{
 const m=new VectorDocument(face);m.apply([{type:'expression.driver',driver:{id:'recolor',param:'color',target:'mouth',property:'fill',points:[[0,'#ff0000'],[1,'#0000ff']]}}]);
 m.apply([{type:'semantic.label',node:{id:'mouth-part',role:'mouth',label:'Boca',targets:['mouth'],status:'confirmed',source:'agent',protection:['deformable','color-preserved','topology-preserved']}}]);
 blocked(m,[{type:'param.set',params:{color:1}}]);
 m.apply([{type:'expression.feature',feature:{id:'mouth-rig',role:'mouth',node:'mouth-part',paths:['mouth'],landmarks:{left:{x:10,y:20},right:{x:30,y:20},center:{x:20,y:18},lower:{x:20,y:24}},region:{kind:'ellipse',cx:20,cy:20,rx:16,ry:16}}}]);
 m.apply([{type:'param.set',params:{sadness:1}}]);assert.notEqual(m.frame(0).match(/<path[^>]*id="mouth"[^>]*>/)![0].match(/ d="([^"]+)"/)?.[1],'M10 10L30 10L30 30L10 30Z');
});
test('F04: collective references are scoped to one owner; proposals cannot be mutated',async()=>{
 const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'+['catA-left','catA-right','catB-left','catB-right'].map((id,i)=>`<path id="shape-${id}" fill="#00ff00" d="M${i*20} 10h10v10h-10Z"/>`).join('')+'</svg>';
 const s=new VectorDocument(svg);for(const c of ['catA','catB']){s.apply([{type:'semantic.label',node:{id:c,role:'character',label:c,targets:[],status:'confirmed',source:'agent'}}]);for(const side of ['left','right'])s.apply([{type:'semantic.label',node:{id:`${c}-${side}`,parent:c,role:`eye-${side}`,label:side,targets:[`shape-${c}-${side}`],status:'confirmed',source:'agent'}}]);}
 assert.throws(()=>resolve(s,'eyes'),(e:{code?:string;extra?:{suggestions?:string[]}})=>e.code==='AMBIGUOUS_TARGET'&&!!e.extra?.suggestions?.includes('catA.eyes'));
 assert.deepEqual(resolve(s,'catA.eyes').addresses,['catA.catA-left','catA.catA-right']);
 s.apply([{type:'semantic.label',node:{id:'tail-guess',role:'tail',label:'Cola (propuesta)',targets:['shape-catB-right'],status:'proposed',source:'heuristic'}}]);
 const ws=fileWorkspace(s.toSVG(),'two-cats.svg');const service=new AgentService(ws);
 await assert.rejects(service.call('motion.preset',{target:'tail-guess',kind:'sway',expectedRevision:ws.revision()}),(e:{code?:string})=>e.code==='UNCONFIRMED_TARGET');
});
test('F03: identity.check needs an explicit reference and coverage; nothing evaluated is never a pass',async()=>{
 const m=new VectorDocument(face);m.apply([{type:'semantic.label',node:{id:'mouth-part',role:'mouth',label:'Boca',targets:['mouth'],status:'confirmed',source:'agent',protection:['protected']}},{type:'semantic.label',node:{id:'floating',role:'other',label:'Sin geometría',targets:[],status:'confirmed',source:'agent'}}]);
 const ws=fileWorkspace(m.toSVG(),'face.svg');const service=new AgentService(ws);
 try{
  await assert.rejects(service.call('identity.check',{reference:{kind:'rig-rest'},parts:[],times:[]}),(e:{code?:string})=>e.code==='INVALID_ARGUMENT');
  await assert.rejects(service.call('identity.check',{parts:['mouth-part'],times:[0]}),(e:{code?:string})=>e.code==='INVALID_ARGUMENT');
  await assert.rejects(service.call('identity.check',{reference:{kind:'baseline',id:'missing'},parts:['mouth-part'],times:[0]}),(e:{code?:string})=>e.code==='BASELINE_NOT_FOUND');
  const empty=await service.call('identity.check',{reference:{kind:'rig-rest'},parts:['floating'],times:[0]});assert.equal(empty.status,'not_evaluated');assert.equal(empty.pass,false);
  const inspect=await service.call('scene.inspect',{});const snap=String(inspect.snapshotId);
  const same=await service.call('identity.check',{reference:{kind:'snapshot',id:snap},parts:['mouth-part'],times:[0]});assert.equal(same.status,'pass');assert.deepEqual(same.evaluatedParts,['mouth-part']);
  ws.model().apply([{type:'semantic.protect',id:'mouth-part',protection:[]},{type:'attributes',id:'mouth',attrs:{fill:'#0000ff'}},{type:'semantic.protect',id:'mouth-part',protection:['protected']}]);
  const changed=await service.call('identity.check',{reference:{kind:'snapshot',id:snap},parts:['mouth-part'],times:[0]});assert.equal(changed.status,'fail');
 }finally{await closeRenderer();}
});
test('F08: schemas reject incomplete unions, examples validate, operation types are all dispatched',()=>{
 const candidates=TOOLS.find(t=>t.name==='part.candidates')!.input;
 assert.throws(()=>validate(candidates,{region:{kind:'rect'}}),/required property 'x'/);
 assert.throws(()=>validate(candidates,{region:{kind:'ellipse',cx:1,cy:1,rx:0,ry:1}}),/rx/);
 for(const t of TOOLS)for(const ex of t.examples)validate(t.input,ex.args);
 assert.throws(()=>validate(TOOLS.find(t=>t.name==='ops.apply')!.input,{ops:[{type:'not.real'}],expectedRevision:0}),/allowed values|equal to one of/);
 const m=new VectorDocument(face);for(const type of OPERATION_TYPES){try{m.apply([{type} as never]);}catch(e){assert.ok(!/Unknown operation/.test(String((e as Error).message)),`${type} is listed but not dispatched`);}}
});
test('F05: CLI routes return one JSON object with stable exit codes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'mai cli space-'));const file=join(dir,'face with spaces.svg');await writeFile(file,face);
 const run=(...args:string[])=>{const r=spawnSync(process.execPath,[resolvePath('node_modules/tsx/dist/cli.mjs'),resolvePath('packages/cli/main.ts'),...args],{encoding:'utf8',cwd:dir,timeout:60000});return {status:r.status,body:JSON.parse(r.stdout),stderr:r.stderr};};
 try{
  const caps=run('capabilities','--json');assert.equal(caps.status,0);assert.equal(caps.body.tools.length,TOOLS.length);
  const call=run('call','capabilities','--json','--tool','scene.inspect');assert.equal(call.status,0);assert.equal(call.body.tools.length,1);
  const exp=run('export','capabilities','--file',file,'--json');assert.equal(exp.status,0,exp.stderr);assert.ok(Array.isArray(exp.body.targets));
  const inspect=run('inspect','--file',file,'--json');assert.equal(inspect.status,0);assert.equal(inspect.body.validation.valid,true);
  const noSession=run('history','--json');assert.equal(noSession.status,1);assert.equal(noSession.body.error.code,'NO_SESSION');
  const bad=run('call','not.a.tool');assert.equal(bad.status,1);assert.equal(bad.body.error.code,'UNKNOWN_TOOL');
 }finally{await rm(dir,{recursive:true,force:true});}
});
