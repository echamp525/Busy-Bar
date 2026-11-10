(() => {
  const VERSION='1.1.0';
  if(globalThis.__busyMusicAgent?.version===VERSION)return;
  globalThis.__busyMusicAgent?.stop();
  let stopped=false,timer,wakeHandler;
  const agent={version:VERSION,stop(){stopped=true;clearInterval(timer);if(wakeHandler)chrome.runtime.onMessage.removeListener(wakeHandler);}};
  globalThis.__busyMusicAgent=agent;
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const qa=(name,root=document)=>root.querySelector('[data-testid="'+name+'"]');
  const text=e=>(e?.textContent||'').trim();
  const visible=e=>e&&!e.disabled&&e.getAttribute('aria-disabled')!=='true'&&e.getClientRects().length;
  const path=()=>location.pathname.replace(/\/+$/,'');
  let polling=false,executing=false,pendingAck=null,lastId=null,lastOutcome=null;
  let listItems=new Map(),playlistItems=new Map(),listContext=null;
  function metadata(){
    const player=qa('player-bar');
    const lines=Array.from(player?.querySelectorAll('[data-testid="lcd-metadata"] [data-testid="marquee-line"]')||[]);
    const first=lines[0]?.querySelector('.marquee-line__scrolling-text-chunk:not(.marquee-line__scrolling-text-chunk--copy)');
    const buttons=Array.from(lines[1]?.querySelectorAll('button')||[]);
    const metaLine=text(lines[1]?.querySelector('.marquee-line__scrolling-text-chunk:not(.marquee-line__scrolling-text-chunk--copy)'));
    const separator=metaLine.indexOf('\u2014');
    const artist=separator>=0?metaLine.substring(0,separator).trim():(text(buttons[0])||metaLine);
    const album=separator>=0?metaLine.substring(separator+1).trim():text(buttons[1]);
    return {title:text(first),artist,album,
      playing:!!player?.querySelector('button.playback-play__pause:not([aria-hidden="true"])'),
      signedIn:!!document.querySelector('nav a[data-testid="songs"]'),version:'1.1.0'};
  }
  function control(action){
    const player=qa('player-bar');
    let button;
    if(action==='toggle'){
      button=Array.from(player?.querySelectorAll('button.playback-play__pause,button.playback-play__play')||[])
        .find(b=>b.getAttribute('aria-hidden')!=='true'&&visible(b));
    }else{
      const direction=action==='next'?'next':'previous';
      button=player?.querySelector('amp-playback-controls-item-skip[direction="'+direction+'"]')?.shadowRoot?.querySelector('button');
    }
    if(!visible(button))throw Error('CONTROL UNAVAILABLE');button.click();
    return {ok:true,message:action==='toggle'?'PLAY / PAUSE':(action==='next'?'NEXT TRACK':'PREVIOUS TRACK')};
  }
  function areaFor(element){
    for(let e=element?.parentElement;e;e=e.parentElement){
      if(e.scrollHeight>e.clientHeight+20&&/(auto|scroll)/.test(getComputedStyle(e).overflowY))return e;
    }
    return document.scrollingElement;
  }
  function songs(){
    const library=Array.from(document.querySelectorAll('main [data-testid="library-track"]')).map(row=>{
      const parent=row.parentElement,height=parseFloat(parent.style.minHeight)||44,top=parseFloat(parent.style.top);
      const title=text(row.querySelector('.library-track-name__text'));
      return {position:Math.round(top/height),height,title,artist:text(qa('library-track__artist',row)),row,
        button:row.querySelector('button[data-testid="play-button"]')};
    });
    if(library.length)return library.filter(r=>Number.isFinite(r.position)&&r.title);
    return Array.from(document.querySelectorAll('main [data-testid="track-list-item"]')).map(row=>({
      position:Number(row.getAttribute('data-row')),height:row.getBoundingClientRect().height||64,
      title:text(qa('track-title',row)),artist:text(qa('track-column-secondary',row)),row,
      button:row.querySelector('button[data-testid="play-button"]')||row.querySelector('[data-testid="track-play-button"]')
    })).filter(r=>r.title&&Number.isFinite(r.position));
  }
  function playlistLinks(){
    return Array.from(document.querySelectorAll('nav a[href*="/library/playlist/"]'))
      .map(link=>({id:'playlist:'+link.getAttribute('href').split('/').pop(),title:text(link),artist:'',link}));
  }
  function playlistCards(){
    const nav=playlistLinks(),items=[],seen=new Set();
    for(const link of document.querySelectorAll('main a[data-testid="product-lockup-link"]')){
      const title=text(link);if(!title||seen.has(title))continue;seen.add(title);
      const known=nav.find(item=>item.title===title);
      items.push({id:known?.id||'card:'+title,title,artist:'',link:known?.link||link});
    }
    return items;
  }
  async function until(test,message){
    for(let i=0;i<120;i++){if(test())return;await delay(100);}
    throw Error(message);
  }
  async function navigate(scope,parent){
    if(!metadata().signedIn)throw Error('SIGN IN TO APPLE MUSIC');
    if(scope==='songs'){
      const link=document.querySelector('nav a[data-testid="songs"]');
      if(!path().endsWith('/library/songs'))link.click();
      await until(()=>path().endsWith('/library/songs')&&document.querySelector('main [data-testid="library-track"]'),'LIBRARY NOT READY');
    }else if(scope==='playlists'){
      const link=document.querySelector('nav a[data-testid="all-playlists"]');
      if(!link)throw Error('PLAYLISTS UNAVAILABLE');
      if(!path().endsWith('/library/all-playlists'))link.click();
      await until(()=>path().endsWith('/library/all-playlists')&&playlistCards().length,'PLAYLISTS NOT READY');
    }else{
      let item=playlistLinks().find(item=>item.id===parent)||playlistItems.get(parent);
      if(!item)throw Error('PLAYLIST CHANGED - REOPEN LIST');
      const title=item.title;
      if(location.pathname.includes('/library/playlist/')&&songs().length&&text(document.querySelector('main h1')).startsWith(title))return;
      if(!item.link?.isConnected){item=playlistCards().find(i=>i.id===parent);}
      if(!item?.link)throw Error('REOPEN PLAYLISTS');
      item.link.click();
      await until(()=>location.pathname.includes('/library/playlist/')&&songs().length&&text(document.querySelector('main h1')).startsWith(title),'PLAYLIST NOT READY');
    }
  }
  async function listPlaylists(page){
    const found=new Map();let stuck=0;
    for(let i=0;i<100;i++){
      const cards=playlistCards();for(const item of cards)found.set(item.id,item);
      if(found.size>(page+1)*50)break;
      const area=areaFor(cards[0]?.link);if(!area)break;
      const old=area.scrollTop;area.scrollTop+=Math.max(250,area.clientHeight*.75);await delay(150);
      if(area.scrollTop===old){if(++stuck>=4)break;}else stuck=0;
    }
    const all=Array.from(found.values()),items=all.slice(page*50,(page+1)*50);
    playlistItems=new Map(all.map(item=>[item.id,item]));
    listItems=new Map(items.map(item=>[item.id,item]));
    return {items:items.map(({id,title,artist})=>({id,title,artist})),hasMore:all.length>(page+1)*50,title:'Your playlists'};
  }
  async function listSongs(page){
    let rows=songs(),area=areaFor(rows[0]?.row);
    if(!area)throw Error('LIBRARY UNAVAILABLE');
    const start=page*50,end=start+50,found=new Map();
    area.scrollTop=start*(rows[0]?.height||44);await delay(200);
    let stuck=0;
    for(let i=0;i<150;i++){
      rows=songs();for(const item of rows)if(item.position>=start&&item.position<=end)found.set(item.position,item);
      if(found.has(end)&&found.size>=51)break;
      const old=area.scrollTop;area.scrollTop+=Math.max(200,area.clientHeight*.65);await delay(120);
      if(area.scrollTop===old){if(++stuck>=5)break;}else stuck=0;
    }
    const all=Array.from(found.values()).sort((a,b)=>a.position-b.position),items=all.filter(i=>i.position<end);
    // IDs bind the current row position to its observed title, avoiding a wrong song after reordering.
    for(const item of items)item.id='track:'+item.position+':'+encodeURIComponent(item.title).slice(0,350);
    listItems=new Map(items.map(item=>[item.id,item]));
    return {items:items.map(({id,title,artist})=>({id,title,artist})),hasMore:found.has(end),title:text(document.querySelector('main h1'))||'Library songs'};
  }
  async function listing(command){
    await navigate(command.scope,command.parent);
    listContext={scope:command.scope,parent:command.parent};
    const result=command.scope==='playlists'?await listPlaylists(command.page):await listSongs(command.page);
    return {ok:true,message:result.items.length?'READY':'NO ITEMS',listing:result};
  }
  async function play(id){
    const expected=listItems.get(id);if(!expected||!listContext||listContext.scope==='playlists')throw Error('REOPEN LIBRARY');
    await navigate(listContext.scope,listContext.parent);
    let rows=songs(),area=areaFor(rows[0]?.row);if(!area)throw Error('LIBRARY UNAVAILABLE');
    area.scrollTop=expected.position*(rows[0]?.height||44);await delay(200);
    for(let i=0;i<80;i++){
      rows=songs();const row=rows.find(r=>r.position===expected.position);
      if(row){
        if(row.title!==expected.title||row.artist!==expected.artist)throw Error('LIBRARY CHANGED - REOPEN');
        if(!visible(row.button))throw Error('TRACK UNAVAILABLE');
        row.button.click();
        await until(()=>metadata().title===expected.title&&metadata().playing,'PLAYBACK NOT STARTED');
        return {ok:true,message:'PLAYING'};
      }
      const low=Math.min(...rows.map(r=>r.position));
      area.scrollTop+=(expected.position<low?-1:1)*Math.max(200,area.clientHeight*.65);await delay(120);
    }
    throw Error('TRACK NOT FOUND');
  }
  async function poll(){
    if(stopped||polling)return;polling=true;
    try{
      const ack=pendingAck,result=await chrome.runtime.sendMessage({type:'busy-apple-poll',metadata:metadata(),ack});
      if(result?.ok&&pendingAck===ack)pendingAck=null;
      const command=result?.command;
      if(command&&!executing){
        if(command.id===lastId){pendingAck={id:command.id,...lastOutcome};return;}
        executing=true;
        void(async()=>{try{
          let outcome;
          try{outcome=command.action==='list'?await listing(command):(command.action==='play'?await play(command.item):control(command.action));}
          catch(error){outcome={ok:false,message:error.message||'UNAVAILABLE'};}
          lastId=command.id;lastOutcome=outcome;pendingAck={id:command.id,...outcome};
        }finally{executing=false;}})();
      }
    }catch(error){if(!chrome.runtime?.id||String(error).includes('Extension context invalidated'))agent.stop();}finally{polling=false;}
  }
  wakeHandler=(message,_sender,reply)=>{
    if(message?.type==='busy-apple-wake'){
      reply({version:VERSION});void poll();
    }
  };
  chrome.runtime.onMessage.addListener(wakeHandler);
  timer=setInterval(poll,1000);poll();
})();
