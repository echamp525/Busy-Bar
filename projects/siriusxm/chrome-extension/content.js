(() => {
  const VERSION='1.3.0';
  if(globalThis.__busyMusicAgent?.version===VERSION)return;
  globalThis.__busyMusicAgent?.stop();
  let stopped=false,timer,wakeHandler;
  const agent={version:VERSION,stop(){stopped=true;clearInterval(timer);if(wakeHandler)chrome.runtime.onMessage.removeListener(wakeHandler);}};
  globalThis.__busyMusicAgent=agent;
  if (/\/player\/(login|welcome)/.test(location.pathname)) return;
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  let pendingAck = null;
  let polling = false;
  let executing = false;
  let lastKnown = null;
  let lastCommandId = null;
  let lastCommandResult = null;
  let activeMode = null;
  let missingTotal = 0;
  function playerLines() {
    return (document.querySelector('[data-qa="mediaPlayer-track-metadata-top"]')?.innerText||'')
      .split('\n').map(line=>line.trim()).filter(Boolean);
  }
  function stationName() {
    const lines=playerLines(),caption=lines[0]||navigator.mediaSession?.metadata?.title||'';
    return caption.includes('\u00b7')?caption.split('\u00b7').pop().trim():(lines.length?caption:'');
  }
  function rows() {
    return Array.from(document.querySelectorAll('button[data-qa="epg-item-play"]')).filter(button=>
      !button.disabled && button.getClientRects().length).map(button => {
      const label = button.getAttribute('aria-label') || '';
      const match = label.match(/^List item (\d+) of (\d+)\. (.+)\. (Now playing|Press Enter to play)$/);
      return match && {position:Number(match[1]), total:Number(match[2]), name:match[3],
        playing:match[4] === 'Now playing', button};
    }).filter(Boolean);
  }
  function scrollArea(button) {
    for (let parent=button?.parentElement; parent; parent=parent.parentElement) {
      if (parent.scrollHeight > parent.clientHeight + 20 && /(auto|scroll)/.test(getComputedStyle(parent).overflowY)) return parent;
    }
    return document.scrollingElement;
  }
  function filterButton(mode) {
    const label=mode==='library'?'In Library':'All';
    return Array.from(document.querySelectorAll('button[data-qa="browse-filters-item-'+label+'"]'))
      .find(button=>!button.disabled && button.getClientRects().length);
  }
  function selectedFilter(button) {
    return (button?.getAttribute('aria-label')||'').startsWith('Selected,');
  }
  function clearFiltersButton() {
    return Array.from(document.querySelectorAll('button')).find(button=>!button.disabled&&button.getClientRects().length&&
      (button.getAttribute('aria-label')||button.textContent||'').trim()==='Clear filters');
  }
  async function ensureChannels(mode) {
    if(!filterButton('all')&&!filterButton('library')&&!clearFiltersButton()){
      const link=document.querySelector('a[href*="/player/curated-grouping/all-channels/"]');
      if(!link)throw new Error('OPEN CHANNELS');
      link.click();
      for(let i=0;i<60&&!filterButton('all')&&!filterButton('library')&&!clearFiltersButton();i++)await delay(100);
    }
    let button=filterButton(mode);
    if(!button){
      const clear=clearFiltersButton();
      if(clear){
        lastKnown=null;clear.click();
        for(let i=0;i<60&&!filterButton(mode);i++)await delay(100);
        button=filterButton(mode);
      }
    }
    if(!button)throw new Error('CHANNELS OFFLINE');
    if(activeMode!==mode||!selectedFilter(button))lastKnown=null;
    if(!selectedFilter(button)){
      button.click();
      for(let i=0;i<60;i++){
        await delay(100);button=filterButton(mode);
        if(button&&selectedFilter(button)&&rows().length)break;
      }
    }
    activeMode=mode;
    if(!selectedFilter(filterButton(mode)))throw new Error('FILTER UNAVAILABLE');
    if(!rows().length)throw new Error(mode==='library'?'LIBRARY EMPTY':'CHANNELS OFFLINE');
  }
  async function findPlaying(allowMissing) {
    let list=rows();
    const name=stationName();
    const match=row=>name?row.name===name:row.playing;
    let current=list.find(match);
    if(current){lastKnown={position:current.position,name:current.name};return current;}
    // A previously tuned position remains valid in this exact channel-list/filter.
    if(lastKnown&&(!name||lastKnown.name===name))return lastKnown;
    let area=scrollArea(list[0]?.button);
    if(!area)throw new Error('OPEN CHANNELS');
    area.scrollTop=0;
    let stuck=0;
    for(let i=0;i<150;i++){
      await delay(120);list=rows();current=list.find(match);
      if(current){lastKnown={position:current.position,name:current.name};return current;}
      area=scrollArea(list[0]?.button)||area;
      const old=area.scrollTop;area.scrollTop+=Math.max(300,area.clientHeight*0.75);
      if(area.scrollTop===old){if(++stuck>12)break;}else stuck=0;
    }
    missingTotal=Math.max(0,...rows().map(row=>row.total));
    if(allowMissing)return null;
    throw new Error('PLAY A CHANNEL');
  }
  async function locate(position) {
    let stuck=0;
    for(let i=0;i<150;i++){
      const list=rows();
      const target=list.find(row=>row.position===position);
      if(target)return target;
      const area=scrollArea(list[0]?.button);
      if(!area||!list.length)throw new Error('CHANNELS OFFLINE');
      const low=Math.min(...list.map(row=>row.position));
      const old=area.scrollTop;
      area.scrollTop+=(position<low?-1:1)*Math.max(300,area.clientHeight*0.75);
      if(area.scrollTop===old){if(++stuck>12)break;}else stuck=0;
      await delay(120);
    }
    throw new Error(position<1?'FIRST CHANNEL':'CHANNEL LIMIT');
  }
  async function tune(delta,mode) {
    mode=mode==='library'?'library':'all';
    await ensureChannels(mode);
    let current=await findPlaying(mode==='library');
    if(!current)current={position:delta<0?missingTotal+1:0};
    const wanted=current.position+Math.max(-50,Math.min(50,Math.trunc(delta)));
    if(wanted<1)throw new Error('FIRST CHANNEL');
    const target=await locate(wanted);
    if(mode==='library'){
      const row=target.button.closest('[data-qa="epg-channel-row"]')||target.button.parentElement;
      const saved=row&&Array.from(row.querySelectorAll('button')).some(button=>
        (button.getAttribute('aria-label')||button.textContent||'').trim()==='Remove from Library');
      if(!saved)throw new Error('NOT IN LIBRARY');
    }
    if(target.button.disabled || target.button.getAttribute('aria-disabled')==='true')throw new Error('UNAVAILABLE');
    target.button.click();
    for(let i=0;i<50;i++){
      await delay(100);
      const playing=rows().find(row=>row.position===wanted);
      if(playing&&(stationName()===target.name||(!playerLines().length&&playing.playing))){
        lastKnown={position:playing.position,name:playing.name};return {ok:true,message:'TUNED'};
      }
    }
    throw new Error('TUNE FAILED');
  }
  function skip() {
    const button=Array.from(document.querySelectorAll('button')).find(button=>
      (button.getAttribute('aria-label')||button.textContent||'').trim()==='Skip forward');
    if(!button || button.disabled || button.getAttribute('aria-disabled')==='true')return {ok:false,message:'SKIP UNAVAILABLE'};
    button.click();
    return {ok:true,message:'SKIPPED'};
  }
  function toggle() {
    const fallback=Array.from(document.querySelectorAll('[data-qa="mediaPlayer-control-buttons"] button')).find(button=>
      button.getClientRects().length && ['Play','Pause'].includes(button.getAttribute('aria-label')));
    if(!fallback||fallback.disabled)throw Error('CONTROL UNAVAILABLE');
    fallback.click();return {ok:true,message:'PLAY / PAUSE'};
  }
  function metadata() {
    const station=stationName();
    const playing=rows().find(row=>station?row.name===station:row.playing);
    if(lastKnown&&station&&lastKnown.name!==station)lastKnown=null;
    if(playing)lastKnown={position:playing.position,name:playing.name};
    const media=navigator.mediaSession?.metadata;
    const lines=playerLines();
    const caption=lines[0]||'';
    const track=lines.slice(1).join(' - ');
    const canToggle=!!Array.from(document.querySelectorAll('[data-qa="mediaPlayer-control-buttons"] button')).find(b=>
      b.getClientRects().length && ['Play','Pause'].includes(b.getAttribute('aria-label')));
    const playingNow=!!Array.from(document.querySelectorAll('[data-qa="mediaPlayer-control-buttons"] button')).find(b=>b.getAttribute('aria-label')==='Pause'&&b.getClientRects().length);
    return {title:String(caption||media?.title||station).slice(0,600), artist:String(track||media?.artist||'').slice(0,600),
      playing:playingNow,canToggle,
      channel:String(station||playing?.name||lastKnown?.name||'').slice(0,200),
      browseModes:true,browseMode:activeMode,browseVersion:'1.3.0'};
  }
  async function poll() {
    if(stopped||polling)return;
    polling=true;
    try {
      const ack=pendingAck;
      const result=await chrome.runtime.sendMessage({type:'busy-bar-poll',metadata:metadata(),ack});
      if(result?.ok && pendingAck===ack)pendingAck=null;
      const command=result?.command;
      if(command && !executing){
        if(command.id===lastCommandId){pendingAck={id:command.id,...lastCommandResult};return;}
        executing=true;
        // Continue heartbeats while a long virtualized list is being loaded.
        void (async()=>{try{
          let outcome;
          try{outcome=command.action==='channel'?await tune(command.delta,command.browseMode):(command.action==='toggle'?toggle():skip());}
          catch(error){outcome={ok:false,message:error.message||'UNAVAILABLE'};}
          lastCommandId=command.id;lastCommandResult=outcome;
          pendingAck={id:command.id,...outcome};
        }finally{executing=false;}})();
      }
    }catch(error){if(!chrome.runtime?.id||String(error).includes('Extension context invalidated'))agent.stop();}finally{polling=false;}
  }
  // Changing a filter/order makes old row positions invalid.
  document.addEventListener('click',event=>{
    if(executing)return;
    const button=event.target.closest?.('button');
    if(button && !button.matches('[data-qa="epg-item-play"]'))lastKnown=null;
  },true);
  wakeHandler=(message,_sender,reply)=>{
    if(message?.type==='busy-sirius-wake'){
      reply({version:VERSION});void poll();
    }
  };
  chrome.runtime.onMessage.addListener(wakeHandler);
  timer=setInterval(poll,1000);
  poll();
})();
