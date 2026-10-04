/**
 * Native importer host. All artwork is bundled; no network, credentials or MCP.
 * Only exact IDs created in this session may be cleaned up. Existing nodes,
 * styles, variables and prototype flows are preserved.
 */
const PREFIX = 'Along · Local import · v1';
const BUILD_VERSION = '1.0.1';
const SAMPLE = new Set(['01', '02', '13', '17', '21', '40']);
const PALETTE = {ink:'#123C38',muted:'#586D68',teal:'#146B59',lime:'#DDF5A0',paper:'#F7F8F2',white:'#FFFFFF',line:'#DCE4DC',soft:'#EAF2E9',danger:'#AD3E36',dangerSoft:'#FFF0EC',amber:'#8A5B14',amberSoft:'#FFF3D4',map:'#EBEEE5',park:'#D4E3C3',water:'#CBE3E8'};
const TYPE = {display:[48,'ExtraBold',54],h1:[30,'ExtraBold',36],h2:[24,'Bold',30],h3:[18,'Bold',24],body:[15,'Regular',22],label:[15,'Bold',20],small:[12,'Medium',18],micro:[10,'Bold',14]};
let busy = false;
let lastRun = null;
figma.showUI(__html__, {width:440,height:610,themeColors:true});

function progress(message) { figma.ui.postMessage({type:'progress',message}); }
function color(hex) { return {r:parseInt(hex.slice(1,3),16)/255,g:parseInt(hex.slice(3,5),16)/255,b:parseInt(hex.slice(5,7),16)/255}; }
function own(run,node) { run.nodeIds.add(node.id); return node; }

/**
 * Remove one owned subtree and forget its IDs only after successful removal.
 * Sample pruning must not leave deleted section children in the rollback ledger.
 */
function removeOwnedTree(run,node) {
  const ids=[node.id,...('findAll' in node?node.findAll(()=>true).map(child=>child.id):[])];
  node.remove();
  for(const id of ids)run.nodeIds.delete(id);
}

/** Check the real font inventory before any document mutation; no silent substitution. */
async function loadFonts() {
  const available = await figma.listAvailableFontsAsync();
  const names = ['Regular','Medium','SemiBold','Bold','ExtraBold'];
  for (const style of names) {
    if (!available.some(item => item.fontName.family === 'Manrope' && item.fontName.style === style)) {
      throw new Error('Manrope ' + style + ' is unavailable. Install/enable Manrope, then rerun. Nothing has been imported.');
    }
  }
  await Promise.all(names.map(style => figma.loadFontAsync({family:'Manrope',style})));
}

/** Create independent local foundations so imports never restyle an existing draft. */
async function foundations(run) {
  const page = figma.currentPage;
  const S = {vars:{},styles:{},components:{},pages:{kit:page.id,journey:page.id,states:page.id},frames:{}};
  const collection = figma.variables.createVariableCollection(run.label);
  run.collectionIds.push(collection.id);
  const mode = collection.defaultModeId;
  for (const [key,hex] of Object.entries(PALETTE)) {
    const primitive = figma.variables.createVariable('palette/' + key,collection,'COLOR');
    primitive.scopes=[]; primitive.setValueForMode(mode,color(hex));
    primitive.setVariableCodeSyntax('WEB','var(--along-palette-' + key + ')');
    const semantic = figma.variables.createVariable('color/' + key,collection,'COLOR');
    semantic.scopes=['FRAME_FILL','SHAPE_FILL','TEXT_FILL','STROKE_COLOR'];
    semantic.setValueForMode(mode,{type:'VARIABLE_ALIAS',id:primitive.id});
    semantic.setVariableCodeSyntax('WEB','var(--along-' + key + ')');
    S.vars[key]=semantic.id;
  }
  for (const [prefix,values,scope] of [['space',[4,8,12,16,24,32],'GAP'],['radius',[12,16,24,32],'CORNER_RADIUS']]) {
    for (const value of values) {
      const variable=figma.variables.createVariable(prefix+'/'+value,collection,'FLOAT');
      variable.scopes=[scope]; variable.setValueForMode(mode,value);
      variable.setVariableCodeSyntax('WEB','var(--along-'+prefix+'-'+value+')');
      S.vars[prefix+value]=variable.id;
    }
  }
  for(const [key,[size,weight,line]] of Object.entries(TYPE)) {
    const style=figma.createTextStyle();run.styleIds.push(style.id);
    style.name=run.label+'/'+key;style.fontName={family:'Manrope',style:weight};
    style.fontSize=size;style.lineHeight={unit:'PIXELS',value:line};S.styles[key]=style.id;
  }
  for(const [key,h,y] of [['cover',900,160],['kit',1250,1140]]) {
    const frame=own(run,figma.createFrame());frame.name=run.label+' / '+key;
    frame.resize(1560,h);frame.x=run.offset;frame.y=y;frame.clipsContent=false;S.frames[key]=frame.id;
  }
  return S;
}

