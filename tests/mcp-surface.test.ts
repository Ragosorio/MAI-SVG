// F4: MCP v2 — granular resources, revision subscriptions, workflow prompts and live completions (official SDK client).
import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';import {ResourceUpdatedNotificationSchema} from '@modelcontextprotocol/sdk/types.js';
import {studio,buildFixture,port} from '../scripts/fixtures/mini-character.js';
const TSX=resolve('node_modules/tsx/dist/cli.mjs'),MAIN=resolve('packages/cli/main.ts');

test('MCP v2: resources read one thing at a time, subscriptions notify on revision change, prompts and completions come from live catalogues',async()=>{
 const root=await mkdtemp(join(tmpdir(),'mai-mcp2-'));const p=await port();const s=await studio(root,p);
 const mcp=new Client({name:'mai-mcp2-test',version:'1.0.0'});const transport=new StdioClientTransport({command:process.execPath,args:[TSX,MAIN,'mcp'],cwd:root,env:{...process.env,MAI_PORT:String(p),MAI_MCP_POLL_MS:'200'} as Record<string,string>,stderr:'pipe'});
 try{await buildFixture(s.call,s.post);await mcp.connect(transport);
  const caps=mcp.getServerCapabilities()!;assert.ok(caps.resources?.subscribe&&caps.prompts&&caps.completions);
  const listed=await mcp.listResources();assert.ok(listed.resources.some(r=>r.uri==='mai://scene/summary'));const templates=await mcp.listResourceTemplates();assert.ok(templates.resourceTemplates.some(t=>t.uriTemplate==='mai://operation/{type}'));
  const read=async(uri:string)=>JSON.parse(String(((await mcp.readResource({uri})).contents[0] as {text:string}).text));
  const op=await read('mai://operation/track.set');assert.equal(op.type,'track.set');assert.ok(op.schema.properties.keys);
  const summary=await read('mai://scene/summary');assert.ok(summary.parts.length>0);
  assert.equal((await read('mai://preset/idle')).name,'idle');assert.ok((await read('mai://expr/functions')).functions.spring);assert.ok((await read('mai://shot/push-in')).does);assert.ok((await read('mai://catalog/effects')).kinds.length>=8);
  const part=await read('mai://part/char.flask');assert.ok(part.ids.length>0);
  await assert.rejects(mcp.readResource({uri:'mai://nope'}),/Unknown resource/);
  const updates:string[]=[];mcp.setNotificationHandler(ResourceUpdatedNotificationSchema,n=>{updates.push(n.params.uri);});
  await mcp.subscribeResource({uri:'mai://scene/summary'});
  const rev=Number(summary.revision);await s.call('ops.apply',{ops:[{type:'keyframe',target:'flask',property:'y',time:0,value:0},{type:'keyframe',target:'flask',property:'y',time:1,value:-6}],expectedRevision:rev});
  for(let i=0;i<40&&!updates.length;i++)await new Promise(r=>setTimeout(r,100));assert.deepEqual(updates.slice(0,1),['mai://scene/summary']);
  const prompts=await mcp.listPrompts();assert.ok(prompts.prompts.some(x=>x.name==='refine-until-alive'));
  const prompt=await mcp.getPrompt({name:'animate-character-idle',arguments:{part:'char',context:'game inventory'}});assert.match(String((prompt.messages[0].content as {text:string}).text),/char.*game inventory/s);
  await assert.rejects(mcp.getPrompt({name:'animate-character-idle',arguments:{}}),/Missing argument part/);
  const types=await mcp.complete({ref:{type:'ref/resource',uri:'mai://operation/{type}'},argument:{name:'type',value:'camera.'}});assert.ok(types.completion.values.includes('camera.shot'));
  const parts=await mcp.complete({ref:{type:'ref/prompt',name:'animate-character-idle'},argument:{name:'part',value:'char'}});assert.ok(parts.completion.values.some(v=>v.startsWith('char')));
 }finally{await mcp.close();await s.app.close();await rm(root,{recursive:true,force:true});}
});
