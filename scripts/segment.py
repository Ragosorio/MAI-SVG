"""Local GrabCut-assisted segmentation. Rectangles are hints, not semantic inference."""
import cv2, numpy as np, json, sys, pathlib
image=cv2.imread(sys.argv[1],cv2.IMREAD_UNCHANGED)
if image is None: raise ValueError('Cannot decode image')
if image.ndim==2:image=cv2.cvtColor(image,cv2.COLOR_GRAY2BGRA)
if image.shape[2]==3:image=cv2.cvtColor(image,cv2.COLOR_BGR2BGRA)
h,w=image.shape[:2]
if w*h>4_000_000:raise ValueError('Image exceeds 4 million pixels')
config=json.loads(pathlib.Path(sys.argv[2]).read_text())
regions=config.get('regions',[])
if not 1<=len(regions)<=16:raise ValueError('Provide 1-16 named rectangle hints')
output=[]
for r in regions:
 x,y,rw,rh=[int(r[k]) for k in ['x','y','width','height']]
 if min(x,y)<0 or min(rw,rh)<3 or x+rw>w or y+rh>h:raise ValueError('Rectangle outside image')
 mask=np.zeros((h,w),np.uint8);mask[y:y+rh,x:x+rw]=cv2.GC_PR_FGD
 mask[image[:,:,3]<8]=cv2.GC_BGD
 # A definite foreground seed prevents all-background solutions in textured characters.
 visible=np.argwhere(image[y:y+rh,x:x+rw,3]>=128)
 if len(visible):
  nearest=visible[np.argmin((visible[:,0]-rh/2)**2+(visible[:,1]-rw/2)**2)]
  cy,cx=y+int(nearest[0]),x+int(nearest[1]);seed=np.zeros((h,w),np.uint8);cv2.circle(seed,(cx,cy),4,255,-1);mask[(seed>0)&(image[:,:,3]>=128)&(mask==cv2.GC_PR_FGD)]=cv2.GC_FGD
 if r.get('mode','grabcut')=='rectangle':selected=np.zeros((h,w),np.uint8);selected[y:y+rh,x:x+rw]=255
 else:
  cv2.grabCut(image[:,:,:3].copy(),mask,None,np.zeros((1,65),np.float64),np.zeros((1,65),np.float64),3,cv2.GC_INIT_WITH_MASK)
  selected=np.where((mask==cv2.GC_FGD)|(mask==cv2.GC_PR_FGD),255,0).astype('uint8')
 contours,_=cv2.findContours(selected,cv2.RETR_LIST,cv2.CHAIN_APPROX_SIMPLE)
 paths=[];points=0
 for contour in contours:
  if cv2.contourArea(contour)<float(r.get('minArea',8)):continue
  contour=cv2.approxPolyDP(contour,.35,True).reshape(-1,2)
  points+=len(contour)
  if points>10000:raise ValueError('Region exceeds 10000 contour points')
  if len(contour)>=3:paths.append('M'+'L'.join(f'{a},{b}'for a,b in contour)+'Z')
 if not paths:raise ValueError('No foreground found: adjust rectangle hint')
 output.append({'id':r['id'],'name':r.get('name',r['id']),'d':''.join(paths),'hint':{'x':x,'y':y,'width':rw,'height':rh},'pixels':int(np.count_nonzero(selected)),'needsReview':True})
print(json.dumps({'schemaVersion':1,'width':w,'height':h,'engine':'OpenCV GrabCut / contours','opencvVersion':cv2.__version__,'semanticInference':False,'regions':output}))
