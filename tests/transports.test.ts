// S3 gate: CLI, HTTP API and MCP (official SDK client) are sibling adapters of one service: same structured input,
// same normalized result, same error code and revision. Also MCP lifecycle: initialize, ping, invalid JSON, EOF.
import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {mkdtemp,rm,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {studio,buildFixture,port} from '../scripts/fixtures/mini-character.js';
import {TOOLS} from '../packages/agent/registry.js';
const TSX=resolve('node_modules/tsx/dist/cli.mjs'),MAIN=resolve('packages/cli/main.ts');
const strip=(v:unknown):unknown=>Array.isArray(v)?v.map(strip):v&&typeof v==='object'?Object.fromEntries(Object.entries(v as object).filter(([k])=>!['elapsedMs','at','time','path','previewPath','startedAt','imagesOmitted'].includes(k)).map(([k,x])=>[k,strip(x)])):v;
test('S3: the same structured call gives the same result over CLI, HTTP and MCP',async()=>{
 const root=await mkdtemp(join(tmpdir(),'mai-transports-'));const p=await port();const s=await studio(root,p);
 const cli=(...args:string[])=>new Promise<{status:number|null;body:Record<string,unknown>}>((ok,fail)=>{const c=spawn(process.execPath,[TSX,MAIN,...args,'--json'],{cwd:root});let out='',err='';c.stdout.on('data',d=>out+=d);c.stderr.on('data',d=>err+=d);c.on('close',status=>{try{ok({status,body:JSON.parse(out)});}catch{fail(Error(`CLI ${args.join(' ')} → ${status}: ${out.slice(0,300)} ${err.slice(0,600)}`));}});});
 const mcp=new Client({name:'mai-transport-test',version:'1.0.0'});const transport=new StdioClientTransport({command:process.execPath,args:[TSX,MAIN,'mcp'],cwd:root,env:{...process.env,MAI_PORT:String(p)} as Record<string,string>,stderr:'pipe'});
 try{await buildFixture(s.call,s.post);await mcp.connect(transport);await mcp.ping();
  const listed=await mcp.listTools();assert.equal(listed.tools.length,TOOLS.length);assert.ok(listed.tools.every(t=>t.inputSchema&&t.outputSchema&&t.description));assert.equal(listed.tools.find(t=>t.name==='release_identity')!.annotations!.destructiveHint,true);assert.equal(listed.tools.find(t=>t.name==='undo')!.annotations!.destructiveHint,false,'an agent can undo its own transaction without a human approval prompt');
  const viaMcp=async(name:string,args:Record<string,unknown>)=>{const r=await mcp.callTool({name,arguments:args});return r.structuredContent as Record<string,unknown>;};
  // Queries.
  const http=await s.call('part.resolve',{ref:'char.eyes'}),c1=await cli('resolve','char.eyes'),m1=await viaMcp('resolve_part',{ref:'char.eyes'});
  assert.equal(c1.status,0);assert.deepEqual(strip(c1.body),strip(http));assert.deepEqual(strip(m1),strip(http));
  // Same domain error everywhere.
  const e1=await s.call('part.resolve',{ref:'tentacle'}),e2=await cli('resolve','tentacle'),e3=await viaMcp('resolve_part',{ref:'tentacle'});
  assert.equal(e1.ok,false);assert.equal(e2.status,1);for(const e of [e1,e2.body,e3])assert.equal((e.error as {code:string}).code,'NOT_FOUND');
  // Dry-run mutation: same changes and identity impact, no revision change.
  const rev=Number((await s.call('scene.history')).revision);const args={params:{'sadness@eyes':.5},dryRun:true,expectedRevision:rev};
  const d1=await s.call('expression.apply',args),d2=await cli('expression','apply','--params','sadness@eyes=0.5','--dry-run','--expected-revision',String(rev)),d3=await viaMcp('apply_expression',args);
  assert.equal(d2.status,0,JSON.stringify(d2.body));for(const d of [d2.body,d3])assert.deepEqual(strip({changes:d.changes,identityImpact:d.identityImpact,committed:d.committed,revision:d.revision}),strip({changes:d1.changes,identityImpact:d1.identityImpact,committed:d1.committed,revision:d1.revision}));
  // Conflicts: exit code 2 on the CLI, REVISION_CONFLICT everywhere.
  const k1=await cli('expression','apply','--params','sadness@eyes=0.5','--expected-revision',String(rev-1)),k2=await viaMcp('apply_expression',{params:{'sadness@eyes':.5},expectedRevision:rev-1});
  assert.equal(k1.status,2);assert.equal((k1.body.error as {code:string}).code,'REVISION_CONFLICT');assert.equal((k2.error as {code:string}).code,'REVISION_CONFLICT');
  // Plan via CLI file flag equals the HTTP contract.
  const inspect=await s.call('scene.inspect');const plan={protocol:'mai.agent-plan/v1',requestId:'transport-plan',sessionId:inspect.sessionId,documentId:inspect.documentId,expectedRevision:inspect.revision,mode:'dry-run',label:'humo más lento',commands:[{id:'s',type:'animation.adjust',target:{partId:'smoke',within:'char'},sourceId:'smoke-flow',property:'speed',scale:.7,onOverflow:'reject'}],validation:{times:[0],required:['structural'],preview:false},provenance:{kind:'user-direction',text:'baja 30% el humo'}};
  await writeFile(join(root,'plan.json'),JSON.stringify(plan));const pc=await cli('execute','--plan','plan.json');assert.equal(pc.status,0,JSON.stringify(pc.body));assert.equal(pc.body.status,'prepared');
  const pm=await viaMcp('plan_status',{requestId:'transport-plan'});assert.equal(pm.status,'prepared');
 }finally{await mcp.close();await s.app.close();await rm(root,{recursive:true,force:true});}
});
test('S3: MCP lifecycle handles invalid JSON and exits on EOF',async()=>{
 const root=await mkdtemp(join(tmpdir(),'mai-mcp-life-'));const child=spawn(process.execPath,[TSX,MAIN,'mcp'],{cwd:root,stdio:['pipe','pipe','pipe']});let out='';child.stdout.on('data',d=>out+=d);
 try{child.stdin.write('{not json\n');child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'raw',version:'1'}}})+'\n');
  for(let i=0;i<100&&!out.includes('"id":1');i++)await new Promise(r=>setTimeout(r,100));const lines=out.trim().split('\n').map(l=>JSON.parse(l));
  assert.ok(lines.some(l=>l.error?.code===-32700),'parse error reported');assert.ok(lines.some(l=>l.id===1&&l.result?.serverInfo?.name==='mai-svg'));
  const exited=new Promise<number|null>(r=>child.once('exit',c=>r(c)));child.stdin.end();const code=await Promise.race([exited,new Promise<string>(r=>setTimeout(()=>r('timeout'),10000))]);assert.equal(code,0);
 }finally{child.kill();await rm(root,{recursive:true,force:true});}
});
