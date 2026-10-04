import {Choices}from './choices.js';
import {createServer,type IncomingMessage,type ServerResponse} from 'node:http';
import {readFile,writeFile,mkdir,rename,readdir,realpath,stat} from 'node:fs/promises';
import {resolve,join,extname,relative,sep} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {WebSocketServer,WebSocket} from 'ws';
import {VectorDocument,starterSvg,type Snapshot} from '../core/document.js';
import type {Operation} from '../core/model.js';
import {exportSvg,type ExportOptions} from '../core/export.js';
import {convertFile,PRESETS,vectorizeRaster,vectorizeSvg} from '../converter/index.js';
import {renderSvg,closeRenderer} from './render.js';
const HISTORY_LIMIT=40;
export async function startEditorServer(port=4318,root=process.cwd()){
 if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid port');
 const cache=join(root,'.cache');await mkdir(cache,{recursive:true});await mkdir(join(cache,'events'),{recursive:true});
 let model=new VectorDocument(starterSvg,'demo'),asset='demo',revision=0;
 try{model=new VectorDocument(await readFile(join(cache,'current.svg'),'utf8'));revision=model.project.revision;asset=model.project.name;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 const token=randomBytes(32).toString('hex'),origin=`http://127.0.0.1:${port}`,sessionId=randomUUID();
 type Entry={revision:number;id:string;label:string;time:string;before:Buffer;after:Buffer};let undo:Entry[]=[],redo:Entry[]=[],entries:Omit<Entry,'before'|'after'>[]=[];
 const pack=(s:Snapshot)=>gzipSync(JSON.stringify(s),{level:1}),unpack=(s:Buffer)=>JSON.parse(gunzipSync(s).toString()) as Snapshot;
 const files=(await readdir(join(cache,'events'))).filter(f=>f.endsWith('.json.gz')).sort();
 for(const file of files){const event=JSON.parse(gunzipSync(await readFile(join(cache,'events',file))).toString());entries.push(event.info);if(event.info.revision>revision){model.restore(event.after);revision=event.info.revision;model.project.revision=revision;}if(event.kind==='apply'){undo.push({...event.info,before:pack(event.before),after:pack(event.after)});undo=undo.slice(-HISTORY_LIMIT);redo=[];}else if(event.kind==='undo'){const e=undo.pop();if(e)redo.push(e);}else if(event.kind==='redo'){const e=redo.pop();if(e)undo.push(e);}}
 let timer:ReturnType<typeof setTimeout>|undefined,saving=false,dirty=false;
 async function checkpoint(){if(saving){dirty=true;return;}saving=true;dirty=false;const source=model.toSVG();const path=join(cache,`current-${randomUUID()}.tmp`);try{await writeFile(path,source);await rename(path,join(cache,'current.svg'));}finally{saving=false;if(dirty)timer=setTimeout(()=>void checkpoint(),500);}}
 const save=()=>{dirty=true;if(timer)clearTimeout(timer);timer=setTimeout(()=>void checkpoint().catch(console.error),500);};
 const choices=new Choices(join(cache,'choices'));await choices.restore();
 const ws=new WebSocketServer({noServer:true});
 const summary=()=>({sessionId,revision,asset,choice:choices.public(),project:structuredClone(model.project),objects:model.count,canUndo:undo.length>0,canRedo:redo.length>0});
 const broadcast=(change:Record<string,unknown>)=>{const payload=JSON.stringify({type:'change',sentAt:Date.now(),...summary(),...change});for(const socket of ws.clients)if(socket.readyState===WebSocket.OPEN)socket.send(payload);};
 async function record(kind:string,label:string,before:Snapshot,after:Snapshot){const next=revision+1,info={revision:next,id:randomUUID(),label,time:new Date().toISOString()};model.project.revision=next;if(after.kind==='attributes')after.project.revision=next;else after.svg=model.toSVG();
  const path=join(cache,'events',`${String(next).padStart(10,'0')}.json.gz`),temp=path+'.tmp';try{await writeFile(temp,gzipSync(JSON.stringify({kind,info,before,after}),{level:1}));await rename(temp,path);}catch(error){model.restore(before);throw error;}revision=next;entries.push(info);save();return info;}
 let queue=Promise.resolve<unknown>(undefined);
 const queued=<T>(work:()=>Promise<T>):Promise<T>=>{const task=queue.then(work,work);queue=task.catch(()=>{});return task;};
 const expected=(value:unknown)=>{if(value!==revision)throw Object.assign(Error(`Revision conflict: expected ${value}, current ${revision}`),{status:409});};
 async function apply(ops:Operation[],expectedRevision:number,label='Edición'){return queued(async()=>{expected(expectedRevision);const before=model.capture(ops);const started=performance.now();const change=model.apply(ops);const after=model.capture(ops);const info=await record('apply',label,before,after);undo.push({...info,before:pack(before),after:pack(after)});undo=undo.slice(-HISTORY_LIMIT);redo=[];const result={...summary(),...change,elapsedMs:Number((performance.now()-started).toFixed(2)),transaction:info};broadcast({...change,elapsedMs:result.elapsedMs});return result;});}
 async function open(svg:string,name:string,expectedRevision:number){return queued(async()=>{expected(expectedRevision);const next=new VectorDocument(svg,name),before:Snapshot={kind:'svg',svg:model.toSVG()};model=next;asset=name;model.project.name=name;const after:Snapshot={kind:'svg',svg:model.toSVG()};const info=await record('apply',`Abrir ${name}`,before,after);undo.push({...info,before:pack(before),after:pack(after)});undo=undo.slice(-HISTORY_LIMIT);redo=[];broadcast({reload:true,patches:[]});return summary();});}
 async function historyAction(kind:'undo'|'redo',expectedRevision:number){return queued(async()=>{expected(expectedRevision);const from=kind==='undo'?undo:redo,to=kind==='undo'?redo:undo,entry=from.at(-1);if(!entry)throw Error(`Nothing to ${kind}`);const before:Snapshot={kind:'svg',svg:model.toSVG()},after=unpack(kind==='undo'?entry.before:entry.after);model.restore(after);asset=model.project.name;await record(kind,`${kind}: ${entry.label}`,before,after);from.pop();to.push(entry);broadcast({reload:true,patches:[]});return summary();});}
 const json=(res:ServerResponse,value:unknown,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
 async function body(req:IncomingMessage){const buffers=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>44*1024*1024)throw Error('Request exceeds 44 MiB');buffers.push(chunk);}return JSON.parse(Buffer.concat(buffers).toString()||'{}');}
 const server=createServer(async(req,res)=>{try{
  if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host??'')){json(res,{error:'Invalid host'},403);return;}
  const url=new URL(req.url!,origin),path=url.pathname;
  if(path.startsWith('/api/')){
   if(req.headers.origin&&req.headers.origin!==origin&&req.headers.origin!==`http://localhost:${port}`){json(res,{error:'Invalid origin'},403);return;}
   if(req.method!=='GET'&&req.headers['x-mai-token']!==token){json(res,{error:'Invalid session token'},403);return;}
   if(req.method==='GET'&&path==='/api/bootstrap'){json(res,{...summary(),token});return;}
   if(req.method==='GET'&&path==='/api/choices'){json(res,choices.public());return;}
   if(req.method==='GET'&&path==='/api/choice-preview'){const png=await choices.preview(url.searchParams.get('id')??'',url.searchParams.get('option')??'');res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'no-store'});res.end(png);return;}
   if(req.method==='GET'&&path==='/api/state'){json(res,summary());return;}
   if(req.method==='GET'&&path==='/api/download'){const name=url.searchParams.get('file')??'';if(!/^[a-zA-Z0-9_.-]+\.svg$/.test(name))throw Error('Invalid export filename');const directory=await realpath(join(root,'exports')),file=await realpath(join(directory,name)),rel=relative(directory,file);if(rel==='..'||rel.startsWith(`..${sep}`))throw Error('Invalid export path');res.writeHead(200,{'Content-Type':'image/svg+xml','Content-Disposition':`attachment; filename="${name}"`,'Cache-Control':'no-store'});res.end(await readFile(file));return;}
   if(req.method==='GET'&&path==='/api/svg'){res.writeHead(200,{'Content-Type':'image/svg+xml','Cache-Control':'no-store'});res.end(model.toSVG());return;}
   if(req.method==='GET'&&path==='/api/objects'){json(res,model.list(url.searchParams.get('filter')??'',Math.max(0,Number(url.searchParams.get('offset')??0)),Math.min(200,Number(url.searchParams.get('limit')??80))));return;}
   if(req.method==='GET'&&path==='/api/object'){json(res,model.info(model.element(url.searchParams.get('id')!)));return;}
   if(req.method==='GET'&&path==='/api/history'){json(res,{revision,entries:entries.slice(-100),canUndo:undo.length>0,canRedo:redo.length>0});return;}
   if(req.method==='GET'&&path==='/api/assets'){let records=[];try{records=JSON.parse(await readFile(join(root,'assets/manifest.json'),'utf8')).records;}catch{}json(res,{records});return;}
   if(req.method==='POST'){
    const data=await body(req);
    if(path==='/api/choices/propose'){json(res,await queued(async()=>{expected(data.expectedRevision);const result=await choices.propose(data.request,model,revision);broadcast({patches:[]});return result;}));return;}
    if(path==='/api/choices/choose'){expected(data.expectedRevision);const option=choices.selected(data.id,data.option,revision);const result=await apply(option.ops,data.expectedRevision,'Elegir: '+option.label);choices.current!.status='chosen';choices.current!.selected=option.id;await choices.save();broadcast({patches:[]});json(res,{...result,choice:choices.public()});return;}
    if(path==='/api/choices/dismiss'){json(res,await queued(async()=>{expected(data.expectedRevision);if(choices.current?.id!==data.id||choices.current?.status!=='pending')throw Error('Unknown pending choice');choices.current!.status='dismissed';await choices.save();broadcast({patches:[]});return choices.public();}));return;}
    if(path==='/api/preview'){expected(data.expectedRevision);const draft=new VectorDocument(model.toSVG());const change=draft.apply(data.ops);json(res,{revision,committed:false,...change,project:draft.project});return;}
    if(path==='/api/insert'){expected(data.expectedRevision);const source=new VectorDocument(data.svg,String(data.name??'SVG'));const svg=exportSvg(source,{profile:'standalone'}).svg;json(res,await apply([{type:'scene.insert',svg,name:String(data.name??'SVG'),x:data.placement?.x,y:data.placement?.y,width:data.placement?.width,height:data.placement?.height}],data.expectedRevision,'Agregar SVG'));return;}
    if(path==='/api/apply'){json(res,await apply(data.ops,data.expectedRevision,data.label));return;}
    if(path==='/api/undo'||path==='/api/redo'){json(res,await historyAction(path.slice(5) as 'undo'|'redo',data.expectedRevision));return;}
    if(path==='/api/open'){if(data.name==='demo'){json(res,await open(starterSvg,'demo',data.expectedRevision));return;}if(!/^[a-z0-9_]+$/.test(data.name)||!['vector','animated'].includes(data.kind??'vector'))throw Error('Invalid asset');const svg=await readFile(join(root,`assets/${data.kind??'vector'}`,`${data.name}.svg`),'utf8');json(res,await open(svg,data.name,data.expectedRevision));return;}
    if(path==='/api/import'){expected(data.expectedRevision);const buffer=Buffer.from(data.base64,'base64');if(buffer.length>32*1024*1024)throw Error('Import exceeds 32 MiB');let svg:string;if(/\.svg$/i.test(data.name)){const source=buffer.toString('utf8');svg=data.vectorize?(await vectorizeSvg(source,PRESETS.find(p=>p.id==='high-color-preserved')!)).svg:source;}else svg=(await vectorizeRaster(buffer,PRESETS.find(p=>p.id==='high-color-preserved')!)).svg;json(res,data.append?await apply([{type:'scene.insert',svg:exportSvg(new VectorDocument(svg),{profile:'standalone'}).svg,name:String(data.name).slice(0,200)}],data.expectedRevision,'Agregar SVG'):await open(svg,String(data.name).slice(0,200),data.expectedRevision));return;}
    if(path==='/api/export'){expected(data.expectedRevision);const result=exportSvg(model,data as ExportOptions),exportRevision=revision;const filename=`${asset.replace(/[^a-zA-Z0-9_.-]/g,'_').slice(0,80)}-r${exportRevision}-${data.profile}-${randomUUID().slice(0,8)}.svg`,directory=join(root,'exports');await mkdir(directory,{recursive:true});await writeFile(join(directory,filename),result.svg);await writeFile(join(directory,filename+'.json'),JSON.stringify({...result.report,revision:exportRevision},null,2));json(res,{...result,savedFile:'exports/'+filename,downloadUrl:'/api/download?file='+encodeURIComponent(filename)});return;}
    if(path==='/api/render'){expected(data.expectedRevision);const result=exportSvg(model,{profile:'standalone',tolerance:.25});const image=await renderSvg(result.svg,Number(data.time??0));json(res,{...image,png:undefined,base64:image.png.toString('base64'),exportReport:result.report});return;}
   }
   json(res,{error:'Unknown API route'},404);return;
  }
  if(req.method!=='GET'){res.writeHead(405);res.end();return;}
  const directory=await realpath(join(root,'apps/editor/dist'));const file=await realpath(resolve(directory,`.${path==='/'?'/index.html':decodeURIComponent(path)}`));const rel=relative(directory,file);if(rel==='..'||rel.startsWith(`..${sep}`)){res.writeHead(403);res.end();return;}
  const mime:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};if(!mime[extname(file)]){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':mime[extname(file)],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; base-uri 'none'"});res.end(await readFile(file));
 }catch(error){json(res,{error:String(error),revision},(error as {status?:number}).status??422);}});
 server.on('upgrade',(req,socket,head)=>{const url=new URL(req.url!,origin);if(req.headers.host!==`127.0.0.1:${port}`||req.headers.origin!==origin||url.pathname!=='/events'||url.searchParams.get('token')!==token){socket.destroy();return;}ws.handleUpgrade(req,socket,head,s=>ws.emit('connection',s,req));});
 ws.on('connection',socket=>socket.send(JSON.stringify({type:'hello',...summary()})));
 await new Promise<void>((yes,no)=>{server.once('error',no);server.listen(port,'127.0.0.1',yes);});await writeFile(join(cache,'session.json'),JSON.stringify({url:origin,token,sessionId}),{mode:0o600});save();
 console.log(`MAI SVG editor: ${origin}`);
 return {server,model:()=>model,close:async()=>{if(timer)clearTimeout(timer);await queue;await checkpoint();for(const socket of ws.clients)socket.terminate();ws.close();await new Promise<void>(yes=>server.close(()=>yes()));await closeRenderer();}};
}
