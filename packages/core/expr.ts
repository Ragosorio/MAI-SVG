// Expression DSL (plan lane A, ADR-003 §A.7): a small, safe, numbers-only language for relationships between channels
// — "the ear follows the head's rotation with a spring", "the shadow shrinks as the body rises". Pratt parser into an
// AST; evaluated by walking the AST (no eval/Function, no property access beyond a whitelist, hard size limits).
// The host (procedural.ts) resolves references; temporal functions are simulated once per scene version and cached.

export class ExpressionError extends Error{constructor(public code:string,message:string,public at?:number){super(`${code}: ${message}`);}}
const PART_PROPS=new Set(['x','y','rotation','scaleX','scaleY','opacity','boneRotation','boneX','boneY']);
const VARS=new Set(['t','time','frame','duration','fps','loopPhase','value','PI','TAU','E']);
const CONST_VARS=new Set(['PI','TAU','E','duration','fps']);
const LIMITS={chars:1000,tokens:512,nodes:256,depth:24,temporal:8,refs:32};

export type ExprNode=
 |{k:'num';v:number}|{k:'str';v:string}|{k:'var';name:string}
 |{k:'ref';ns:'part';id:string;prop:string}|{k:'ref';ns:'param';id:string}|{k:'ref';ns:'sig';id:string}
 |{k:'un';op:'-'|'+'|'!';a:ExprNode}|{k:'bin';op:string;a:ExprNode;b:ExprNode}|{k:'cond';c:ExprNode;a:ExprNode;b:ExprNode}
 |{k:'call';fn:string;args:ExprNode[];slot:number};
