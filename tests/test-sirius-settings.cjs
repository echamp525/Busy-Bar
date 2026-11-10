const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('projects/siriusxm/app/scripts/main.template.js','utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
async function test(mode,invalid=false){
  const commands=[];
  const context={setInterval(){},clearInterval(){},setTimeout(){},clearTimeout(){},listen(){return ()=>{};},fetch(url,options){
    let data={available:false};
    if(url.includes('/apps/settings'))data={values:{browse_mode:invalid?'bad-mode':mode}};
    if(url.includes('/command')){commands.push(JSON.parse(options.body));data={ok:true};}
    return Promise.resolve({ok:true,json:()=>Promise.resolve(data)});
  }};
  vm.runInNewContext(source,context);await settle();await settle();
  assert.equal(context.settingsReady,!invalid);
  context.command('channel',1);await settle();await settle();
  if(invalid)assert.equal(commands.length,0,'Unreadable settings must not tune All Channels accidentally');
  else {assert.equal(context.browseMode,mode);assert.equal(commands[0].browseMode,mode);}
}
(async()=>{await test('all');await test('library');await test('all',true);console.log('Passed saved All/Library mode loading, mode propagation to dial commands, and fail-closed settings errors.');})().catch(error=>{console.error(error);process.exitCode=1;});
