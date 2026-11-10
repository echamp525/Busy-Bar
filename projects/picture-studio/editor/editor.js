'use strict';
const $=id=>document.getElementById(id);
const crop=$('crop'),ctx=crop.getContext('2d');
let source=null,angle=0,offset={x:0,y:0},drag=null,version=0,previewTimer,controller=null,prepared=null,saving=false;
let folderState=null,loadingFolders=false;
const key=document.querySelector('meta[name="editor-key"]').content;
function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
function reset(){angle=0;offset={x:0,y:0};$('zoom').value=1;$('brightness').value=100;$('contrast').value=100;render();}
function dimensions(){const rotated=angle%180!==0;return {w:rotated?source.height:source.width,h:rotated?source.width:source.height};}
function render(){
  const rear=$('format').value==='back';
  crop.width=rear?640:720;crop.height=rear?272:160;
  ctx.fillStyle='#000';ctx.fillRect(0,0,crop.width,crop.height);
  $('zoom-value').textContent=Number($('zoom').value).toFixed(2)+'×';
  $('brightness-value').textContent=$('brightness').value+'%';$('contrast-value').textContent=$('contrast').value+'%';
  if(!source)return;
  status('');
  const size=dimensions(),ratios=[crop.width/size.w,crop.height/size.h];
  const scale=($('fit').value==='cover'?Math.max(...ratios):Math.min(...ratios))*Number($('zoom').value);
  const limit={x:Math.max(0,(size.w*scale-crop.width)/2),y:Math.max(0,(size.h*scale-crop.height)/2)};
  offset.x=Math.max(-limit.x,Math.min(limit.x,offset.x));offset.y=Math.max(-limit.y,Math.min(limit.y,offset.y));
  ctx.save();ctx.translate(crop.width/2+offset.x,crop.height/2+offset.y);ctx.scale(scale,scale);ctx.rotate(angle*Math.PI/180);
  ctx.filter=`brightness(${$('brightness').value}%) contrast(${$('contrast').value}%)`;
  ctx.drawImage(source,-source.width/2,-source.height/2);ctx.restore();
  $('empty').classList.add('hidden');$('rotate').disabled=false;$('reset').disabled=false;
  $('save').disabled=true;prepared=null;version++;clearTimeout(previewTimer);
  $('preview-note').textContent='Updating pixel preview…';
  const current=version;previewTimer=setTimeout(()=>preview(current),180);
}
async function api(path,body,signal){
  const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-Editor-Key':key},body:JSON.stringify(body),signal});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'Request failed.');return result;
}
function paint(id,url){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>{const canvas=$(id);canvas.getContext('2d').drawImage(image,0,0);resolve();};image.onerror=reject;image.src=url;});}
async function preview(current){
  if(controller)controller.abort();controller=new AbortController();
  const image=crop.toDataURL('image/png');
  try{
    const result=await api('/api/preview',{image},controller.signal);
    if(current!==version)return;
    await Promise.all([paint('front-preview',result.front),paint('back-preview',result.back)]);
    if(current!==version)return;
    prepared=image;updateSaveEnabled();
    $('preview-note').textContent='Exact viewer conversion · 32-color front / 16-shade rear.';
  }catch(error){if(error.name==='AbortError')return;if(current===version){$('preview-note').textContent='Preview unavailable.';status(error.message,true);}}
}
async function load(file){
  if(!file)return;
  if(file.size>30_000_000){status('Choose an image under 30 MB.',true);return;}
  status('');const url=URL.createObjectURL(file);
  try{
    const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('This file could not be opened as a photo.'));image.src=url;});
    if(image.naturalWidth*image.naturalHeight>40_000_000)throw new Error('Choose an image under 40 megapixels.');
    // Freeze the decoded photo so an animated input remains a single editable still.
    const scale=Math.min(1,3000/Math.max(image.naturalWidth,image.naturalHeight));
    source=document.createElement('canvas');source.width=Math.max(1,Math.round(image.naturalWidth*scale));source.height=Math.max(1,Math.round(image.naturalHeight*scale));
    source.getContext('2d').drawImage(image,0,0,source.width,source.height);
    $('filename').value=(file.name||'photo').replace(/\.[^.]+$/,'');updateName();reset();
  }catch(error){status(error.message,true);}finally{URL.revokeObjectURL(url);}
}
function updateName(){$('preview-name').textContent=($('filename').value.trim()||'photo')+'.png';}
$('file').addEventListener('change',e=>load(e.target.files[0]));
for(const id of ['zoom','brightness','contrast'])$(id).addEventListener('input',render);
for(const id of ['format','fit'])$(id).addEventListener('change',()=>{offset={x:0,y:0};render();});
$('filename').addEventListener('input',updateName);
$('rotate').addEventListener('click',()=>{angle=(angle+90)%360;offset={x:0,y:0};render();});
$('reset').addEventListener('click',reset);
$('grid').addEventListener('change',()=>document.querySelectorAll('.grid').forEach(e=>e.classList.toggle('hidden',!$('grid').checked)));
crop.addEventListener('pointerdown',e=>{if(!source)return;drag={x:e.clientX,y:e.clientY};crop.setPointerCapture(e.pointerId);});
crop.addEventListener('pointermove',e=>{if(!drag)return;const rect=crop.getBoundingClientRect();offset.x+=(e.clientX-drag.x)*crop.width/rect.width;offset.y+=(e.clientY-drag.y)*crop.height/rect.height;drag={x:e.clientX,y:e.clientY};render();});
for(const event of ['pointerup','pointercancel','lostpointercapture'])crop.addEventListener(event,()=>drag=null);
crop.addEventListener('keydown',e=>{const move={ArrowLeft:[-5,0],ArrowRight:[5,0],ArrowUp:[0,-5],ArrowDown:[0,5]}[e.key];if(!move||!source)return;e.preventDefault();offset.x+=move[0];offset.y+=move[1];render();});
$('demo').addEventListener('click',()=>{
  source=document.createElement('canvas');source.width=1200;source.height=600;
  const c=source.getContext('2d'),gradient=c.createLinearGradient(0,0,1200,600);gradient.addColorStop(0,'#123d59');gradient.addColorStop(1,'#669b91');c.fillStyle=gradient;c.fillRect(0,0,1200,600);
  c.fillStyle='#f6d777';c.beginPath();c.arc(870,170,90,0,Math.PI*2);c.fill();
  c.fillStyle='#49745b';c.beginPath();c.moveTo(0,490);c.lineTo(370,100);c.lineTo(780,600);c.lineTo(0,600);c.fill();
  c.fillStyle='#254c45';c.beginPath();c.moveTo(320,600);c.lineTo(820,270);c.lineTo(1200,590);c.lineTo(1200,600);c.fill();
  c.fillStyle='#d9e4c3';c.beginPath();c.moveTo(260,217);c.lineTo(370,100);c.lineTo(497,255);c.lineTo(385,214);c.lineTo(330,252);c.fill();
  $('filename').value='mountain-sample';updateName();status('');reset();
});
$('save').addEventListener('click',async()=>{
  if(!prepared||saving)return;
  const destination=folderState?.folders.find(folder=>folder.id===$('save-folder').value&&folder.available);
  if(!destination){status('Choose an available save folder.',true);return;}
  saving=true;$('save').disabled=true;status('Saving to '+destination.name+'…');
  try{
    const result=await api('/api/save',{image:prepared,name:$('filename').value,folderId:destination.id});
    status(`Saved ${result.name} to ${result.folder}.`);
  }catch(error){status(error.message,true);}finally{saving=false;updateSaveEnabled();}
});
function updateSaveEnabled(){
  const chosen=folderState?.folders.find(folder=>folder.id===$('save-folder').value);
  $('save').disabled=!prepared||saving||!chosen?.available;
}
function folderOptions(select,folders,selected){
  select.replaceChildren();
  for(const folder of folders){
    const option=document.createElement('option');option.value=folder.id;
    option.textContent=folder.name+(folder.available?'':' (unavailable)');
    option.disabled=!folder.available;select.append(option);
  }
  select.value=selected;select.disabled=false;
}
function showFolders(result){
  folderState=result;
  folderOptions($('save-folder'),result.folders,result.saveFolder);
  folderOptions($('view-folder'),result.folders,result.viewFolder);
  if(!$('folder-dialog').open)folderOptions($('parent-folder'),result.folders,result.saveFolder);
  const chosen=result.folders.find(folder=>folder.id===$('save-folder').value);
  $('save-path').textContent=chosen?.path||'Choose a folder.';updateSaveEnabled();
}
async function refreshFolders(){
  if(loadingFolders)return;loadingFolders=true;
  try{showFolders(await api('/api/folders',{}));}
  catch(error){status(error.message,true);}finally{loadingFolders=false;}
}
async function chooseFolder(select,role){
  select.disabled=true;
  try{showFolders(await api('/api/folders/select',{folderId:select.value,role}));}
  catch(error){status(error.message,true);}finally{select.disabled=false;}
}
$('save-folder').addEventListener('change',()=>chooseFolder($('save-folder'),'saveFolder'));
$('view-folder').addEventListener('change',()=>chooseFolder($('view-folder'),'viewFolder'));
$('refresh-folders').addEventListener('click',refreshFolders);
$('pick-folder').addEventListener('click',async()=>{
  $('pick-folder').disabled=true;status('Choose a folder in the Windows folder chooser.');
  try{const result=await api('/api/folders/pick',{});if(result.cancelled){status('');return;}showFolders(result);status('Folder added. It is now available on the Bar.');}
  catch(error){status(error.message,true);}finally{$('pick-folder').disabled=false;}
});
$('add-path').addEventListener('click',async()=>{
  $('add-path').disabled=true;
  try{showFolders(await api('/api/folders/add',{path:$('folder-path').value.trim()}));$('folder-path').value='';status('Folder added. It is now available on the Bar.');}
  catch(error){status(error.message,true);}finally{$('add-path').disabled=false;}
});
$('new-folder').addEventListener('click',async()=>{
  await refreshFolders();if(!folderState)return;
  folderOptions($('parent-folder'),folderState.folders,$('save-folder').value);
  $('folder-name').value='';$('folder-error').textContent='';$('folder-dialog').showModal();
});
$('cancel-folder').addEventListener('click',()=>$('folder-dialog').close());
$('folder-form').addEventListener('submit',async event=>{
  event.preventDefault();$('create-folder').disabled=true;
  try{
    showFolders(await api('/api/folders/create',{parentId:$('parent-folder').value,name:$('folder-name').value}));
    $('folder-dialog').close();status('Folder created and selected for saving. It is now available on the Bar.');
  }catch(error){$('folder-error').textContent=error.message;}finally{$('create-folder').disabled=false;}
});
window.addEventListener('focus',refreshFolders);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshFolders();});
setInterval(()=>{if(!document.hidden&&!$('folder-dialog').open&&!saving)void refreshFolders();},10000);
void refreshFolders();
render();