type Fn={arity:[number,number];kind:'math'|'shape'|'procedural'|'temporal';constArgs?:number[];doc:string};
/** Function catalogue (published as mai://expr/functions). */
export const EXPR_FUNCTIONS:Record<string,Fn>={
 sin:{arity:[1,1],kind:'math',doc:'sine (radians)'},cos:{arity:[1,1],kind:'math',doc:'cosine (radians)'},tan:{arity:[1,1],kind:'math',doc:'tangent'},asin:{arity:[1,1],kind:'math',doc:'arc sine'},acos:{arity:[1,1],kind:'math',doc:'arc cosine'},atan:{arity:[1,1],kind:'math',doc:'arc tangent'},atan2:{arity:[2,2],kind:'math',doc:'atan2(y,x)'},tanh:{arity:[1,1],kind:'math',doc:'hyperbolic tangent (soft saturation: L*tanh(x/L))'},
 abs:{arity:[1,1],kind:'math',doc:'absolute value'},sign:{arity:[1,1],kind:'math',doc:'-1, 0 or 1'},floor:{arity:[1,1],kind:'math',doc:'round down'},ceil:{arity:[1,1],kind:'math',doc:'round up'},round:{arity:[1,1],kind:'math',doc:'round'},fract:{arity:[1,1],kind:'math',doc:'fractional part'},
 min:{arity:[2,8],kind:'math',doc:'minimum'},max:{arity:[2,8],kind:'math',doc:'maximum'},pow:{arity:[2,2],kind:'math',doc:'power'},sqrt:{arity:[1,1],kind:'math',doc:'square root (0 for negatives)'},exp:{arity:[1,1],kind:'math',doc:'e^x'},log:{arity:[1,1],kind:'math',doc:'natural log (0 for ≤0)'},mod:{arity:[2,2],kind:'math',doc:'positive modulo'},deg:{arity:[1,1],kind:'math',doc:'radians → degrees'},rad:{arity:[1,1],kind:'math',doc:'degrees → radians'},
 clamp:{arity:[3,3],kind:'shape',doc:'clamp(x, lo, hi)'},mix:{arity:[3,3],kind:'shape',doc:'mix(a, b, u) = a + (b−a)·u'},lerp:{arity:[3,3],kind:'shape',doc:'alias of mix'},
 map:{arity:[5,5],kind:'shape',doc:'map(x, a0, a1, b0, b1) linear remap (unclamped)'},linear:{arity:[5,5],kind:'shape',doc:'linear(x, a0, a1, b0, b1) remap clamped to [b0,b1]'},
 smoothstep:{arity:[3,3],kind:'shape',doc:'smoothstep(e0, e1, x)'},step:{arity:[2,2],kind:'shape',doc:'step(edge, x): 0 below, 1 at/above'},ease:{arity:[2,2],kind:'shape',constArgs:[0],doc:"ease('ease-in-out'|…|'cubic-bezier(…)', u)"},
 noise:{arity:[1,3],kind:'procedural',constArgs:[0,1,2],doc:'noise(frequency, seed?, octaves?) smooth seeded noise in [-1,1], loop-aware'},
 wiggle:{arity:[2,3],kind:'procedural',constArgs:[0,2],doc:'wiggle(frequency, amplitude, seed?)'},random:{arity:[1,1],kind:'procedural',constArgs:[0],doc:'random(seed): constant in [0,1)'},
 delay:{arity:[2,2],kind:'temporal',constArgs:[1],doc:'delay(x, seconds): x evaluated earlier (wraps on loops)'},
 spring:{arity:[1,3],kind:'temporal',constArgs:[1,2],doc:'spring(x, stiffness=80, damping=9): x followed by a damped spring (overshoot, settle)'},
 smooth:{arity:[2,2],kind:'temporal',constArgs:[1],doc:'smooth(x, seconds): x low-pass filtered (lag without overshoot)'},
 velocity:{arity:[1,1],kind:'temporal',doc:'velocity(x): units per second'},accel:{arity:[1,1],kind:'temporal',doc:'accel(x): units per second²'},
 valueAt:{arity:[2,2],kind:'temporal',constArgs:[1],doc:'valueAt(x, time): x at a fixed time'},
 ref:{arity:[2,2],kind:'math',constArgs:[0,1],doc:"ref('part-id', 'rotation'): a part channel whose id is not a plain identifier"},
 param:{arity:[1,1],kind:'math',constArgs:[0],doc:"param('name@slot'): a rig param"},sig:{arity:[1,1],kind:'math',constArgs:[0],doc:"sig('signal-id'): another signal's contribution"},
};
export const EXPR_VARIABLES={t:'scene time (s)',time:'alias of t',frame:'t·fps',duration:'timeline seconds',fps:'export sampling rate (60)',loopPhase:'t / duration (0→1)',value:'the channel before this signal (keys, paths, other signals)',PI:'π',TAU:'2π',E:'e'};
export const EXPR_REFERENCES={'ID.x|y|rotation|scaleX|scaleY|opacity':'a part channel (keys + paths + non-expression signals + rig + secondary)',"ref('id','prop')":'same, for ids with dashes or bone channels (boneRotation, boneX, boneY)','param.NAME':"a rig param (or param('name@slot'))",'sig.ID':"another signal's contribution value·weight (or sig('id'))"};

