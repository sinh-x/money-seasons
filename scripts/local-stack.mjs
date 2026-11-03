// Local synthetic Docker/Caddy stack only. No real plan, credential or trust-store migration.
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const repo = fileURLToPath(new URL('../', import.meta.url));
export const localHome = () => path.join(os.homedir(), '.local/share/money-seasons-local-test');
async function directory(filename) {
  await fs.mkdir(filename, { mode: 0o700 }).catch(e => { if (e.code !== 'EEXIST') throw e; });
  const stat = await fs.lstat(filename);
  if (!stat.isDirectory() || stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0 || await fs.realpath(filename) !== filename) {
    throw new Error('Existing local stack directory is not private/owned or has symlinked components. Refusing to change it.');
  }
}
export async function prepareLocalStack() {
  // The production image deliberately runs as UID 1000; never broaden permissions to compensate.
  if (process.getuid?.() !== 1000) throw new Error('Local bootstrap requires host UID 1000, matching the containers. Configure ownership privately instead of running privileged.');
  const base = localHome();
  await fs.mkdir(path.dirname(base), { recursive: true, mode: 0o700 });
  await directory(base); await directory(path.join(base, 'data')); await directory(path.join(base, 'caddy'));
  const secret = path.join(base, 'passphrase');
  try { await fs.writeFile(secret, randomBytes(24).toString('base64url') + '\n', { flag: 'wx', mode: 0o600 }); }
  catch (e) { if (e.code !== 'EEXIST') throw e; }
  const stat = await fs.lstat(secret);
  if (!stat.isFile() || stat.nlink !== 1 || stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0) {
    throw new Error('Existing local passphrase is unsafe; refusing to replace/read it or relax permissions.');
  }
  console.log(`Local synthetic state: ${base}`);
  console.log('Passphrase is in the private passphrase file; its contents are never printed.');
  return base;
}
export function compose(args) {
  const result = spawnSync('docker', ['compose', '-p', 'money-seasons-local-test', '-f', 'compose.local.yaml', ...args], {
    cwd: repo, env: { ...process.env, HOME: os.homedir() }, stdio: 'inherit'
  });
  if (result.error) throw new Error('Unable to execute Docker Compose.');
  if (result.status !== 0) throw new Error(`Local stack command failed (exit ${result.status ?? 'signal'}).`);
}
async function main(command) {
  switch (command) {
    case 'init': await prepareLocalStack(); break;
    case 'up':
      await prepareLocalStack();
      compose(['up', '-d', '--build', '--wait', '--wait-timeout', '90']);
      console.log('Local test app: https://localhost:3081 (Caddy local CA; host trust is unchanged).');
      break;
    case 'down': compose(['down']); break; // Preserve private data and CA; never remove another project.
    case 'ps': compose(['ps']); break;
    case 'logs': compose(['logs', '--tail=50']); break;
    default: throw new Error('Usage: node scripts/local-stack.mjs init|up|down|ps|logs');
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(process.argv[2]); }
  catch (e) { console.error(e.message); process.exitCode = 1; }
}
