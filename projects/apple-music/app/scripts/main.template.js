var APP='local.applemusic.remote',BASE='__BRIDGE_URL__',TOKEN='__BRIDGE_TOKEN__';
var stopped=false,polling=false,drawing=false,pending=null,pendingEffect=null,lastFrame='',state={};
var view='playing',choice=0,scope='songs',parent='',page=0,requestId='',items=[],hasMore=false,localNotice='',noticeUntil=0;
var commandBusy=false,phase='artist',detailKey='',detailUntil=0,suppressClick=false;
var nowPlayingSince=0,equalizerKey='',equalizerVisible=false,lastEqualizerFrame='';
var equalizerPhase=0,equalizerPhaseAt=0;
var pixelFont={
 ' ':'00000','A':'25755','B':'65656','C':'34443','D':'65556','E':'74647','F':'74644','G':'34553','H':'55755','I':'72227','J':'11152','K':'55655','L':'44447','M':'57755','N':'57555','O':'25552','P':'65644','Q':'25573','R':'65655','S':'34216','T':'72222','U':'55557','V':'55552','W':'55577','X':'55255','Y':'55222','Z':'71247',
 '0':'75557','1':'26227','2':'61247','3':'61216','4':'55711','5':'74616','6':'34657','7':'71222','8':'75757','9':'75716',
 '.':'00002',',':'00024',"'":'22000','"':'55000',':':'02020',';':'02024','-':'00700','_':'00007','/':'11244','\\':'44211','(':'12421',')':'42124','[':'32223',']':'62226','&':'25653','?':'71202','!':'22202','+':'02720','=':'07070','*':'52725','#':'57575','%':'51245','@':'75743','<':'12421','>':'42124','|':'22222'
};
function clean(s){return String(s||' ').replace(/[^\x20-\x7E]/g,'?');}
function text(id,value,screen,y,width,x,color){return {id:id,type:'text',text:clean(value),display:screen,x:x||0,y:y,width:width,font:screen==='front'?'tiny':'small',color:color||'#FFFFFFFF',scroll_rate:600,scroll_start_delay:1200,scroll_repeat_delay:2000,z_index:2};}
function icon(paused){var rows=paused?['##.##','##.##','##.##','##.##','##.##']:['#....','###..','#####','###..','#....'];return {id:'icon',type:'xpmbitmap',display:'front',x:0,y:0,data:'! XPM2\n5 5 2 1\n. c #000000\n# c #FF3030\n'+rows.join('\n')};}
function equalizerHeading(now,fixed){
 var track=state.track||{},labels=['Apple Music',track.artist||'Unknown artist',track.title||'Unknown song'];
 if(!fixed){
   if(!equalizerPhaseAt)equalizerPhaseAt=now;
   var width=labels[equalizerPhase].length*4-1;
   var duration=width<=64?5000:2400+width*100;
   if(now-equalizerPhaseAt>=duration){equalizerPhase=(equalizerPhase+1)%3;equalizerPhaseAt=now;}
 }
 var phase=fixed?0:equalizerPhase;
 return {text:labels[phase],kind:phase===0?'brand':(phase===1?'artist':'song'),elapsed:fixed?0:now-equalizerPhaseAt};
}
function equalizerBitmap(tick,fixed){
 var track=state.track||{},rows=[],on=equalizerVisible;
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
 return {id:'equalizer',type:'xpmbitmap',display:'front',x:0,y:0,z_index:1,
   data:'! XPM2\n72 16 5 1\n. c '+(on?'#000000':'none')+'\nt c #FF3030\ng c #44DD66\ny c #FFCC33\nr c #FF4433\n'+lines.join('\n')};
}
function pump(){if(stopped||drawing||(!pending&&!pendingEffect))return;var body=pending||pendingEffect;if(pending){pending=null;pendingEffect=null;}else pendingEffect=null;drawing=true;fetch('http://localhost/api/display/draw',{method:'POST',body:body}).then(function(r){if(!r.ok)lastFrame='';}).catch(function(){lastFrame='';}).then(function(){drawing=false;pump();});}
function draw(){
 if(stopped)return;
 var track=state.track||{},title=track.title||'APPLE MUSIC',detail=track.artist||'Play a song in Chrome',header=title;
 var eqKey=title+'\n'+track.artist+'\n'+track.album,wasEqualizerVisible=equalizerVisible;
 if(view==='playing'&&state.attached&&track.signedIn&&track.title){
   if(eqKey!==equalizerKey){equalizerKey=eqKey;nowPlayingSince=0;}
   if(!nowPlayingSince)nowPlayingSince=Date.now();
   equalizerVisible=Date.now()-nowPlayingSince>=36000;
 }else{nowPlayingSince=0;equalizerVisible=false;}
 if(!equalizerVisible||!wasEqualizerVisible){equalizerPhase=0;equalizerPhaseAt=0;lastEqualizerFrame='';}
 var rear1=title,rear2=track.artist||'',rear3=track.album||'',hint='Turn: next/previous / click: next',hint2='Start: play/pause',hint3='Hold dial: browse / Back: exit';
 if(!state.attached){header='APPLE MUSIC';detail='Connect Chrome';rear1='Open Apple Music in Chrome';rear2='Sign in and play a song';rear3='Start PC companion + extension';}
 else if(!track.signedIn){header='SIGN IN';detail='Apple Music in Chrome';}
 else if(view==='playing'){
   var key=title+'\n'+track.artist;
   if(key!==detailKey){detailKey=key;phase=track.artist?'artist':'song';detailUntil=0;}
   var value=phase==='artist'?track.artist:title;
   if(!detailUntil)detailUntil=Date.now()+Math.max(5000,2700+(String(value||'').length*5+64)*100);
   else if(Date.now()>detailUntil){phase=phase==='artist'?'song':(track.artist?'artist':'song');detailUntil=0;}
   detail=phase==='artist'?'* '+track.artist:'~ '+title;
 }
 if(view==='root'){
   header='BROWSE';detail=['1. Library songs','2. Playlists','3. Now playing'][choice];
   rear1='APPLE MUSIC / BROWSE';rear2=(choice===0?'> ':'  ')+'1. Library songs';rear3=(choice===1?'> ':'  ')+'2. Playlists';
   hint=(choice===2?'> ':'  ')+'3. Now playing';hint2='Turn: highlight / click: select';hint3='Back: now playing';
 }else if(view==='loading'){
   header='LOADING';detail=scope==='playlists'?'Playlists':'Library songs';rear1='Loading from Apple Music...';rear2='Keep the Chrome tab open';rear3='';hint='';hint2='';hint3='Back: cancel browsing';
 }else if(view==='list'){
   var item=items[choice],previous=page>0&&choice===items.length,next=hasMore&&choice===items.length+(page>0?1:0);
   var label=item?item.title:(previous?'Previous page':(next?'Next page':'No items'));
   header=scope==='playlists'?'PLAYLISTS':(scope==='playlist'?'PLAYLIST':'LIBRARY');detail='> '+label;
   rear1=(state.library&&state.library.title)||header;rear2=label;rear3=item?item.artist:'';
   hint='Page '+(page+1)+' / item '+(choice+1);hint2='Turn: highlight / click: '+(scope==='playlists'?'open':'play');hint3='Back: browse menu';
 }
 if(Date.now()<noticeUntil)rear3=localNotice;
 else if(state.notice)rear3=state.notice;
 // The active front screen is one bitmap so refreshes preserve its red heading.
 var frame=JSON.stringify({application_name:APP,priority:50,elements:[icon(!track.playing),text('header',equalizerVisible?' ':header,'front',0,64,8,'#FF3030FF'),text('detail',equalizerVisible?' ':detail,'front',9,72),text('rear1',rear1,'back',0,160),text('rear2',rear2,'back',15,160),text('rear3',rear3,'back',29,160),text('hint',hint,'back',45,160),text('hint2',hint2,'back',57,160),text('hint3',hint3,'back',69,160),equalizerBitmap(0,true)]});
 if(frame===lastFrame)return;lastFrame=frame;pending=frame;pump();
}
function refresh(){if(stopped||polling)return;polling=true;fetch(BASE+'/state?token='+TOKEN).then(function(r){if(!r.ok)throw new Error('Offline');return r.json();}).then(function(data){
 state=data;
 if(view==='loading'&&requestId&&data.library&&data.library.requestId===requestId&&data.library.state!=='loading'){
   if(data.library.state==='ok'){items=data.library.items||[];hasMore=data.library.hasMore===true;choice=0;view='list';}
   else{view='root';choice=0;localNotice=data.notice||'Library unavailable';noticeUntil=Date.now()+4000;}
 }draw();
}).catch(function(){state={attached:false};draw();}).then(function(){polling=false;});}
function send(body,callback){if(stopped||commandBusy)return;if(body.action==='play'||body.action==='next'||body.action==='previous')nowPlayingSince=0;commandBusy=true;fetch(BASE+'/command?token='+TOKEN,{method:'POST',body:JSON.stringify(body)}).then(function(r){if(!r.ok)throw new Error('Command failed');return r.json();}).then(function(result){if(!result.ok)throw new Error(result.message||'Unavailable');if(callback)callback(result);}).catch(function(e){localNotice=e.message;noticeUntil=Date.now()+4000;if(view==='loading')view='root';}).then(function(){commandBusy=false;draw();refresh();});}
function load(which,number,playlist){scope=which;page=number||0;parent=playlist||'';requestId='';view='loading';draw();send({action:'list',scope:scope,page:page,parent:parent},function(result){requestId=result.requestId;});}
var timer=setInterval(refresh,1000);
var equalizerTimer=setInterval(function(){
 if(stopped)return;
 if(!equalizerVisible){
   if(view==='playing'&&nowPlayingSince&&Date.now()-nowPlayingSince>=36000)draw();
   return;
 }
 if(view!=='playing'||!state.attached||!state.track||pending)return;
 var frame=JSON.stringify({application_name:APP,priority:50,elements:[equalizerBitmap(Math.floor(Date.now()/125))]});
 if(frame!==lastEqualizerFrame){lastEqualizerFrame=frame;pendingEffect=frame;pump();}
},125);
var unbind=listen('input',function(e){
 if(stopped)return;
 if(e.key==='ok'&&e.action==='press')suppressClick=false;
 if(e.key==='ok'&&e.action==='long'){suppressClick=true;view='root';choice=0;draw();return;}
 if(e.key==='ok'&&e.action==='short'&&suppressClick){suppressClick=false;return;}
 if(e.key==='start'&&e.action==='short'){send({action:'toggle'});return;}
 if(e.key==='encoder'){
   if(view==='root')choice=Math.max(0,Math.min(2,choice+e.delta));
   else if(view==='list')choice=Math.max(0,Math.min(Math.max(0,items.length+(page>0?1:0)+(hasMore?1:0)-1),choice+e.delta));
   else if(view==='playing')send({action:e.delta>0?'next':'previous'});
   draw();return;
 }
 if(e.key==='ok'&&e.action==='short'){
   if(view==='root'){if(choice===2)view='playing';else load(choice===0?'songs':'playlists',0,'');}
   else if(view==='list'){
     var item=items[choice];
     if(item){if(scope==='playlists')load('playlist',0,item.id);else send({action:'play',item:item.id},function(){view='playing';detailUntil=0;});}
     else if(page>0&&choice===items.length)load(scope,page-1,parent);
     else if(hasMore)load(scope,page+1,parent);
   }else if(view==='playing')send({action:'next'});
   draw();return;
 }
 if(e.key==='back'&&e.action==='short'){
   if(view==='playing'){stopped=true;clearInterval(timer);clearInterval(equalizerTimer);setTimeout(unbind,0);}
   else if(view==='root')view='playing';
   else if(view==='list'&&scope==='playlist')load('playlists',0,'');
   else {view='root';choice=0;}
   draw();
 }
});
draw();refresh();
