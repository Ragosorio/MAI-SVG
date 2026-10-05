// OFFLINE FALLBACK ONLY. Interpreting human language is the agent's job (Claude, Codex…): it reads context with
// `mai choices inspect`/`mai inspect` and calls structured tools (variant.combine, animation.adjust…).
// This tiny parser exists for no-LLM shortcuts and demos (`mai shortcut "…"`); it is not used by core flows
// and must not grow into an NLP engine. Unknown fragments are returned as `unresolved`, never guessed.
export type OptionRef={id:string;label?:string};
export type Adjustment={slot?:string;property:'speed'|'intensity'|'size'|'opacity'|'direction'|'amount'|'emotion';op:'scale'|'add'|'set';amount:number;raw:string;emotion?:string;direction?:{x:number;y:number}};
export type FeedbackIntent={text:string;kind:'choose'|'combine'|'adjust'|'reject'|'regenerate'|'keep-original'|'revert'|'comment'|'question';sentiment:'positive'|'negative'|'mixed'|'neutral';
 base?:string;likes:{option?:string;slot?:string}[];dislikes:{option?:string;slot?:string}[];takes:{slot:string;from:string;resolved:boolean}[];adjustments:Adjustment[];keep:string[];count?:number;confidence:number;unresolved:string[];clarification?:string;plan:string[]};