// ── Tokenizer ─────────────────────────────────────────────────────────────────────────────────────────────────────
type Tok={t:'num'|'id'|'str'|'op'|'end';v:string;at:number};
function tokenize(src:string):Tok[]{if(typeof src!=='string'||!src.trim())throw new ExpressionError('MAI_EXPR_SYNTAX','empty expression');
 if(src.length>LIMITS.chars)throw new ExpressionError('MAI_EXPR_TOO_COMPLEX',`expression longer than ${LIMITS.chars} characters`);
 const out:Tok[]=[];let i=0;const ops=['<=','>=','==','!=','&&','||','+','-','*','/','%','^','(',')',',','?',':','<','>','!','.'];
 while(i<src.length){const c=src[i];if(/\s/.test(c)){i++;continue;}
  if(/[0-9]/.test(c)||(c==='.'&&/[0-9]/.test(src[i+1]??''))){const m=/^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i))!;out.push({t:'num',v:m[0],at:i});i+=m[0].length;continue;}
  if(/[A-Za-z_]/.test(c)){const m=/^[A-Za-z_]\w*/.exec(src.slice(i))!;out.push({t:'id',v:m[0],at:i});i+=m[0].length;continue;}
  if(c==="'"||c==='"'){const j=src.indexOf(c,i+1);if(j<0)throw new ExpressionError('MAI_EXPR_SYNTAX','unterminated string',i);const v=src.slice(i+1,j);if(!/^[\w.@:() ,-]{0,120}$/.test(v))throw new ExpressionError('MAI_EXPR_SYNTAX','strings may hold ids, param names or easing names only',i);out.push({t:'str',v,at:i});i=j+1;continue;}
  const op=ops.find(o=>src.startsWith(o,i));if(!op)throw new ExpressionError('MAI_EXPR_SYNTAX',`unexpected "${c}"`,i);out.push({t:'op',v:op,at:i});i+=op.length;
  if(out.length>LIMITS.tokens)throw new ExpressionError('MAI_EXPR_TOO_COMPLEX',`more than ${LIMITS.tokens} tokens`);}
 out.push({t:'end',v:'',at:src.length});return out;}

