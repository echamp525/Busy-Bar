const vm=require('node:vm');
const fs=require('node:fs');
const assert=require('node:assert/strict');
let selected=1,clicks=0,skips=0,interval,pending=null;
let mode='all',paused=false,knownStation=false;
const acknowledgements=[];
const buttons=[1,2,3].map(position=>({disabled:false,parentElement:null,
  getClientRects(){return [{}];},
  closest(){return {querySelectorAll(){return [{getAttribute(){return null;},textContent:position!==2?'Remove from Library':'Add to Library'}];}};},
  getAttribute(name){const ids=mode==='library'?[1,3]:[1,2,3];return name==='aria-label'?`List item ${ids.indexOf(position)+1} of ${ids.length}. Channel ${position}. ${selected===position&&!paused?'Now playing':'Press Enter to play'}`:null;},
  click(){selected=position;paused=false;clicks++;}}));
const filters=Object.fromEntries(['all','library'].map(value=>[value,{disabled:false,getClientRects(){return [{}];},getAttribute(){return (mode===value?'Selected, ':'')+(value==='library'?'In Library':'All');},click(){mode=value;}}]));
const scroll={clientHeight:100,get scrollTop(){return 0;},set scrollTop(value){}};
const skip={disabled:true,getClientRects(){return [{}];},getAttribute(name){return name==='aria-label'?'Skip forward':null;},click(){skips++;}};
const context={location:{pathname:'/player/curated-grouping/all-channels/example'},
  document:{scrollingElement:scroll,querySelectorAll(selector){
    if(selector.includes('browse-filters-item-'))return mode==='talk'||(mode==='library'&&!selector.includes('In Library'))?[]:[filters[selector.includes('In Library')?'library':'all']];
    if(selector.includes('epg-item-play'))return mode==='library'?[buttons[0],buttons[2]]:buttons;
    return [...buttons,skip,...(mode!=='all'?[{disabled:false,getClientRects(){return [{}];},getAttribute(){return 'Clear filters';},click(){mode='all';}}]:[])];
  },addEventListener(){},querySelector(selector){return knownStation&&selector.includes('mediaPlayer-track-metadata-top')?{get innerText(){return 'Program · Channel '+selected+'\nArtist - Song'}}:null;}},
  navigator:{mediaSession:{metadata:{title:'Test title',artist:'Test artist'}}},
  chrome:{runtime:{onMessage:{addListener(){}},async sendMessage(message){if(message.ack){acknowledgements.push(message.ack);pending=null;}return {ok:true,command:pending};}}},
  setInterval(fn){interval=fn;},setTimeout(fn){return setImmediate(fn);},getComputedStyle(){return {overflowY:'auto'};}};
vm.runInNewContext(fs.readFileSync('projects/siriusxm/chrome-extension/content.js','utf8'),context);
const settle=()=>new Promise(resolve=>setTimeout(resolve,25));
(async()=>{
  await settle();pending={id:'one',action:'channel',delta:1};await interval();await settle();await interval();await settle();
  assert.equal(selected,2);assert.equal(clicks,1);assert.equal(acknowledgements.at(-1).message,'TUNED');
  pending={id:'one',action:'channel',delta:1};await interval();await settle();await interval();await settle();assert.equal(clicks,1,'Replayed command must not tune twice');
  pending={id:'two',action:'skip'};await interval();await settle();await interval();await settle();assert.equal(skips,0);assert.equal(acknowledgements.at(-1).ok,false);
  skip.disabled=false;pending={id:'three',action:'skip'};await interval();await settle();await interval();await settle();assert.equal(skips,1);assert.equal(acknowledgements.at(-1).ok,true);
  pending={id:'four',action:'channel',delta:1,browseMode:'library'};await interval();await settle();await interval();await settle();assert.equal(mode,'library');assert.equal(selected,1,'Non-favorite current station must enter Library at the first favorite');
  pending={id:'five',action:'channel',delta:1,browseMode:'library'};await interval();await settle();await interval();await settle();assert.equal(selected,3,'Library dial must skip unfavorited Channel 2');
  pending={id:'six',action:'channel',delta:-1,browseMode:'all'};await interval();await settle();await interval();await settle();assert.equal(mode,'all');assert.equal(selected,2,'All Channels must include unfavorited channels again');
  mode='talk';pending={id:'seven',action:'channel',delta:1,browseMode:'library'};await interval();await settle();await interval();await settle();assert.equal(mode,'library');assert.equal(selected,1,'Library must clear a previously selected category');assert.equal(acknowledgements.at(-1).message,'TUNED');
  mode='all';selected=2;paused=true;knownStation=true;
  pending={id:'paused',action:'channel',delta:1,browseMode:'all'};await interval();await settle();await interval();await settle();
  assert.equal(selected,3,'Paused player must tune relative to its metadata station, not a stale row marker');assert.equal(acknowledgements.at(-1).message,'TUNED');
  console.log('Passed All/Library/category filter switching, favorite-only tuning, non-favorite starting station, duplicate protection, and skip controls.');
})().catch(error=>{console.error(error);process.exitCode=1;});