const strip=(s:string)=>s.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
export const SLOT_WORDS:Record<string,string[]>={
 mouth:['boca','bocas','labio','labios','hocico','sonrisa','mueca','mouth','lips','lip','smile','muzzle'],eyes:['ojo','ojos','mirada','parpado','parpados','pupila','pupilas','iris','eye','eyes','eyelid','eyelids','gaze'],
 brows:['ceja','cejas','entrecejo','brow','brows','eyebrow','eyebrows'],ears:['oreja','orejas','ear','ears'],tail:['cola','colita','tail'],smoke:['humo','vapor','niebla','humito','smoke','steam','fog'],
 fluid:['fluido','agua','lava','fuego','llama','water','fire','flame','liquido','liquid'],timing:['velocidad','ritmo','timing','tiempo','tempo','rapidez','speed','pace'],color:['color','colores','tono','colour','colors','hue'],
 pose:['pose','postura','cuerpo','body','posture','movimiento','motion'],face:['cara','rostro','expresion','gesto','face','expression'],tear:['lagrima','lagrimas','llanto','tear','tears'],flask:['botella','frasco','pocion','bottle','flask','potion'],head:['cabeza','head'],
};
const ORDINALS:[RegExp,number][]=[[/\b(primer[oa]?|1r[oa]|1º|1ª|first|1st|uno)\b/,0],[/\b(segund[oa]|2d[oa]|2º|2ª|second|2nd|dos)\b/,1],[/\b(tercer[oa]?|3r[oa]|3º|3ª|third|3rd|tres)\b/,2],[/\b(cuart[oa]|4º|4ª|fourth|4th|cuatro)\b/,3],[/\b(quint[oa]|5º|fifth|5th|cinco)\b/,4],[/\b(sext[oa]|6º|sixth|6th|seis)\b/,5]];
const NUMBERS:Record<string,number>={dos:2,tres:3,cuatro:4,cinco:5,seis:6,two:2,three:3,four:4,five:5,six:6,'2':2,'3':3,'4':4,'5':5,'6':6};
const POSITIVE=/\b(me gusta(?:n)?|me encanta(?:n)?|prefiero|quiero|elijo|escojo|me quedo con|quedate con|va la|mejor|perfect[ao]|bien|genial|like|love|prefer|want|pick|choose|go with|best|great|good|usa|use|toma|take|dame)\b/;
const NEGATIVE=/\b(no me gusta(?:n)?|odio|fe[oa]|peor|horrible|mal|no quiero|don'?t like|do not like|hate|ugly|worse|bad|not)\b/;
const EMOTIONS:Record<string,string>={triste:'sadness',tristeza:'sadness',sad:'sadness',sadness:'sadness',feliz:'happiness',alegre:'happiness',happy:'happiness',contento:'happiness',enojad:'anger',enfadad:'anger',furios:'anger',angry:'anger',asustad:'fear',miedo:'fear',scared:'fear',afraid:'fear',sorprendid:'surprise',surprised:'surprise',cansad:'tiredness',tired:'tiredness',sleepy:'tiredness'};
function percent(c:string){const m=/(\d+(?:[.,]\d+)?)\s*(%|por ?ciento|percent|pct)/.exec(c);if(m)return Number(m[1].replace(',','.'))/100;if(/\b(un poco|poquito|ligeramente|a bit|a little|slightly|tantito)\b/.test(c))return .15;if(/\b(mucho|bastante|a lot|much|way)\b/.test(c))return .4;if(/\b(la mitad|half)\b/.test(c))return .5;if(/\b(el doble|double|twice)\b/.test(c))return 1;return undefined;}
export function slotOf(word:string,known:string[]=[]){const w=strip(word).trim();for(const [slot,words]of Object.entries(SLOT_WORDS))if(words.includes(w)||words.includes(w.replace(/s$/,'')))return slot;const k=known.find(k=>strip(k)===w||strip(k).replace(/s$/,'')===w.replace(/s$/,''));return k;}
export function interpretFeedback(text:string,options:OptionRef[]=[],knownSlots:string[]=[]):FeedbackIntent{
 if(typeof text!=='string'||!text.trim()||text.length>4000)throw Error('Feedback text must be 1–4000 characters');
 const intent:FeedbackIntent={text,kind:'comment',sentiment:'neutral',likes:[],dislikes:[],takes:[],adjustments:[],keep:[],confidence:.9,unresolved:[],plan:[]};
 const norm=strip(text),n=options.length;
 const optionAt=(index:number)=>index>=0&&index<n?options[index].id:undefined;
 // Option references with positions, so slots can be paired with the closest option.
 const refs=(clause:string,raw:string)=>{const out:{pos:number;id:string|undefined;raw:string}[]=[];
  for(const [re,i]of ORDINALS){const g=new RegExp(re.source,'g');let m;while((m=g.exec(clause))){const before=clause.slice(Math.max(0,m.index-12),m.index);if(['dos','tres','cuatro','cinco','seis','uno'].includes(m[1])&&!/\b(la|el|opcion|option|numero)\s*$/.test(before))continue;out.push({pos:m.index,id:optionAt(i),raw:m[0]});}}
  {const g=/\b(ultim[oa]|last)\b/g;let m;while((m=g.exec(clause)))out.push({pos:m.index,id:optionAt(n-1),raw:m[0]});}
  {const g=/\b(?:opcion|option|variante|variant|version|alternativa|candidat[oa]|propuesta|#)\s*([a-f]|[1-6])\b/g;let m;while((m=g.exec(clause))){const v=m[1];out.push({pos:m.index,id:/\d/.test(v)?optionAt(Number(v)-1):options.find(o=>strip(o.id)===v)?.id??optionAt(v.charCodeAt(0)-97),raw:m[0]});}}
  {const g=/(?:^|[^\p{L}])([A-F])(?![\p{L}])/gu;let m;while((m=g.exec(raw))){const v=m[1];const pos=m.index+m[0].indexOf(v);if(out.some(r=>Math.abs(r.pos-pos)<12))continue;out.push({pos,id:options.find(o=>o.id===v)?.id??optionAt(v.charCodeAt(0)-65),raw:v});}}
  for(const o of options){if(o.label){const l=strip(o.label);const i=clause.indexOf(l);if(l.length>2&&i>=0&&!out.some(r=>r.pos===i))out.push({pos:i,id:o.id,raw:o.label});}if(o.id.length>2){const i=clause.indexOf(strip(o.id));if(i>=0&&!out.some(r=>r.pos===i))out.push({pos:i,id:o.id,raw:o.id});}}
  return out.sort((a,b)=>a.pos-b.pos);};
 const slotsIn=(clause:string)=>{const out:{pos:number;slot:string}[]=[];const vocab=[...Object.entries(SLOT_WORDS).flatMap(([slot,words])=>words.map(w=>[w,slot])),...knownSlots.map(k=>[strip(k),k])];for(const [w,slot]of vocab){const g=new RegExp(`\\b${w}\\b`,'g');let m;while((m=g.exec(clause)))if(!out.some(o=>o.pos===m!.index))out.push({pos:m.index,slot});}return out.sort((a,b)=>a.pos-b.pos);};
 // Clauses split on punctuation and contrastive conjunctions; "con" starts a borrow clause.
 const rawClauses=text.split(/[;.\n]+|,|\b(?:pero|but|aunque|however|sin embargo|excepto|except)\b/i).map(s=>s.trim()).filter(Boolean);
 let lastSlot:string|undefined;const defaults=new Set<Adjustment>();let negativeSeen=false;
 if(/\b(ninguno|ninguna|none|neither|nada me gusta|no me gusta ninguna|ninguna me gusta|todas mal)\b/.test(norm)){intent.kind='reject';intent.sentiment='negative';}
 const regen=/\b(haz|hazme|dame|genera|muestra|propon|crea|make|give|show|generate|create|try)\b[^.;]*\b(otr[oa]s?|mas|nuev[oa]s|another|more|new|again)\b|\b(otra vez|de nuevo|try again)\b/.exec(norm);
 if(regen){const num=/\b(dos|tres|cuatro|cinco|seis|two|three|four|five|six|[2-6])\b/.exec(norm);intent.count=num?NUMBERS[num[1]]:3;}
 for(const raw of rawClauses){const clause=strip(raw);const r=refs(clause,raw),slots=slotsIn(clause);const neg=NEGATIVE.test(clause),pos=POSITIVE.test(clause)||/^\s*(con|with)\b/.test(clause);
  const borrow=/\b(con|with|usa|use|toma|take|pon|put|ponle|agrega|add)\b/.test(clause);
  const keep=/\b(conserva|conservar|manten|mantener|mantenga|deja|dejar|keep|preserve|respeta)\b/.test(clause)&&/\b(original|actual|como estaba|como antes|as it was|as is|intact[oa]?)\b/.test(clause);
  if(keep){for(const s of slots)intent.keep.push(s.slot);if(!slots.length)intent.unresolved.push(raw);continue;}
  if(/\b(estaba mejor antes|era mejor antes|como estaba antes|vuelve a como|regresa|deshaz|was better before|go back|revert|undo)\b/.test(clause)){if(intent.kind==='comment')intent.kind='revert';for(const s of slots)intent.dislikes.push({slot:s.slot});continue;}
  // Adjustments: speed, intensity, size, opacity, direction.
  const p=percent(clause);const slot=slots[0]?.slot??lastSlot;let adjusted=false;const before=intent.adjustments.length;
  // An adjustment belongs to the slot named just before it in the clause ("el humo, más lento"), else to the previous clause's slot.
  const at=(re:RegExp)=>{const m=re.exec(clause);if(!m)return slot;const prior=slots.filter(x=>x.pos<m.index).at(-1);return prior?prior.slot:slots.length?undefined:lastSlot;};
  const down=/\b(baja|bajalo|bajala|bajale|reduce|reducir|reducelo|disminuye|menos|lower|decrease|less|slow down|calma)\b/.test(clause),up=/\b(sube|subelo|subele|aumenta|aumentalo|incrementa|mas|more|increase|raise|boost)\b/.test(clause);
  if(/\b(lent[oa]s?|despacio|slow|slower)\b/.test(clause)||(/\b(demasiado|muy|too)\b[^,]*\b(rapid[oa]s?|fast|quick)\b/.test(clause))||(slot==='timing'||slot==='smoke'||slot==='fluid')&&down&&!/\b(rapid|fast)/.test(clause)&&/\b(velocidad|rapid|speed|lent|slow)|bajalo|reduce/.test(clause)){intent.adjustments.push({slot:slot==='timing'?undefined:slot,property:'speed',op:'scale',amount:Number((1-(p??.25)).toFixed(3)),raw});adjusted=true;}
  else if(/\b(rapid[oa]s?|velocidad|fast|faster|quick|aprisa)\b/.test(clause)&&!/\b(demasiado|muy|too)\b/.test(clause)||/\b(demasiado|muy|too)\b[^,]*\b(lent[oa]s?|slow)\b/.test(clause)){intent.adjustments.push({slot:slot==='timing'?undefined:slot,property:'speed',op:'scale',amount:Number((1+(p??.25)).toFixed(3)),raw});adjusted=true;}
  for(const [word,emotion]of Object.entries(EMOTIONS)){if(!new RegExp(`\\b${word}`).test(clause))continue;const more=/\b(mas|more|un poco mas)\b/.test(clause)&&!/\b(menos|less)\b/.test(clause),less=/\b(menos|less|demasiado|too)\b/.test(clause);if(more||less){intent.adjustments.push({slot:at(new RegExp(`\\b${word}`)),property:'emotion',emotion,op:'scale',amount:Number((less?1-(p??.25):1+(p??.25)).toFixed(3)),raw});adjusted=true;}break;}
  if(/\b(intens[oa]|marcad[oa]|exagerad[oa]|fuerte|strong|stronger|bigger expression)\b/.test(clause)&&!adjusted){intent.adjustments.push({slot:at(/\b(intens|marcad|exagerad|fuerte|strong)/),property:'intensity',op:'scale',amount:Number((/\b(menos|less|demasiado|too)\b/.test(clause)?1-(p??.25):1+(p??.25)).toFixed(3)),raw});adjusted=true;}
  if(/\b(sutil|suave|subtle|softer|gentle)\b/.test(clause)&&!adjusted){intent.adjustments.push({slot:at(/\b(sutil|suave|subtle|softer|gentle)\b/),property:'intensity',op:'scale',amount:Number((1-(p??.25)).toFixed(3)),raw});adjusted=true;}
  if(/\b(grande|agranda|mas grande|bigger|larger|enlarge)\b/.test(clause)){intent.adjustments.push({slot:at(/\b(grande|agranda|bigger|larger|enlarge)\b/),property:'size',op:'scale',amount:Number((1+(p??.2)).toFixed(3)),raw});adjusted=true;}
  if(/\b(pequen[oa]|chic[oa]|achica|smaller|shrink|tiny)\b/.test(clause)){intent.adjustments.push({slot:at(/\b(pequen|chic|achica|smaller|shrink|tiny)/),property:'size',op:'scale',amount:Number((1-(p??.2)).toFixed(3)),raw});adjusted=true;}
  if(/\b(transparente|opac[oa]|translucid[oa]|transparent|fainter|denser|dens[oa])\b/.test(clause)){intent.adjustments.push({slot,property:'opacity',op:'scale',amount:Number((/\b(transparente|translucid|transparent|fainter)\b/.test(clause)?1-(p??.25):1+(p??.25)).toFixed(3)),raw});adjusted=true;}
  const dir=/\b(hacia|a la|to the|towards|toward|para)\s*(la\s+|el\s+)?(izquierda|derecha|arriba|abajo|left|right|up|down)\b/.exec(clause);
  if(dir){const v={izquierda:{x:-1,y:0},left:{x:-1,y:0},derecha:{x:1,y:0},right:{x:1,y:0},arriba:{x:0,y:-1},up:{x:0,y:-1},abajo:{x:0,y:1},down:{x:0,y:1}}[dir[3] as 'left'];intent.adjustments.push({slot:at(/\b(hacia|a la|to the|towards|toward|para)\b/),property:'direction',op:'set',amount:1,direction:v,raw});adjusted=true;}
  if(!adjusted&&p!==undefined&&(down||up)){intent.adjustments.push({slot,property:'amount',op:'scale',amount:Number((down?1-p:1+p).toFixed(3)),raw});adjusted=true;}
  // "demasiado rápido, bájalo 30 %": an explicit amount refines the previous default-amount adjustment.
  if(p!==undefined&&intent.adjustments.length>before&&before>0){const added=intent.adjustments.slice(before),prev=intent.adjustments.slice(0,before);for(const a of added){const match=prev.find(x=>x.slot===a.slot&&(x.property===a.property||a.property==='amount')&&defaults.has(x));if(match){match.amount=a.property==='amount'?Number((match.amount<1?1-p:1+p).toFixed(3)):a.amount;match.raw+=' · '+a.raw;defaults.delete(match);intent.adjustments.splice(intent.adjustments.indexOf(a),1);}}}
  if(p===undefined)for(const a of intent.adjustments.slice(before))defaults.add(a);
  // Pair each slot with the nearest option reference (after first: "los ojos de la tercera").
  const used=new Set<number>();
  for(const s of slots){const after=r.find(x=>x.pos>s.pos&&!used.has(x.pos)),before=[...r].reverse().find(x=>x.pos<s.pos&&!used.has(x.pos));const ref=after&&(after.pos-s.pos<40)?after:before;if(!ref)continue;used.add(ref.pos);
   if(!ref.id){intent.unresolved.push(ref.raw);continue;}if(neg&&!borrow)intent.dislikes.push({option:ref.id,slot:s.slot});else if(borrow||pos||r.length>1)intent.takes.push({slot:s.slot,from:ref.id,resolved:true});else intent.likes.push({option:ref.id,slot:s.slot});}
  const free=r.filter(x=>!used.has(x.pos));
  for(const ref of free){if(!ref.id){intent.unresolved.push(ref.raw);continue;}
   // "con x cosa de la segunda": a borrow without a known slot needs clarification.
   const between=clause.slice(0,ref.pos).match(/\b(?:con|with|usa|use|toma|take)\s+(?:el|la|los|las|lo|the|un|una|esa|ese|eso)?\s*([\p{L}\s]{1,40}?)\s+(?:de|del|from|of)\s+(?:la|el|the)?\s*$/u);
   if(between&&borrow){intent.takes.push({slot:between[1].trim(),from:ref.id,resolved:false});intent.unresolved.push(between[1].trim());continue;}
   if(neg)intent.dislikes.push({option:ref.id});else intent.likes.push({option:ref.id});}
  if(slots.length)lastSlot=slots.at(-1)!.slot;
  if(neg)negativeSeen=true;
  const recognized=/\b(combinalos|combinala|combinalas|combina|mezcla|mezclalos|junta|juntalos|une|unelos|combine|merge|mix|hazlo|do it|ok|vale|listo|gracias|thanks|por favor|please)\b/.test(clause);
  if(!r.length&&!slots.length&&!adjusted&&!keep&&!regen&&!recognized&&!neg&&!/\b(ninguno|ninguna|none|neither)\b/.test(clause)&&clause.length>3&&!POSITIVE.test(clause))intent.unresolved.push(raw);
 }
 // Base: first whole-option like; otherwise the first liked/borrowed option.
 intent.base=intent.likes.find(l=>!l.slot)?.option??intent.likes[0]?.option??intent.takes[0]?.from;
 // A liked slot of another option is a borrow ("la cola de la A" while B is the base).
 for(const l of intent.likes)if(l.slot&&l.option&&l.option!==intent.base&&!intent.takes.some(t=>t.slot===l.slot))intent.takes.push({slot:l.slot,from:l.option,resolved:true});
 if(intent.base)intent.takes=intent.takes.filter(t=>!(t.from===intent.base&&intent.likes.some(l=>l.option===t.from&&!l.slot)));
 const pos=intent.likes.length+intent.takes.length,negs=intent.dislikes.length+(intent.kind==='reject'||negativeSeen?1:0);intent.sentiment=pos&&negs?'mixed':pos?'positive':negs?'negative':'neutral';
 if(intent.count!==undefined)intent.kind='regenerate';
 else if(intent.takes.length)intent.kind='combine';
 else if(intent.adjustments.length)intent.kind='adjust';
 else if(intent.kind==='reject'){}
 else if(intent.likes.some(l=>!l.slot)&&!intent.dislikes.length)intent.kind='choose';
 else if(intent.likes.length)intent.kind='combine';
 else if(intent.keep.length)intent.kind='keep-original';
 else if(intent.kind==='comment'&&/\?\s*$/.test(text))intent.kind='question';
 const unresolvedTakes=intent.takes.filter(t=>!t.resolved);
 if(unresolvedTakes.length)intent.clarification=`¿Qué parte de la opción ${unresolvedTakes[0].from} quieres usar? Puedo tomar: ${[...new Set(['boca','ojos','cejas','orejas',...knownSlots])].slice(0,8).join(', ')}.`;
 else if(intent.unresolved.some(u=>/^[A-F1-6]$|primer|segund|tercer|cuart|quint|sext|ultim/i.test(strip(u))))intent.clarification=`No encuentro la opción «${intent.unresolved[0]}»: hay ${n} opciones (${options.map(o=>o.id).join(', ')}).`;
 else if(intent.kind==='comment'&&!intent.dislikes.length)intent.clarification='No identifiqué una opción, parte o ajuste concreto. ¿Qué te gustaría cambiar?';
 intent.confidence=Number(Math.max(.05,intent.confidence-.25*intent.unresolved.length-(intent.kind==='comment'?.5:0)-(intent.clarification?.2:0)).toFixed(2));
 const name=(id?:string)=>id?`opción ${id}`:'la versión actual';
 if(intent.kind==='choose')intent.plan.push(`Aplicar ${name(intent.base)} tal como está (requiere confirmación del usuario).`);
 if(intent.kind==='combine'){intent.plan.push(`Partir de ${name(intent.base)}.`);for(const t of intent.takes)intent.plan.push(t.resolved?`Tomar ${t.slot} de ${name(t.from)}.`:`Pendiente: aclarar «${t.slot}» de ${name(t.from)}.`);}
 for(const a of intent.adjustments)intent.plan.push(`${a.property==='direction'?'Cambiar dirección':`Escalar ${a.property}${a.emotion?' '+a.emotion:''}`}${a.slot?` de ${a.slot}`:''}${a.property==='direction'?` hacia (${a.direction!.x},${a.direction!.y})`:` ×${a.amount}`}.`);
 for(const k of intent.keep)intent.plan.push(`Conservar ${k} original en todas las alternativas.`);
 if(intent.kind==='reject')intent.plan.push('Descartar las opciones actuales sin aplicar ninguna.');
 if(intent.kind==='regenerate')intent.plan.push(`Generar ${intent.count} alternativas nuevas${intent.keep.length?` respetando ${intent.keep.join(', ')}`:''}.`);
 if(intent.kind==='revert')intent.plan.push('Comparar con revisiones anteriores y proponer volver a la versión previa de esa parte.');
 if(intent.clarification)intent.plan.push(`Preguntar: ${intent.clarification}`);
 return intent;
}