// ── Pratt parser ──────────────────────────────────────────────────────────────────────────────────────────────────
const BP:Record<string,number>={'?':10,'||':15,'&&':20,'==':25,'!=':25,'<':30,'<=':30,'>':30,'>=':30,'+':40,'-':40,'*':50,'/':50,'%':50,'^':70};
export type Parsed={ast:ExprNode;refs:{parts:{id:string;prop:string}[];params:string[];signals:string[]};temporal:number;usesValue:boolean;nodes:number};
const cache=new Map<string,Parsed>();
export function parseExpr(src:string):Parsed{const hit=cache.get(src);if(hit)return hit;
 const toks=tokenize(src);let pos=0,nodes=0,slots=0,temporal=0,usesValue=false;const refs:Parsed['refs']={parts:[],params:[],signals:[]};
 const peek=()=>toks[pos],next=()=>toks[pos++];const fail=(m:string,tok=peek()):never=>{throw new ExpressionError('MAI_EXPR_SYNTAX',`${m} at ${tok.at}`,tok.at);};
 const expect=(v:string)=>{const t=next();if(t.t!=='op'||t.v!==v)fail(`expected "${v}"`,t);};
 const node=<T extends ExprNode>(n:T,depth:number):T=>{if(++nodes>LIMITS.nodes)throw new ExpressionError('MAI_EXPR_TOO_COMPLEX',`more than ${LIMITS.nodes} nodes`);if(depth>LIMITS.depth)throw new ExpressionError('MAI_EXPR_TOO_COMPLEX',`nesting deeper than ${LIMITS.depth}`);return n;};
 const noStr=(...xs:ExprNode[])=>{for(const x of xs)if(x.k==='str')throw new ExpressionError('MAI_EXPR_SYNTAX','strings are only arguments of ref(), param(), sig() and ease()');};
 const ref=(n:ExprNode,d:number)=>{if(n.k==='ref'){if(n.ns==='part')refs.parts.push({id:n.id,prop:n.prop});else if(n.ns==='param')refs.params.push(n.id);else refs.signals.push(n.id);if(refs.parts.length+refs.params.length+refs.signals.length>LIMITS.refs)throw new ExpressionError('MAI_EXPR_TOO_COMPLEX',`more than ${LIMITS.refs} references`);}return node(n,d);};
 const parse=(rbp:number,d:number):ExprNode=>{let left=prefix(d);
  for(;;){const t=peek();if(t.t!=='op')break;const bp=BP[t.v];if(bp===undefined||bp<=rbp)break;next();
   if(t.v==='?'){const a=parse(0,d+1);expect(':');const b=parse(bp-1,d+1);noStr(left,a,b);left=node({k:'cond',c:left,a,b},d);continue;}
   const right=parse(t.v==='^'?bp-1:bp,d+1);noStr(left,right);left=node({k:'bin',op:t.v,a:left,b:right},d);}
  return left;};
 const prefix=(d:number):ExprNode=>{const t=next();
  if(t.t==='num'){const v=Number(t.v);if(!Number.isFinite(v))fail('invalid number',t);return node({k:'num',v},d);}
  if(t.t==='str')return node({k:'str',v:t.v},d);
  if(t.t==='op'&&t.v==='('){const e=parse(0,d+1);expect(')');return e;}
  if(t.t==='op'&&(t.v==='-'||t.v==='+'||t.v==='!')){const a=parse(60,d+1);noStr(a);return node({k:'un',op:t.v,a},d);}
  if(t.t!=='id')return fail(t.t==='end'?'unexpected end':`unexpected "${t.v}"`,t);
  const name=t.v;
  if(peek().t==='op'&&peek().v==='('){next();const fn=Object.hasOwn(EXPR_FUNCTIONS,name)?EXPR_FUNCTIONS[name]:undefined;if(!fn)throw new ExpressionError('MAI_EXPR_UNKNOWN_FUNCTION',`unknown function ${name}() — see mai://expr/functions`,t.at);
   const args:ExprNode[]=[];if(!(peek().t==='op'&&peek().v===')')){do{args.push(parse(0,d+1));}while(peek().t==='op'&&peek().v===','&&next());}expect(')');
   if(args.length<fn.arity[0]||args.length>fn.arity[1])throw new ExpressionError('MAI_EXPR_ARITY',`${name}() takes ${fn.arity[0]===fn.arity[1]?fn.arity[0]:fn.arity.join('–')} arguments, got ${args.length}`,t.at);
   const str=(i:number)=>{const a=args[i];if(a?.k!=='str')throw new ExpressionError('MAI_EXPR_BAD_REFERENCE',`${name}() argument ${i+1} must be a quoted string`,t.at);return a.v;};
   if(name==='ref'){const id=str(0),prop=str(1);if(!PART_PROPS.has(prop))throw new ExpressionError('MAI_EXPR_BAD_REFERENCE',`unknown channel ${prop} (${[...PART_PROPS].join(', ')})`,t.at);return ref({k:'ref',ns:'part',id,prop},d);}
   if(name==='param')return ref({k:'ref',ns:'param',id:str(0)},d);if(name==='sig')return ref({k:'ref',ns:'sig',id:str(0)},d);
   if(name==='ease')str(0);args.forEach((a,i)=>{if(a.k==='str'&&!(name==='ease'&&i===0))throw new ExpressionError('MAI_EXPR_SYNTAX',`${name}() argument ${i+1} cannot be a string`,t.at);});
   for(const i of fn.constArgs??[])if(args[i]&&!isConst(args[i]))throw new ExpressionError('MAI_EXPR_NONCONSTANT',`${name}() argument ${i+1} must be a constant (numbers and arithmetic only)`,t.at);
   if(fn.kind==='temporal'&&++temporal>LIMITS.temporal)throw new ExpressionError('MAI_EXPR_TOO_COMPLEX',`more than ${LIMITS.temporal} temporal functions`,t.at);
   return node({k:'call',fn:name,args,slot:slots++},d);}
  if(peek().t==='op'&&peek().v==='.'){next();const m=next();if(m.t!=='id')fail('expected a channel name after "."',m);
   if(name==='param')return ref({k:'ref',ns:'param',id:m.v},d);if(name==='sig')return ref({k:'ref',ns:'sig',id:m.v},d);
   if(name==='camera')throw new ExpressionError('MAI_EXPR_BAD_REFERENCE','camera.* is not readable from expressions yet; drive the camera with signals instead',t.at);
   if(!PART_PROPS.has(m.v))throw new ExpressionError('MAI_EXPR_BAD_REFERENCE',`unknown channel ${name}.${m.v} (${[...PART_PROPS].join(', ')})`,m.at);return ref({k:'ref',ns:'part',id:name,prop:m.v},d);}
  if(!VARS.has(name))throw new ExpressionError('MAI_EXPR_UNKNOWN_IDENTIFIER',`unknown identifier ${name} — variables: ${[...VARS].join(', ')}; parts are read as ID.x or ref('id','x')`,t.at);
  if(name==='value')usesValue=true;return node({k:'var',name},d);};
 const ast=parse(0,0);if(peek().t!=='end')fail(`unexpected "${peek().v}"`);noStr(ast);
 const out={ast,refs,temporal,usesValue,nodes};if(cache.size>512)cache.clear();cache.set(src,out);return out;}

