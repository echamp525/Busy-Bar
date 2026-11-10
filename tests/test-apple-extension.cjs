const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
let poll,pending=null,playing=true,title='Song 0',clicks=0,lastMetadata;const acks=[];
const area={clientHeight:440,scrollHeight:70*44,parentElement:null};let scroll=0;
Object.defineProperty(area,'scrollTop',{get(){return scroll},set(v){scroll=Math.max(0,Math.min(70*44-440,v))}});
const visible=()=>[{}];
const node=value=>({textContent:value});
function row(i){const parent={style:{minHeight:'44px',top:i*44+'px'},parentElement:area,scrollHeight:44,clientHeight:44};
 const button={disabled:false,getClientRects:visible,getAttribute(){return null},click(){playing=true;title='Song '+i;clicks++}};
 return {parentElement:parent,querySelector(s){if(s.includes('library-track-name__text'))return node('Song '+i);if(s.includes('library-track__artist'))return node('Artist');if(s.includes('play-button'))return button;return null;}};
}
const link={click(){location.pathname='/us/library/songs'}};
const location={pathname:'/us/library/songs/'};
const toggle={getClientRects:visible,getAttribute(){return null},click(){playing=!playing}};
const hidden={getClientRects:visible,getAttribute(){return 'true'},click(){throw Error('Clicked hidden button')}};
const player={querySelector(s){
 if(s.includes('amp-playback-controls-item-skip'))return {shadowRoot:{querySelector(){return {getClientRects:visible,getAttribute(){return null},click(){title='Song '+(Number(title.split(' ')[1])+(s.includes('"next"')?1:-1));}}}}};
 return s.includes('playback-play__pause')&&playing?{}:null;
},querySelectorAll(s){
 if(s.includes('marquee-line'))return [{querySelector(){return node(title)}},{querySelector(){return node('Artist \u2014 Album')},querySelectorAll(){return []}}];
 if(s.includes('button.playback-play'))return [hidden,toggle];return [];
}};
const document={scrollingElement:area,querySelector(s){if(s.includes('player-bar'))return player;if(s.includes('nav a'))return link;if(s.includes('library-track'))return row(0);return null;},querySelectorAll(s){if(s.includes('main [data-testid="library-track"]')){const first=Math.max(0,Math.floor(scroll/44)-5);return Array.from({length:Math.min(25,70-first)},(_,n)=>row(first+n));}return [];}};
const context={document,location,getComputedStyle:e=>({overflowY:e===area?'auto':'hidden'}),setInterval(fn){poll=fn},setTimeout(fn){return setImmediate(fn)},chrome:{runtime:{onMessage:{addListener(){}},async sendMessage(message){lastMetadata=message.metadata;if(message.ack){acks.push(message.ack);pending=null;}return {ok:true,command:pending}}}}};
vm.runInNewContext(fs.readFileSync('projects/apple-music/chrome-extension/content.js','utf8'),context);
const settle=()=>new Promise(r=>setTimeout(r,30));
async function run(command){pending=command;await poll();await settle();await poll();await settle();return acks.at(-1)}
(async()=>{
 await settle();assert.equal(lastMetadata.artist,'Artist','Read artist even when Apple renders plain text');assert.equal(lastMetadata.album,'Album');let ack=await run({id:'a',action:'list',scope:'songs',page:0,parent:''});
 assert(ack.ok);assert.equal(ack.listing.items.length,50);assert.equal(ack.listing.hasMore,true);assert.equal(ack.listing.items[49].title,'Song 49');
 ack=await run({id:'b',action:'list',scope:'songs',page:1,parent:''});assert(ack.ok);assert.equal(ack.listing.items.length,20);assert.equal(ack.listing.hasMore,false);
 const id=ack.listing.items[15].id;
 ack=await run({id:'c',action:'play',item:id});assert(ack.ok);assert.equal(title,'Song 65');assert.equal(clicks,1);
 await run({id:'c',action:'play',item:id});assert.equal(clicks,1,'Duplicate command must not replay a track');
 ack=await run({id:'d',action:'toggle'});assert(ack.ok);assert.equal(playing,false);
 ack=await run({id:'e',action:'toggle'});assert(ack.ok);assert.equal(playing,true);
 ack=await run({id:'f',action:'next'});assert(ack.ok);assert.equal(title,'Song 66');
 ack=await run({id:'g',action:'previous'});assert(ack.ok);assert.equal(title,'Song 65');
 console.log('Passed virtualized paging, selection/replay protection, hidden-button filtering and shadow-DOM playback controls.');
})().catch(e=>{console.error(e);process.exitCode=1});
