// Plan F0: every core operation is fully described (fields, examples, identity impact) so agents never guess.
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {Ajv2020} from 'ajv/dist/2020.js';
import {OPERATION_TYPES,type Operation} from '../packages/core/model.js';
import {OPERATION_DOCS,FIXTURES,operationSchema,operationUnionSchema,type OperationType} from '../packages/core/operation-schemas.js';
import {VectorDocument} from '../packages/core/document.js';
import {STARTER_OPS} from './golden-scenes.js';

const ajv=new Ajv2020({allErrors:true,strict:false});const union=ajv.compile(operationUnionSchema());
const explain=(errors:typeof union.errors)=>(errors??[]).filter(e=>e.keyword!=='if').map(e=>`${e.instancePath||'/'} ${e.message} ${JSON.stringify(e.params)}`).join('; ');

test('every operation type has a schema doc, and nothing else does',()=>{
 assert.deepEqual(Object.keys(OPERATION_DOCS).sort(),[...OPERATION_TYPES].sort());
 for(const [type,doc] of Object.entries(OPERATION_DOCS)){assert.ok(doc.summary.length>10,`${type} summary`);assert.ok(doc.examples.length>=1,`${type} example`);ajv.compile(operationSchema(type as OperationType));}
});

test('every example validates and applies on its fixture (after its setup)',()=>{
 for(const [type,doc] of Object.entries(OPERATION_DOCS))for(const [i,example] of doc.examples.entries()){
  assert.equal(example.op.type,type,`${type} example ${i} has the wrong type`);
  for(const op of [...(example.setup??[]),example.op])assert.ok(union(op),`${type} example ${i}: ${op.type} invalid: ${explain(union.errors)}`);
  const d=new VectorDocument(FIXTURES[example.fixture??'starter']);
  if(example.setup)d.apply(example.setup);
  assert.doesNotThrow(()=>d.apply([example.op]),`${type} example ${i} (${example.why}) does not apply`);
 }
});

test('closed schemas reject unknown fields and wrong types with the accepted field list',()=>{
 assert.ok(!union({type:'keyframe',target:'tail',property:'rotation',time:1,value:10,ease:'linear'}),'typo field');
 const err=(union.errors??[]).find(e=>e.keyword==='additionalProperties');assert.equal(err?.params.additionalProperty,'ease');
 assert.ok(!union({type:'keyframe',target:'tail',property:'spin',time:1,value:10}),'unknown property');
 assert.ok(!union({type:'motion.preset',id:'tail',kind:'wiggle'}),'unknown preset kind');
 assert.ok(!union({type:'nope'}),'unknown type');
 assert.ok(union({type:'keyframe',target:'tail',property:'rotation',time:1,value:10,easing:'cubic-bezier(.2,-.4,.3,1.4)'}));
});

test('real operations used by examples, the golden scene and the CLI stay valid (no false rejections)',()=>{
 const files=['../examples/agent-motion.json','../examples/candy-float.json','../examples/candy-label.json','../examples/rig-tail.json','../examples/tail-wave.json','../examples/emotions/milo-operations.json','../examples/candy-emotions/candy-operations.json'];
 const ops:Operation[]=[...STARTER_OPS,...files.flatMap(f=>JSON.parse(readFileSync(new URL(f,import.meta.url),'utf8')) as Operation[])];
 const choice=JSON.parse(readFileSync(new URL('../examples/candy-emotions/sad-choice.json',import.meta.url),'utf8')) as {options:{ops?:Operation[]}[]};
 ops.push(...choice.options.flatMap(o=>o.ops??[]));
 for(const op of ops)assert.ok(union(op),`${op.type}: ${explain(union.errors)} — ${JSON.stringify(op).slice(0,200)}`);
});

test('macros declare what they expand to',()=>{
 for(const t of ['motion.preset','track.copy','fluid.add','clip.place','param.set','expression.set','lipsync','emotion.keyframe','sprite.keyframe','modifier.bake','secondary.bake','morph.apply'] as OperationType[])assert.ok(OPERATION_DOCS[t].expands,`${t} expands`);
});

test('agent surface: ops.apply rejects a mistyped field before any transaction and points to operations.describe',async()=>{
 const {AgentService}=await import('../packages/agent/service.js');const {fileWorkspace}=await import('../packages/cli/agent.js');const {starterSvg}=await import('../packages/core/document.js');
 const svc=new AgentService(fileWorkspace(starterSvg,'starter.svg'));
 await assert.rejects(svc.call('ops.apply',{ops:[{type:'keyframe',target:'tail',property:'rotation',time:1,value:5,ease:'linear'}],expectedRevision:0}),(e:{code:string;extra:Record<string,unknown>})=>{
  assert.equal(e.code,'INVALID_ARGUMENT');assert.equal(e.extra.path,'args.ops.0');assert.ok((e.extra.accepted as string[]).includes('easing'));assert.match(String(e.extra.hint),/operations\.describe/);return true;});
 const listed=await svc.call('operations.list',{family:'secondary'}) as {operations:{type:string}[]};assert.deepEqual(listed.operations.map(o=>o.type).sort(),['secondary.add','secondary.bake','secondary.remove','secondary.update']);
 const described=await svc.call('operations.describe',{type:'track.copy'}) as {schema:{properties:Record<string,unknown>};expands:string;examples:unknown[]};assert.ok('offset' in described.schema.properties);assert.equal(described.expands,'keyframe');assert.ok(described.examples.length);
});
