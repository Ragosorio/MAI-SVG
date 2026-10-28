import {readFile} from 'node:fs/promises';import sharp from 'sharp';import {join} from 'node:path';
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {ListToolsRequestSchema,CallToolRequestSchema,ListResourcesRequestSchema,ListResourceTemplatesRequestSchema,ReadResourceRequestSchema,SubscribeRequestSchema,UnsubscribeRequestSchema,ListPromptsRequestSchema,GetPromptRequestSchema,CompleteRequestSchema,McpError} from '@modelcontextprotocol/sdk/types.js';
import {FIXED,TEMPLATES,PROMPTS,readResource,complete} from './surface.js';
import {TOOLS,CONVENTIONS,toolByName,type Tool} from '../agent/registry.js';
import {startEditorServer} from '../server/server.js';
// MCP server (official SDK, stdio). Tools are generated from the same registry as the CLI and HTTP API and call the
// same live session, so MCP edits reach the editor through WebSocket and share revisions, receipts and undo.
const log=(...a:unknown[])=>process.stderr.write(a.map(String).join(' ')+'\n');
const MAX_IMAGES=4,MAX_IMAGE_BYTES=1.5*1024*1024;
function describe(t:Tool){const ex=t.examples[0];return `${t.summary}\nWhen: ${t.when}\nSide effects: ${t.sideEffects}. Reversible: ${t.reversible}. Preview: ${t.preview}. Identity: ${t.identityImpact}. Availability: ${t.availability?.status}${t.availability?.note?` (${t.availability.note})`:''}.${ex?`\nExample: ${JSON.stringify(ex.args).slice(0,600)} — ${ex.why}`:''}`;}
export function mcpTools(){return TOOLS.map(t=>({name:t.mcp,title:t.name,description:describe(t),inputSchema:t.input as {type:'object'},outputSchema:t.outputSchema as {type:'object'},annotations:{title:t.name,readOnlyHint:t.kind==='query'||(t.kind==='render'&&t.name!=='export'),destructiveHint:!!t.destructive,idempotentHint:t.kind==='query'||t.name==='plan.execute',openWorldHint:false}}));}
// MAI_ROOT selects the workspace (its .cache holds the session); default: current directory.
const ROOT=process.env.MAI_ROOT??process.cwd();
async function session(){try{return JSON.parse(await readFile(join(ROOT,'.cache/session.json'),'utf8')) as {url:string;token:string};}catch{return undefined;}}
let started:Promise<Awaited<ReturnType<typeof startEditorServer>>>|undefined;
async function ensureSession(){let s=await session();if(s){try{const r=await fetch(`${s.url}/api/state`);if(r.ok)return s;}catch{}}
 // No live editor: start one in this process so the human can open it and watch the agent's edits arrive.
 started??=startEditorServer(Number(process.env.MAI_PORT??4318),ROOT);await started;s=await session();if(!s)throw Error('Could not start a MAI session');log(`MAI editor for MCP clients: ${s.url}`);return s;}
async function post(tool:string,args:Record<string,unknown>,signal?:AbortSignal){const s=await ensureSession();const r=await fetch(`${s.url}/api/agent/call`,{method:'POST',headers:{'Content-Type':'application/json','x-mai-token':s.token},body:JSON.stringify({tool,args}),signal});return await r.json() as Record<string,unknown>;}
// Contact sheets come first (a whole animation in one image); oversized PNGs are re-encoded as JPEG to fit the budget.
async function images(body:Record<string,unknown>){const sheet=(x:unknown)=>{const p=(x as {sheet?:{path?:string}}|undefined)?.sheet?.path;return p?[{path:p}]:[];};const paths=[...sheet(body),...sheet((body.preview as {filmstrip?:unknown})?.filmstrip),...sheet(body.filmstrip),...sheet((body.evaluation as {filmstrip?:unknown})?.filmstrip),...sheet(((body.receipt as {evaluation?:{filmstrip?:unknown}})?.evaluation)?.filmstrip),...(typeof body.posterPath==='string'?[{path:body.posterPath}]:[]),...((body.views as {path:string}[]|undefined)??[]),...((body.frames as {path:string}[]|undefined)??[]),...(((body.preview as {frames?:{path:string}[]})?.frames)??[]),...(((body.artifacts as {path?:string}[]|undefined)??[]).filter(a=>a.path) as {path:string}[]),...((body.option as {previewPath?:string}|undefined)?.previewPath?[{path:(body.option as {previewPath:string}).previewPath}]:[]),...((((body.choice as {options?:{previewPath?:string}[]})?.options)??[]).filter(o=>o.previewPath).map(o=>({path:o.previewPath!})))];
 const out:{type:'image';data:string;mimeType:string}[]=[];const skipped:string[]=[];for(const f of paths){if(out.length>=MAX_IMAGES){skipped.push(f.path);continue;}try{let data=await readFile(f.path),mimeType=/\.jpe?g$/i.test(f.path)?'image/jpeg':'image/png';if(data.length>MAX_IMAGE_BYTES){data=await sharp(data).resize({width:1600,withoutEnlargement:true}).flatten({background:'#e9e9ec'}).jpeg({quality:82}).toBuffer();mimeType='image/jpeg';}if(data.length>MAX_IMAGE_BYTES){skipped.push(f.path);continue;}out.push({type:'image',data:data.toString('base64'),mimeType});}catch{skipped.push(f.path);}}return {out,skipped};}
