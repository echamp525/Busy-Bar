var APP = 'local.siriusxm.remote';
var BASE = '__BRIDGE_URL__';
var TOKEN = '__BRIDGE_TOKEN__';
var stopped = false;
var busy = false;
var commandBusy = false;
var lastFrame = '';
var lastSuccess = 0;
var notice = '';
var noticeUntil = 0;
var dialDelta = 0;
var dialTimer;
var tuningUntil = 0;
var tunedUntil = 0;
var lastTunedNotice = 0;
var lastData = {};
var browseMode = 'all';
var settingsReady = false;
var settingsLoading = false;
var menuOpen = false;
var menuChoice = 'all';
var browseKey = 'confirmed-browse-mode';
var suppressClick = false;
var detailKey = '';
var detailPhase = 'artist';
var detailUntil = 0;
var nowPlayingSince=0,equalizerKey='',equalizerVisible=false,lastEqualizerFrame='';
var equalizerPhase=0,equalizerPhaseAt=0;
var sxmEqualizerData={};
var pixelFont={
 ' ':'00000','A':'25755','B':'65656','C':'34443','D':'65556','E':'74647','F':'74644','G':'34553','H':'55755','I':'72227','J':'11152','K':'55655','L':'44447','M':'57755','N':'57555','O':'25552','P':'65644','Q':'25573','R':'65655','S':'34216','T':'72222','U':'55557','V':'55552','W':'55577','X':'55255','Y':'55222','Z':'71247',
 '0':'75557','1':'26227','2':'61247','3':'61216','4':'55711','5':'74616','6':'34657','7':'71222','8':'75757','9':'75716',
 '.':'00002',',':'00024',"'":'22000','"':'55000',':':'02020',';':'02024','-':'00700','_':'00007','/':'11244','\\':'44211','(':'12421',')':'42124','[':'32223',']':'62226','&':'25653','?':'71202','!':'22202','+':'02720','=':'07070','*':'52725','#':'57575','%':'51245','@':'75743','<':'12421','>':'42124','|':'22222'
};
function equalizerHeading(now,fixed){
 var track=sxmEqualizerData,labels=[track.station||'SiriusXM',track.artist||'',track.title||''];
 if(!fixed){
   if(!equalizerPhaseAt)equalizerPhaseAt=now;
   var width=labels[equalizerPhase].length*4-1;
   var duration=width<=64?5000:2400+width*100;
   if(now-equalizerPhaseAt>=duration){equalizerPhase=(equalizerPhase+1)%3;if(equalizerPhase===1&&!track.artist)equalizerPhase=2;equalizerPhaseAt=now;}
 }
 var phase=fixed?0:equalizerPhase;
 return {text:labels[phase],kind:phase===0?'brand':(phase===1?'artist':'song'),elapsed:fixed?0:now-equalizerPhaseAt};
}
function equalizerBitmap(tick,fixed){
 var track=sxmEqualizerData,rows=[],on=equalizerVisible;
 for(var y=0;y<16;y++){rows[y]=[];for(var x=0;x<72;x++)rows[y][x]='.';}
 if(on){
   var heading=equalizerHeading(Date.now(),fixed),symbol;
   if(heading.kind==='brand')symbol=track.playing?['#......','###....','#####..','###....','#......','.......']:['##.##..','##.##..','##.##..','##.##..','##.##..','.......'];
   else if(heading.kind==='artist')symbol=['...#...','...#...','.#####.','..###..','.#...#.','.......'];
   else symbol=['..####.','..#..#.','..#..#.','..#..#.','.##.##.','##.##..'];
   for(var sy=0;sy<6;sy++)for(var sx=0;sx<7;sx++)if(symbol[sy].charAt(sx)==='#')rows[sy][sx]='t';
   var value=clean(heading.text).toUpperCase(),width=value.length*4-1;
   var offset=width<=64?0:Math.floor(Math.max(0,heading.elapsed-1200)/100);
   var first=Math.floor(offset/4),limit=Math.min(value.length,first+18);
   for(var i=first;i<limit;i++){
     var glyph=pixelFont[value.charAt(i)]||pixelFont['?'];
     for(var gy=0;gy<5;gy++)for(var gx=0;gx<3;gx++){
       var px=8+i*4+gx-offset;
       if(px>=8&&px<72&&(parseInt(glyph.charAt(gy),10)&(1<<(2-gx))))rows[gy+1][px]='t';
     }
   }
   for(var band=0;band<18;band++){
     var height=track.playing?1+Math.floor(6*(0.5+0.5*Math.sin(tick*.63+band*1.19)*Math.cos(tick*.27-band*.39))):1;
     for(var by=7-height;by<7;by++)for(var bx=0;bx<3;bx++)rows[by+9][band*4+bx]=by<2?'r':(by<4?'y':'g');
   }
 }
 var lines=[];for(var line=0;line<16;line++)lines.push(rows[line].join(''));
 return {id:'equalizer',type:'xpmbitmap',display:'front',x:0,y:0,z_index:10,
   data:'! XPM2\n72 16 5 1\n. c '+(on?'#000000':'none')+'\nt c '+accent.substring(0,7)+'\ng c #44DD66\ny c #FFCC33\nr c #FF4433\n'+lines.join('\n')};
}
function validMode(mode){return mode==='all'||mode==='library';}
function loadSettings(){
  if(settingsLoading||stopped)return;settingsLoading=true;
  try {
    var saved=localStorage.getItem(browseKey);
    if(validMode(saved)){browseMode=saved;settingsReady=true;settingsLoading=false;return;}
  }catch(ignore){}
  fetch('http://localhost/api/apps/settings?app_id='+APP).then(function(r){
    if(!r.ok)throw new Error('Settings unavailable');return r.json();
  }).then(function(settings){
    var mode=settings.values&&settings.values.browse_mode;
    if(mode!=='all'&&mode!=='library')throw new Error('Invalid browse mode');
    browseMode=mode;settingsReady=true;
  }).catch(function(){settingsReady=false;notice='SETTINGS ERROR';noticeUntil=Date.now()+2000;}).then(function(){
    settingsLoading=false;if(settingsReady&&dialDelta)flushDial();
  });
}
function openBrowse(){
  if(!settingsReady){loadSettings();return;}
  if(dialTimer!==undefined)clearTimeout(dialTimer);
  dialDelta=0;menuChoice=browseMode;menuOpen=true;
  tuningUntil=0;tunedUntil=0;draw(lastData);
}
function closeBrowse(save){
  if(save){
    try{localStorage.setItem(browseKey,menuChoice);}catch(error){
      notice='SAVE FAILED - TRY AGAIN';noticeUntil=Date.now()+4000;draw(lastData);return;
    }
    browseMode=menuChoice;notice='SAVED: '+(browseMode==='library'?'LIBRARY':'ALL CHANNELS');
  }else notice='CANCELLED';
  noticeUntil=Date.now()+2500;menuOpen=false;detailUntil=0;draw(lastData);
}
function detailDuration(text){
  return text.length*5<=64?5000:2700+(text.length*5+64)*100;
}
var displayMode = 'normal';
var accent = '#33BBFFFF';
var effectStarted = 0;
var lastEffectFrame = '';
var rendering = false;
var pendingMain = null;
var pendingEffects = null;
function stationColor(name) {
  var key=String(name).toLowerCase();
  if(key.indexOf('metallica')>=0)return '#FFB52EFF';
  if(key.indexOf('octane')>=0)return '#FF4433FF';
  if(key.indexOf('hair nation')>=0)return '#CC66FFFF';
  if(key.indexOf('turbo')>=0)return '#00DDCCFF';
  if(key.indexOf('liquid metal')>=0)return '#FF3366FF';
  if(key.indexOf('ozzy')>=0)return '#9966FFFF';
  if(key.indexOf('lithium')>=0)return '#66CC55FF';
  var palette=['#33BBFFFF','#FFAA33FF','#66DD99FF','#EE77BBFF','#8877FFFF'];
  var hash=0;for(var i=0;i<key.length;i++)hash=(hash*31+key.charCodeAt(i))%65521;
  return palette[hash%palette.length];
}
function dim(color) {
  var out='#';for(var i=1;i<7;i+=2){var n=Math.floor(parseInt(color.substring(i,i+2),16)/7);out+=(n<16?'0':'')+n.toString(16);}
  return out+'FF';
}
function bar(id,x,width,color,z) {
  return {id:id,type:'rectangle',display:'front',x:x,y:7,width:width,height:1,
    fill:'solid',fill_colors:[color],border_width:0,z_index:z};
}
function effects() {
  var elapsed=Date.now()-effectStarted;
  var x=0,width=1,color='#000000FF';
  if(displayMode==='tuning'){
    var phase=(elapsed%2400)/1200;
    x=Math.round((phase<1?phase:2-phase)*64);width=8;color=accent;
  }else if(displayMode==='tuned'){
    width=72;color=elapsed<180?'#FFFFFFFF':(elapsed<650?accent:dim(accent));
  }
  return [bar('accent_line',0,72,dim(accent),1),bar('tuning_light',x,width,color,2)];
}
function pump() {
  if(stopped||rendering)return;
  var body=pendingMain||pendingEffects;
  if(!body)return;
  if(pendingMain){pendingMain=null;pendingEffects=null;}else pendingEffects=null;
  rendering=true;
  fetch('http://localhost/api/display/draw',{method:'POST',body:body}).then(function(r){
    if(!r.ok)lastFrame='';
  }).catch(function(){lastFrame='';}).then(function(){rendering=false;pump();});
}
function clean(value) {
  return String(value || '-').replace(/[^\x20-\x7E]/g, '?');
}
function label(id, text, screen, y, width, color, x) {
  return {id:id,type:'text',text:clean(text),display:screen,x:x||0,y:y,
    font:screen==='front'?'tiny':'small',align:'top_left',width:width,color:color,
    scroll_rate:600,scroll_start_delay:1200,scroll_repeat_delay:2000};
}
function smallIcon(id,pixels,color,y){
  return {id:id,type:'xpmbitmap',display:'front',x:0,y:y,opacity:equalizerVisible?0:100,
    data:'! XPM2\n7 6 2 1\n. c #000000\n# c '+color.substring(0,7)+'\n'+pixels.join('\n')};
}
function drawBrowse(){
  nowPlayingSince=0;equalizerVisible=false;equalizerPhase=0;equalizerPhaseAt=0;lastEqualizerFrame='';
  displayMode='normal';
  var name=menuChoice==='library'?'2. Library':'1. All Channels';
  var frame=JSON.stringify({application_name:APP,priority:50,elements:[
    label('state','BROWSE','front',0,64,'#33BBFFFF',8),
    label('track',name,'front',9,64,'#FFFFFFFF',8),
    label('brand','BROWSE CHANNELS','back',0,160,'#FFFFFFFF'),
    label('title',(menuChoice==='all'?'> ':'  ')+'1. All Channels','back',15,160,'#FFFFFFFF'),
    label('artist',(menuChoice==='library'?'> ':'  ')+'2. Library','back',29,160,'#FFFFFFFF'),
    label('controls','Turn: highlight / click: save','back',45,160,'#FFFFFFFF'),
    label('skip','Back: cancel','back',57,160,'#FFFFFFFF'),
    label('exit',Date.now()<noticeUntil&&notice.indexOf('SAVE FAILED')===0?notice:'Active: '+(browseMode==='library'?'Library':'All Channels'),'back',69,160,'#FFFFFFFF'),
    smallIcon('playback_icon',['.......','.......','.......','.......','.......','.......'],'#000000FF',0),
    smallIcon('detail_icon',['#......','###....','#####..','###....','#......','.......'],'#33BBFFFF',9),
    bar('accent_line',0,72,'#073344FF',1),bar('tuning_light',0,1,'#000000FF',2),equalizerBitmap(0,true)
  ]});
  if(frame===lastFrame)return;lastFrame=frame;pendingMain=frame;pump();
}
function draw(data) {
  if (stopped) return;
  lastData = data;
  if(menuOpen){drawBrowse();return;}
  var connected = data.available === true;
  var stationParts = String(data.title || '').split('\u00b7');
  var station = stationParts.length > 1 ? stationParts[stationParts.length-1].trim() : (data.channel || data.title || 'SiriusXM');
  var songParts = String(data.artist || '').split(' - ');
  var song = songParts.length > 1 ? songParts.slice(1).join(' - ').trim() : String(data.artist || ' ');
  var performer=songParts.length>1?songParts[0].trim():'';
  if(data.tuning){tuningUntil=Date.now()+2500;tunedUntil=0;}
  if(data.notice==='TUNED' && data.noticeUntil>Date.now() && data.noticeUntil>lastTunedNotice){
    lastTunedNotice=data.noticeUntil;tunedUntil=Math.max(Date.now()+2000,data.noticeUntil);
  }
  var tuning = connected && Date.now() < tuningUntil;
  var tuned = connected && !data.tuning && Date.now() < tunedUntil;
  var header = connected ? station : 'SIRIUSXM';
  var title = connected ? data.title : (data.message || 'Start PC companion');
  var artist = connected ? data.artist : 'Sign in and play a channel';
  var key=station+'\n'+performer+'\n'+song;
  if(key!==detailKey){detailKey=key;detailPhase=performer?'artist':'song';detailUntil=0;}
  if(connected&&!tuning&&!tuned){
    if(!detailUntil)detailUntil=Date.now()+detailDuration(detailPhase==='artist'?performer:song);
    else if(Date.now()>=detailUntil){
      detailPhase=detailPhase==='artist'?'song':(performer?'artist':'song');
      detailUntil=Date.now()+detailDuration(detailPhase==='artist'?performer:song);
    }
  }else detailUntil=0;
  var detail = connected ? (detailPhase==='artist'?performer:song) : title;
  if(connected && (tuning||tuned)){
    header=tuned?'TUNED':'TUNING';detail=data.channel||station;
  }
  var rearStatus = connected ? String(data.status).toUpperCase() : 'CONNECT TO PC';
  if(Date.now()<noticeUntil)rearStatus=notice;
  if(data.notice && data.noticeUntil>Date.now())rearStatus=data.notice;
  var mode=tuned?'tuned':(tuning?'tuning':'normal');
  if(mode!==displayMode){displayMode=mode;effectStarted=Date.now();lastEffectFrame='';}
  accent=stationColor((tuning||tuned)?(data.channel||station):station);
  var paused=String(data.status).toLowerCase()==='paused';
  var wasEqualizerVisible=equalizerVisible;
  sxmEqualizerData={station:station,artist:performer,title:song,playing:!paused};
  if(connected&&!tuning&&!tuned&&String(song).trim()){
    if(key!==equalizerKey){equalizerKey=key;nowPlayingSince=0;}
    if(!nowPlayingSince)nowPlayingSince=Date.now();
    equalizerVisible=Date.now()-nowPlayingSince>=36000;
  }else{nowPlayingSince=0;equalizerVisible=false;}
  if(!equalizerVisible||!wasEqualizerVisible){equalizerPhase=0;equalizerPhaseAt=0;lastEqualizerFrame='';}

  var pixels=paused?['##.##','##.##','##.##','##.##','##.##']:['#....','###..','#####','###..','#....'];
  var icon={id:'playback_icon',type:'xpmbitmap',display:'front',x:0,y:0,opacity:equalizerVisible?0:100,
    data:'! XPM2\n5 5 2 1\n. c #000000\n# c '+accent.substring(0,7)+'\n'+pixels.join('\n')};
  var frame = JSON.stringify({application_name:APP,priority:50,elements:[
    label('state',equalizerVisible?' ':header,'front',0,64,accent,8),
    label('track',equalizerVisible?' ':detail,'front',9,connected&&!tuning&&!tuned?64:72,'#FFFFFFFF',connected&&!tuning&&!tuned?8:0),
    label('brand',station+' / '+rearStatus,'back',0,160,'#FFFFFFFF'),
    label('title',(tuning||tuned)?(data.channel||station):title,'back',15,160,'#FFFFFFFF'),
    label('artist',(tuning||tuned)?' ':artist,'back',29,160,'#FFFFFFFF'),
    label('controls','Turn: channel / press: skip','back',45,160,'#FFFFFFFF'),
    label('skip','Start: play/pause / '+(browseMode==='library'?'Library':'All Channels'),'back',57,160,'#FFFFFFFF'),
    label('exit','Hold dial: browse / Back: exit','back',69,160,'#FFFFFFFF'),icon,
    smallIcon('detail_icon',connected&&!tuning&&!tuned?
      (detailPhase==='artist'?['...#...','...#...','.#####.','..###..','.#...#.','.......']:
      ['..####.','..#..#.','..#..#.','..#..#.','.##.##.','##.##..']):
      ['.......','.......','.......','.......','.......','.......'],'#FFFFFFFF',9)
  ].concat(effects()).concat([equalizerBitmap(0,true)])});
  if (frame === lastFrame) return;
  lastFrame = frame;
  pendingMain=frame;pump();
}
function refresh() {
  if(stopped || busy)return;
  busy=true;
  fetch(BASE+'/state?token='+TOKEN).then(function(r){
    if(!r.ok)throw new Error('Bridge unavailable');
    return r.json();
  }).then(function(data){lastSuccess=Date.now();draw(data);}).catch(function(){
    draw({available:false,message:'PC companion offline'});
  }).then(function(){busy=false;});
}
function command(action,delta) {
  if(stopped)return;
  if(action==='channel'&&!settingsReady){dialDelta+=delta;loadSettings();return;}
  if(commandBusy){if(action==='channel')dialDelta+=delta;return;}
  commandBusy=true;
  if(action==='channel'){tuningUntil=Date.now()+2500;draw(lastData);}
  fetch(BASE+'/command?token='+TOKEN,{method:'POST',body:JSON.stringify({action:action,delta:delta||0,browseMode:browseMode})}).then(function(r){
    if(!r.ok)throw new Error('Command failed');
    return r.json();
  }).then(function(result){
    notice=result.message||(result.ok?'SXM OK':'NOT AVAILABLE'); noticeUntil=Date.now()+1800;
  }).catch(function(){notice='PC OFFLINE';noticeUntil=Date.now()+1800;}).then(function(){commandBusy=false;refresh();if(dialDelta)flushDial();});
}
function flushDial(){
  dialTimer=undefined;
  if(stopped||!dialDelta)return;
  var delta=Math.max(-50,Math.min(50,dialDelta));dialDelta=0;command('channel',delta);
}
draw({available:false,message:'Connecting to PC...'});
var timer=setInterval(function(){
  if(!stopped && busy && lastSuccess && Date.now()-lastSuccess>15000)draw({available:false,message:'PC companion offline'});
  refresh();
},2000);
var effectTimer=setInterval(function(){
  if(stopped)return;
  if(displayMode==='normal'){
    if(!equalizerVisible){
      if(!menuOpen&&nowPlayingSince&&Date.now()-nowPlayingSince>=36000)draw(lastData);
      return;
    }
    if(menuOpen||pendingMain)return;
    var equalizerFrame=JSON.stringify({application_name:APP,priority:50,elements:[equalizerBitmap(Math.floor(Date.now()/125))]});
    if(equalizerFrame!==lastEqualizerFrame){lastEqualizerFrame=equalizerFrame;pendingEffects=equalizerFrame;pump();}
    return;
  }
  var now=Date.now();
  if((displayMode==='tuned'&&now>=tunedUntil)||(displayMode==='tuning'&&now>=tuningUntil&&!lastData.tuning)){
    draw(lastData);return;
  }
  var frame=JSON.stringify({application_name:APP,priority:50,elements:effects()});
  if(frame!==lastEffectFrame){lastEffectFrame=frame;pendingEffects=frame;pump();}
},125);
var unbind=listen('input',function(event){
  if(stopped)return;
  if(event.key==='ok'&&event.action==='long'){
    suppressClick=true;if(!menuOpen)openBrowse();return;
  }
  if(event.key==='ok'&&event.action==='press')suppressClick=false;
  if(event.key==='ok'&&event.action==='short'&&suppressClick){suppressClick=false;return;}
  if(menuOpen){
    if(event.key==='encoder'&&event.delta){menuChoice=event.delta>0?'library':'all';draw(lastData);}
    if(event.key==='ok'&&event.action==='short')closeBrowse(true);
    if(event.key==='back'&&event.action==='short')closeBrowse(false);
    return;
  }
  if(event.key==='start'&&event.action==='short')command('toggle');
  if(event.key==='ok'&&event.action==='short')command('skip');
  if(event.key==='encoder'){
    tunedUntil=0;lastTunedNotice=Math.max(lastTunedNotice,lastData.noticeUntil||0);
    tuningUntil=Date.now()+2500;draw(lastData);
    dialDelta+=event.delta;
    if(dialTimer!==undefined)clearTimeout(dialTimer);
    dialTimer=setTimeout(flushDial,220);
  }
  if(event.key==='back'&&event.action==='short'){
    stopped=true;clearInterval(timer);clearInterval(effectTimer);if(dialTimer!==undefined)clearTimeout(dialTimer);setTimeout(unbind,0);
  }
});
loadSettings();refresh();
