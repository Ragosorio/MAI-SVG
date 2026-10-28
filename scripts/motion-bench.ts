// Motion benchmark (plan F0). An external agent gets ONLY a human brief and the MAI tools; we measure what it made
// and how much low-level direction it needed. The session server can be any MAI checkout (`--mai`), so a baseline of
// older code is comparable; verification always runs with THIS checkout's metrics on the final editable SVG.
//
//   npx tsx scripts/motion-bench.ts --case mini-idle [--case …|--all] --agent claude,codex|none [--runs 1]
//        [--mai PATH | --ref GIT_COMMIT] [--label baseline] [--timeout 1800] [--model M] [--keep]
//   npx tsx scripts/motion-bench.ts --verify RUN_DIR      (re-verify a kept run)
//   npx tsx scripts/motion-bench.ts --rescore OUT_DIR     (recompute every run.json from saved artifacts with this code)
//
// Scores are evidence for a human reviewer, never aesthetic approval (AGENTS.md).
import {spawn,type ChildProcess} from 'node:child_process';import {createServer} from 'node:net';import {once} from 'node:events';
import {mkdir,readFile,writeFile,cp,copyFile,symlink,readdir,stat,rm} from 'node:fs/promises';import {existsSync,createWriteStream} from 'node:fs';
import {join,resolve,dirname,relative} from 'node:path';import {fileURLToPath} from 'node:url';import {tmpdir} from 'node:os';import {createHash} from 'node:crypto';
import {VectorDocument} from '../packages/core/document.js';import {critique} from '../packages/core/critique.js';import {detect} from '../packages/core/detectors.js';import {profile} from '../packages/core/profiler.js';import {exportSvg} from '../packages/core/export.js';
import {AgentService} from '../packages/agent/service.js';import {fileWorkspace} from '../packages/cli/agent.js';import {TOOLS,toolByName} from '../packages/agent/registry.js';import {closeRenderer} from '../packages/server/render.js';
import {FIXTURE} from './fixtures/mini-character.js';

const REPO=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const argv=process.argv.slice(2);const all=(n:string)=>argv.flatMap((a,i)=>a===n?[argv[i+1]]:[]);const opt=(n:string,d?:string)=>{const i=argv.indexOf(n);return i>=0?argv[i+1]:d;};const has=(n:string)=>argv.includes(n);
const sha=(b:string|Buffer)=>createHash('sha256').update(b).digest('hex');
type Case={id:string;title:string;source:{fixture?:'mini';file?:string;case?:string};approvedName:string;timeline:{duration:number;fps:number;loop:boolean};prepare:{tool:string;args:Record<string,unknown>;label?:string}[];invariants:{parts:string[];finalFrameEqualsOriginal?:boolean};context:Record<string,unknown>;brief:string;svg:string};
type Call={tool:string;args:Record<string,unknown>;ok:boolean;code?:string;index:number;images?:number};

async function loadCase(id:string):Promise<Case>{const dir=join(REPO,'benchmarks/motion/cases',id);const c=JSON.parse(await readFile(join(dir,'case.json'),'utf8')) as Case;c.brief=(await readFile(join(dir,'brief.md'),'utf8')).trim();
 c.svg=c.source.fixture==='mini'?FIXTURE:c.source.file?await readFile(join(REPO,c.source.file),'utf8'):await readFile(join(dir,c.source.case!),'utf8');return c;}
async function freePort(){const s=createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const p=(s.address() as {port:number}).port;await new Promise<void>(r=>s.close(()=>r()));return p;}
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));

// ── Workspace + session (any MAI checkout) ──────────────────────────────────────────────────────────
async function startSession(mai:string,dir:string,port:number){
 const server=spawn(process.execPath,[join(mai,'node_modules/tsx/dist/cli.mjs'),join(mai,'packages/cli/main.ts'),'serve','--port',String(port)],{cwd:dir,stdio:['ignore','pipe','pipe']});
 const log=createWriteStream(join(dir,'server.log'));server.stdout!.pipe(log);server.stderr!.pipe(log);
 for(let i=0;i<240;i++){await sleep(250);try{const cfg=JSON.parse(await readFile(join(dir,'.cache/session.json'),'utf8'));const r=await fetch(`${cfg.url}/api/state`);if(r.ok)return {server,cfg:cfg as {url:string;token:string}};}catch{}if(server.exitCode!==null)break;}
 server.kill();throw Error(`MAI session did not start (see ${join(dir,'server.log')})`);}
