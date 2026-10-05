import {readFile} from 'node:fs/promises';
import {TOOLS,type Tool,type Schema} from '../agent/registry.js';
import {AgentService,type Workspace} from '../agent/service.js';
import {AgentError} from '../agent/address.js';
import {VectorDocument} from '../core/document.js';
import {Choices} from '../server/choices.js';import {Snapshots} from '../server/snapshots.js';import {Comments} from '../server/comments.js';import {Inbox} from '../server/inbox.js';
import {join} from 'node:path';import {tmpdir} from 'node:os';
import {assertSvg} from '../converter/svg.js';
import {closeRenderer} from '../server/render.js';
// CLI surface generated from the tool registry. Output is always a JSON envelope (stable for agents).
const camel=(s:string)=>s.replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
export function matchTool(argv:string[]):{tool:Tool;rest:string[]}|undefined{
 const candidates=TOOLS.map(t=>({t,words:t.cli.split(' ')})).filter(({words})=>words.every((w,i)=>argv[i]===w)).sort((a,b)=>b.words.length-a.words.length);
 return candidates[0]?{tool:candidates[0].t,rest:argv.slice(candidates[0].words.length)}:undefined;}
function coerce(schema:Schema|undefined,raw:string):unknown{
 if(!schema)return raw;switch(schema.type){
  case 'number':case 'integer':{const n=Number(raw);if(!Number.isFinite(n))throw new AgentError('INVALID_ARGUMENT',`Expected a number, got "${raw}"`);return n;}
  case 'boolean':return !['false','0','no'].includes(raw);
  case 'array':{if(raw.trim().startsWith('['))return JSON.parse(raw);return raw.split(',').map(x=>x.trim()).filter(Boolean).map(x=>coerce(schema.items,x));}
  case 'object':{if(raw.trim().startsWith('{'))return JSON.parse(raw);
   if(typeof schema.additionalProperties==='object')return Object.fromEntries(raw.split(',').map(pair=>{const i=pair.indexOf('=');if(i<1)throw new AgentError('INVALID_ARGUMENT',`Expected key=value, got "${pair}"`);return [pair.slice(0,i).trim(),coerce(schema.additionalProperties as Schema,pair.slice(i+1).trim())];}));
   const nums=raw.split(',').map(Number);if(nums.every(Number.isFinite)){if(nums.length===2&&schema.properties?.x&&schema.properties?.y&&!schema.properties?.width)return {x:nums[0],y:nums[1]};if(nums.length===4&&schema.properties?.width)return {x:nums[0],y:nums[1],width:nums[2],height:nums[3]};}
   throw new AgentError('INVALID_ARGUMENT',`Expected JSON object for this flag, got "${raw}"`);}
  default:return raw;}}
export async function parseArgs(tool:Tool,rest:string[]){const props=tool.input.properties??{};const args:Record<string,unknown>={};const positional:string[]=[];
 for(let i=0;i<rest.length;i++){const a=rest[i];if(!a.startsWith('--')){positional.push(a);continue;}const key=camel(a.slice(2));
  if(key==='args'){Object.assign(args,JSON.parse(rest[++i]));continue;}if(key==='argsFile'){Object.assign(args,JSON.parse(await readFile(rest[++i],'utf8')));continue;}if(key==='compact'||key==='file')continue;
  const s=props[key];if(!s)throw new AgentError('INVALID_ARGUMENT',`Unknown flag --${a.slice(2)} for ${tool.name}. Valid: ${Object.keys(props).map(k=>'--'+k.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())).join(' ')}`);
  if(s.type==='boolean'&&(rest[i+1]===undefined||rest[i+1].startsWith('--'))){args[key]=true;continue;}const v=rest[++i];if(v===undefined)throw new AgentError('INVALID_ARGUMENT',`--${a.slice(2)} needs a value`);
  // Object flags accept inline JSON or a .json file path (mai execute --plan plan.json).
  const value=(s.type==='object'||(s.type===undefined&&!!s.properties))&&/\.json$/i.test(v)&&!v.trim().startsWith('{')?JSON.parse(await readFile(v,'utf8')):coerce(s,v);
  if(s.type==='object'&&typeof s.additionalProperties==='object'&&args[key])args[key]={...(args[key] as object),...(value as object)};else if(s.type==='array'&&Array.isArray(args[key]))args[key]=[...(args[key] as unknown[]),...(value as unknown[])];else args[key]=value;}
 // Positional values fill required string properties in order ("mai resolve candy.flask.smoke", "mai choices choose D").
 const slots=(tool.input.required??[]).filter(k=>props[k]?.type==='string'&&args[k]===undefined);for(const [i,v]of positional.entries()){if(tool.name==='choice.propose'&&i===0){args.request=JSON.parse(await readFile(v,'utf8'));continue;}const k=slots[i];if(!k)throw new AgentError('INVALID_ARGUMENT',`Unexpected argument "${v}"`);args[k]=v;}
 return args;}