/** Constant-foldable: numbers, constant variables, and pure math/shape calls of constants. */
function isConst(n:ExprNode):boolean{switch(n.k){case 'num':case 'str':return true;case 'var':return CONST_VARS.has(n.name);case 'ref':return false;case 'un':return isConst(n.a);case 'bin':return isConst(n.a)&&isConst(n.b);case 'cond':return isConst(n.c)&&isConst(n.a)&&isConst(n.b);
 case 'call':{const f=EXPR_FUNCTIONS[n.fn];return (f.kind==='math'||f.kind==='shape'||n.fn==='random')&&n.args.every(isConst);}}}

// ── Evaluation ────────────────────────────────────────────────────────────────────────────────────────────────────
export type ExprHost={duration:number;loop:boolean;fps:number;
 part(id:string,prop:string,t:number):number;param(name:string,t:number):number;signal(id:string,t:number):number;value(t:number):number;
 noise(t:number,frequency:number,seed:number,octaves:number):number;ease(name:string,u:number):number;
 /** Cached simulation of a temporal slot over the timeline grid (computed once per scene version). */
 sim(slot:number,compute:()=>Float64Array):Float64Array};
const fin=(v:number)=>Number.isFinite(v)?v:0;
const hash=(seed:number)=>{let h=Math.imul((seed*1000|0)^0x9e3779b1,0x85ebca6b);h^=h>>>13;h=Math.imul(h,0xc2b2ae35);h^=h>>>16;return (h>>>0)/4294967296;};
export const SIM_FPS=120;
const wrapT=(h:ExprHost,t:number)=>h.loop?((t%h.duration)+h.duration)%h.duration:Math.max(0,Math.min(h.duration,t));
function gridAt(a:Float64Array,h:ExprHost,t:number){const n=a.length,x=Math.max(0,Math.min(1,h.duration?wrapT(h,t)/h.duration:0))*(n-1),i=Math.min(n-2,Math.floor(x)),u=x-i;return a[i]*(1-u)+a[i+1]*u;}
/** Damped spring (k, c) or first-order lag (T) following x(t); loops run 3 passes and close the seam. */
export function simulateFollow(x:(t:number)=>number,h:{duration:number;loop:boolean},mode:{spring:[number,number]}|{lag:number}){
 const D=h.duration,n=Math.min(SIM_FPS*600,Math.max(2,Math.ceil(D*SIM_FPS))+1),dt=D/(n-1);const xs=new Float64Array(n);for(let i=0;i<n;i++)xs[i]=x(i*dt);
 const out=new Float64Array(n);let y=xs[0],v=0;const passes=h.loop?3:1;const sub=4,ds=dt/sub;
 for(let pass=0;pass<passes;pass++)for(let i=0;i<n;i++){if(i>0||pass>0){const a=xs[Math.max(0,i-1)],b=xs[i];for(let s=1;s<=sub;s++){const target=a+(b-a)*s/sub;
   if('spring' in mode){const [k,c]=mode.spring;v+=(k*(target-y)-c*v)*ds;y+=v*ds;}else{y+=(target-y)*(1-Math.exp(-ds/Math.max(1e-4,mode.lag)));}}}
  if(pass===passes-1)out[i]=y;}
 if(h.loop){const seam=out[n-1]-out[0];for(let i=0;i<n;i++)out[i]-=seam*i/(n-1);}
 return out;}