/** Move only this phase's newly created top-level nodes into a clear canvas area. */
function positionPhase(run,before,dx) {
  for (const node of figma.currentPage.children) {
    if (!before.has(node.id) && run.nodeIds.has(node.id)) {node.x+=dx;}
  }
}

/**
 * Read native text and geometry after Figma layout. Sheets may move upward to
 * respect the bottom safe area; body/footer collisions are reported, never hidden.
 */
async function audit(run) {
  const warnings=[];const typeCounts={};const families=new Set();const audited=new Set();let images=0;
  for(const id of run.nodeIds) {
    const node=await figma.getNodeByIdAsync(id);if(!node)continue;
    const descendants='findAll' in node?node.findAll(()=>true):[];
    for(const item of [node,...descendants])if(!audited.has(item.id)) {
      audited.add(item.id);typeCounts[item.type]=(typeCounts[item.type]||0)+1;
    }
  }
  const screenRecords=[];
  for(const [key,id] of Object.entries(run.screens)) {
    const frame=await figma.getNodeByIdAsync(id);
    if(!frame||frame.type!=='FRAME')throw new Error('Missing screen '+key);
    const texts=frame.findAllWithCriteria({types:['TEXT']});
    for(const text of texts) {
      for(const segment of text.getStyledTextSegments(['fontName']))families.add(segment.fontName.family);
    }
    for(const node of frame.findAll(()=>true)) {
      if('fills' in node && Array.isArray(node.fills))images+=node.fills.filter(p=>p.type==='IMAGE').length;
    }
    const content=frame.children.find(n=>n.name==='Screen content');
    const footer=frame.children.find(n=>n.name==='Bottom actions');
    const sheet=frame.children.find(n=>n.name==='Map sheet');
    if(content&&content.y+content.height>(footer?footer.y-16:807))warnings.push(key+': content reaches footer/safe area');
    if(sheet&&sheet.y+sheet.height>811)warnings.push(key+': sheet crosses safe area');
    if(sheet&&sheet.y<210)warnings.push(key+': sheet overlaps map header');
    if(frame.width!==390||frame.height!==844)warnings.push(key+': unexpected viewport');
    screenRecords.push({key,id,name:frame.name,width:frame.width,height:frame.height,textNodes:texts.length});
  }
  if(families.size!==1||!families.has('Manrope'))throw new Error('Font verification failed: '+[...families].join(', '));
  if(images)throw new Error('Unexpected raster fill in native screen artwork');
  return {version:1,buildVersion:BUILD_VERSION,mode:run.mode,pageId:run.pageId,screens:screenRecords,screenCount:screenRecords.length,
    components:Object.keys(run.S.components).length,linkedActions:run.linked,unlinkedActions:run.unlinked,
    fonts:[...families],rasterFills:images,typeCounts,warnings,createdNodeIds:[...run.nodeIds],
    collectionIds:run.collectionIds,styleIds:run.styleIds,visualReview:'Required in Figma; structural checks are not a visual pass.'};
}

/**
 * Remove only the outermost nodes owned by this invocation. Figma removes their
 * descendants with them; deleting constrained child layers one by one can fail.
 * Orphaned construction nodes are also owned roots and are removed on rollback.
 * Existing nodes and flows are never selected for cleanup by a name match.
 */
async function cleanup(run) {
  const failures=[];
  try {
    const page=await figma.getNodeByIdAsync(run.pageId);
    if(page&&page.type==='PAGE')page.flowStartingPoints=page.flowStartingPoints.filter(flow=>!run.nodeIds.has(flow.nodeId));
  } catch(error){failures.push('Prototype flows: '+error.message);}
  for(const id of [...run.nodeIds].reverse()) {
    try {
      const node=await figma.getNodeByIdAsync(id);if(!node||node.removed)continue;
      let parent=node.parent;
      while(parent&&!run.nodeIds.has(parent.id))parent=parent.parent;
      if(!parent)removeOwnedTree(run,node);
    }
    catch(error){ failures.push('Node '+id+': '+error.message); }
  }
  for(const id of run.styleIds) {
    try { const style=await figma.getStyleByIdAsync(id);if(style)style.remove(); }
    catch(error){failures.push('Style '+id+': '+error.message);}
  }
  for(const id of run.collectionIds) {
    try {const collection=await figma.variables.getVariableCollectionByIdAsync(id);if(collection)collection.remove();}
    catch(error){failures.push('Collection '+id+': '+error.message);}
  }
  if(failures.length)throw new Error('Cleanup incomplete. '+failures.join('; '));
}

/**
 * Reactions can introduce automatic flows before this step. Replace flows only
 * on this run's nodes, then merge by node ID; preserve unrelated flow names/order.
 */
function registerFlows(page,run) {
  const flows=new Map(page.flowStartingPoints.filter(flow=>!run.nodeIds.has(flow.nodeId)).map(flow=>[flow.nodeId,flow]));
  for(const [key,name] of [['01','Along · Start'],['40','Along · Settings and safety'],['32','Along · Coordinator states']]) {
    const nodeId=run.screens[key];if(nodeId)flows.set(nodeId,{nodeId,name});
  }
  page.flowStartingPoints=[...flows.values()];
}