function client(cfg:{url:string;token:string}){
 const post=async(path:string,body:unknown)=>{const r=await fetch(cfg.url+path,{method:'POST',headers:{'Content-Type':'application/json','x-mai-token':cfg.token},body:JSON.stringify(body)});return await r.json() as Record<string,any>;};
 return {post,call:async(tool:string,args:Record<string,unknown>={})=>post('/api/agent/call',{tool,args}),svg:async()=>(await fetch(cfg.url+'/api/svg')).text(),state:async()=>(await fetch(cfg.url+'/api/state')).json() as Promise<Record<string,any>>};}

async function prepareWorkspace(c:Case,dir:string,mai:string,port:number){
 await mkdir(join(dir,'approved'),{recursive:true});await writeFile(join(dir,'approved',c.approvedName),c.svg);
 await mkdir(join(dir,'apps/editor'),{recursive:true});try{await symlink(join(mai,'apps/editor/dist'),join(dir,'apps/editor/dist'));}catch{}
 if(existsSync(join(mai,'.claude/skills/mai-svg')))await cp(join(mai,'.claude/skills/mai-svg'),join(dir,'.claude/skills/mai-svg'),{recursive:true});
 if(existsSync(join(mai,'.agents/skills')))await cp(join(mai,'.agents/skills'),join(dir,'.agents/skills'),{recursive:true});
 const mcp={command:process.execPath,args:[join(mai,'node_modules/tsx/dist/cli.mjs'),join(mai,'packages/cli/main.ts'),'mcp'],env:{MAI_ROOT:dir,MAI_PORT:String(port)}};
 await writeFile(join(dir,'.mcp.json'),JSON.stringify({mcpServers:{'mai-svg':mcp}},null,2));
 const guide=`# ${c.title}\n\nArt-direction workspace in MAI SVG. Use the \`mai-svg\` skill and the \`mai-svg\` MCP tools for everything; the live session already has the artwork loaded and its parts labelled. \`approved/\` holds the approved original (never modify it).\n`;
 await writeFile(join(dir,'CLAUDE.md'),guide);await writeFile(join(dir,'AGENTS.md'),guide);
 const {server,cfg}=await startSession(mai,dir,port);const api=client(cfg);
 let rev=(await api.post('/api/import',{name:c.approvedName,base64:Buffer.from(c.svg).toString('base64'),expectedRevision:0})).revision as number;
 const kinds=new Map(TOOLS.map(t=>[t.name,t.kind]));
 const step=async(tool:string,args:Record<string,unknown>)=>{const k=kinds.get(tool);const r=await api.call(tool,{...args,...(k==='mutation'||k==='proposal'?{expectedRevision:rev}:{})});if(!r.ok)throw Error(`prepare ${tool}: ${JSON.stringify(r.error).slice(0,300)}`);rev=r.revision;return r;};
 await step('timeline.set',c.timeline);for(const p of c.prepare)await step(p.tool,{...p.args,...(p.label?{label:p.label}:{})});
 await step('baseline.capture',{id:'approved',label:`${c.id} approved original`,file:`approved/${c.approvedName}`});
 const inspect=await api.call('scene.inspect',{depth:1});
 const prepared={case:c.id,preparedAt:new Date().toISOString(),mai:relative(REPO,mai)||'.',maiCommit:await gitHead(mai),revision:inspect.revision,documentId:inspect.documentId,approvedSha256:sha(c.svg),port};
 await writeFile(join(dir,'prepared.json'),JSON.stringify(prepared,null,1));return {server,cfg,prepared};}
