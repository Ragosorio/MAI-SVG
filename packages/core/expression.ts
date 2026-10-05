import {mixPaths,type Point} from './geometry.js';
import {warpPath,boundaryPins,regionBounds,mlsRigid,insideRegion,type Handle} from './warp.js';
import {segments,pathData} from './geometry.js';
import type {ExpressionFeature,ExpressionRig,Displacement,Driver,PreservationMode,Region,Pose} from './model.js';
// Parametric expressions: shape keys are landmark displacements (fractions of feature size) in a local frame
// u = toward the second reference landmark (right corner / outer corner), v = perpendicular, pointing down.
type Template={landmarks:string[];axis:[string,string];keys:Record<string,Record<string,[number,number]>>;imageFrame?:string[];curve?:Record<string,number>};
export const TEMPLATES:Record<string,Template>={
 // Calibrated on tests/fixtures (smiling mouth must be able to read as a frown under "balanced").
 mouth:{landmarks:['left','right','center','lower'],axis:['left','right'],keys:{
  happiness:{left:[-.04,-.22],right:[.04,-.22],center:[0,.02],lower:[0,.06]},sadness:{left:[.04,.26],right:[-.04,.26],center:[0,-.14],lower:[0,-.1]},
  anger:{left:[.08,.14],right:[-.08,.14],center:[0,-.06],lower:[0,-.08]},fear:{left:[-.06,.14],right:[.06,.14],center:[0,-.04],lower:[0,.12]},
  surprise:{left:[.18,.06],right:[-.18,.06],center:[0,-.06],lower:[0,.25]},tiredness:{left:[0,.12],right:[0,.12],center:[0,-.04],lower:[0,-.02]},
  'mouth-open':{left:[.03,.04],right:[-.03,.04],center:[0,-.05],lower:[0,.35]},'mouth-wide':{left:[-.14,0],right:[.14,0]},
  'mouth-round':{left:[.18,.03],right:[-.18,.03],lower:[0,.12]},'lips-closed':{lower:[0,-.07],center:[0,.03]},smirk:{right:[.05,-.16]}},
  curve:{sadness:-.24,happiness:.14,anger:-.1,tiredness:-.06,fear:-.05}},
 eye:{landmarks:['inner','outer','upper','lower','iris'],axis:['inner','outer'],imageFrame:['look-x','look-y'],keys:{
  sadness:{outer:[0,.18],upper:[0,.14],inner:[0,-.08]},happiness:{lower:[0,-.2],upper:[0,.05],outer:[0,-.04]},anger:{inner:[0,.16],upper:[0,.12]},
  fear:{upper:[0,-.12],lower:[0,.06]},surprise:{upper:[0,-.15],lower:[0,.08]},tiredness:{upper:[0,.22]},squint:{upper:[0,.12],lower:[0,-.12]},
  'look-x':{iris:[.12,0]},'look-y':{iris:[0,.1]}}},
 brow:{landmarks:['inner','middle','outer'],axis:['inner','outer'],keys:{
  sadness:{inner:[0,-.24],outer:[0,.1]},anger:{inner:[0,.22],outer:[0,-.08]},surprise:{inner:[0,-.26],middle:[0,-.28],outer:[0,-.22]},
  happiness:{middle:[0,-.08]},fear:{inner:[0,-.2],middle:[0,-.1]},tiredness:{outer:[0,.08]}}},
 ear:{landmarks:['base','tip'],axis:['base','tip'],keys:{sadness:{tip:[.05,.25]},'ear-droop':{tip:[.1,.4]},anger:{tip:[.06,.15]},surprise:{tip:[-.04,0]},fear:{tip:[.05,.2]}}},
};
// Maximum landmark displacement as a fraction of feature size. Soft-clamped so mixes never jump.
// Heuristic budgets calibrated on fixtures (not a guarantee of likeness): fraction of the feature size.
export const PRESERVATION:Record<PreservationMode,{maxDisplacement:number;meaning:string}>={
 strict:{maxDisplacement:.12,meaning:'Matices: la expresión apenas cambia el dibujo. Color, topología y silueta intactos; landmarks ≤12% del tamaño del rasgo.'},
 balanced:{maxDisplacement:.32,meaning:'Expresión legible (una sonrisa puede volverse tristeza) usando la misma boca/ojos: sin recolorear ni cambiar topología; landmarks ≤32%.'},
 free:{maxDisplacement:.6,meaning:'Actuación exagerada con la misma geometría: deformaciones amplias, aún sin recolorear ni sustituir partes; landmarks ≤60%.'},
};
export const groupOf=(role:string)=>role.startsWith('eye')?'eyes':role.startsWith('brow')?'brows':role.startsWith('ear')?'ears':role;
export const templateOf=(role:string)=>role.startsWith('eye')?'eye':role.startsWith('brow')?'brow':role.startsWith('ear')?'ear':role==='mouth'||role==='muzzle'?'mouth':undefined;
export function paramValue(params:Record<string,number>,name:string,role:string){return params[`${name}@${role}`]??params[`${name}@${groupOf(role)}`]??params[name]??0;}
const unit=(a:Point,b:Point)=>{const l=Math.hypot(b.x-a.x,b.y-a.y)||1;return {x:(b.x-a.x)/l,y:(b.y-a.y)/l};};
export function templateKeys(role:string,landmarks:Record<string,Point>){
 const name=templateOf(role),t=name?TEMPLATES[name]:undefined;if(!t)return {keys:{},size:0,curve:{} as Record<string,number>};
 const [a,b]=t.axis;if(!landmarks[a]||!landmarks[b])throw Error(`Template ${name} needs landmarks ${a} and ${b}`);
 const u=unit(landmarks[a],landmarks[b]);let v={x:-u.y,y:u.x};if(v.y<0)v={x:-v.x,y:-v.y};const size=Math.hypot(landmarks[b].x-landmarks[a].x,landmarks[b].y-landmarks[a].y);
 // Ears grow outward; use their length. Mouth/eye/brow use their width.
 const keys:Record<string,Record<string,Displacement>>={};
 for(const [param,entries]of Object.entries(t.keys)){keys[param]={};for(const [lm,[du,dv]]of Object.entries(entries)){if(!landmarks[lm])continue;const image=t.imageFrame?.includes(param);const dx=image?du*size:(du*u.x+dv*v.x)*size,dy=image?dv*size:(du*u.y+dv*v.y)*size;keys[param][lm]={dx:Number(dx.toFixed(3)),dy:Number(dy.toFixed(3))};}if(!Object.keys(keys[param]).length)delete keys[param];}
 const curve=Object.fromEntries(Object.entries(t.curve??{}).map(([k,v])=>[k,Number((v*size).toFixed(3))]));
 return {keys,size,curve};
}
export function buildFeature(input:{id:string;role:string;node?:string;paths:string[];landmarks:Record<string,Point>;region?:Region;pins?:Point[];keys?:Record<string,Record<string,Displacement>>;rigid?:Record<string,string[]>},rest:Record<string,string>):ExpressionFeature{
 const template=templateKeys(input.role,input.landmarks);const pins=input.pins??(input.region?boundaryPins(input.region,28):[]);
 if(!pins.length)throw Error('Expression feature needs boundary pins or a region so the seam stays fixed');
 const size=template.size||(input.region?Math.max(regionBounds(input.region).width,regionBounds(input.region).height):0);if(!size)throw Error('Cannot infer feature size');
 return {id:input.id,role:input.role,node:input.node,paths:input.paths,rest,pins,landmarks:input.landmarks,keys:{...template.keys,...(input.keys??{})},size:Number(size.toFixed(3)),rigid:input.rigid,...(input.region?{region:input.region}:{}),...(Object.keys(template.curve).length?{curve:template.curve}:{})};
}
export function featureDisplacements(f:ExpressionFeature,params:Record<string,number>,mode:PreservationMode='balanced'){
 const out:Record<string,Displacement>={};if(f.frozen){for(const lm of Object.keys(f.landmarks))out[lm]={dx:0,dy:0};return out;}const limit=PRESERVATION[mode].maxDisplacement*f.size;
 const knee=(m:number)=>{const k=.7*limit;return m>k&&limit>0?k+(limit-k)*Math.tanh((m-k)/(limit-k)):m;};
 if(f.curve){let c=0;for(const [param,amount]of Object.entries(f.curve))c+=paramValue(params,param,f.role)*amount;const m=Math.abs(c);out['~curve']={dx:0,dy:m>1e-9?Math.sign(c)*knee(m):0};}
 for(const lm of Object.keys(f.landmarks)){if(lm==='~curve')continue;let dx=0,dy=0;for(const [param,key]of Object.entries(f.keys)){const w=paramValue(params,param,f.role);if(!w||!key[lm])continue;dx+=w*key[lm].dx;dy+=w*key[lm].dy;}
  // Soft knee: requested values pass unchanged up to 70% of the budget, then saturate smoothly at the budget.
  const m=Math.hypot(dx,dy),knee=.7*limit;if(m>knee&&limit>0){const t=knee+(limit-knee)*Math.tanh((m-knee)/(limit-knee));dx*=t/m;dy*=t/m;}out[lm]={dx,dy};}
 return out;
}
export function featureHandles(f:ExpressionFeature,disp:Record<string,Displacement>):Handle[]{return [...f.pins.map(p=>({p,q:p})),...Object.entries(f.landmarks).map(([lm,p])=>({p,q:{x:p.x+(disp[lm]?.dx??0),y:p.y+(disp[lm]?.dy??0)}}))];}
export function evaluateFeature(f:ExpressionFeature,params:Record<string,number>,mode:PreservationMode='balanced'){
 if(f.frozen)return {};const disp=featureDisplacements(f,params,mode),moving=Object.values(disp).some(d=>Math.abs(d.dx)>1e-6||Math.abs(d.dy)>1e-6);if(!moving)return {};
 const rigid=new Map<string,Displacement>();for(const [lm,ids]of Object.entries(f.rigid??{}))for(const id of ids)rigid.set(id,disp[lm]??{dx:0,dy:0});
 const handles=featureHandles(f,disp),attrs:Record<string,string>={};const field=curveField(f,disp['~curve']?.dy??0);
 for(const id of f.paths){const rest=f.rest[id];if(!rest)continue;const r=rigid.get(id);if(r){attrs[id]=translatePath(rest,r.dx,r.dy);continue;}if(!field){attrs[id]=warpPath(rest,handles);continue;}
  const data=segments(rest);for(const sg of data)sg.points=sg.points.map(p=>{const w=mlsRigid(handles,p),c=field(p);return {x:w.x+c.x,y:w.y+c.y};});attrs[id]=pathData(data);}
 return attrs;
}
function translatePath(d:string,dx:number,dy:number){if(!dx&&!dy)return d;return warpPath(d,[{p:{x:0,y:0},q:{x:dx,y:dy}}]);}
export function evaluateDriver(d:Driver,value:number):number|string{
 const pts=[...d.points].sort((a,b)=>a[0]-b[0]);if(value<=pts[0][0])return pts[0][1];if(value>=pts.at(-1)![0])return pts.at(-1)![1];
 const j=pts.findIndex(p=>p[0]>value),a=pts[j-1],b=pts[j],t=(value-a[0])/(b[0]-a[0]);
 if(typeof a[1]==='number'&&typeof b[1]==='number')return a[1]+(b[1]-a[1])*t;
 if(d.property==='d')return mixPaths(String(a[1]),String(b[1]),t);
 const hex=(v:string)=>[1,3,5].map(i=>parseInt(v.slice(i,i+2),16));const x=hex(String(a[1])),y=hex(String(b[1]));return '#'+x.map((v,i)=>Math.round(v+(y[i]-v)*t).toString(16).padStart(2,'0')).join('');
}
// Drivers are driven keys: the parameter value maps to an absolute property value (Rive/Blender style).
export function evaluateRig(rig:ExpressionRig|undefined,params:Record<string,number>,mode:PreservationMode='balanced'){
 const attrs:Record<string,Record<string,string>>={},posePatch:Record<string,Partial<Pose>>={};if(!rig)return {attrs,poses:posePatch};
 for(const f of rig.features)for(const [id,d]of Object.entries(evaluateFeature(f,params,mode)))(attrs[id]??={}).d=d;
 for(const driver of rig.drivers){if(!(driver.param in params))continue;const v=evaluateDriver(driver,params[driver.param]);if(['x','y','rotation','scaleX','scaleY'].includes(driver.property))(posePatch[driver.target]??={})[driver.property as 'x']=Number(v);else (attrs[driver.target]??={})[driver.property]=String(v);}
 return {attrs,poses:posePatch};
}
// Interpretations for choice boards: same emotion, different distribution across facial slots.
export type Interpretation={id:string;label:string;description:string;params:Record<string,number>};
export function interpretations(emotion:string,intensity:number,count=3,slots:string[]=['mouth','eyes','brows','ears'],seed=1):Interpretation[]{
 if(!Number.isFinite(intensity)||intensity<0||intensity>1)throw Error('Intensity must be 0–1');if(!Number.isInteger(count)||count<2||count>6)throw Error('Use 2–6 interpretations');
 const secondary:Record<string,string>={sadness:'tiredness',happiness:'surprise',anger:'tiredness',fear:'surprise',surprise:'fear',tiredness:'sadness'};
 const recipes=[
  {id:'contenida',label:'Contenida',description:'La emoción vive en los ojos; la boca apenas cambia.',w:{mouth:.45,eyes:.95,brows:.7,ears:.4},extra:{}},
  {id:'abierta',label:'Abierta',description:'La boca carga la emoción; ojos más neutros.',w:{mouth:1,eyes:.5,brows:.9,ears:.6},extra:{'mouth-open@mouth':.12}},
  {id:'matizada',label:'Matizada',description:`Mezcla con ${secondary[emotion]??'tiredness'} para una lectura más humana.`,w:{mouth:.7,eyes:.75,brows:.6,ears:.9},extra:{[`${secondary[emotion]??'tiredness'}@eyes`]:.35,[`${secondary[emotion]??'tiredness'}@mouth`]:.2}},
  {id:'sutil',label:'Sutil',description:'Todo al 60 %: mínima deformación.',w:{mouth:.6,eyes:.6,brows:.6,ears:.6},extra:{}},
  {id:'intensa',label:'Intensa',description:'Máxima lectura permitida por el modo de preservación.',w:{mouth:1,eyes:1,brows:1,ears:1},extra:{}},
  {id:'asimetrica',label:'Asimétrica',description:'Un lado más marcado; útil para ironía o duda.',w:{mouth:.8,eyes:.7,brows:.8,ears:.5},extra:{'smirk@mouth':.25}},
 ];
 const rot=(seed-1)%recipes.length,picked=[...recipes.slice(rot),...recipes.slice(0,rot)].slice(0,count);
 return picked.map(r=>{const params:Record<string,number>={};for(const slot of slots){const w=(r.w as Record<string,number>)[slot]??.7;params[`${emotion}@${slot}`]=Number((intensity*w).toFixed(3));}for(const [k,v]of Object.entries(r.extra))if(slots.includes(k.split('@')[1]))params[k]=Number((v*intensity/.7).toFixed(3));return {id:r.id,label:r.label,description:r.description,params};});
}
// Slot-level combination: "mouth from A, eyes from C".
export function combineParams(base:Record<string,number>,takes:{slot:string;from:Record<string,number>}[]){
 const result={...base};for(const {slot,from}of takes){for(const key of Object.keys(result))if(key.endsWith('@'+slot))delete result[key];for(const [k,v]of Object.entries(from))if(k.endsWith('@'+slot))result[k]=v;}return result;
}
export function scaleParams(params:Record<string,number>,factor:number,slot?:string){return Object.fromEntries(Object.entries(params).map(([k,v])=>[k,!slot||k.endsWith('@'+slot)?Number(Math.max(0,Math.min(1,v*factor)).toFixed(3)):v]));}

