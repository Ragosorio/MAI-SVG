// S1 gate: Agent IR v1 compiles several intents into ONE transaction, with explicit identity references,
// idempotent receipts, CAS on revision/board, fault-free rollback and undo of scene + decision together.
import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {startEditorServer} from '../packages/server/server.js';
import {PlanExecutor,type PlanHost,type Plan} from '../packages/agent/plan.js';
import {VectorDocument} from '../packages/core/document.js';
import {FIXTURE,studio,buildFixture,port} from '../scripts/fixtures/mini-character.js';
const plan=(inspect:Record<string,unknown>,board:Record<string,unknown>,extra:Partial<Plan>={}):Plan=>({protocol:'mai.agent-plan/v1',requestId:`req-${Math.random().toString(36).slice(2,10)}`,sessionId:String(inspect.sessionId),documentId:String(inspect.documentId),expectedRevision:Number(inspect.revision),mode:'commit',label:'A, ojos de C, boca como está, humo ×0.7',
 constraints:{preserve:[{part:{partId:'mouth',within:'char'},reference:{kind:'snapshot',id:String(inspect.snapshotId)},channels:['geometry','paint','expression'],allowRigidMotion:true}]},
 commands:[{id:'expression',type:'variant.apply',target:{partId:'char'},board:{id:String(board.id),version:Number(board.version)},base:'A',take:{eyes:'C'}},{id:'smoke-speed',type:'animation.adjust',target:{partId:'smoke',within:'char'},sourceId:'smoke-flow',property:'speed',scale:.7,onOverflow:'reject'}],
 validation:{times:[0,1,2],required:['structural','identity'],preview:false},provenance:{kind:'user-direction',text:'Me gusta la primera pero con los ojos de la tercera. Conserva la boca y baja 30% la velocidad del humo.'},...extra});