// `--ref COMMIT` benchmarks an older MAI: the commit is archived next to the runs and shares this node_modules.
async function checkout(ref:string){const rev=await new Promise<string>((ok,no)=>{const p=spawn('git',['rev-parse','--verify',`${ref}^{commit}`],{cwd:REPO});let out='';p.stdout.on('data',d=>out+=d);p.on('close',c=>c===0?ok(out.trim()):no(Error(`Unknown git ref ${ref}`)));});
 const dir=join(tmpdir(),'mai-motion-bench','mai-'+rev.slice(0,12));if(existsSync(join(dir,'packages/cli/main.ts')))return dir;await mkdir(dir,{recursive:true});
 const tar=spawn('tar',['-x','-C',dir],{stdio:['pipe','ignore','inherit']});const git=spawn('git',['archive',rev],{cwd:REPO,stdio:['ignore','pipe','inherit']});git.stdout.pipe(tar.stdin);await once(tar,'close');
 await symlink(join(REPO,'node_modules'),join(dir,'node_modules')).catch(()=>{});await mkdir(join(dir,'apps/editor'),{recursive:true});await symlink(join(REPO,'apps/editor/dist'),join(dir,'apps/editor/dist')).catch(()=>{});return dir;}
async function gitHead(dir:string){try{const p=spawn('git',['rev-parse','HEAD'],{cwd:dir});let out='';p.stdout.on('data',d=>out+=d);await once(p,'close');return out.trim()||undefined;}catch{return undefined;}}

// ── Agents ─────────────────────────────────────────────────────────────────────────────────────────
const FOOTER='\n\n(Trabaja en la sesión de MAI de este workspace con las herramientas mai-svg. El humano no está disponible durante esta tarea: decide con tu mejor criterio, deja el resultado aplicado en la sesión y al final resume qué hiciste y qué supuestos tomaste.)';
async function runAgent(agent:'claude'|'codex',dir:string,port:number,mai:string,brief:string,timeoutSec:number,model?:string){
 const prompt=brief+FOOTER;let child:ChildProcess;
 if(agent==='claude')child=spawn('claude',['-p','--output-format','stream-json','--verbose','--settings',JSON.stringify({disableAllHooks:true}),'--mcp-config',join(dir,'.mcp.json'),'--strict-mcp-config','--permission-mode','dontAsk',...(model?['--model',model]:[]),'--allowedTools','mcp__mai-svg','Read','Skill'],{cwd:dir,stdio:['pipe','pipe','pipe']});
 else child=spawn('codex',['exec','--json','-C',dir,'--skip-git-repo-check','--ephemeral','-s','read-only','-c',`mcp_servers.mai_svg.command=${JSON.stringify(process.execPath)}`,'-c',`mcp_servers.mai_svg.args=${JSON.stringify([join(mai,'node_modules/tsx/dist/cli.mjs'),join(mai,'packages/cli/main.ts'),'mcp'])}`,'-c',`mcp_servers.mai_svg.env={MAI_ROOT=${JSON.stringify(dir)},MAI_PORT=${JSON.stringify(String(port))}}`,'-c','mcp_servers.mai_svg.startup_timeout_sec=90','-c','mcp_servers.mai_svg.tool_timeout_sec=900',...(model?['-m',model]:[]),prompt],{cwd:dir,stdio:['pipe','pipe','pipe']});
 const out=createWriteStream(join(dir,'transcript.jsonl')),err=createWriteStream(join(dir,'agent.stderr.log'));child.stdout!.pipe(out);child.stderr!.pipe(err);
 if(agent==='claude')child.stdin!.end(prompt);else child.stdin!.end();
 const started=Date.now();let timedOut=false;const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');setTimeout(()=>child.kill('SIGKILL'),10000);},timeoutSec*1000);
 const [code]=await once(child,'close') as [number|null];clearTimeout(timer);await new Promise(r=>out.end(r));
 return {agent,exitCode:code,timedOut,wallMs:Date.now()-started};}

