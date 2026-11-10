// Shared MV3 recovery. Polling only runs while a matching player tab exists.
// Alarms and tab/startup events recover if Chrome terminates this worker.
const RECOVERY_ALARM = 'busy-music-recovery';
let checking = false;
let nextCheck;
let forwarding = Promise.resolve();
function validPlayer(url) {
  try {
    const value = new URL(url);
    return value.origin === PLAYER_ORIGIN && value.pathname.startsWith(PLAYER_PATH) &&
      !(PLAYER_ORIGIN.includes('siriusxm') && /^\/player\/(login|welcome)(\/|$)/.test(value.pathname));
  } catch { return false; }
}
async function badge(text, title) {
  await chrome.action.setBadgeText({text});
  await chrome.action.setTitle({title});
}
async function pair(message, sender) {
  const now = Date.now();
  const {pairing = {}} = await chrome.storage.session.get('pairing');
  const playing = message.metadata?.playing === true;
  if (pairing.tabId !== undefined && pairing.tabId !== sender.tab.id && now - pairing.seen < 10000 &&
      !(playing && !pairing.playing)) return {ok:false, message:'Another player tab is paired'};
  await chrome.storage.session.set({pairing:{tabId:sender.tab.id,seen:now,playing}});
  try {
    const response = await fetch(BASE + '/browser?token=' + TOKEN, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({metadata:message.metadata,ack:message.ack || null}),
      signal:AbortSignal.timeout(3500), credentials:'omit', cache:'no-store'
    });
    if (!response.ok) throw Error('Bridge unavailable');
    const result = await response.json();
    await badge('', DISPLAY_NAME + ' — connected');
    return result;
  } catch {
    await badge('PC', DISPLAY_NAME + ' — PC companion offline; retrying automatically');
    return {ok:false,message:'PC companion offline; retrying'};
  }
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type !== POLL_MESSAGE || !sender.tab || sender.frameId !== 0 || !validPlayer(sender.url)) return false;
  // Serialize competing tabs so two simultaneous polls cannot both claim the bridge.
  const previous = forwarding;
  const run = (async () => {
    try { await previous; } catch { /* A failed request must not block future polls. */ }
    return await pair(message, sender);
  })();
  forwarding = run;
  void (async () => {
    try { reply(await run); }
    catch { reply({ok:false,message:'Reconnecting'}); }
  })();
  return true;
});
async function wake(tab) {
  try {
    const response = await chrome.tabs.sendMessage(tab.id,{type:WAKE_MESSAGE});
    if (response?.version === chrome.runtime.getManifest().version) return;
  } catch { /* Reload/update left this already-open tab without a content script. */ }
  try {
    await chrome.scripting.executeScript({target:{tabId:tab.id},files:['content.js']});
    await chrome.tabs.sendMessage(tab.id,{type:WAKE_MESSAGE});
  } catch { /* Loading, discarded, or permission withheld. Next event retries. */ }
}
async function recover() {
  if (checking) return;
  checking = true;
  clearTimeout(nextCheck);
  let hasPlayer = false;
  try {
    const tabs = (await chrome.tabs.query({url:PLAYER_MATCH})).filter(t => validPlayer(t.url) && !t.discarded);
    hasPlayer = tabs.length > 0;
    const {pairing = {}} = await chrome.storage.session.get('pairing');
    if (!tabs.some(t => t.id === pairing.tabId)) await chrome.storage.session.remove('pairing');
    // Paused tabs may have severely throttled timers; extension messages wake them.
    await Promise.allSettled(tabs.map(wake));
    if (!hasPlayer) await badge('OPEN',DISPLAY_NAME + ' — open the player in Chrome');
  } finally {
    checking = false;
    if (hasPlayer) nextCheck = setTimeout(() => void recover(),2000);
  }
}
async function initialize() {
  await chrome.alarms.create(RECOVERY_ALARM,{periodInMinutes:0.5});
  await recover();
}
chrome.runtime.onInstalled.addListener(() => void initialize().catch(() => {}));
chrome.runtime.onStartup.addListener(() => void initialize().catch(() => {}));
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === RECOVERY_ALARM) void recover().catch(() => {});
});
chrome.tabs.onUpdated.addListener((_id, change, tab) => {
  if ((change.status === 'complete' || change.discarded === false) && validPlayer(tab.url)) void recover().catch(() => {});
});
chrome.tabs.onRemoved.addListener(() => void recover().catch(() => {}));
chrome.action.onClicked.addListener(async () => {
  const tabs = await chrome.tabs.query({url:PLAYER_MATCH});
  if (!tabs.length) await chrome.tabs.create({url:PLAYER_START});
  await recover();
});
void initialize().catch(() => {});
