const fs=require('fs');
const path=require('path');
const dependencyRoot=process.env.ALONG_NODE_MODULES;
if(!dependencyRoot)throw new Error('Set ALONG_NODE_MODULES to the bundled runtime node_modules directory.');
const canvas=require(path.join(dependencyRoot,'@napi-rs/canvas'));
const sharp=require(path.join(dependencyRoot,'sharp'));
canvas.GlobalFonts.registerFromPath('/System/Library/Fonts/Supplemental/Arial.ttf','Along Preview');
canvas.GlobalFonts.registerFromPath('/System/Library/Fonts/Supplemental/Arial Bold.ttf','Along Preview Bold');
const ctx=canvas.createCanvas(16,16).getContext('2d');
const escape=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const color=p=>p?'rgb('+[p.color.r,p.color.g,p.color.b].map(v=>Math.round(v*255)).join(',')+')':'none';
/** Measures live text with a local font, then computes the authored row/column layout without opening a browser. */
function layout(n){
 if(n.type==='TEXT'){
  const bold=['Bold','ExtraBold','SemiBold'].includes(n.fontName.style);ctx.font=n.fontSize+'px "'+(bold?'Along Preview Bold':'Along Preview')+'"';const max=n.textAutoResize==='HEIGHT'?n.width:Infinity;const lines=[];
  for(const p of n.characters.split('\n')){let current='';for(const word of p.split(' ')){const next=current?current+' '+word:word;if(current&&ctx.measureText(next).width>max){lines.push(current);current=word;}else current=next;}lines.push(current);}
  n.lines=lines;n.height=lines.length*n.lineHeight;if(max===Infinity)n.width=Math.max(...lines.map(s=>ctx.measureText(s).width));return;
 }
 for(const c of n.children)layout(c);
 if(n.layoutMode==='NONE')return;
 const horiz=n.layoutMode==='HORIZONTAL',gap=n.itemSpacing||0,l=n.paddingLeft||0,r=n.paddingRight||0,t=n.paddingTop||0,b=n.paddingBottom||0;
 const sum=n.children.reduce((a,c)=>a+(horiz?c.width:c.height),0)+Math.max(0,n.children.length-1)*gap;
 const cross=Math.max(0,...n.children.map(c=>horiz?c.height:c.width));
 if(horiz){if(n.primaryAxisSizingMode==='AUTO')n.width=sum+l+r;if(n.counterAxisSizingMode==='AUTO')n.height=cross+t+b;}else{if(n.primaryAxisSizingMode==='AUTO')n.height=sum+t+b;if(n.counterAxisSizingMode==='AUTO')n.width=cross+l+r;}
 const room=(horiz?n.width-l-r:n.height-t-b)-sum;let pos=(horiz?l:t)+(n.primaryAxisAlignItems==='CENTER'?room/2:n.primaryAxisAlignItems==='MAX'?room:0);const actualGap=n.primaryAxisAlignItems==='SPACE_BETWEEN'&&n.children.length>1?gap+room/(n.children.length-1):gap;
 for(const c of n.children){const align=c.layoutAlign||n.counterAxisAlignItems;const crossRoom=horiz?n.height-t-b-c.height:n.width-l-r-c.width;const crossPos=(horiz?t:l)+(align==='CENTER'?crossRoom/2:align==='MAX'?crossRoom:0);c.x=horiz?pos:crossPos;c.y=horiz?crossPos:pos;pos+=(horiz?c.width:c.height)+actualGap;}
}
function svg(n){let clip=0;const parts=[];
 function draw(n,px,py){const x=px+n.x,y=py+n.y;const w=n.width,h=n.height;const rad=n.type==='ELLIPSE'?w/2:n.cornerRadius||0;
 if(n.clipsContent){const id='clip'+ ++clip;parts.push('<defs><clipPath id="'+id+'"><rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="'+rad+'"/></clipPath></defs><g clip-path="url(#'+id+')">');}
 if(n.type==='TEXT'){for(let i=0;i<n.lines.length;i++)parts.push('<text x="'+x+'" y="'+(y+i*n.lineHeight+n.fontSize*.85+(n.lineHeight-n.fontSize)/2)+'" font-family="Arial, sans-serif" font-size="'+n.fontSize+'" font-weight="'+(['Bold','ExtraBold','SemiBold'].includes(n.fontName.style)?700:400)+'" fill="'+color(n.fills[0])+'">'+escape(n.lines[i])+'</text>');}
 else if(n.type==='SVG'){parts.push(n.svg.replace('<svg ','<svg x="'+x+'" y="'+y+'" ').replace(/width="\d+"/,'width="'+w+'"').replace(/height="\d+"/,'height="'+h+'"'));}
 else{if(n.fills.length||n.strokes?.length)parts.push('<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="'+rad+'" fill="'+color(n.fills[0])+'" stroke="'+color(n.strokes?.[0])+'" stroke-width="'+(n.strokeWeight||1)+'" opacity="'+(n.opacity??1)+'"/>');for(const c of n.children)draw(c,x,y);}
 if(n.clipsContent)parts.push('</g>');
 }draw(n,0,0);return '<svg xmlns="http://www.w3.org/2000/svg" width="'+n.width+'" height="'+n.height+'" viewBox="0 0 '+n.width+' '+n.height+'"><title>'+escape(n.name)+'</title>'+parts.join('')+'</svg>';
}
module.exports=async function(screens,nodes,brand,out){
 const warnings=[];for(const [key,id]of screens){const n=nodes.get(id);n.x=0;n.y=0;layout(n);const file=path.join(out,'screens',key+'.svg');fs.writeFileSync(file,svg(n));for(const c of n.children){if(['Screen content','Introduction','Map sheet'].includes(c.name)){const footer=n.children.find(f=>f.name==='Bottom actions');if(c.y+c.height>(footer?footer.y-8:816))warnings.push({screen:key,container:c.name,bottom:c.y+c.height,limit:footer?footer.y-8:816});}}}
 brand.x=0;brand.y=0;layout(brand);fs.writeFileSync(path.join(out,'brand.svg'),svg(brand));
 for(const keys of [['01','02','05','13','17'],['21','25','32','41','49']]){const files=await Promise.all(keys.map(async key=>({input:await sharp(path.join(out,'screens',key+'.svg')).png().toBuffer(),left:30+420*keys.indexOf(key),top:50})));await sharp({create:{width:2130,height:944,channels:4,background:'#eaf2e9'}}).composite(files).png().toFile(path.join(out,'review-'+keys[0]+'.png'));}
 fs.writeFileSync(path.join(out,'layout-report.json'),JSON.stringify(warnings,null,2));console.log('SVG exports: '+screens.length+'; layout warnings: '+warnings.length);
};