export function evalExpr(p:Parsed,t:number,h:ExprHost):number{return fin(ev(p.ast,t,h));}
function ev(n:ExprNode,t:number,h:ExprHost):number{
 switch(n.k){
  case 'num':return n.v;case 'str':return 0;
  case 'var':switch(n.name){case 't':case 'time':return t;case 'frame':return t*h.fps;case 'duration':return h.duration;case 'fps':return h.fps;case 'loopPhase':return h.duration?t/h.duration:0;case 'value':return h.value(t);case 'PI':return Math.PI;case 'TAU':return 2*Math.PI;case 'E':return Math.E;}return 0;
  case 'ref':return fin(n.ns==='part'?h.part(n.id,n.prop,t):n.ns==='param'?h.param(n.id,t):h.signal(n.id,t));
  case 'un':{const a=ev(n.a,t,h);return n.op==='-'?-a:n.op==='!'?(a?0:1):a;}
  case 'cond':return ev(n.c,t,h)?ev(n.a,t,h):ev(n.b,t,h);
  case 'bin':{if(n.op==='&&')return ev(n.a,t,h)&&ev(n.b,t,h)?1:0;if(n.op==='||')return ev(n.a,t,h)||ev(n.b,t,h)?1:0;const a=ev(n.a,t,h),b=ev(n.b,t,h);
   switch(n.op){case '+':return a+b;case '-':return a-b;case '*':return a*b;case '/':return b?a/b:0;case '%':return b?a%b:0;case '^':return fin(Math.pow(a,b));
    case '<':return a<b?1:0;case '<=':return a<=b?1:0;case '>':return a>b?1:0;case '>=':return a>=b?1:0;case '==':return Math.abs(a-b)<1e-9?1:0;case '!=':return Math.abs(a-b)>=1e-9?1:0;}return 0;}
  case 'call':return fin(call(n,t,h));}}