test('S1: one human request → one atomic, idempotent, undoable transaction (scene + board)',async()=>{
 const root=await mkdtemp(join(tmpdir(),'mai-plan-'));const p=await port();let s=await studio(root,p);
 try{await buildFixture(s.call,s.post);
  const inspect=await s.call('scene.inspect');const board=(await s.call('choices.inspect')).choice as Record<string,unknown>;assert.deepEqual(Object.keys(board.slotParts as object).sort(),['eyes','mouth']);
  const mouthBefore=(await (await fetch(s.url+'/api/svg')).text()).match(/<path[^>]*id="mouth"[^>]*>/)![0];const rev0=Number(inspect.revision);
  // Dry-run: nothing changes; previews/receipt refer to the draft.
  const dry=await s.call('plan.execute',{plan:plan(inspect,board,{mode:'dry-run',validation:{times:[0,1],required:['structural','identity'],preview:true}})});
  assert.equal(dry.ok,true,JSON.stringify(dry.error));assert.equal(dry.status,'prepared');assert.equal(dry.committed,false);assert.equal((await s.call('scene.history')).revision,rev0);assert.equal(((dry.artifacts as unknown[]).length),2);assert.equal((dry.identity as {status:string}).status,'pass');
  // Last command fails → zero changes.
  const broken=plan(inspect,board);(broken.commands[1] as {sourceId:string}).sourceId='no-such-flow';const bad=await s.call('plan.execute',{plan:broken});
  assert.equal(bad.ok,false);assert.equal((bad.error as {code:string}).code,'NOT_FOUND');assert.equal(bad.committed,false);assert.equal((await s.call('scene.history')).revision,rev0);assert.equal(((await s.call('choices.inspect')).choice as {status:string}).status,'pending');
  // Persistence failure at the commit point → nothing visible.
  process.env.MAI_FAIL_PERSISTENCE='1';const disk=await s.call('plan.execute',{plan:plan(inspect,board)});delete process.env.MAI_FAIL_PERSISTENCE;
  assert.equal((disk.error as {code:string}).code,'PERSISTENCE_FAILED');assert.equal((await s.call('scene.history')).revision,rev0);
  // Taking a preserved slot is refused before anything happens.
  const clash=await s.call('plan.execute',{plan:plan(inspect,board,{commands:[{id:'x',type:'variant.apply',target:{partId:'char'},board:{id:String(board.id),version:Number(board.version)},base:'A',take:{mouth:'C'}}]})});assert.equal((clash.error as {code:string}).code,'NOT_COMBINABLE');
  // Commit.
  const good=plan(inspect,board);const done=await s.call('plan.execute',{plan:good});
  assert.equal(done.ok,true,JSON.stringify(done.error));assert.equal(done.status,'committed');assert.equal(done.baseRevision,rev0);assert.equal(done.revision,rev0+1);assert.ok((done.transaction as {undoToken:string}).undoToken);
  assert.equal((done.identity as {status:string;evaluatedParts:string[]}).status,'pass');assert.deepEqual((done.identity as {evaluatedParts:string[]}).evaluatedParts,['char.head.mouth']);
  const svg=await (await fetch(s.url+'/api/svg')).text();assert.equal(svg.match(/<path[^>]*id="mouth"[^>]*>/)![0],mouthBefore);
  const state=await (await fetch(s.url+'/api/state')).json();const params=state.project.params;const cEyes=(board.options as {id:string;params:Record<string,number>}[]).find(o=>o.id==='C')!.params;
  assert.equal(params['sadness@eyes'].default,cEyes['sadness@eyes']);assert.ok(!params['sadness@mouth']||params['sadness@mouth'].default===0);
  assert.equal(state.project.modifiers.find((m:{id:string})=>m.id==='smoke-flow').params.speedFactor,.7);assert.equal(state.choice.status,'chosen');assert.equal(state.project.acceptances.length,1);
  // Retry with the same requestId: same receipt, speed not multiplied again. Different payload, same id → rejected.
  const again=await s.call('plan.execute',{plan:good});assert.equal(again.replayed,true);assert.equal(again.revision,rev0+1);
  assert.equal((await (await fetch(s.url+'/api/state')).json()).project.modifiers[0].params.speedFactor,.7);
  const reused=await s.call('plan.execute',{plan:{...good,label:'otro'}});assert.equal((reused.error as {code:string}).code,'REQUEST_ID_REUSED');
  // Restart: receipt recovered from the journal.
  await s.app.close();s=await studio(root,p);const st=await s.call('plan.status',{requestId:good.requestId});assert.equal(st.status,'committed');assert.equal(st.revision,rev0+1);
  // Undo with the token restores scene AND board.
  const u=await s.call('history.undo',{token:(done.transaction as {undoToken:string}).undoToken,expectedRevision:rev0+1});assert.equal(u.ok,true,JSON.stringify(u.error));
  const after=await (await fetch(s.url+'/api/state')).json();assert.equal(after.project.modifiers[0].params.speedFactor??1,1);assert.equal(after.choice.status,'pending');assert.equal((after.project.acceptances??[]).length,0);
  // Dry-run then a human edit: committing on the old revision conflicts; nothing is applied.
  const i2=await s.call('scene.inspect');const b2=(await s.call('choices.inspect')).choice as Record<string,unknown>;const dry2=plan(i2,b2,{mode:'dry-run'});assert.equal((await s.call('plan.execute',{plan:dry2})).status,'prepared');
  assert.equal((await s.post('/api/apply',{ops:[{type:'pose',id:'flask',pose:{x:1}}],expectedRevision:Number(i2.revision),source:'editor'})).status,200);
  const late=await s.call('plan.execute',{plan:{...dry2,requestId:dry2.requestId+'-c',mode:'commit'}});assert.equal((late.error as {code:string}).code,'REVISION_CONFLICT');assert.equal(late.committed,false);
 }finally{await s.app.close();await rm(root,{recursive:true,force:true});}
});
test('S1: a human edit while previews render makes the commit fail (CAS), and render failure blocks a required gate',async()=>{
 const root=await mkdtemp(join(tmpdir(),'mai-plan-race-'));const p=await port();const s=await studio(root,p);
 try{await buildFixture(s.call,s.post);const inspect=await s.call('scene.inspect');const board=(await s.call('choices.inspect')).choice as Record<string,unknown>;
  const slow=plan(inspect,board,{validation:{times:[0,.5,1,1.5,2,2.5,3,3.5],required:['structural','identity'],preview:true}});
  const pending=s.call('plan.execute',{plan:slow});await new Promise(r=>setTimeout(r,150));
  const edit=await s.post('/api/apply',{ops:[{type:'pose',id:'flask',pose:{x:2}}],expectedRevision:Number(inspect.revision),source:'editor'});assert.equal(edit.status,200);
  const r=await pending;assert.equal(r.ok,false);assert.ok(['REVISION_CONFLICT','STALE_CHOICE'].includes((r.error as {code:string}).code),JSON.stringify(r.error));assert.equal(r.committed,false);
  const state=await (await fetch(s.url+'/api/state')).json();assert.equal(state.project.modifiers[0].params.speedFactor??1,1);assert.equal(state.choice.status,'pending');
 }finally{await s.app.close();await rm(root,{recursive:true,force:true});}
 // Executor-level fault injection: the renderer is unavailable and the perceptual gate is required → no commit.
 const doc=new VectorDocument(FIXTURE);doc.project.documentId='doc-x';doc.apply([{type:'semantic.label',node:{id:'mouth',role:'mouth',label:'m',targets:['mouth'],status:'confirmed',source:'agent'}},{type:'semantic.label',node:{id:'flask',role:'flask',label:'f',targets:['flask'],status:'confirmed',source:'agent'}},{type:'keyframe',target:'flask',property:'x',time:0,value:0},{type:'keyframe',target:'flask',property:'x',time:2,value:10}]);
 let committed=false;const host:PlanHost={model:()=>doc,revision:()=>3,sessionId:()=>'s',documentId:()=>'doc-x',board:()=>undefined,reference:async()=>({doc:new VectorDocument(doc.toSVG()),label:'snapshot'}),saveSnapshot:async()=>'snap-x',render:async()=>{throw Error('renderer down');},metrics:async()=>({mae:0,ssim:1,silhouetteIoU:1}),writeArtifact:async()=>'x',commit:async()=>{committed=true;return {requestId:'r',hash:'h',status:'committed'};},receipts:new Map()};
 const ex=new PlanExecutor(host);
 await assert.rejects(ex.execute({protocol:'mai.agent-plan/v1',requestId:'r1',sessionId:'s',documentId:'doc-x',expectedRevision:3,mode:'commit',label:'slow flask',constraints:{preserve:[{part:{partId:'mouth'},reference:{kind:'snapshot',id:'snap-x'},channels:['geometry','paint'],allowRigidMotion:true}]},commands:[{id:'a',type:'animation.adjust',target:{partId:'flask'},sourceId:'track:flask:x',property:'speed',scale:.5,onOverflow:'reject'}],validation:{times:[0],required:['structural','identity','perceptual'],preview:false},provenance:{kind:'user-direction',text:'más lento el frasco'}}),(e:{code?:string})=>e.code==='VALIDATION_NOT_EVALUATED');
 assert.equal(committed,false);
 // Slowing a finite track beyond the timeline is rejected whole (onOverflow: reject).
 await assert.rejects(ex.execute({protocol:'mai.agent-plan/v1',requestId:'r2',sessionId:'s',documentId:'doc-x',expectedRevision:3,mode:'commit',label:'too slow',commands:[{id:'a',type:'animation.adjust',target:{partId:'flask'},sourceId:'track:flask:x',property:'speed',scale:.3,onOverflow:'reject'}],validation:{times:[0],required:['structural'],preview:false},provenance:{kind:'user-direction',text:'mucho más lento'}}),(e:{code?:string})=>e.code==='TIMELINE_OVERFLOW');
 assert.equal(committed,false);
});
// Found by the external agent in S4 run 2: "pensándolo mejor, la segunda" on a chosen board, and a protected part
// that is only a region of shared artwork (Candy's nose). Both must work without workarounds.
test('S4 regression: re-choosing on a chosen board and region-only preserved parts',async()=>{
 const root=await mkdtemp(join(tmpdir(),'mai-plan-rechoose-'));const p=await port();const s=await studio(root,p);
 try{let rev=await buildFixture(s.call,s.post);
  const zone=(id:string,region:Record<string,number>)=>({type:'semantic.label',node:{id,role:'other',label:id,targets:[],parent:'head',region:{kind:'rect',...region},status:'confirmed',source:'agent'}});
  const z=await s.call('ops.apply',{ops:[zone('muzzle',{x:93,y:67,width:14,height:12}),zone('eye-zone',{x:60,y:44,width:30,height:22})],expectedRevision:rev});assert.equal(z.ok,true,JSON.stringify(z.error));rev=Number(z.revision);
  // A region-only part can scope a candidate search (through its nearest ancestor with one element).
  const scoped=await s.call('part.candidates',{scope:'muzzle',box:{x:93,y:67,width:14,height:12}});assert.equal(scoped.ok,true,JSON.stringify(scoped.error));
  const inspect=await s.call('scene.inspect');const board=(await s.call('choices.inspect')).choice as Record<string,unknown>;
  const keep=(partId:string)=>({part:{partId,within:'char'},reference:{kind:'snapshot' as const,id:String(inspect.snapshotId)},channels:['geometry' as const,'paint' as const],allowRigidMotion:false});
  // A region-only part is compared by pixels in its region: untouched → pass; covered by a change → blocked.
  const blocked=await s.call('plan.execute',{plan:plan(inspect,board,{constraints:{preserve:[keep('eye-zone')]},commands:[{id:'e',type:'variant.apply',target:{partId:'char'},board:{id:String(board.id),version:Number(board.version)},base:'A'}]})});
  assert.equal((blocked.error as {code:string}).code,'IDENTITY_BLOCKED',JSON.stringify(blocked.error).slice(0,400));const ev=((blocked.error as {identity:{parts:{part:string;method?:string;status:string}[]}}).identity.parts).find(x=>x.part.endsWith('eye-zone'))!;assert.equal(ev.method,'region-pixels');assert.equal(ev.status,'fail');
  const first=await s.call('plan.execute',{plan:plan(inspect,board)});assert.equal(first.status,'committed',JSON.stringify(first.error));const accepted=((await (await fetch(s.url+'/api/state')).json()).choice as {selected:string}).selected;
  // Same board, other option, no explicit re-choice → refused with a recovery that names it.
  const i2=await s.call('scene.inspect');const b2=(await s.call('choices.inspect')).choice as Record<string,unknown>;
  const second=(extra:Record<string,unknown>)=>plan(i2,b2,{constraints:{preserve:[keep('muzzle')]},commands:[{id:'b',type:'variant.apply',target:{partId:'char'},board:{id:String(b2.id),version:Number(b2.version)},base:'B',...extra} as Plan['commands'][number]],validation:{times:[0,1],required:['structural','identity'],preview:false},provenance:{kind:'user-direction',text:'Pensándolo mejor, la segunda tal como estaba. A la nariz no le toques nada.'}});
  const refused=await s.call('plan.execute',{plan:second({})});assert.equal((refused.error as {code:string}).code,'STALE_CHOICE');assert.equal((refused.error as {recovery:{action:string}}).recovery.action,'rechoose');
  const re=await s.call('plan.execute',{plan:second({rechoose:true})});assert.equal(re.status,'committed',JSON.stringify(re.error));
  const muzzle=(re.identity as {parts:{part:string;method?:string;status:string}[]}).parts.find(x=>x.part.endsWith('muzzle'))!;assert.equal(muzzle.method,'region-pixels');assert.equal(muzzle.status,'pass');
  const st=await (await fetch(s.url+'/api/state')).json();const B=(b2.options as {id:string;params:Record<string,number>}[]).find(o=>o.id==='B')!.params;
  assert.equal(st.choice.selected,'B');assert.equal(st.project.acceptances.length,2);assert.equal(st.project.acceptances[1].supersedes,accepted);
  for(const [k,v]of Object.entries(st.project.params as Record<string,{default:number}>))assert.equal(v.default,B[k]??0,`param ${k} is exactly option B`);
  // Undo returns to the previous acceptance (scene and board).
  const u=await s.call('history.undo',{token:(re.transaction as {undoToken:string}).undoToken,expectedRevision:Number(re.revision)});assert.equal(u.ok,true,JSON.stringify(u.error));
  const back=await (await fetch(s.url+'/api/state')).json();assert.equal(back.choice.selected,accepted);assert.equal(back.project.acceptances.length,1);
 }finally{await s.app.close();await rm(root,{recursive:true,force:true});}
});

