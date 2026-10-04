/**
 * Figma construction helpers for the Along proposal.
 * Execute inside use_figma with the saved state S; preload fonts before changing text.
 * All names, messages and places in the design are synthetic or public landmarks.
 * Layout values here describe a design concept, not implemented mobile behavior.
 */
const made=[]; const links=[]; const screenshots=[];
const C={ink:'#123C38',muted:'#586D68',teal:'#146B59',lime:'#DDF5A0',paper:'#F7F8F2',white:'#FFFFFF',line:'#DCE4DC',soft:'#EAF2E9',danger:'#AD3E36',dangerSoft:'#FFF0EC',amber:'#8A5B14',amberSoft:'#FFF3D4',map:'#EBEEE5',park:'#D4E3C3',water:'#CBE3E8'};
await Promise.all(['Regular','Medium','SemiBold','Bold','ExtraBold'].map(style=>figma.loadFontAsync({family:'Manrope',style})));
const V={};for(const [k,id] of Object.entries(S.vars))V[k]=await figma.variables.getVariableByIdAsync(id);
function rgb(h){return {r:parseInt(h.slice(1,3),16)/255,g:parseInt(h.slice(3,5),16)/255,b:parseInt(h.slice(5,7),16)/255};}
function fill(k){return figma.variables.setBoundVariableForPaint({type:'SOLID',color:rgb(C[k])},'color',V[k]);}
function track(n){made.push(n.id);return n;}
function put(p,n,x=0,y=0){p.appendChild(n);if(p.layoutMode==='NONE'||p.type==='PAGE'){n.x=x;n.y=y;}return n;}
function box(p,name,w,h,color='white',r=0,x=0,y=0){const n=track(figma.createFrame());n.name=name;n.resize(w,h);n.fills=color?[fill(color)]:[];n.clipsContent=false;if(r){n.cornerRadius=r;if(V['radius'+r])n.setBoundVariable('cornerRadius',V['radius'+r]);}return put(p,n,x,y);}
function stack(p,name,w,gap=12,pad=0,color=null,dir='VERTICAL',x=0,y=0){const n=track(figma.createAutoLayout(dir));n.name=name;n.resize(w,1);n.primaryAxisSizingMode=dir==='VERTICAL'?'AUTO':'FIXED';n.counterAxisSizingMode=dir==='VERTICAL'?'FIXED':'AUTO';n.itemSpacing=gap;n.paddingTop=pad;n.paddingBottom=pad;n.paddingLeft=pad;n.paddingRight=pad;n.fills=color?[fill(color)]:[];if(V['space'+gap])n.setBoundVariable('itemSpacing',V['space'+gap]);if(V['space'+pad])for(const k of ['paddingTop','paddingBottom','paddingLeft','paddingRight'])n.setBoundVariable(k,V['space'+pad]);put(p,n,x,y);return n;}
async function txt(p,s,style='body',color='ink',w=null,x=0,y=0){const n=track(figma.createText());n.name=s.slice(0,60);await n.setTextStyleIdAsync(S.styles[style]);n.characters=s;n.fills=[fill(color)];n.textAutoResize='WIDTH_AND_HEIGHT';if(w){n.textAutoResize='HEIGHT';n.resize(w,n.height);}put(p,n,x,y);return n;}
function rect(p,w,h,color,r=0,x=0,y=0){const n=track(figma.createRectangle());n.resize(w,h);n.fills=[fill(color)];n.cornerRadius=r;return put(p,n,x,y);}
function circle(p,d,color,x=0,y=0){const n=track(figma.createEllipse());n.resize(d,d);n.fills=[fill(color)];return put(p,n,x,y);}
const paths={
arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
back:'<path d="m14 5-7 7 7 7"/>',
close:'<path d="m6 6 12 12M6 18 18 6"/>',
search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
pin:'<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>',
users:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-3a6 6 0 0 1 12 0v3m1-15a3 3 0 0 1 0 6m1 3c3 0 4 2 4 5"/>',
chat:'<path d="M4 4h16v12H9l-5 4Z"/><path d="M8 8h8M8 12h5"/>',
shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
check:'<path d="m5 12 5 5L20 7"/>',
clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
locate:'<circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/><path d="M12 1v5m0 12v5M1 12h5m12 0h5"/>',
sliders:'<path d="M5 3v4m0 4v10M12 3v10m0 4v4M19 3v4m0 4v10M2 7h6m1 10h6m1-10h6"/>',
bell:'<path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5Zm5 3h4"/>',
more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
warning:'<path d="m12 3 10 18H2Z"/><path d="M12 9v5m0 3v1"/>',
car:'<path d="m5 8 2-5h10l2 5m-16 1h18v10H3Zm3 10v2m12-2v2M6 13h2m8 0h2"/>',
list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h1m-1 6h1m-1 6h1"/>',
send:'<path d="m3 3 19 9-19 9 4-9Zm4 9h15"/>',
exit:'<path d="M9 3H3v18h6m4-14 5 5-5 5m-6-5h15"/>',
wifi:'<path d="M3 8a14 14 0 0 1 18 0M6 12a9 9 0 0 1 12 0m-9 4a4 4 0 0 1 6 0M12 20h.01"/>'
};
function icon(p,key,color='ink',size=24,x=0,y=0){const n=track(figma.createNodeFromSvg('<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="'+C[color]+'" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+paths[key]+'</svg>'));n.name='Icon / '+key;n.resize(size,size);return put(p,n,x,y);}
function roundIcon(p,key,color='ink',bg='soft',d=48,x=0,y=0){const f=box(p,'Control / '+key,d,d,bg,16,x,y);icon(f,key,color,22,(d-22)/2,(d-22)/2);return f;}
function border(n,color='line'){n.strokes=[fill(color)];n.strokeWeight=1;}
function action(n,target){n.name+=' → '+target;links.push({id:n.id,target});return n;}
async function instance(p,key,label,w=342){const c=await figma.getNodeByIdAsync(S.components[key]);const n=track(c.createInstance());put(p,n);if(label!=null){const k=Object.keys(n.componentProperties).find(k=>k.startsWith('Label#'));if(k)n.setProperties({[k]:label});}if(w)n.resize(w,n.height);return n;}
async function button(p,label,target,variant='Primary',w=342){const n=await instance(p,'button'+variant,label,w);if(target)action(n,target);return n;}
async function badge(p,label,type='Neutral'){return await instance(p,'badge'+type,label,null);}
async function row(p,title,detail,ico='pin',target=null){const r=stack(p,title,342,12,0,null,'HORIZONTAL');r.counterAxisAlignItems='CENTER';roundIcon(r,ico,'ink','soft',44);const s=stack(r,'Copy',244,3);await txt(s,title,'label','ink',244);if(detail)await txt(s,detail,'small','muted',244);if(target)action(r,target);return r;}
async function note(p,s,type='soft'){const n=stack(p,'Notice',342,8,12,type);n.cornerRadius=12;await txt(n,s,'small',type==='dangerSoft'?'danger':type==='amberSoft'?'amber':'muted',318);return n;}
async function title(p,a,b){await txt(p,a,'h2','ink',342);if(b)await txt(p,b,'body','muted',342);}
async function card(p,name='Card'){const c=stack(p,name,342,12,16,'white');c.cornerRadius=16;border(c);return c;}
async function status(p){const r=stack(p,'Status bar',342,8,0,null,'HORIZONTAL',24,16);r.primaryAxisAlignItems='SPACE_BETWEEN';r.counterAxisAlignItems='CENTER';await txt(r,'9:41','small');await txt(r,'▮▮▮  5G  ▰','small');}
async function nav(p,label,back='02',more=null){const r=stack(p,'Navigation',342,12,0,null,'HORIZONTAL',24,60);r.counterAxisAlignItems='CENTER';action(roundIcon(r,'back','ink','white',44),back);await txt(r,label,'label','ink',more?218:238);if(more)action(roundIcon(r,'more','ink','white',44),more);}
async function homebar(p){rect(p,120,4,'ink',2,135,827);}
async function marker(p,label,type,x,y,target=null){const n=await instance(p,'marker'+type,label,null);n.x=x;n.y=y;if(target)action(n,target);return n;}
async function map(p,mode='active'){const n=await instance(p,'map',null,390);p.insertChild(0,n);n.x=0;n.y=0;if(mode==='active'||mode==='match'||mode==='preview'){circle(p,30,'white',146,382);circle(p,16,'teal',153,389);circle(p,6,'white',158,394);}if(mode==='active'||mode==='match'||mode==='preview'){await marker(p,'Asia Mall · ~350 m',mode!=='active'?'Excellent':'Default',30,251,'05');await marker(p,'Group · 3/4','Group',210,360,'19');await marker(p,'Dordoi · ~800 m','Default',82,430,'05');}if(mode==='match'){await marker(p,'You','Own',265,300); }return n;}
async function mapHeader(p,query='Where are you heading?'){const h=stack(p,'Floating header',342,12,0,null,'VERTICAL',24,61);const top=stack(h,'Identity',342,8,0,null,'HORIZONTAL');top.primaryAxisAlignItems='SPACE_BETWEEN';await txt(top,'along','h2');await badge(top,'DEMO','Neutral');const r=stack(h,'Destination search',342,12,16,'white','HORIZONTAL');r.cornerRadius=16;icon(r,'search');await txt(r,query,'label','ink',270);action(r,'03');action(roundIcon(p,'sliders','ink','white',44,322,192),'40');}
async function sheet(p,y=540){const s=stack(p,'Map sheet',390,16,24,'white','VERTICAL',0,y);s.cornerRadius=32;s.paddingTop=12;const handle=rect(s,36,4,'line',2);handle.layoutAlign='CENTER';return s;}
async function phone(parent,key,name){const f=box(parent,key+' · '+name,390,844,'paper',32);f.clipsContent=true;await status(f);await homebar(f);return f;}
async function body(p,label,back='02',more=null){await nav(p,label,back,more);return stack(p,'Screen content',342,18,0,null,'VERTICAL',24,127);}
async function footer(p,label,target,secondary=null,secondaryTarget=null,variant='Primary'){const f=stack(p,'Bottom actions',342,10,0,null,'VERTICAL',24,secondary?679:731);await button(f,label,target,variant);if(secondary)await button(f,secondary,secondaryTarget,'Ghost');return f;}
async function field(p,label,value){const f=stack(p,label,342,8);await txt(f,label,'small','muted');const b=stack(f,'Input',342,8,16,'white','HORIZONTAL');b.cornerRadius=16;border(b);await txt(b,value,'body','ink',310);return b;}
function allIds(root){return [root.id,...root.findAll(()=>true).map(n=>n.id)];}