async function session(){try{return JSON.parse(await readFile(join(process.env.MAI_ROOT??process.cwd(),'.cache/session.json'),'utf8')) as {url:string;token:string};}catch{return undefined;}}
export async function callSession(tool:string,args:Record<string,unknown>){const s=await session();if(!s)throw new AgentError('NO_SESSION','No running MAI session (.cache/session.json missing)',{hint:'Start it with: npm run mai -- serve'},503);
 let r:Response;try{r=await fetch(`${s.url}/api/agent/call`,{method:'POST',headers:{'Content-Type':'application/json','x-mai-token':s.token},body:JSON.stringify({tool,args})});}catch{throw new AgentError('NO_SESSION',`MAI session at ${s.url} is not reachable`,{hint:'Start it with: npm run mai -- serve'},503);}
 return {status:r.status,body:await r.json()};}
// Read-only workspace over a file: lets agents inspect/audit assets without a running editor.
export function fileWorkspace(svg:string,name:string):Workspace{const model=new VectorDocument(svg,name);model.project.documentId??=`file-${name.replace(/[^\w.-]/g,'_').slice(0,60)}`;const cache=join(tmpdir(),'mai-offline');const no=()=>{throw new AgentError('SESSION_REQUIRED','This tool changes the scene: load the file into a session (mai serve; mai load FILE --expected-revision N)',{},400);};
 return {model:()=>model,revision:()=>model.project.revision,asset:()=>name,sessionId:()=>'offline',documentId:()=>model.project.documentId!,snapshots:new Snapshots(join(cache,'snapshots')),cache,root:process.cwd(),selection:()=>[],apply:no,undo:no,redo:no,history:()=>({revision:model.project.revision,entries:[],canUndo:false,canRedo:false}),previous:()=>undefined,queued:w=>w(),broadcast:()=>{},choices:new Choices(join(cache,'choices')),comments:new Comments(join(cache,'comments')),inbox:new Inbox(join(cache,'inbox.jsonl')),exportFile:no};}
const OFFLINE=new Set(['capabilities','scene.inspect','scene.semantics','scene.timeline','scene.identity','audit','critique','performance','export.capabilities','part.resolve','preview.render','identity.check']);
export async function runTool(argv:string[]):Promise<number>{
 const compact=argv.includes('--compact');const print=(v:unknown)=>console.log(JSON.stringify(v,null,compact?0:2));
 try{const found=matchTool(argv);if(!found)return -1;const {tool,rest}=found;
  const fileIndex=rest.findIndex(a=>/\.svg$/i.test(a)&&!rest[rest.indexOf(a)-1]?.startsWith('--'));const file=rest.includes('--file')?rest[rest.indexOf('--file')+1]:fileIndex>=0&&OFFLINE.has(tool.name)?rest[fileIndex]:undefined;
  const cleaned=file?rest.filter((a,i)=>a!==file&&!(a==='--file'&&rest[i+1]===file)):rest;const args=await parseArgs(tool,cleaned);
  if(tool.name==='capabilities'){const service=new AgentService(fileWorkspace('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"/>','registry'));print(await service.call('capabilities',args));return 0;}
  if(file){if(!OFFLINE.has(tool.name))throw new AgentError('SESSION_REQUIRED',`${tool.name} needs a running session`);const svg=await readFile(file,'utf8');const service=new AgentService(fileWorkspace(svg,file.split('/').at(-1)!));try{const out=await service.call(tool.name,args);print(tool.name==='scene.inspect'?{...out,validation:assertSvg(svg)}:out);return 0;}finally{await closeRenderer();}}
  if(['capabilities'].includes(tool.name)){print(await new AgentService(fileWorkspace('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"/>','registry')).call(tool.name,args));return 0;}
  const r=await callSession(tool.name,args);print(r.body);return r.body.ok?0:r.status===409?2:1;
 }catch(error){const e=error as AgentError;print({ok:false,error:{code:e.code??'CLI_ERROR',message:String(e.message??e),...(e.extra??{})}});return e.status===409?2:1;}
}
export function toolHelp(){return TOOLS.map(t=>`mai ${t.cli.padEnd(22)} ${t.kind.padEnd(9)} ${t.summary.split('.')[0]}`).join('\n');}
