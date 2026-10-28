// Shared assertion vocabulary for persisted projects, tools and core operations.
export type Event={part:string;event:'starts'|'stops'|'peakSpeed';threshold?:number;relativeTo?:string};
export type Assertion={part:string;during?:[number,number];relativeTo?:string} & (
 |{type:'moves';direction:'left'|'right'|'up'|'down';minDistance:number}
 |{type:'still';maxSpeed:number}
 |{type:'energy';min?:number;max?:number}
 |{type:'arc';minCurvature:number}
 |{type:'returnsToRest';at:number;tolerance:number;restTime?:number}
 |{type:'loopSeamless';positionTolerance:number;velocityTolerance:number}
 |{type:'visible';minPixels:number}
 |{type:'insideFrame';safeArea?:{x:number;y:number;width:number;height:number}}
 |{type:'overshoots';axis:'x'|'y';goal:number;minDistance:number;direction:'positive'|'negative'}
 |{type:'settles';axis:'x'|'y';goal:number;tolerance:number;by:number;maxSpeed:number}
 |{type:'lags';driver:string;axis:'x'|'y'|'rotation';delay:[number,number];minCorrelation?:number}
 |{type:'before';a:Event;b:Event;gap:number}
 // part = sprite id: which named variant (e.g. eyes open / wink) shows at `at` or over `during`.
 |{type:'state';state:string;at?:number}
 // Rendered: at `at`, the part looks like the approved baseline (world space, camera off).
 |{type:'matchesBaseline';at:number;baseline?:string;maxMae?:number}
);
const num={type:'number'},positive={type:'number',minimum:0},part={type:'string',minLength:1,maxLength:300};
const during={type:'array',items:positive,minItems:2,maxItems:2};
const obj=(properties:Record<string,unknown>,required:string[])=>({type:'object',additionalProperties:false,properties,required});
const event=obj({part,event:{enum:['starts','stops','peakSpeed']},threshold:positive,relativeTo:{...part,description:'Detect the event inside this part\'s frame (own motion of a child)'}},['part','event']);
const branch=(type:string,properties:Record<string,unknown>,required:string[])=>obj({type:{const:type},part,during,relativeTo:{...part,description:'Measure the part inside this part\'s frame held at rest (e.g. an arm relative to its torso)'},...properties},['type','part',...required]);
export const assertionSchema={oneOf:[
 branch('moves',{direction:{enum:['left','right','up','down']},minDistance:positive},['direction','minDistance']),
 branch('still',{maxSpeed:positive},['maxSpeed']),branch('energy',{min:positive,max:positive},[]),
 branch('arc',{minCurvature:positive},['minCurvature']),
 branch('returnsToRest',{at:positive,tolerance:positive,restTime:positive},['at','tolerance']),
 branch('loopSeamless',{positionTolerance:positive,velocityTolerance:positive},['positionTolerance','velocityTolerance']),
 branch('visible',{minPixels:{type:'integer',minimum:1}},['minPixels']),
 branch('insideFrame',{safeArea:obj({x:num,y:num,width:{type:'number',exclusiveMinimum:0},height:{type:'number',exclusiveMinimum:0}},['x','y','width','height'])},[]),
 branch('overshoots',{axis:{enum:['x','y']},goal:num,minDistance:positive,direction:{enum:['positive','negative']}},['axis','goal','minDistance','direction']),
 branch('settles',{axis:{enum:['x','y']},goal:num,tolerance:positive,by:positive,maxSpeed:positive},['axis','goal','tolerance','by','maxSpeed']),
 branch('lags',{driver:part,axis:{enum:['x','y','rotation']},delay:during,minCorrelation:{type:'number',minimum:0,maximum:1}},['driver','axis','delay']),
 branch('before',{a:event,b:event,gap:positive},['a','b','gap']),
 branch('state',{state:{type:'string',minLength:1,maxLength:100,description:'Sprite variant expected (part is the sprite id)'},at:positive},['state']),
 branch('matchesBaseline',{at:positive,baseline:{type:'string',minLength:1,maxLength:100,description:'Baseline id (default: the only/first registered baseline)'},maxMae:{type:'number',minimum:0,maximum:255,description:'Max mean absolute error 0–255 in the part region (default 2)'}},['at'])
]};
// Lightweight schema subset validator also runs in the editor (no Node or Ajv bundle required).
export function validateAssertions(value:unknown):asserts value is Assertion[]{
 const check=(schema:any,v:any):boolean=>{
  if(schema.oneOf)return schema.oneOf.filter((s:any)=>check(s,v)).length===1;
  if(schema.const!==undefined&&v!==schema.const)return false;
  if(schema.enum&&!schema.enum.includes(v))return false;
  if(schema.type==='integer')return Number.isInteger(v)&&v>=(schema.minimum??-Infinity);
  if(schema.type==='number')return typeof v==='number'&&Number.isFinite(v)&&(schema.minimum===undefined||v>=schema.minimum)&&(schema.maximum===undefined||v<=schema.maximum)&&(schema.exclusiveMinimum===undefined||v>schema.exclusiveMinimum);
  if(schema.type==='string')return typeof v==='string'&&v.length>=(schema.minLength??0)&&v.length<=(schema.maxLength??Infinity);
  if(schema.type==='array')return Array.isArray(v)&&v.length>=(schema.minItems??0)&&v.length<=(schema.maxItems??Infinity)&&v.every(x=>check(schema.items,x));
  if(schema.type==='object')return !!v&&typeof v==='object'&&!Array.isArray(v)&&schema.required.every((k:string)=>Object.hasOwn(v,k))&&Object.keys(v).every(k=>Object.hasOwn(schema.properties,k)&&check(schema.properties[k],v[k]));
  return true;
 };
 if(!Array.isArray(value)||value.length>32||!value.every(v=>check(assertionSchema,v)))throw Error('Invalid motion assertions (max 32; use operations.describe motion.assertions)');
}