// Normalize Claude stream-json / Codex --json transcripts into tool calls with outcome.
function parseTranscript(text:string,agent:string){
 const lines=text.split('\n').filter(Boolean).flatMap(l=>{try{return [JSON.parse(l)];}catch{return [];}});const calls:Call[]=[];let usage:Record<string,unknown>={},final='';const reads:string[]=[];
 const body=(t:unknown)=>{const s=typeof t==='string'?t:Array.isArray(t)?t.map(x=>x?.text??'').join(''):'';try{return JSON.parse(s) as {ok?:boolean;error?:{code?:string}};}catch{return undefined;}};
 if(agent==='claude'){const pending=new Map<string,Call>();
  for(const d of lines){if(d.type==='assistant')for(const b of d.message?.content??[]){if(b.type==='tool_use'){if(String(b.name).startsWith('mcp__mai-svg__')){const c:Call={tool:String(b.name).slice(14),args:b.input??{},ok:true,index:calls.length};calls.push(c);pending.set(b.id,c);}else if(b.name==='Read')reads.push(String(b.input?.file_path??''));}if(b.type==='text')final=b.text;}
   if(d.type==='user')for(const b of d.message?.content??[])if(b.type==='tool_result'&&pending.has(b.tool_use_id)){const c=pending.get(b.tool_use_id)!;if(Array.isArray(b.content))c.images=b.content.filter((x:{type?:string})=>x?.type==='image').length;const j=body(b.content);c.ok=!b.is_error&&j?.ok!==false;if(!c.ok)c.code=j?.error?.code??'TOOL_ERROR';}
   if(d.type==='result'){usage={turns:d.num_turns,durationMs:d.duration_ms,costUsd:d.total_cost_usd,usage:d.usage,subtype:d.subtype,...(d.terminal_reason&&d.terminal_reason!=='completed'?{failed:d.terminal_reason}:{})};if(d.result)final=d.result;}}}
 else{for(const d of lines){const it=d.item;if(d.type==='item.completed'&&it?.type==='mcp_tool_call'){const j=body(it.result?.content);const c:Call={tool:String(it.tool),args:it.arguments??{},ok:it.status==='completed'&&!it.error&&j?.ok!==false,index:calls.length,images:Array.isArray(it.result?.content)?it.result.content.filter((x:{type?:string})=>x?.type==='image').length:0};if(!c.ok)c.code=j?.error?.code??(it.error?'CLIENT_REJECTED':'TOOL_ERROR');calls.push(c);}
   if(d.type==='item.completed'&&it?.type==='agent_message')final=it.text??final;if(d.type==='turn.completed')usage={usage:d.usage};if(d.type==='turn.failed')usage={...usage,failed:d.error?.message};}}
 return {calls,usage,final,reads};}

function autonomy(t:ReturnType<typeof parseTranscript>){
 const name=(c:Call)=>toolByName(c.tool)?.name??c.tool;const kind=(c:Call)=>toolByName(c.tool)?.kind;const byTool:Record<string,number>={};for(const c of t.calls)byTool[name(c)]=(byTool[name(c)]??0)+1;
 const errors=t.calls.filter(c=>!c.ok);const codes:Record<string,number>={};for(const e of errors)codes[e.code!]=(codes[e.code!]??0)+1;
 const ops=t.calls.filter(c=>name(c)==='ops.apply'&&c.ok).flatMap(c=>(c.args.ops as {type:string}[]|undefined)??[]);const opTypes:Record<string,number>={};for(const o of ops)opTypes[o.type]=(opTypes[o.type]??0)+1;
 const presetCalls=(byTool['motion.preset']??0)+(opTypes['motion.preset']??0);const keyframeOps=(opTypes['keyframe']??0)+(opTypes['track.copy']??0)+(opTypes['track.edit']??0)+(opTypes['clip.place']??0);
 const mutations=t.calls.filter(c=>c.ok&&(kind(c)==='mutation'||kind(c)==='proposal')&&!c.args.dryRun);const looks=t.calls.filter(c=>['preview.render','render.filmstrip','compare.frames','critique','identity.check'].includes(name(c))||(c.args.preview&&c.ok));
 const ANIMATING=new Set(['ops.apply','plan.execute','motion.preset','motion.spring','animation.adjust','fluid.animate','smoke.emit','morph.apply','expression.apply','timeline.set','variant.combine','history.undo','history.redo']);
 const last=mutations.at(-1)?.index??-1,lastAnim=mutations.filter(c=>ANIMATING.has(name(c))).at(-1)?.index??-1;
 return {toolCalls:t.calls.length,byTool,errors:errors.length,errorCodes:codes,commits:mutations.length,dryRuns:t.calls.filter(c=>c.args.dryRun).length,plans:byTool['plan.execute']??0,
  opsApplied:ops.length,opTypes,presetUses:presetCalls,keyframeLevelOps:keyframeOps,primitiveShare:keyframeOps+presetCalls?Number((keyframeOps/(keyframeOps+presetCalls)).toFixed(3)):null,
  observations:looks.length,lookedAfterLastCommit:last>=0&&looks.some(c=>c.index>last),lookedAfterLastAnimationChange:lastAnim>=0&&looks.some(c=>c.index>lastAnim),imagesSeen:t.calls.reduce((s,c)=>s+(c.images??0),0)+t.reads.filter(r=>/\.(png|jpe?g)$/i.test(r)).length,usage:t.usage};}

