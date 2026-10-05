import sharp from 'sharp';
// Perceptual metrics over rendered RGBA frames. Structural validity and artistic quality stay separate categories:
// these numbers say how much changed, not whether it looks good.
export type Box={x:number;y:number;width:number;height:number};
export async function raw(png:Buffer){const {data,info}=await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true});return {data,width:info.width,height:info.height};}
const clampBox=(b:Box|undefined,w:number,h:number)=>{if(!b)return {x:0,y:0,width:w,height:h};const x=Math.max(0,Math.floor(b.x)),y=Math.max(0,Math.floor(b.y));return {x,y,width:Math.max(1,Math.min(w-x,Math.ceil(b.width))),height:Math.max(1,Math.min(h-y,Math.ceil(b.height)))};};
export function metrics(a:{data:Buffer;width:number;height:number},b:{data:Buffer;width:number;height:number},box?:Box){
 if(a.width!==b.width||a.height!==b.height)throw Error('Frames must have the same size');const r=clampBox(box,a.width,a.height);
 let mae=0,n=0,inter=0,union=0;const la=new Float64Array(r.width*r.height),lb=new Float64Array(r.width*r.height);
 for(let y=0;y<r.height;y++)for(let x=0;x<r.width;x++){const i=((r.y+y)*a.width+r.x+x)*4,A=a.data[i+3]/255,B=b.data[i+3]/255;
  const pa=[a.data[i]*A,a.data[i+1]*A,a.data[i+2]*A],pb=[b.data[i]*B,b.data[i+1]*B,b.data[i+2]*B];mae+=(Math.abs(pa[0]-pb[0])+Math.abs(pa[1]-pb[1])+Math.abs(pa[2]-pb[2])+Math.abs(a.data[i+3]-b.data[i+3]))/4;n++;
  la[y*r.width+x]=.299*pa[0]+.587*pa[1]+.114*pa[2];lb[y*r.width+x]=.299*pb[0]+.587*pb[1]+.114*pb[2];if(A>.5&&B>.5)inter++;if(A>.5||B>.5)union++;}
 return {mae:Number((mae/Math.max(1,n)).toFixed(4)),ssim:Number(ssim(la,lb,r.width,r.height).toFixed(4)),silhouetteIoU:Number((union?inter/union:1).toFixed(4)),pixels:n};
}
// Mean SSIM over 8×8 windows with stride 4 on luma (Wang et al. 2004 constants).
export function ssim(a:Float64Array,b:Float64Array,w:number,h:number){const C1=(.01*255)**2,C2=(.03*255)**2,size=Math.min(8,w,h),stride=Math.max(1,Math.floor(size/2));let total=0,count=0;
 for(let y=0;y+size<=h;y+=stride)for(let x=0;x+size<=w;x+=stride){let ma=0,mb=0;for(let j=0;j<size;j++)for(let i=0;i<size;i++){ma+=a[(y+j)*w+x+i];mb+=b[(y+j)*w+x+i];}const N=size*size;ma/=N;mb/=N;let va=0,vb=0,cov=0;
  for(let j=0;j<size;j++)for(let i=0;i<size;i++){const da=a[(y+j)*w+x+i]-ma,db=b[(y+j)*w+x+i]-mb;va+=da*da;vb+=db*db;cov+=da*db;}va/=N-1||1;vb/=N-1||1;cov/=N-1||1;total+=((2*ma*mb+C1)*(2*cov+C2))/((ma*ma+mb*mb+C1)*(va+vb+C2));count++;}
 return count?total/count:1;}
