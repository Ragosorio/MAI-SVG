import type {VectorDocument} from './document.js';
import {detect} from './detectors.js';
// State signals for an agent deciding what to do next (Impeccable's `signals` idea). Suggestions, never auto-run.
export function signals(model:VectorDocument,session:{choice:string|null;openComments:number;inboxSeq:number}){
 const p=model.project,nodes=p.semantic?.nodes??[],audit=detect(model);const next:{tool:string;reason:string}[]=[];
 if(session.openComments)next.push({tool:'comments.list',reason:`${session.openComments} comentarios del usuario sin responder.`});
 if(session.choice==='pending')next.push({tool:'choices.inspect',reason:'Hay un tablero de opciones pendiente: espera la elección o interpreta el feedback del usuario.'});
 if(!nodes.length)next.push({tool:'part.candidates',reason:'La escena no tiene partes semánticas: identifica cabeza/ojos/boca/etc. con el usuario antes de editar.'});
 else if(nodes.some(n=>n.status==='proposed'))next.push({tool:'part.candidates',reason:'Hay partes propuestas sin confirmar.'});
 if(nodes.some(n=>/^(eye|mouth|nose)/.test(n.role))&&!nodes.some(n=>n.protection?.length))next.push({tool:'identity.preserve',reason:'Facciones sin protección: decide niveles antes de animar.'});
 if(nodes.some(n=>n.role==='mouth'||n.role.startsWith('eye'))&&!(p.expression?.features??[]).length)next.push({tool:'expression.rig',reason:'Hay facciones etiquetadas pero ningún rasgo expresivo: crea el rig para expresiones paramétricas.'});
 if(audit.summary.errors)next.push({tool:'audit',reason:`${audit.summary.errors} errores deterministas en la escena.`});
 return {schemaVersion:1,revision:p.revision,state:{parts:nodes.length,confirmed:nodes.filter(n=>n.status==='confirmed').length,protected:nodes.filter(n=>n.protection?.length).length+(p.identity?.ids.length??0),expressionFeatures:(p.expression?.features??[]).length,modifiers:(p.modifiers??[]).length,tracks:p.tracks.length,choice:session.choice,openComments:session.openComments,inboxSeq:session.inboxSeq,audit:audit.summary},next:next.slice(0,4)};
}