// ── Verification with THIS checkout's metrics ──────────────────────────────────────────────────────────
async function verify(dir:string,c:Case,api:ReturnType<typeof client>,prepared:Record<string,any>,agentRun?:Record<string,unknown>){
 const svg=await api.svg();await writeFile(join(dir,'final.svg'),svg);const state=await api.state();
 const h=await api.call('scene.history',{limit:100});const history=((h.entries as {revision:number}[]|undefined)??[]).filter(e=>e.revision>prepared.revision);
 return measure(dir,c,svg,prepared,Number(state.revision),history.length,agentRun);}
// Pure measurement of a final editable SVG (+ transcript): used live and by --rescore so every run uses the same code.
async function measure(dir:string,c:Case,svg:string,prepared:Record<string,any>,revision:number,historyCount:number|undefined,agentRun?:Record<string,unknown>){
 const m=new VectorDocument(svg,'final.svg');const p=m.project;
 const tracks=p.tracks,keys=tracks.reduce((s,t)=>s+t.keys.length,0);
 // v2 engine: procedural signals, motion paths, camera, effects and beats animate without keyframe tracks.
 const signals=(p.signals??[]).filter(x=>x.enabled!==false),camera=tracks.some(t=>t.target==='@camera')||signals.some(x=>(x.output as {target?:string}).target==='@camera');
 const motion={animated:tracks.length>0||(p.secondary??[]).length>0||(p.modifiers??[]).length>0||signals.length>0||(p.motionPaths??[]).length>0||(p.smokeEmitters??[]).length>0,revision,revisionsSincePrepare:revision-prepared.revision,...(historyCount!==undefined?{historyEntriesSincePrepare:historyCount}:{}),tracks:tracks.length,keys,animatedTargets:new Set(tracks.map(t=>t.target)).size,properties:[...new Set(tracks.map(t=>t.property))],easings:[...new Set(tracks.flatMap(t=>t.keys.map(k=>k.easing.startsWith('cubic')?'cubic-bezier':k.easing)))],layers:[...new Set(tracks.map(t=>t.layer??'base'))],secondary:(p.secondary??[]).length,modifiers:(p.modifiers??[]).length,paramTracks:tracks.filter(t=>t.property==='param').length,signals:signals.length,signalKinds:[...new Set(signals.map(x=>(x.source as {kind?:string}).kind??'?'))],motionPaths:(p.motionPaths??[]).length,camera,effects:(p.effects??[]).length,beats:(p.beats??[]).length,assertions:(p.assertions??[]).length,context:p.context?.purpose??null,duration:p.duration,loop:p.loop};
 const crit=critique(m);const audit=detect(m);const perf=profile(m) as unknown as Record<string,unknown>;
 let exported:Record<string,unknown>;try{const r=exportSvg(m,{profile:'standalone'});exported={ok:true,bytes:r.svg.length,report:{samples:(r as {report?:{samples?:number}}).report?.samples}};}catch(e){exported={ok:false,error:String((e as Error).message).slice(0,200)};}
 const ws={...fileWorkspace(svg,'final.svg'),root:dir};const svc=new AgentService(ws);const D=p.duration;const times=[0,.15,.3,.45,.6,.75,.9,1].map(f=>Number((f*D).toFixed(3)));
 let identity:Record<string,unknown>;try{const r=await svc.call('identity.check',{reference:{kind:'baseline',id:'approved'},parts:c.invariants.parts,times});const ev=(r.evaluated as {part:string;time:number;status:string;mae:number;ssim:number;silhouetteIoU:number}[])??[];
  const per:Record<string,{restMae?:number;maxMae:number;minSsim:number;minIoU:number;statuses:Record<string,number>}>={};for(const e of ev){const a=per[e.part]??={maxMae:0,minSsim:1,minIoU:1,statuses:{}};if(e.time===0)a.restMae=e.mae;a.maxMae=Math.max(a.maxMae,e.mae);a.minSsim=Math.min(a.minSsim,e.ssim);a.minIoU=Math.min(a.minIoU,e.silhouetteIoU);a.statuses[e.status]=(a.statuses[e.status]??0)+1;}
  // Gated status only exists for protected parts; rest-frame MAE (0–255) says whether the character comes back to itself.
  const vals=Object.values(per);identity={status:r.status,restMaxMae:vals.length?Math.max(...vals.map(v=>v.restMae??0)):null,maxMae:vals.length?Math.max(...vals.map(v=>v.maxMae)):null,skipped:r.skipped,perPart:per};}catch(e){identity={status:'error',error:String((e as Error).message).slice(0,200)};}
 let finalFrame:Record<string,unknown>|undefined;if(c.invariants.finalFrameEqualsOriginal){try{const ref=new VectorDocument(c.svg);const {renderSvg}=await import('../packages/server/render.js');const {metrics,raw}=await import('../packages/server/perceptual.js');const [a,b]=await Promise.all([renderSvg(ref.frame(0)),renderSvg(m.frame(D))]);finalFrame=metrics(await raw(a.png),await raw(b.png));}catch(e){finalFrame={error:String((e as Error).message).slice(0,200)};}}
 let filmstrip:string|undefined;try{const f=await svc.call('render.filmstrip',{count:12}) as {sheet:{path:string}};filmstrip=join(dir,'filmstrip.png');await copyFile(f.sheet.path,filmstrip);}catch(e){filmstrip=undefined;}
 const t=existsSync(join(dir,'transcript.jsonl'))&&agentRun?parseTranscript(await readFile(join(dir,'transcript.jsonl'),'utf8'),String(agentRun.agent)):undefined;
 const counts=(xs:{code:string;severity:string}[])=>({errors:xs.filter(x=>x.severity==='error').length,warnings:xs.filter(x=>x.severity==='warning').length,codes:[...new Set(xs.map(x=>x.code))]});
 const scores=crit.deterministic.scores as Record<string,number>;
 return {case:c.id,verifiedAt:new Date().toISOString(),prepared,agent:agentRun,changed:revision>prepared.revision,motion,
  axes:{fidelity:identity,technicalCraft:{critique:counts(crit.deterministic.findings),audit:audit.summary,export:exported,performance:{bytes:perf.bytes,engine:perf.engine,counts:perf.counts}},motionQuality:{critiqueScores:scores,mean:Number((Object.values(scores).reduce((a,b)=>a+b,0)/Object.values(scores).length/4).toFixed(3))},direction:{status:'human review pending',notes:`benchmarks/motion/cases/${c.id}/human-quality-notes.json`},autonomy:t?autonomy(t):null},
  ...(finalFrame?{finalFrameVsOriginal:finalFrame}:{}),filmstrip:filmstrip?relative(dir,filmstrip):null,finalMessage:t?.final?.slice(0,2000),note:'Deterministic evidence for a human reviewer; not aesthetic approval.'};}

