/** Produce an editable SVG from the current browser layout, preserving vector icons and live text. */
function exportScreen(key){
 const screen=document.querySelector('#screen-'+key+' .phone');
 const bounds=screen.getBoundingClientRect();const parts=[];let clipSerial=0;
 const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 function visit(el){
  const r=el.getBoundingClientRect(),s=getComputedStyle(el),x=r.x-bounds.x,y=r.y-bounds.y,w=r.width,h=r.height;
  const round=parseFloat(s.borderRadius)||0;let wrapped=false;
  if(s.overflow==='hidden'){const id='clip'+ ++clipSerial;parts.push('<defs><clipPath id="'+id+'"><rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="'+round+'"/></clipPath></defs><g clip-path="url(#'+id+')">');wrapped=true;}
  const bg=s.backgroundColor,stroke=s.borderTopColor,bw=parseFloat(s.borderTopWidth)||0;
  if(bg!=='rgba(0, 0, 0, 0)'||bw)parts.push('<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="'+round+'" fill="'+(bg==='rgba(0, 0, 0, 0)'?'none':bg)+'" stroke="'+(bw?stroke:'none')+'" stroke-width="'+bw+'" opacity="'+s.opacity+'"/>');
  if(el.dataset.kind==='TEXT'){
   const text=el.firstChild;if(text?.nodeType===3){const lines=[];let lastY=null;for(let i=0;i<text.length;i++){const range=document.createRange();range.setStart(text,i);range.setEnd(text,i+1);const cr=range.getBoundingClientRect();if(text.textContent[i]==='\n')continue;if(lastY===null||Math.abs(cr.y-lastY)>2){lines.push({x:cr.x-bounds.x,y:cr.y-bounds.y,text:''});lastY=cr.y;}lines[lines.length-1].text+=text.textContent[i];}for(const l of lines)parts.push('<text x="'+l.x+'" y="'+(l.y+parseFloat(s.fontSize)*.82)+'" font-family="Manrope, Avenir Next, Arial, sans-serif" font-size="'+parseFloat(s.fontSize)+'" font-weight="'+s.fontWeight+'" fill="'+s.color+'">'+escape(l.text)+'</text>');}
  }else if(el.dataset.kind==='SVG'){const svg=el.querySelector('svg');if(svg)parts.push('<svg x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" viewBox="'+svg.getAttribute('viewBox')+'" '+[...svg.attributes].filter(a=>!['width','height','viewBox','xmlns'].includes(a.name)).map(a=>a.name+'="'+escape(a.value)+'"').join(' ')+'>'+svg.innerHTML+'</svg>');}
  else for(const c of el.children)if(c.classList.contains('n'))visit(c);
  if(wrapped)parts.push('</g>');
 }
 visit(screen.firstElementChild);
 return '<svg xmlns="http://www.w3.org/2000/svg" width="390" height="844" viewBox="0 0 390 844"><title>Along screen '+key+'</title>'+parts.join('')+'</svg>';
}
function downloadScreen(key){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([exportScreen(key)],{type:'image/svg+xml'}));a.download='along-'+key+'.svg';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
document.addEventListener('click',e=>{const n=e.target.closest('[data-target]');if(n)location.hash='screen-'+n.dataset.target;});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.dataset.target)location.hash='screen-'+e.target.dataset.target;});