function call(n:Extract<ExprNode,{k:'call'}>,t:number,h:ExprHost):number{const A=n.args,v=(i:number)=>ev(A[i],t,h);
 switch(n.fn){
  case 'sin':return Math.sin(v(0));case 'cos':return Math.cos(v(0));case 'tan':return Math.tan(v(0));case 'asin':return Math.asin(Math.max(-1,Math.min(1,v(0))));case 'acos':return Math.acos(Math.max(-1,Math.min(1,v(0))));case 'atan':return Math.atan(v(0));case 'atan2':return Math.atan2(v(0),v(1));case 'tanh':return Math.tanh(v(0));
  case 'abs':return Math.abs(v(0));case 'sign':return Math.sign(v(0));case 'floor':return Math.floor(v(0));case 'ceil':return Math.ceil(v(0));case 'round':return Math.round(v(0));case 'fract':{const x=v(0);return x-Math.floor(x);}
  case 'min':return Math.min(...A.map((_,i)=>v(i)));case 'max':return Math.max(...A.map((_,i)=>v(i)));case 'pow':return Math.pow(v(0),v(1));case 'sqrt':{const x=v(0);return x>0?Math.sqrt(x):0;}case 'exp':return Math.exp(Math.min(700,v(0)));case 'log':{const x=v(0);return x>0?Math.log(x):0;}
  case 'mod':{const a=v(0),b=v(1);return b?((a%b)+b)%b:0;}case 'deg':return v(0)*180/Math.PI;case 'rad':return v(0)*Math.PI/180;
  case 'clamp':{const x=v(0),lo=v(1),hi=v(2);return Math.max(Math.min(lo,hi),Math.min(Math.max(lo,hi),x));}case 'mix':case 'lerp':{const a=v(0);return a+(v(1)-a)*v(2);}
  case 'map':case 'linear':{const x=v(0),a0=v(1),a1=v(2),b0=v(3),b1=v(4);let u=a1===a0?0:(x-a0)/(a1-a0);if(n.fn==='linear')u=Math.max(0,Math.min(1,u));return b0+(b1-b0)*u;}
  case 'smoothstep':{const e0=v(0),e1=v(1),x=v(2);const u=e1===e0?(x<e0?0:1):Math.max(0,Math.min(1,(x-e0)/(e1-e0)));return u*u*(3-2*u);}case 'step':return v(1)>=v(0)?1:0;
  case 'ease':return h.ease((A[0] as {v:string}).v,Math.max(0,Math.min(1,v(1))));
  case 'noise':return h.noise(t,v(0),A[1]?v(1):0,A[2]?Math.max(1,Math.min(6,Math.round(v(2)))):1);
  case 'wiggle':return v(1)*h.noise(t,v(0),A[2]?v(2):0,2);
  case 'random':return hash(v(0));
  case 'delay':return ev(A[0],wrapT(h,t-v(1)),h);
  case 'valueAt':return ev(A[0],wrapT(h,v(1)),h);
  case 'velocity':case 'accel':{const d=1/240,f=(x:number)=>ev(A[0],x,h);const lo=h.loop?t-d:Math.max(0,t-d),hi=h.loop?t+d:Math.min(h.duration,t+d);const W=(x:number)=>wrapT(h,x);
   if(n.fn==='velocity')return hi>lo?(f(W(hi))-f(W(lo)))/(hi-lo):0;const c=h.loop?t:Math.max(d,Math.min(h.duration-d,t));return (f(W(c+d))-2*f(W(c))+f(W(c-d)))/(d*d);}
  case 'spring':case 'smooth':{const grid=h.sim(n.slot,()=>simulateFollow(x=>ev(A[0],x,h),h,n.fn==='spring'?{spring:[A[1]?Math.max(.1,Math.min(5000,v(1))):80,A[2]?Math.max(0,Math.min(500,v(2))):9]}:{lag:Math.max(1e-3,v(1))}));return gridAt(grid,h,t);}
 }
 return 0;}

/** Validate an expression against the scene: syntax, references and signal ids (cycles are checked by the caller). */
export function checkExpr(src:string,scene:{part:(id:string,prop:string)=>boolean;param:(name:string)=>boolean;signal:(id:string)=>boolean;easing:(name:string)=>boolean}):Parsed{
 const p=parseExpr(src);for(const r of p.refs.parts)if(!scene.part(r.id,r.prop))throw new ExpressionError('MAI_EXPR_MISSING_TARGET',`${r.id}.${r.prop}: part or bone ${r.id} not found`);
 for(const r of p.refs.params)if(!scene.param(r))throw new ExpressionError('MAI_EXPR_MISSING_TARGET',`param ${r} not found`);for(const r of p.refs.signals)if(!scene.signal(r))throw new ExpressionError('MAI_EXPR_MISSING_TARGET',`signal ${r} not found`);
 for(const c of calls(p.ast))if(c.fn==='ease'){const name=(c.args[0] as {v:string}).v;if(!scene.easing(name))throw new ExpressionError('MAI_EXPR_BAD_REFERENCE',`unknown easing ${name}`);}
 return p;}
function calls(n:ExprNode):Extract<ExprNode,{k:'call'}>[]{switch(n.k){case 'call':return [n,...n.args.flatMap(calls)];case 'un':return calls(n.a);case 'bin':return [...calls(n.a),...calls(n.b)];case 'cond':return [...calls(n.c),...calls(n.a),...calls(n.b)];default:return [];}}
