/**
 * Exercise importer lifecycle with a deliberately small Plugin API test double.
 * These tests verify ownership, rollback and links, not native Figma rendering.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const bundle=fs.readFileSync(path.join(__dirname,'code.js'),'utf8');

function environment({missingFont=false,failAt=Infinity,failFlows=false}={}) {
  let serial=0;const nodes=new Map(),styles=new Map(),collections=new Map(),variables=new Map(),messages=[];
  let figma,flowsFailed=false;const rejectedRemovals=[],removeCalls=[];
  class Node {
    constructor(type,attach=true){this.type=type;this.id='n:'+ ++serial;this.name='';this.children=[];this.x=0;this.y=0;this.width=100;this.height=100;this.fills=[];this.layoutMode='NONE';this.fontName={family:'Manrope',style:'Regular'};nodes.set(this.id,this);if(attach)figma.currentPage.appendChild(this);}
    resize(w,h){this.width=w;this.height=h;}
    resizeWithoutConstraints(w,h){this.resize(w,h);}
    appendChild(n){if(n.parent)n.parent.children=n.parent.children.filter(c=>c!==n);this.children.push(n);n.parent=this;}
    insertChild(i,n){this.appendChild(n);this.children.pop();this.children.splice(i,0,n);}
    setBoundVariable(field,value){assert(value);this.boundVariables={...this.boundVariables,[field]:value.id};}
    async setTextStyleIdAsync(id){const style=styles.get(id);assert(style);this.fontName=style.fontName;this.height=style.lineHeight.value;}
    addComponentProperty(name,type,value){this.props||={};const key=name+'#'+this.id;this.props[key]={type,value};return key;}
    get componentProperties(){return this.props||{};}
    setProperties(values){for(const [key,value] of Object.entries(values)){assert(this.props[key]);this.props[key].value=value;for(const n of this.findAll(n=>n.type==='TEXT'))if(n.componentPropertyReferences?.characters===key)n.characters=value;}}
    createInstance(){const copy=n=>{const c=new Node(n.type==='COMPONENT'?'INSTANCE':n.type,false);for(const k of Object.keys(n))if(!['id','children','parent','removed'].includes(k))c[k]=structuredClone(n[k]);for(const child of n.children)c.appendChild(copy(child));return c;};const clone=copy(this);figma.currentPage.appendChild(clone);return clone;}
    findAll(fn){return this.children.flatMap(n=>[...(fn(n)?[n]:[]),...n.findAll(fn)]);}
    findAllWithCriteria({types}){return this.findAll(n=>types.includes(n.type));}
    getStyledTextSegments(){return [{fontName:this.fontName}];}
    async setReactionsAsync(reactions){for(const reaction of reactions){const target=nodes.get(reaction.actions[0].destinationId);assert(target);assert.equal(target.type,'FRAME');assert.equal(target.parent.type,'PAGE');}this.reactions=reactions;
      // Reactions can create a starting point before the importer names its flows.
      let source=this;while(source.parent&&source.parent.type!=='PAGE')source=source.parent;
      if(!page.flowStartingPoints.some(flow=>flow.nodeId===source.id))page.flowStartingPoints=[...page.flowStartingPoints,{nodeId:source.id,name:'Auto flow'}];
    }
    remove(){
      removeCalls.push(this.id);
      // Model constrained nested layers; removing their container remains valid.
      if(this.componentPropertyReferences||this.parent?.type==='INSTANCE'||(this.type==='COMPONENT'&&this.parent?.type==='COMPONENT_SET'&&this.parent.children.length===1)){
        rejectedRemovals.push(this.id);throw new Error('in remove: Removing this node is not allowed');
      }
      const erase=node=>{for(const child of [...node.children])erase(child);nodes.delete(node.id);node.removed=true;};erase(this);
      if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);
    }
  }
  const root=new Node('DOCUMENT',false),page=new Node('PAGE',false);root.appendChild(page);
  let flows=[];
  Object.defineProperty(page,'flowStartingPoints',{get(){return structuredClone(flows);},set(value){
    if(new Set(value.map(flow=>flow.nodeId)).size!==value.length)throw new Error('in set_flowStartingPoints: Found duplicate input nodeIds');
    if(failFlows&&!flowsFailed&&value.some(flow=>flow.name.startsWith('Along ·'))){flowsFailed=true;throw new Error('Injected flow registration failure');}
    flows=structuredClone(value);
  }});
  figma={root,currentPage:page,editorType:'figma',showUI(){},closePlugin(){},commitUndo(){},viewport:{scrollAndZoomIntoView(){}},ui:{postMessage(message){messages.push(message);}},
    listAvailableFontsAsync:async()=>['Regular','Medium','SemiBold','Bold',...(missingFont?[]:['ExtraBold'])].map(style=>({fontName:{family:'Manrope',style}})),loadFontAsync:async()=>{},
    getNodeByIdAsync:async id=>nodes.get(id)||null,getStyleByIdAsync:async id=>styles.get(id)||null,setCurrentPageAsync:async p=>{figma.currentPage=p;},
    createTextStyle(){const style={id:'style:'+ ++serial,remove(){styles.delete(this.id);}};styles.set(style.id,style);return style;},
    combineAsVariants(cs,p){const n=new Node('COMPONENT_SET');p.appendChild(n);cs.forEach(c=>n.appendChild(c));return n;},
    variables:{
      getLocalVariableCollectionsAsync:async()=>[...collections.values()],getVariableByIdAsync:async id=>variables.get(id),getVariableCollectionByIdAsync:async id=>collections.get(id),
      createVariableCollection(name){const c={id:'collection:'+ ++serial,name,defaultModeId:'mode',remove(){collections.delete(this.id);for(const [id,v] of variables)if(v.collection===this)variables.delete(id);}};collections.set(c.id,c);return c;},
      createVariable(name,collection,type){const v={id:'variable:'+ ++serial,name,collection,type,setValueForMode(mode,value){assert.equal(mode,'mode');this.value=value;},setVariableCodeSyntax(){}};variables.set(v.id,v);return v;},
      setBoundVariableForPaint(p,field,v){assert(v);return {...p,boundVariables:{[field]:v.id}};}
    }};
  for(const [method,type] of Object.entries({createFrame:'FRAME',createText:'TEXT',createComponent:'COMPONENT',createSection:'SECTION',createRectangle:'RECTANGLE',createEllipse:'ELLIPSE',createNodeFromSvg:'FRAME'}))figma[method]=()=>{if(serial>=failAt)throw new Error('Injected construction failure');return new Node(type);};
  const existing=new Node('FRAME');existing.name='User artwork';existing.x=20;existing.resize(300,200);page.flowStartingPoints=[{nodeId:existing.id,name:'User flow'}];
  vm.runInNewContext(bundle,{figma,__html__:'',console,Set,Map},{filename:'code.js'});
  return {figma,nodes,styles,collections,variables,messages,existing,rejectedRemovals,removeCalls,send:type=>figma.ui.onmessage({type}),latest:type=>messages.filter(m=>m.type===type).at(-1)};
}

(async()=>{
  const sample=environment();await sample.send('sample');assert(!sample.latest('error'),sample.latest('error')?.message);
  assert.equal(sample.latest('complete').report.screenCount,6);assert.equal(sample.latest('complete').report.components,17);
  for(const id of sample.latest('complete').report.createdNodeIds)assert(sample.nodes.has(id),'Deleted sample section retained in ownership ledger: '+id);
  assert(sample.figma.currentPage.children.includes(sample.existing));assert.equal(sample.figma.currentPage.flowStartingPoints[0].name,'User flow');
  assert.equal(sample.figma.currentPage.flowStartingPoints.length,3);
  sample.figma.currentPage.flowStartingPoints=[{nodeId:sample.existing.id,name:'Renamed user flow'} ,...sample.figma.currentPage.flowStartingPoints.slice(1)];
  const owned=new Set(sample.latest('complete').report.createdNodeIds),rootIds=new Set([...owned].filter(id=>!owned.has(sample.nodes.get(id).parent.id))),priorRemovals=sample.removeCalls.length;
  await sample.send('remove-sample');assert.equal(sample.figma.currentPage.children.length,1);assert.equal(sample.styles.size,0);assert.equal(sample.collections.size,0);assert.equal(sample.variables.size,0);
  for(const id of sample.removeCalls.slice(priorRemovals))assert(rootIds.has(id),'Cleanup directly removed an owned descendant: '+id);
  assert.equal(sample.rejectedRemovals.length,0);assert.equal(sample.nodes.size,3);assert.deepEqual(sample.figma.currentPage.flowStartingPoints,[{nodeId:sample.existing.id,name:'Renamed user flow'}]);
  const full=environment();await full.send('full');assert(!full.latest('error'),full.latest('error')?.message);
  const report=full.latest('complete').report;assert.equal(report.screenCount,55);assert.equal(report.unlinkedActions.length,0);assert(report.linkedActions>100);
  assert.equal(full.figma.currentPage.flowStartingPoints.length,4);
  for(const [key,name] of [['01','Along · Start'],['40','Along · Settings and safety'],['32','Along · Coordinator states']])assert(full.figma.currentPage.flowStartingPoints.some(flow=>flow.nodeId===report.screens.find(screen=>screen.key===key).id&&flow.name===name));
  const count=full.nodes.size;await full.send('full');assert.match(full.latest('error').message,/already exists/);assert.equal(full.nodes.size,count);
  const missing=environment({missingFont:true});await missing.send('sample');assert.match(missing.latest('error').message,/unavailable/);assert.equal(missing.figma.currentPage.children.length,1);assert.equal(missing.collections.size,0);
  const failure=environment({failAt:250});await failure.send('full');assert.match(failure.latest('error').message,/Injected construction failure/);assert.equal(failure.figma.currentPage.children.length,1);assert.equal(failure.styles.size,0);assert.equal(failure.collections.size,0);assert.equal(failure.variables.size,0);assert.equal(failure.figma.currentPage.flowStartingPoints.length,1);
  const lateFailure=environment({failFlows:true});await lateFailure.send('full');assert.match(lateFailure.latest('error').message,/Injected flow registration failure/);assert(!lateFailure.latest('error').message.includes('Cleanup incomplete'));
  assert.equal(lateFailure.nodes.size,3);assert.equal(lateFailure.styles.size,0);assert.equal(lateFailure.collections.size,0);assert.equal(lateFailure.variables.size,0);assert.equal(lateFailure.rejectedRemovals.length,0);assert.deepEqual(lateFailure.figma.currentPage.flowStartingPoints,[{nodeId:lateFailure.existing.id,name:'User flow'}]);
  await lateFailure.send('sample');assert.equal(lateFailure.latest('complete').report.screenCount,6);
  const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'manifest.json'),'utf8'));assert.deepEqual(manifest.networkAccess.allowedDomains,['none']);
  assert(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|\beval\s*\(|new Function/.test(bundle));
  const html=fs.readFileSync(path.join(__dirname,'ui.html'),'utf8');new vm.Script(html.match(/<script>([\s\S]*)<\/script>/)[1]);
  console.log(JSON.stringify({result:'pass',screens:report.screenCount,components:report.components,linkedActions:report.linkedActions,checks:['six-screen sample','exact-ID container cleanup with constrained children','55-screen coverage','all declared targets resolve','same-page prototype targets','automatic flows replaced without duplicate IDs','preserve user content/renamed flows','duplicate refusal','font preflight without writes','construction failure rollback','late flow failure rollback and retry','offline manifest','UI script syntax'],nativeRenderingVerified:false},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