/** Build beside existing content, then connect all supported storyboard destinations. */
async function importDesign(mode) {
  if(figma.editorType!=='figma')throw new Error('Open a Figma Design file first.');
  const page=figma.currentPage;
  const label=PREFIX+' · '+(mode==='sample'?'Sample':'Full');
  const collections=await figma.variables.getLocalVariableCollectionsAsync();
  if(collections.some(c=>c.name===label)||page.children.some(n=>n.name===label+' / cover')) {
    throw new Error('This import already exists. Select it on the canvas; it will not be duplicated. Remove a sample using this plugin in the same session, or Undo its import before retrying.');
  }
  progress('Checking Manrope fonts…');await loadFonts();
  const offset=Math.max(0,...page.children.map(n=>n.x+n.width))+300;
  const run={mode,label,pageId:page.id,offset,nodeIds:new Set(),collectionIds:[],styleIds:[],screens:{},linked:0,unlinked:[]};
  try {
    progress('Building brand and reusable components…');run.S=await foundations(run);await buildKit(run.S,run,null);
    const onlyKeys=mode==='sample'?SAMPLE:null;
    progress('Building the main journey…');let before=new Set(page.children.map(n=>n.id));
    const journey=await buildJourney(run.S,run,onlyKeys);positionPhase(run,before,offset+1600);
    progress('Building recovery, safety and settings…');before=new Set(page.children.map(n=>n.id));
    const states=await buildStates(run.S,run,onlyKeys);positionPhase(run,before,offset+4000);
    run.screens={...journey.screens,...states.screens};
    // Sample omits unused row backgrounds; only remove exact newly returned IDs.
    if(mode==='sample') {
      const frames=await Promise.all(Object.values(run.screens).map(id=>figma.getNodeByIdAsync(id)));
      for(const id of [...journey.boards,...states.boards]) {
        const board=await figma.getNodeByIdAsync(id);
        if(board&&!frames.some(frame=>frame.x>=board.x&&frame.x<board.x+board.width&&frame.y>=board.y&&frame.y<board.y+board.height))removeOwnedTree(run,board);
      }
    }
    for(const id of Object.values(run.screens)) {
      const frame=await figma.getNodeByIdAsync(id);const sheet=frame.children.find(n=>n.name==='Map sheet');
      if(sheet)sheet.y=Math.min(sheet.y,811-sheet.height);
    }
    progress('Connecting and checking the storyboard…');
    for(const link of [...journey.links,...states.links]) {
      const node=await figma.getNodeByIdAsync(link.id);if(!node)continue;
      let source=node;while(source.parent&&source.parent.type!=='PAGE')source=source.parent;
      const target=run.screens[link.target];
      if(!target){run.unlinked.push(link);continue;}
      if(source.id===target)continue;
      await node.setReactionsAsync([{trigger:{type:'ON_CLICK'},actions:[{type:'NODE',destinationId:target,navigation:'NAVIGATE',transition:null}]}]);run.linked++;
    }
    registerFlows(page,run);
    run.report=await audit(run);
    if(Object.keys(run.screens).length!==(mode==='sample'?6:55))throw new Error('Incomplete screen inventory');
    figma.commitUndo();lastRun=run;
    const first=await figma.getNodeByIdAsync(run.screens['02']);page.selection=[first];figma.viewport.scrollAndZoomIntoView([first]);
    figma.ui.postMessage({type:'complete',report:run.report,canRemoveSample:mode==='sample'});
    return run;
  } catch(error) {
    try {await cleanup(run);}catch(cleanupError){error.message+=' '+cleanupError.message;}
    throw error;
  }
}

figma.ui.onmessage=async message=>{
  if(busy)return;
  if(!message||!['sample','full','remove-sample','focus','audit','close'].includes(message.type))return;
  busy=true;
  try {
    if(message.type==='close'){figma.closePlugin();return;}
    if(message.type==='sample'||message.type==='full')await importDesign(message.type);
    if(message.type==='remove-sample') {
      if(!lastRun||lastRun.mode!=='sample')throw new Error('No sample created in this session.');
      await cleanup(lastRun);lastRun=null;figma.commitUndo();figma.ui.postMessage({type:'removed'});
    }
    if(message.type==='audit') {
      if(!lastRun)throw new Error('Import a sample or full design first.');
      lastRun.report=await audit(lastRun);figma.ui.postMessage({type:'complete',report:lastRun.report,canRemoveSample:lastRun.mode==='sample'});
    }
    if(message.type==='focus') {
      if(!lastRun||!lastRun.screens[message.key])throw new Error('That screen is not in this import.');
      const page=await figma.getNodeByIdAsync(lastRun.pageId);await figma.setCurrentPageAsync(page);
      const frame=await figma.getNodeByIdAsync(lastRun.screens[message.key]);page.selection=[frame];figma.viewport.scrollAndZoomIntoView([frame]);
    }
  } catch(error) {figma.ui.postMessage({type:'error',message:error.message});}
  finally {busy=false;figma.ui.postMessage({type:'idle'});}
};
