const fs=require('fs');
const path=require('path');
const OUT=path.resolve(__dirname,'..');
const state=JSON.parse(fs.readFileSync(path.join(__dirname,'state.json'),'utf8'));
const nodes=new Map();let serial=0;
const styleSpecs={display:[48,'ExtraBold',54],h1:[30,'ExtraBold',36],h2:[24,'Bold',30],h3:[18,'Bold',24],body:[15,'Regular',22],label:[15,'Bold',20],small:[12,'Medium',18],micro:[10,'Bold',14]};
const styles=new Map(Object.entries(state.styles).map(([k,id])=>[id,styleSpecs[k]]));
/**
 * Minimal in-memory adapter for the authored Figma scripts.
 * It supports only the geometry used by this proposal; it is not a Figma API emulator
 * or application runtime. Native Figma layout must still be validated after upload.
 */
class Node {
 constructor(type,id){this.type=type;this.id=id||'local:'+ ++serial;this.children=[];this.x=0;this.y=0;this.width=100;this.height=100;this.fills=[];this.layoutMode='NONE';this.primaryAxisSizingMode='FIXED';this.counterAxisSizingMode='FIXED';this.name='';this.fontName={family:'Manrope',style:'Regular'};nodes.set(this.id,this);}
 resize(w,h){this.width=w;this.height=h;}
 resizeWithoutConstraints(w,h){this.resize(w,h);}
 appendChild(n){if(n.parent)n.parent.children=n.parent.children.filter(c=>c!==n);this.children.push(n);n.parent=this;}
 insertChild(i,n){if(n.parent)n.parent.children=n.parent.children.filter(c=>c!==n);this.children.splice(i,0,n);n.parent=this;}
 setBoundVariable(){}
 async setTextStyleIdAsync(id){const [size,weight,line]=styles.get(id);this.fontSize=size;this.fontName.style=weight;this.lineHeight=line;this.height=line;}
 addComponentProperty(k,type,v){this.props||={};const id=k+'#'+this.id;this.props[id]={type,value:v};return id;}
 get componentProperties(){return this.props||{};}
 setProperties(values){for(const [key,value]of Object.entries(values)){this.props[key].value=value;for(const c of this.findAll(n=>n.type==='TEXT'))if(c.componentPropertyReferences?.characters===key)c.characters=value;}}
 createInstance(){const clone=n=>{const c=new Node(n.type==='COMPONENT'?'INSTANCE':n.type);for(const k of Object.keys(n))if(!['id','parent','children'].includes(k))c[k]=structuredClone(n[k]);for(const child of n.children)c.appendChild(clone(child));return c;};return clone(this);}
 findAll(fn){return this.children.flatMap(n=>[...(fn(n)?[n]:[]),...n.findAll(fn)]);}
 findAllWithCriteria({types}){return this.findAll(n=>types.includes(n.type));}
 async setReactionsAsync(r){this.reactions=r;}
}
const root=new Node('DOCUMENT','root');for(const [name,id]of Object.entries(state.pages)){const p=new Node('PAGE',id);p.name=name;root.appendChild(p);}
for(const [name,id]of Object.entries(state.frames)){const n=new Node('FRAME',id);n.name=name;n.resize(1560,name==='cover'?900:1250);nodes.get(state.pages.kit).appendChild(n);}
const figma={root,currentPage:nodes.get(state.pages.kit),loadFontAsync:async()=>{},setCurrentPageAsync:async p=>{figma.currentPage=p;},getNodeByIdAsync:async id=>nodes.get(id),variables:{getVariableByIdAsync:async id=>({id}),setBoundVariableForPaint:p=>p},combineAsVariants:(cs,p)=>{const n=new Node('COMPONENT_SET');p.appendChild(n);for(const c of cs)n.appendChild(c);return n;},createAutoLayout:dir=>{const n=new Node('FRAME');n.layoutMode=dir;return n;},createNodeFromSvg:svg=>{const n=new Node('SVG');n.svg=svg;return n;}};
for(const [method,type]of Object.entries({createFrame:'FRAME',createComponent:'COMPONENT',createText:'TEXT',createRectangle:'RECTANGLE',createEllipse:'ELLIPSE',createSection:'SECTION'}))figma[method]=()=>new Node(type);
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const helpers=fs.readFileSync(path.join(__dirname,'helpers.js'),'utf8');
async function run(file){return new AsyncFunction('figma','S',helpers+'\n'+fs.readFileSync(path.join(__dirname,file),'utf8'))(figma,state);}
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function paint(p){if(!p)return'transparent';const c=p.color;return 'rgb('+[c.r,c.g,c.b].map(x=>Math.round(x*255)).join(',')+')';}
/** Render the saved design tree using browser flex layout; no app services or user data are accessed. */
function render(n,parentLayout='NONE'){
 const css=['box-sizing:border-box','flex-shrink:0'];const auto=n.layoutMode!=='NONE';
 if(parentLayout==='NONE')css.push('position:absolute','left:'+n.x+'px','top:'+n.y+'px');else css.push('position:relative');
 if(n.type==='TEXT'){const fixed=n.textAutoResize==='HEIGHT';css.push('width:'+(fixed?n.width+'px':'max-content'),'height:auto','font-size:'+n.fontSize+'px','font-weight:'+({ExtraBold:800,Bold:700,SemiBold:600,Medium:500,Regular:400}[n.fontName.style]||400),'line-height:'+n.lineHeight+'px','color:'+paint(n.fills[0]),'white-space:pre-wrap');}
 else{css.push('width:'+(auto&&n.layoutMode==='HORIZONTAL'&&n.primaryAxisSizingMode==='AUTO'?'max-content':n.width+'px'));css.push('height:'+(auto&&(n.layoutMode==='VERTICAL'&&n.primaryAxisSizingMode==='AUTO'||n.layoutMode==='HORIZONTAL'&&n.counterAxisSizingMode==='AUTO')?'auto':n.height+'px'));}
 if(auto){css.push('display:flex','flex-direction:'+(n.layoutMode==='VERTICAL'?'column':'row'),'gap:'+(n.itemSpacing||0)+'px','padding:'+(n.paddingTop||0)+'px '+(n.paddingRight||0)+'px '+(n.paddingBottom||0)+'px '+(n.paddingLeft||0)+'px','align-items:'+({CENTER:'center',MAX:'flex-end',MIN:'flex-start'}[n.counterAxisAlignItems]||'flex-start'),'justify-content:'+({CENTER:'center',SPACE_BETWEEN:'space-between',MAX:'flex-end'}[n.primaryAxisAlignItems]||'flex-start'));}
 if(n.layoutAlign)css.push('align-self:'+({MAX:'flex-end',CENTER:'center'}[n.layoutAlign]||'auto'));
 if(n.type!=='TEXT')css.push('background:'+paint(n.fills[0]));
 if(n.strokes?.length)css.push('border:'+(n.strokeWeight||1)+'px solid '+paint(n.strokes[0]));
 if(n.cornerRadius||n.type==='ELLIPSE')css.push('border-radius:'+(n.type==='ELLIPSE'?'50%':n.cornerRadius+'px'));
 if(n.clipsContent)css.push('overflow:hidden');if(n.opacity!=null)css.push('opacity:'+n.opacity);
 const target=n.name.match(/ → (\d+)$/)?.[1];
 if(target)css.push('cursor:pointer');
 return '<div class="n" data-kind="'+n.type+'" data-name="'+esc(n.name)+'"'+(target?' data-target="'+target+'" tabindex="0" role="button"':'')+' style="'+css.join(';')+'">'+(n.type==='SVG'?n.svg.replace(/width="\d+" height="\d+"/,'width="100%" height="100%"'):n.type==='TEXT'?esc(n.characters):n.children.map(c=>render(c,n.layoutMode)).join(''))+'</div>';
}
(async()=>{await run('kit.js');const journey=await run('journey.js');const support=await run('states.js');const screens=[...Object.entries(journey.screens),...Object.entries(support.screens)].sort((a,b)=>+a[0]-+b[0]);
 const fragments=screens.map(([key,id])=>{const n=nodes.get(id);n.x=0;n.y=0;return '<article id="screen-'+key+'" data-screen="'+key+'"><h2>'+esc(n.name)+'</h2><div class="phone">'+render(n)+'</div><button onclick="downloadScreen(\''+key+'\')">Download editable SVG</button></article>';}).join('');
 const brand=nodes.get(state.frames.cover);brand.x=0;brand.y=0;
 const html='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Along — Mobile MVP design review</title><style>*{box-sizing:border-box}body{margin:0;background:#eaf2e9;color:#123c38;font-family:"Manrope","Avenir Next",Arial,sans-serif}header{padding:40px;max-width:1400px;margin:auto}h1{font-size:44px;margin:0 0 12px}header p{max-width:900px;line-height:1.6}a{color:#146b59}nav{display:flex;flex-wrap:wrap;gap:8px}nav a,button{border:0;background:#123c38;color:#fff;padding:12px 16px;border-radius:10px;text-decoration:none;font:600 13px inherit;cursor:pointer}.gallery{display:grid;grid-template-columns:repeat(auto-fit,390px);gap:48px 32px;justify-content:center;padding:0 24px 80px}article{width:390px;scroll-margin-top:24px}article h2{font-size:16px;height:40px}article:target{outline:4px solid #146b59;outline-offset:14px;border-radius:12px}.phone{width:390px;height:844px;position:relative;filter:drop-shadow(0 8px 20px #123c3815)}article>button{margin-top:16px;background:#fff;color:#123c38}.n svg{display:block}.brand{position:relative;width:1560px;height:900px;transform-origin:top left}.brand-wrap{width:calc(100% - 48px);max-width:1248px;height:720px;overflow:hidden;margin:0 auto 48px}.brand{transform:scale(.8)}@media(max-width:800px){.brand-wrap{display:none}header{padding:24px}h1{font-size:32px}}@media print{header,nav,article>button,.brand-wrap{display:none}.gallery{display:block;padding:0}article{break-after:page;margin:auto}.phone{filter:none}}</style><header><p>DESIGN CONCEPT · 03 OCTOBER 2026</p><h1>Good company. Same direction.</h1><p><b>Along</b> is a provisional brand for Ride Match. This local review covers the full mobile MVP. Buttons jump between illustrated states; forms, timers, permissions and external apps are simulated. <a href="https://www.figma.com/design/y6N9BYkaqf4gOZlBUiJfvA">The Figma file</a> currently contains the brand kit and screens 01–20; further publishing was blocked by its Starter MCP quota.</p><p>Editable SVG exports retain text and vectors, but do not contain Figma components or prototype wiring. Local typography uses Manrope when installed, otherwise Avenir Next / Arial. Map artwork is illustrative.</p><nav><a href="#screen-01">Start journey</a><a href="#screen-21">Location & errors</a><a href="#screen-32">Coordinator</a><a href="#screen-40">Settings & safety</a></nav></header><div class="brand-wrap"><div class="brand">'+render(brand)+'</div></div><main class="gallery">'+fragments+'</main><script>'+fs.readFileSync(path.join(__dirname,'preview-runtime.js'),'utf8')+'</script></html>';
 fs.writeFileSync(path.join(OUT,'index.html'),html);fs.writeFileSync(path.join(OUT,'screen-index.json'),JSON.stringify(screens.map(([key,id])=>({key,name:nodes.get(id).name})),null,2));console.log('Rendered '+screens.length+' screens.');await require('./export-svg.cjs')(screens,nodes,brand,OUT);
})();
