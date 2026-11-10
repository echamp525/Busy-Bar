var APP='local.pictures.viewer';
var BASE='__BRIDGE_URL__';
var TOKEN='__BRIDGE_TOKEN__';
var stopped=false,fetching=false,drawing=false,queued=null,lastRevision='',lastSuccess=0;
var menuOpen=false,menuChoice=0,folders=[],selectedFolder='',folderBusy=false,lastFoldersAt=0,folderError='',suppressClick=false;
function text(id,value,display,y,width){return {id:id,type:'text',text:String(value).replace(/[^\x20-\x7E]/g,'?'),display:display,x:0,y:y,width:width,font:display==='front'?'tiny':'small',color:'#FFFFFFFF',scroll_rate:600,scroll_start_delay:1200,z_index:2};}
function blank(id,display,w,h){return {id:id,type:'rectangle',display:display,x:0,y:0,width:w,height:h,fill:'solid',fill_colors:['#000000FF'],border_width:0,z_index:0};}
function bitmap(id,display,data){return {id:id,type:'xpmbitmap',display:display,x:0,y:0,data:data,z_index:1};}
function menuRows(clear){
  var result=[],first=Math.max(0,Math.min(menuChoice-1,folders.length-4));
  for(var i=0;i<4;i++){
    var index=first+i,item=folders[index],label=' ';
    if(!clear&&item)label=(index===menuChoice?'> ':'  ')+(item.id===selectedFolder?'* ':'')+item.name;
    result.push(text('folder_row_'+i,label,'back',19+i*11,160));
  }
  return result;
}
function drawMenu(){
  if(!menuOpen||stopped)return;
  var black='! XPM2\n1 1 1 1\n. c #000000\n.';
  var choice=folders[menuChoice],detail=folderError||(choice?choice.name:(folderBusy?'Loading folders...':'No folders available'));
  var elements=[blank('front_bg','front',72,16),blank('back_bg','back',160,80),
    bitmap('front_image','front',black),bitmap('back_image','back',black),
    text('front_info','SETTINGS','front',0,72),text('front_help',detail,'front',9,72),
    text('back_info','VIEW FOLDER','back',3,160),text('back_help',' ','back',35,160),
    text('footer','Turn: choose / click: save / Back: cancel','back',69,160)].concat(menuRows(false));
  queued=JSON.stringify({application_name:APP,priority:50,elements:elements});pump();
}
function loadFolders(open){
  if(stopped)return;
  if(open){menuOpen=true;folderError='';}
  if(folderBusy){if(menuOpen)drawMenu();return;}
  folderBusy=true;lastFoldersAt=Date.now();if(menuOpen)drawMenu();
  var highlighted=folders[menuChoice]&&folders[menuChoice].id;
  fetch(BASE+'/folders?token='+TOKEN).then(function(r){if(!r.ok)throw new Error('offline');return r.json();}).then(function(result){
    folders=(result.folders||[]).filter(function(item){return item.available!==false;});selectedFolder=result.selected||'';
    var wanted=open?selectedFolder:highlighted;menuChoice=0;
    for(var i=0;i<folders.length;i++)if(folders[i].id===wanted)menuChoice=i;
    folderError='';
  }).catch(function(){folderError='PC companion offline';}).then(function(){folderBusy=false;if(menuOpen)drawMenu();});
}
function selectFolder(){
  if(folderBusy||!folders[menuChoice])return;
  folderBusy=true;var chosen=folders[menuChoice].id;
  fetch(BASE+'/command?token='+TOKEN,{method:'POST',body:JSON.stringify({action:'folder',folderId:chosen})}).then(function(r){if(!r.ok)throw new Error('Folder unavailable');return r.json();}).then(function(result){
    if(!result.ok)throw new Error('Folder unavailable');selectedFolder=chosen;menuOpen=false;lastRevision='';
  }).catch(function(){folderError='Folder unavailable';}).then(function(){folderBusy=false;if(menuOpen)drawMenu();else refresh();});
}
function pump(){
  if(stopped||drawing||!queued)return;
  var body=queued;queued=null;drawing=true;
  fetch('http://localhost/api/display/draw',{method:'POST',body:body}).then(function(r){if(!r.ok)lastRevision='';}).catch(function(){lastRevision='';}).then(function(){drawing=false;pump();});
}
function draw(data){
  if(menuOpen)return;
  if(data.revision===lastRevision)return;
  lastRevision=data.revision;
  // Retain fixed element IDs so switching between images and errors replaces old pixels.
  var black='! XPM2\n1 1 1 1\n. c #000000\n.';
  var elements=[blank('front_bg','front',72,16),blank('back_bg','back',160,80),
    bitmap('front_image','front',data.empty?black:data.front),bitmap('back_image','back',data.empty?black:data.back),
    text('front_info',data.empty?'PICTURES':' ','front',0,72),
    text('front_help',data.empty?(data.offline?'PC offline':(data.starting?'Connecting...':'Folder empty')):' ','front',9,72),
    text('back_info',data.empty?(data.message||'PC companion offline'):' ','back',8,160),
    text('back_help',data.empty?(data.folder||'Check PC companion'):' ','back',35,160),
    text('footer',data.empty?'Hold dial: choose folder':(data.paused?'PAUSED ':'PLAY ')+data.position+'/'+data.count+' '+data.name,'back',69,160)].concat(menuRows(true));
  queued=JSON.stringify({application_name:APP,priority:50,elements:elements});pump();
}
function refresh(){
  if(menuOpen){if(!folderBusy&&Date.now()-lastFoldersAt>2000)loadFolders(false);return;}
  if(stopped||fetching)return;fetching=true;
  fetch(BASE+'/frame?token='+TOKEN).then(function(r){if(!r.ok)throw new Error('offline');return r.json();}).then(function(data){lastSuccess=Date.now();draw(data);}).catch(function(){draw({empty:true,offline:true,revision:'offline',message:'PC companion offline - reconnecting'});}).then(function(){fetching=false;});
}
var sending=false,delta=0,toggle=false,rescan=false;
function commands(){
  if(stopped||sending)return;
  var action,step=0;
  if(rescan){rescan=false;action='rescan';}
  else if(toggle){toggle=false;action='toggle';}
  else if(delta){step=Math.max(-50,Math.min(50,delta));delta-=step;action='browse';}
  else return;
  sending=true;
  fetch(BASE+'/command?token='+TOKEN,{method:'POST',body:JSON.stringify({action:action,delta:step})}).catch(function(){}).then(function(){sending=false;lastRevision='';refresh();commands();});
}
var unbind=listen('input',function(e){
  if(stopped)return;
  if(e.key==='ok'&&e.action==='press')suppressClick=false;
  if(e.key==='ok'&&e.action==='long'){suppressClick=true;loadFolders(true);return;}
  if(e.key==='ok'&&e.action==='short'&&suppressClick){suppressClick=false;return;}
  if(menuOpen){
    if(e.key==='encoder'){menuChoice=Math.max(0,Math.min(folders.length-1,menuChoice+e.delta));folderError='';drawMenu();}
    if(e.key==='ok'&&e.action==='short')selectFolder();
    if(e.key==='back'&&e.action==='short'){menuOpen=false;lastRevision='';refresh();}
    return;
  }
  if(e.key==='encoder'){delta+=e.delta;commands();}
  if((e.key==='ok'||e.key==='start')&&e.action==='short'){toggle=!toggle;commands();}
  if(e.key==='back'&&e.action==='short'){stopped=true;clearInterval(timer);setTimeout(unbind,0);}
});
draw({empty:true,starting:true,revision:'starting',message:'Connecting to PC...'});
var timer=setInterval(refresh,250);
loadFolders(false);refresh();
