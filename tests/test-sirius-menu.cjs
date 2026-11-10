const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('projects/siriusxm/app/scripts/main.template.js','utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function boot(saved){
  let input,frame;const commands=[],stored=new Map(saved?[['confirmed-browse-mode',saved]]:[]);
  const context={Date,localStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)},
    setInterval(){},clearInterval(){},setTimeout(){},clearTimeout(){},listen(name,fn){input=fn;return ()=>{};},
    fetch(url,options){let data={available:false};if(url.includes('/apps/settings'))data={values:{browse_mode:'all'}};
      if(url.includes('/display/draw'))frame=JSON.parse(options.body);
      if(url.includes('/command')){commands.push(JSON.parse(options.body));data={ok:true};}
      return Promise.resolve({ok:true,json:()=>Promise.resolve(data)});}};
  vm.runInNewContext(source,context);
  return {context,commands,stored,input:e=>input(e),frame:()=>frame};
}
(async()=>{
  const b=boot();await settle();await settle();
  b.input({key:'ok',action:'long'});await settle();assert.equal(b.context.menuOpen,true);
  b.input({key:'ok',action:'short'});assert.equal(b.context.menuOpen,true,'Opening hold must not confirm on release');
  b.input({key:'encoder',delta:1});assert.equal(b.context.menuChoice,'library');
  assert.equal(b.context.browseMode,'all');assert.equal(b.stored.size,0,'Highlighting must not save');
  b.input({key:'start',action:'short'});assert.equal(b.commands.length,0,'Menu must not control playback');
  b.input({key:'back',action:'short'});assert.equal(b.context.menuOpen,false);assert.equal(b.context.stopped,false);assert.equal(b.context.browseMode,'all');
  b.input({key:'ok',action:'long'});b.input({key:'encoder',delta:1});
  b.input({key:'ok',action:'press'});b.input({key:'ok',action:'short'});await settle();
  assert.equal(b.context.menuOpen,false);assert.equal(b.context.browseMode,'library');assert.equal(b.stored.get('confirmed-browse-mode'),'library');
  assert.equal(b.commands.length,0,'Confirmation must not skip or tune');
  const restart=boot(b.stored.get('confirmed-browse-mode'));await settle();assert.equal(restart.context.browseMode,'library');
  restart.context.command('channel',1);await settle();assert.equal(restart.commands[0].browseMode,'library');
  const data={available:true,title:'Show · Octane',artist:'Bad Omens - The Death of Peace of Mind',channel:'Octane',status:'Playing'};
  b.context.draw(data);await settle();assert.equal(b.frame().elements.find(e=>e.id==='track').text,'Bad Omens');
  const star=b.frame().elements.find(e=>e.id==='detail_icon').data;
  assert.equal(b.frame().elements.find(e=>e.id==='state').text,'Octane');
  b.context.detailUntil=Date.now()-1;b.context.draw(data);await settle();
  assert.equal(b.frame().elements.find(e=>e.id==='track').text,'The Death of Peace of Mind');assert.notEqual(b.frame().elements.find(e=>e.id==='detail_icon').data,star);
  assert(b.context.detailDuration('x'.repeat(80))>40000,'Long metadata must have time to scroll');
  b.context.draw({...data,artist:'New Artist - New Song'});await settle();assert.equal(b.frame().elements.find(e=>e.id==='track').text,'New Artist');
  console.log('Passed preview/cancel/confirm/restart persistence, hold isolation, artist/song alternation, icons and scroll duration.');
})().catch(e=>{console.error(e);process.exitCode=1;});
