// S4 benchmark workspace: an isolated folder an external agent works in. It contains the approved Candy SVG (copied,
// hash recorded), a live MAI session for that folder, the generated mai-svg skill and an MCP config — but no MAI
// source code and no precompiled solution. Candy is prepared exclusively through agent tools (HTTP API).
// Usage: npx tsx scripts/s4-workspace.ts [--dir DIR] [--port 4410]   (keeps the session running)
// --replay FILE: after preparing, re-executes the plan an earlier agent committed (read from its transcript), with this
// workspace's session/document/snapshot/board ids, so a later instruction starts from the same state on new code.
import {mkdir,copyFile,readFile,writeFile,symlink,cp,stat} from 'node:fs/promises';import {join,resolve} from 'node:path';import {tmpdir} from 'node:os';import {createHash} from 'node:crypto';
import {startEditorServer} from '../packages/server/server.js';
const arg=(n:string,d:string)=>{const i=process.argv.indexOf(n);return i>0?process.argv[i+1]:d;};
const dir=resolve(arg('--dir',join(tmpdir(),'mai-s4-candy'))),port=Number(arg('--port','4410')),project=resolve('.');
const sha=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
await mkdir(join(dir,'approved'),{recursive:true});await mkdir(join(dir,'apps/editor'),{recursive:true});
const source=join(project,'assets/vector/candy_alchemist_cat.svg');await copyFile(source,join(dir,'approved/candy_alchemist_cat.svg'));
try{await symlink(join(project,'apps/editor/dist'),join(dir,'apps/editor/dist'));}catch{}
await cp(join(project,'.claude/skills/mai-svg'),join(dir,'.claude/skills/mai-svg'),{recursive:true});
await writeFile(join(dir,'.mcp.json'),JSON.stringify({mcpServers:{'mai-svg':{command:process.execPath,args:[join(project,'node_modules/tsx/dist/cli.mjs'),join(project,'packages/cli/main.ts'),'mcp'],env:{MAI_ROOT:dir,MAI_PORT:String(port)}}}},null,2));
await writeFile(join(dir,'CLAUDE.md'),'# Candy workspace\n\nThis folder is an art-direction workspace for the character Candy in MAI SVG. Use the `mai-svg` skill and the `mai-svg` MCP tools for everything; the editor shows your changes live to the human. `approved/` holds the approved original (never modify it).\n');
const app=await startEditorServer(port,dir);const url=`http://127.0.0.1:${port}`;const cfg=JSON.parse(await readFile(join(dir,'.cache/session.json'),'utf8'));
const call=async(tool:string,args:Record<string,unknown>={})=>{const r=await fetch(`${url}/api/agent/call`,{method:'POST',headers:{'Content-Type':'application/json','x-mai-token':cfg.token},body:JSON.stringify({tool,args})});const v=await r.json();if(!v.ok)throw Error(`${tool}: ${JSON.stringify(v.error)}`);process.stderr.write(`✓ ${tool} → rev ${v.revision}\n`);return v;};
const fresh=!(await stat(join(dir,'prepared.json')).catch(()=>undefined));
if(fresh){
 let rev=(await (await fetch(`${url}/api/import`,{method:'POST',headers:{'Content-Type':'application/json','x-mai-token':cfg.token},body:JSON.stringify({name:'candy.svg',base64:Buffer.from(await readFile(join(dir,'approved/candy_alchemist_cat.svg'))).toString('base64'),expectedRevision:0})})).json()).revision as number;
 const m=async(tool:string,args:Record<string,unknown>)=>{const v=await call(tool,{...args,expectedRevision:rev});rev=v.revision;return v;};
 await m('timeline.set',{duration:9,fps:24,loop:true});
 await m('baseline.capture',{id:'approved',label:'Candy high-color-preserved aprobado',file:'approved/candy_alchemist_cat.svg'});
 // Real artwork regions become independent, alpha-preserving layers (pixel-identical at rest).
 await m('part.extract',{id:'mouth',name:'Boca original',source:'#mai-artwork',alpha:false,region:{kind:'ellipse',cx:344,cy:230,rx:28,ry:14},role:'mouth'});
 await m('part.extract',{id:'eye-left',name:'Ojo turquesa',source:'#mai-artwork',alpha:false,region:{kind:'ellipse',cx:296,cy:195,rx:24,ry:23},role:'eye-left'});
 await m('part.extract',{id:'eye-right',name:'Ojo violeta',source:'#mai-artwork',alpha:false,region:{kind:'ellipse',cx:379,cy:180,rx:24,ry:23},role:'eye-right'});
 await m('part.extract',{id:'smoke',name:'Humo original del frasco',source:'#mai-artwork',role:'smoke',region:{kind:'polygon',points:[{x:482,y:76},{x:630,y:76},{x:630,y:214},{x:548,y:214},{x:530,y:204},{x:518,y:197},{x:500,y:197},{x:484,y:180}]}});
 await m('ops.apply',{ops:[{type:'group',ids:['mai-artwork','mouth','eye-left','eye-right','smoke'],id:'candy-root',name:'Candy'}],label:'Agrupar personaje'});
 const label=(id:string,role:string,lbl:string,targets:string[],parent?:string,region?:unknown)=>({type:'semantic.label',node:{id,role,label:lbl,targets,...(parent?{parent}:{}),...(region?{region}:{}),status:'confirmed',source:'agent'}});
 await m('ops.apply',{ops:[label('candy','character','Candy',['candy-root']),label('head','head','Cabeza',[],'candy',{kind:'ellipse',cx:337,cy:190,rx:112,ry:86}),label('flask','flask','Frasco',[],'candy',{kind:'rect',x:443,y:198,width:122,height:210}),label('nose','nose','Nariz',[],'head',{kind:'ellipse',cx:340,cy:211,rx:11,ry:7}),label('mouth','mouth','Boca',['mouth'],'head',{kind:'ellipse',cx:344,cy:230,rx:28,ry:14}),label('eye-left','eye-left','Ojo izquierdo (turquesa)',['eye-left'],'head',{kind:'ellipse',cx:296,cy:195,rx:24,ry:23}),label('eye-right','eye-right','Ojo derecho (violeta)',['eye-right'],'head',{kind:'ellipse',cx:379,cy:180,rx:24,ry:23}),label('smoke','smoke','Humo',['smoke'],'flask')],label:'Partes de Candy'});
 await m('expression.rig',{part:'mouth',role:'mouth',landmarks:{left:{x:331,y:234},right:{x:358,y:230},center:{x:341.5,y:227},lower:{x:346,y:232}}});
 await m('expression.rig',{part:'eye-left',role:'eye-left',landmarks:{inner:{x:314,y:199},outer:{x:277,y:195},upper:{x:297,y:177},lower:{x:296,y:211},iris:{x:297,y:197}}});
 await m('expression.rig',{part:'eye-right',role:'eye-right',landmarks:{inner:{x:360,y:180},outer:{x:397,y:178},upper:{x:378,y:161},lower:{x:378,y:197},iris:{x:377,y:181}}});
 await m('identity.preserve',{targets:['nose'],levels:['protected']});
 await m('identity.preserve',{targets:['mouth','candy.eyes'],levels:['deformable','color-preserved','topology-preserved'],freezeExpression:false});
 await m('fluid.animate',{target:'candy.flask.smoke',preset:'smoke',id:'smoke-flow',quality:'balanced'});
 await m('expression.propose',{emotion:'sadness',intensity:.85,count:3,time:1,previewRegion:{x:250,y:140,width:180,height:120},previewScale:2,prompt:'¿Cómo quieres que se vea la tristeza de Candy?'});
 let replayed:Record<string,unknown>|undefined;const replay=process.argv.includes('--replay')?resolve(arg('--replay','')):undefined;
 if(replay){const lines=(await readFile(replay,'utf8')).split('\n').filter(Boolean).map(l=>JSON.parse(l));const item=lines.map(d=>d.item).find(it=>it?.type==='mcp_tool_call'&&it.tool==='execute_plan'&&it.arguments?.plan?.mode==='commit'&&/\\?"ok\\?": true/.test(it.result?.content?.[0]?.text??''));if(!item)throw Error(`No committed plan in ${replay}`);
  const i=await call('scene.inspect'),b=(await call('choices.inspect')).choice;const plan=structuredClone(item.arguments.plan);Object.assign(plan,{requestId:`${plan.requestId}-replay`,sessionId:i.sessionId,documentId:i.documentId,expectedRevision:i.revision});
  for(const c of plan.constraints?.preserve??[])if(c.reference.kind==='snapshot')c.reference.id=i.snapshotId;for(const c of plan.commands)if(c.type==='variant.apply')c.board={id:b.id,version:b.version};
  const done=await call('plan.execute',{plan});rev=done.revision;replayed={from:replay.replace(project+'/',''),requestId:plan.requestId,label:plan.label,text:plan.provenance.text,revision:done.revision,note:'Scripted replay of the plan an external agent committed earlier; not part of the new agent run.'};}
 const inspect=await call('scene.inspect');
 await writeFile(join(dir,'prepared.json'),JSON.stringify({preparedAt:new Date().toISOString(),url,port,approvedSha256:sha(await readFile(join(dir,'approved/candy_alchemist_cat.svg'))),projectSourceSha256:sha(await readFile(source)),revision:inspect.revision,documentId:inspect.documentId,...(replayed?{replayed}:{})},null,1));
}
console.log(JSON.stringify({ready:true,url,dir,fresh},null,1));
process.on('SIGTERM',()=>void app.close().then(()=>process.exit(0)));process.on('SIGINT',()=>void app.close().then(()=>process.exit(0)));