// Arch along the axis (first two template landmarks): offset = amount·(1−u²) along the axis normal ("down"),
// faded by distance to the axis and toward the region boundary so seams with untouched artwork stay fixed.
function curveField(f:ExpressionFeature,amount:number){if(Math.abs(amount)<1e-6)return undefined;const name=templateOf(f.role);const t=name?TEMPLATES[name]:undefined;if(!t)return undefined;
 const a=f.landmarks[t.axis[0]],b=f.landmarks[t.axis[1]];if(!a||!b)return undefined;const len=Math.hypot(b.x-a.x,b.y-a.y)||1,u={x:(b.x-a.x)/len,y:(b.y-a.y)/len};let v={x:-u.y,y:u.x};if(v.y<0)v={x:-v.x,y:-v.y};
 const c={x:(a.x+b.x)/2,y:(a.y+b.y)/2},half=len/2,s=(x:number)=>x<=0?0:x>=1?1:x*x*(3-2*x);
 // Uniform across the stroke (keeps thickness); smooth radial fade to zero at the region boundary (no seam).
 const rb=f.region?regionBounds(f.region):undefined,rc=rb?{x:rb.x+rb.width/2,y:rb.y+rb.height/2,rx:rb.width/2,ry:rb.height/2}:undefined;
 return (p:{x:number;y:number})=>{const du=((p.x-c.x)*u.x+(p.y-c.y)*u.y)/half,dv=((p.x-c.x)*v.x+(p.y-c.y)*v.y)/half;const along=Math.max(0,1-du*du),across=1-s((Math.abs(dv)-1)/.6);let fade=along*across;
  if(rc){const r=Math.hypot((p.x-rc.x)/rc.rx,(p.y-rc.y)/rc.ry);fade*=1-s((r-.72)/.28);if(f.region&&!insideRegion(f.region,p))fade=0;}const k=amount*fade;return {x:v.x*k,y:v.y*k};};}