export async function startMcp(){
 // stdout belongs to JSON-RPC: route every console.log (e.g. the editor banner) to stderr.
 console.log=(...a:unknown[])=>log(...a);console.info=console.log;
 const server=new Server({name:'mai-svg',version:'0.4.0'},{capabilities:{tools:{},resources:{subscribe:true,listChanged:false},prompts:{},completions:{}},instructions:`MAI SVG: structured vector authoring tools. ${CONVENTIONS.language} Start with inspect_scene (and inspect_choices when the human talks about options). For one human request with several changes use execute_plan (one atomic transaction, dry-run first when identity is involved). Mutations need expectedRevision from your last read; errors carry codes, candidates and recovery hints — never guess an ambiguous part. render_preview and check_identity before explaining results.`});
 server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:mcpTools()}));
 // Resources read one thing at a time (a part, an operation, a preset) through the same agent tools.
 const call=async(tool:string,args:Record<string,unknown>={})=>post(tool,args);
 server.setRequestHandler(ListResourcesRequestSchema,async()=>({resources:FIXED}));
 server.setRequestHandler(ListResourceTemplatesRequestSchema,async()=>({resourceTemplates:TEMPLATES}));
 server.setRequestHandler(ReadResourceRequestSchema,async req=>{try{const value=await readResource(req.params.uri,call);return {contents:[{uri:req.params.uri,mimeType:'application/json',text:JSON.stringify(value,null,1)}]};}catch(e){const err=e as {code?:number;message:string};throw new McpError(err.code??-32603,err.message);}});
 // Subscriptions: the live session's revision is polled while anyone listens; every change notifies scene resources.
 const subs=new Set<string>();let lastRevision:number|undefined;let poll:ReturnType<typeof setInterval>|undefined;
 const tick=async()=>{try{const sess=await session();if(!sess)return;const st=await (await fetch(`${sess.url}/api/state`)).json() as {revision:number};if(lastRevision!==undefined&&st.revision!==lastRevision)for(const uri of subs)await server.sendResourceUpdated({uri});lastRevision=st.revision;}catch{/* session restarting: next tick */}};
 server.setRequestHandler(SubscribeRequestSchema,async req=>{subs.add(req.params.uri);if(!poll){await tick();poll=setInterval(()=>void tick(),Number(process.env.MAI_MCP_POLL_MS??1500));}return {};});
 server.setRequestHandler(UnsubscribeRequestSchema,async req=>{subs.delete(req.params.uri);if(!subs.size&&poll){clearInterval(poll);poll=undefined;lastRevision=undefined;}return {};});
 server.setRequestHandler(ListPromptsRequestSchema,async()=>({prompts:PROMPTS.map(p=>({name:p.name,description:p.description,arguments:p.arguments}))}));
 server.setRequestHandler(GetPromptRequestSchema,async req=>{const p=PROMPTS.find(x=>x.name===req.params.name);if(!p)throw new McpError(-32602,`Unknown prompt ${req.params.name}`);const args=(req.params.arguments??{}) as Record<string,string>;
  for(const a of p.arguments)if(a.required&&!args[a.name])throw new McpError(-32602,`Missing argument ${a.name}`);return {description:p.description,messages:[{role:'user',content:{type:'text',text:p.text(args)}}]};});
 server.setRequestHandler(CompleteRequestSchema,async req=>{const values=await complete(req.params.ref as {type:string;name?:string;uri?:string},req.params.argument,call);return {completion:{values,total:values.length,hasMore:false}};});
 server.setRequestHandler(CallToolRequestSchema,async(req,extra)=>{const tool=toolByName(req.params.name);if(!tool){const body={ok:false,error:{code:'UNKNOWN_TOOL',message:`Unknown tool ${req.params.name}`}};return {isError:true,content:[{type:'text',text:JSON.stringify(body)}],structuredContent:body};}
  const args=(req.params.arguments??{}) as Record<string,unknown>;const requestId=tool.name==='plan.execute'?((args.plan as {requestId?:string})?.requestId):undefined;
  // MCP cancellation of a running plan maps to plan.cancel (effective only before its commit).
  if(requestId)extra.signal.addEventListener('abort',()=>{void post('plan.cancel',{requestId}).catch(()=>undefined);});
  let body:Record<string,unknown>;try{body=await post(tool.name,args);}catch(error){body={ok:false,error:{code:'NO_SESSION',message:String(error)}};}
  const imgs=await images(body);if(imgs.skipped.length)body={...body,imagesOmitted:imgs.skipped};
  return {content:[{type:'text',text:JSON.stringify(body,null,1)},...imgs.out],structuredContent:body,isError:body.ok===false};});
 const transport=new StdioServerTransport();
 // JSON-RPC 2.0: unparseable input gets a -32700 response with id null (the SDK only reports it to onerror).
 server.onerror=error=>{if(/JSON|parse|Unexpected token/i.test(String((error as Error)?.message??error)))process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}})+'\n');else log('MCP error:',String(error));};
 // EOF/close: stop the in-process editor (if this MCP server started it) and exit cleanly.
 const closed=new Promise<void>(resolve=>{transport.onclose=()=>resolve();process.stdin.once('end',()=>resolve());});
 await server.connect(transport);await closed;if(poll)clearInterval(poll);if(started)await (await started).close();process.exit(0);
}