// ── Orchestration ────────────────────────────────────────────────────────────────────────────────────
async function gallery(out:string,runs:Record<string,any>[]){const rows=runs.map(r=>{const a=r.axes??{};const au=a.autonomy;return `<tr><td>${r.case}</td><td>${r.agent?.agent??'none'}</td><td>${r.changed?'sí':'no'}</td><td>${a.fidelity?.status??'-'}</td><td>${a.motionQuality?.mean??'-'}</td><td>${a.technicalCraft?.critique?.codes?.join(' ')??''}</td><td>${au?`${au.toolCalls} llamadas · ${au.errors} errores · presets ${au.presetUses} · keyframes ${au.keyframeLevelOps} · miró ${au.observations}${au.lookedAfterLastAnimationChange?' ✓':''}`:'-'}</td><td>${r.filmstrip?`<a href="${r.dir}/${r.filmstrip}"><img src="${r.dir}/${r.filmstrip}" width="360"></a>`:'-'}</td></tr>`;}).join('\n');
 await writeFile(join(out,'index.html'),`<!doctype html><meta charset="utf-8"><title>MAI motion bench</title><style>body{font:14px system-ui;margin:24px}td,th{border-bottom:1px solid #ddd;padding:6px;vertical-align:top;text-align:left}</style><h1>MAI motion bench</h1><p>Evidencia determinista; la dirección y la calidad estética las juzga un humano.</p><table><tr><th>Caso</th><th>Agente</th><th>Cambió</th><th>Identidad</th><th>Movimiento (0–1)</th><th>Hallazgos</th><th>Autonomía</th><th>Filmstrip</th></tr>${rows}</table>`);}

