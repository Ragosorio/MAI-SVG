// Plan protocol schemas (no runtime dependencies on the executor or the service, so the registry can embed them).
import {readFileSync} from 'node:fs';
import {assertionSchema} from '../core/assertions.js';
export const PLAN_V1_SCHEMA=JSON.parse(readFileSync(new URL('./schemas/agent-plan.v1.schema.json',import.meta.url),'utf8'));
// mai.motion-plan/v2 = v1 + an `ops` command (any documented core operation, validated against its full schema),
// `assertions` (motion tests evaluated on the draft and saved with the scene), `evaluation` (filmstrip/critique of the
// draft) and an optional `verify` gate. It is the main authoring path: atomic, dry-runnable, not destructive.
export const PLAN_V2_SCHEMA=(()=>{const v2=structuredClone(PLAN_V1_SCHEMA);v2.$id='https://mai.local/schemas/motion-plan.v2.schema.json';v2.title='MAI motion plan v2';
 v2.description='One atomic, idempotent, undoable transaction: v1 commands plus `ops` (any core operation; fields via operations.describe), motion assertions as tests, and draft evaluation (filmstrip, critique, verify). Dry-run first, look at the filmstrip, then commit the same plan with mode commit and a new requestId.';
 v2.properties.protocol={const:'mai.motion-plan/v2'};v2.properties.commands.items.oneOf.push({$ref:'#/$defs/opsCommand'});
 v2.$defs.opsCommand={type:'object',additionalProperties:false,required:['id','type','ops'],properties:{id:{$ref:'#/$defs/id'},type:{const:'ops'},label:{type:'string',maxLength:200},ops:{type:'array',minItems:1,maxItems:500,items:{type:'object',required:['type'],properties:{type:{type:'string'}}}}}};
 v2.properties.validation.properties.required.items={enum:['structural','identity','perceptual','verify']};v2.properties.validation.properties.required.maxItems=4;
 v2.properties.assertions={type:'array',maxItems:32,items:assertionSchema,description:'Motion tests (motion.verify predicates) evaluated on the draft; saved with the scene unless keepAssertions is false.'};
 v2.properties.keepAssertions={type:'boolean'};
 v2.properties.evaluation={type:'object',additionalProperties:false,properties:{filmstrip:{type:'object',additionalProperties:false,properties:{count:{type:'integer',minimum:4,maximum:36},ghost:{type:'integer',minimum:0,maximum:4},sampling:{enum:['uniform','significant']}}},critique:{type:'boolean'}},description:'Evaluate the draft: a filmstrip of the motion and deterministic critique, returned with the receipt.'};
 return v2;})();
