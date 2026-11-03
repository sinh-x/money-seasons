// Test-only child. Not copied into the production image and never used by npm start.
import { testApp } from './fixture-support.mjs';
let failure = null;
const app = await testApp({ hook: async stage => { if (failure === stage) throw new Error('synthetic failure'); } });
process.send({ base: app.base });
let closing = false;
async function close() { if (!closing) { closing = true; await app.close(); process.disconnect?.(); } }
process.on('message', message => {
  if (message.action === 'close') close();
  if (message.action === 'failure') { failure = message.stage; process.send({ configured: failure }); }
});
process.on('disconnect', close);
process.on('SIGTERM', close);