async function main(){
 if(opt('--rescore')){const out=resolve(opt('--rescore')!);const summary=JSON.parse(await readFile(join(out,'summary.json'),'utf8').catch(()=>'{"runs":[]}'));const results:Record<string,any>[]=[];
  for(const name of (await readdir(out)).filter(n=>!n.includes('.')).sort()){const dir=join(out,name);if(!existsSync(join(dir,'final.svg'))||!existsSync(join(dir,'prepared.json'))){const old=existsSync(join(dir,'run.json'))?JSON.parse(await readFile(join(dir,'run.json'),'utf8')):{};results.push({...old,dir:name});continue;}
   const prepared=JSON.parse(await readFile(join(dir,'prepared.json'),'utf8'));const c=await loadCase(prepared.case);const old=existsSync(join(dir,'run.json'))?JSON.parse(await readFile(join(dir,'run.json'),'utf8')):{};
   // A scratch root holds the approved file so the baseline reference resolves exactly as in the live workspace.
   const root=join(tmpdir(),'mai-motion-bench','rescore',name);await mkdir(join(root,'approved'),{recursive:true});await writeFile(join(root,'approved',c.approvedName),c.svg);for(const f of ['transcript.jsonl'])if(existsSync(join(dir,f)))await copyFile(join(dir,f),join(root,f));
   const svg=await readFile(join(dir,'final.svg'),'utf8');const r=await measure(root,c,svg,prepared,new VectorDocument(svg).project.revision,undefined,old.agent);if(existsSync(join(root,'filmstrip.png')))await copyFile(join(root,'filmstrip.png'),join(dir,'filmstrip.png'));
   await writeFile(join(dir,'run.json'),JSON.stringify({...r,filmstrip:existsSync(join(dir,'filmstrip.png'))?'filmstrip.png':null,rescoredAt:new Date().toISOString()},null,1));results.push({...r,dir:name});process.stderr.write(`rescored ${name}\n`);}
  await writeFile(join(out,'summary.json'),JSON.stringify({...summary,runs:results,rescoredAt:new Date().toISOString()},null,1));await gallery(out,results);await closeRenderer();return;}
 if(opt('--verify')){const dir=resolve(opt('--verify')!);const prepared=JSON.parse(await readFile(join(dir,'prepared.json'),'utf8'));const c=await loadCase(prepared.case);const cfg=JSON.parse(await readFile(join(dir,'.cache/session.json'),'utf8'));
  const run=existsSync(join(dir,'agent.json'))?JSON.parse(await readFile(join(dir,'agent.json'),'utf8')):undefined;const r=await verify(dir,c,client(cfg),prepared,run);await writeFile(join(dir,'run.json'),JSON.stringify(r,null,1));console.log(JSON.stringify(r.axes,null,1));await closeRenderer();return;}
 const ids=has('--all')?(await readdir(join(REPO,'benchmarks/motion/cases'))).sort():all('--case');if(!ids.length)throw Error('Pass --case ID (repeatable) or --all');
 const agents=(opt('--agent','none')!).split(',') as ('claude'|'codex'|'none')[];const runs=Number(opt('--runs','1')),mai=opt('--ref')?await checkout(opt('--ref')!):resolve(opt('--mai',REPO)!),label=opt('--label','run')!,timeout=Number(opt('--timeout','1800')),model=opt('--model');
 const stamp=new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);const out=resolve(opt('--out',join(REPO,'experiments/motion-bench',`${stamp}-${label}`))!);await mkdir(out,{recursive:true});
 const results:Record<string,any>[]=[];
 for(const id of ids){const c=await loadCase(id);for(const agent of agents)for(let n=1;n<=runs;n++){
  const name=`${id}-${agent}-${n}`,dir=join(tmpdir(),'mai-motion-bench',`${stamp}-${label}`,name);await rm(dir,{recursive:true,force:true});await mkdir(dir,{recursive:true});
  process.stderr.write(`▶ ${name}: preparing (MAI ${relative(REPO,mai)||'.'})\n`);const port=await freePort();let server:ChildProcess|undefined;
  try{const prep=await prepareWorkspace(c,dir,mai,port);server=prep.server;const api=client(prep.cfg);
   let agentRun:Record<string,unknown>|undefined;if(agent!=='none'){process.stderr.write(`  running ${agent} (timeout ${timeout}s)\n`);agentRun=await runAgent(agent,dir,port,mai,c.brief,timeout,model);await writeFile(join(dir,'agent.json'),JSON.stringify(agentRun));}
   process.stderr.write('  verifying\n');const r=await verify(dir,c,api,prep.prepared,agentRun);
   const runOut=join(out,name);await mkdir(runOut,{recursive:true});for(const f of ['run.json','transcript.jsonl','agent.stderr.log','filmstrip.png','final.svg','prepared.json'])if(existsSync(join(dir,f))&&f!=='run.json')await copyFile(join(dir,f),join(runOut,f));
   await writeFile(join(runOut,'run.json'),JSON.stringify(r,null,1));results.push({...r,dir:name,workspace:has('--keep')?dir:undefined});
   process.stderr.write(`  ✓ changed=${r.changed} identity=${(r.axes.fidelity as {status?:string}).status} motion=${r.axes.motionQuality.mean} calls=${r.axes.autonomy?.toolCalls??'-'}\n`);}
  catch(e){process.stderr.write(`  ✗ ${String((e as Error).message)}\n`);results.push({case:id,agent:{agent},dir:name,error:String((e as Error).message)});}
  finally{if(server&&!has('--keep'))server.kill('SIGTERM');}}}
 await closeRenderer();const summary={label,mai:relative(REPO,mai)||'.',maiCommit:await gitHead(mai),createdAt:new Date().toISOString(),cases:ids,agents,runs:results};
 await writeFile(join(out,'summary.json'),JSON.stringify(summary,null,1));await gallery(out,results);
 await mkdir(join(REPO,'experiments/evidence'),{recursive:true});await writeFile(join(REPO,'experiments/evidence',`motion-bench-${stamp.slice(0,10)}-${label}.json`),JSON.stringify(summary,null,1));
 console.log(JSON.stringify({out,gallery:join(out,'index.html'),runs:results.length},null,1));
}
await main();