// Review regressions: every required part must be evaluated, and protection must survive relabeling/reopening.
test('S1: mixed identity coverage blocks commit when a required region cannot render or has no coverage',async()=>{
 for(const region of [undefined,{kind:'rect' as const,x:0,y:0,width:10,height:10}]){
  const doc=new VectorDocument(FIXTURE);
  doc.apply([{type:'semantic.label',node:{id:'mouth',role:'mouth',label:'mouth',targets:['mouth'],status:'confirmed',source:'agent'}},{type:'semantic.label',node:{id:'nose',role:'nose',label:'nose',targets:[],...(region?{region}:{}),status:'confirmed',source:'agent'}}]);
  const original=doc.toSVG();let commits=0;
  const host:PlanHost={model:()=>doc,revision:()=>1,sessionId:()=>'s',documentId:()=>'doc',board:()=>undefined,reference:async()=>({doc:new VectorDocument(original),label:'original'}),saveSnapshot:async()=>'draft',render:async()=>{throw Error('renderer down');},metrics:async()=>({mae:0,ssim:1,silhouetteIoU:1}),writeArtifact:async()=>'x',receipts:new Map(),commit:async(ops,_rev,_label,pre,receipt)=>{commits++;pre();doc.apply(ops);return receipt({revision:2,id:'tx'});}};
  const p:Plan={protocol:'mai.agent-plan/v1',requestId:'mixed',sessionId:'s',documentId:'doc',expectedRevision:1,mode:'commit',label:'preserve both',constraints:{preserve:[{part:{partId:'nose'},reference:{kind:'snapshot',id:'original'},channels:['geometry','paint'],allowRigidMotion:false}]},commands:[{id:'protect',type:'identity.preserve',target:{partId:'mouth'},reference:{kind:'snapshot',id:'original'},policy:'locked'}],validation:{times:[0],required:['structural','identity'],preview:false},provenance:{kind:'user-direction',text:'Conserva boca y nariz'}};
  await assert.rejects(new PlanExecutor(host).execute(p),(e:{code?:string})=>e.code==='VALIDATION_NOT_EVALUATED');
  assert.equal(commits,0);assert.equal(doc.toSVG(),original);assert.equal(host.receipts.size,0);
 }
});

