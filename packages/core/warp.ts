import {segments,pathData,type Point} from './geometry.js';
import type {Region} from './model.js';
// Moving Least Squares rigid deformation (Schaefer, McPhail & Warren 2006). Handles p→q; every other point
// follows the locally best rigid transform, so artwork bends without shearing or recoloring.
export type Handle={p:Point;q:Point};
export function mlsRigid(handles:Handle[],v:Point,alpha=1):Point{
 let sw=0,px=0,py=0,qx=0,qy=0;const w=new Float64Array(handles.length);
 for(let i=0;i<handles.length;i++){const h=handles[i],dx=h.p.x-v.x,dy=h.p.y-v.y,d2=dx*dx+dy*dy;if(d2<1e-12)return {x:h.q.x,y:h.q.y};w[i]=1/Math.pow(d2,alpha);sw+=w[i];px+=w[i]*h.p.x;py+=w[i]*h.p.y;qx+=w[i]*h.q.x;qy+=w[i]*h.q.y;}
 px/=sw;py/=sw;qx/=sw;qy/=sw;const dx=v.x-px,dy=v.y-py;let fx=0,fy=0;
 for(let i=0;i<handles.length;i++){const Px=handles[i].p.x-px,Py=handles[i].p.y-py,Qx=handles[i].q.x-qx,Qy=handles[i].q.y-qy,a=Px*dx+Py*dy,b=Px*dy-Py*dx;fx+=w[i]*(Qx*a-Qy*b);fy+=w[i]*(Qx*b+Qy*a);}
 const len=Math.hypot(fx,fy),dl=Math.hypot(dx,dy);if(len<1e-12)return {x:v.x+qx-px,y:v.y+qy-py};return {x:dl*fx/len+qx,y:dl*fy/len+qy};
}
export function regionBounds(r:Region){if(r.kind==='ellipse')return {x:r.cx-r.rx,y:r.cy-r.ry,width:2*r.rx,height:2*r.ry};if(r.kind==='rect')return {x:r.x,y:r.y,width:r.width,height:r.height};const xs=r.points.map(p=>p.x),ys=r.points.map(p=>p.y);return {x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};}
export function regionPath(r:Region){if(r.kind==='ellipse')return `M${r.cx-r.rx} ${r.cy}A${r.rx} ${r.ry} 0 1 0 ${r.cx+r.rx} ${r.cy}A${r.rx} ${r.ry} 0 1 0 ${r.cx-r.rx} ${r.cy}Z`;if(r.kind==='rect')return `M${r.x} ${r.y}H${r.x+r.width}V${r.y+r.height}H${r.x}Z`;return 'M'+r.points.map(p=>`${p.x} ${p.y}`).join('L')+'Z';}
export function insideRegion(r:Region,p:Point){if(r.kind==='ellipse')return ((p.x-r.cx)/r.rx)**2+((p.y-r.cy)/r.ry)**2<=1;if(r.kind==='rect')return p.x>=r.x&&p.x<=r.x+r.width&&p.y>=r.y&&p.y<=r.y+r.height;let inside=false;const q=r.points;for(let i=0,j=q.length-1;i<q.length;j=i++)if((q[i].y>p.y)!==(q[j].y>p.y)&&p.x<(q[j].x-q[i].x)*(p.y-q[i].y)/(q[j].y-q[i].y)+q[i].x)inside=!inside;return inside;}
// Boundary pins keep the seam with untouched artwork invisible.
export function boundaryPins(r:Region,count=24,inflate=1):Point[]{
 if(r.kind==='ellipse')return Array.from({length:count},(_,i)=>{const a=2*Math.PI*i/count;return {x:r.cx+r.rx*inflate*Math.cos(a),y:r.cy+r.ry*inflate*Math.sin(a)};});
 const poly=r.kind==='rect'?[{x:r.x,y:r.y},{x:r.x+r.width,y:r.y},{x:r.x+r.width,y:r.y+r.height},{x:r.x,y:r.y+r.height}]:r.points;
 const lengths=poly.map((p,i)=>Math.hypot(poly[(i+1)%poly.length].x-p.x,poly[(i+1)%poly.length].y-p.y)),total=lengths.reduce((a,b)=>a+b,0),pins:Point[]=[];
 for(let k=0;k<count;k++){let t=total*k/count,i=0;while(t>lengths[i]){t-=lengths[i];i++;}const a=poly[i],b=poly[(i+1)%poly.length],u=lengths[i]?t/lengths[i]:0;pins.push({x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u});}
 return pins;
}
export function warpPath(d:string,handles:Handle[]){if(!handles.some(h=>h.p.x!==h.q.x||h.p.y!==h.q.y))return d;const data=segments(d);for(const s of data)s.points=s.points.map(p=>mlsRigid(handles,p));return pathData(data);}
// Jacobian sign check on a grid: a negative determinant means the warp folds artwork over itself.
export function foldReport(handles:Handle[],bounds:{x:number;y:number;width:number;height:number},steps=16){
 let minDet=Infinity,folds=0;const h=Math.max(bounds.width,bounds.height)/steps/4||1;
 for(let i=0;i<=steps;i++)for(let j=0;j<=steps;j++){const v={x:bounds.x+bounds.width*i/steps,y:bounds.y+bounds.height*j/steps},a=mlsRigid(handles,{x:v.x-h,y:v.y}),b=mlsRigid(handles,{x:v.x+h,y:v.y}),c=mlsRigid(handles,{x:v.x,y:v.y-h}),e=mlsRigid(handles,{x:v.x,y:v.y+h});const det=((b.x-a.x)*(e.y-c.y)-(b.y-a.y)*(e.x-c.x))/(4*h*h);minDet=Math.min(minDet,det);if(det<=0.05)folds++;}
 return {minJacobian:Number(minDet.toFixed(4)),folds,samples:(steps+1)**2};
}