test('S1: identity.preserve accumulates protection and persists it through SVG reopening',async()=>{
 const doc=new VectorDocument(FIXTURE);
 doc.apply([{type:'semantic.label',node:{id:'mouth',role:'mouth',label:'mouth',targets:['mouth'],status:'confirmed',source:'agent',protection:['color-preserved']}}]);
 const original=doc.toSVG();
 const host:PlanHost={model:()=>doc,revision:()=>1,sessionId:()=>'s',documentId:()=>'doc',board:()=>undefined,reference:async()=>({doc:new VectorDocument(original),label:'original'}),saveSnapshot:async()=>'draft',render:async()=>{throw Error('unexpected render');},metrics:async()=>({mae:0,ssim:1,silhouetteIoU:1}),writeArtifact:async()=>'x',receipts:new Map(),commit:async(ops,_rev,_label,pre,receipt)=>{pre();doc.apply(ops);return receipt({revision:2,id:'tx'});}};
 const result=await new PlanExecutor(host).execute({protocol:'mai.agent-plan/v1',requestId:'protect',sessionId:'s',documentId:'doc',expectedRevision:1,mode:'commit',label:'lock mouth',commands:[{id:'geometry',type:'identity.preserve',target:{partId:'mouth'},reference:{kind:'snapshot',id:'original'},policy:'topology-preserved'},{id:'lock',type:'identity.preserve',target:{partId:'mouth'},reference:{kind:'snapshot',id:'original'},policy:'locked'}],validation:{times:[0],required:['structural','identity'],preview:false},provenance:{kind:'user-direction',text:'Bloquea la boca'}});
 assert.equal(result.committed,true);
 const reopened=new VectorDocument(doc.toSVG());
 assert.deepEqual(reopened.project.semantic?.nodes.find(n=>n.id==='mouth')?.protection,['color-preserved','topology-preserved','locked']);
 assert.throws(()=>reopened.apply([{type:'pose',id:'mouth',pose:{x:10}}]));
});
