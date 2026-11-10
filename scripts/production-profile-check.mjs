// Synthetic production-shaped qualification. Never invokes production:* or reads its private config.
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import https from 'node:https';
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isolationPreflight } from './stack-isolation-check.mjs';
import { docker } from './local-stack.mjs';
import { productionSettings, productionEnvironment, productionArgs } from './production-stack.mjs';
import { blankPlan } from '../public/model.js';

const checkout = fileURLToPath(new URL('../', import.meta.url));
async function freePort(used) {
  const listener = net.createServer();
  await new Promise(r => listener.listen(0, '127.0.0.1', r));
  const port = listener.address().port; await new Promise(r => listener.close(r));
  if ([3080, 3081, 3443, ...used].includes(port)) return freePort(used);
  used.push(port); return port;
}
export async function main() {
  const gate = await isolationPreflight(); // No temp files/container effects before explicit daemon gate.
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ms003-profiles-'));
  const project = 'ms003-proof-' + randomBytes(12).toString('hex'), label = 'org.money-seasons.synthetic';
  const env = { ...gate.dockerEnv, DOCKER_CONFIG: path.join(directory, 'docker-config') };
  await fs.mkdir(env.DOCKER_CONFIG, { mode: 0o700 });
  const run = args => {
    try { return docker(args, { env, cwd: checkout, timeout: 180_000 }); }
    catch (e) { throw new Error(`Synthetic Docker ${args.join(' ')}: ${e.message}`); }
  };
  const file = path.join(directory, 'compose.json'), caDir = path.join(directory, 'caddy'), data = path.join(directory, 'data');
  const secretFile = path.join(directory, 'passphrase'), proxyFile = path.join(directory, 'Caddyfile');
  const ports = [], backend = await freePort(ports), frontend = await freePort(ports);
  const compose = args => run(['compose', '--env-file', '/dev/null', '-p', project, '-f', file, ...args]);
  const owned = () => {
    const ids = run(['ps', '-aq', '--filter', `label=com.docker.compose.project=${project}`]).split(/\s+/).filter(Boolean);
    const containers = ids.length ? JSON.parse(run(['inspect', ...ids])) : [];
    for (const c of containers) assert.equal(c.Config.Labels[label], project, 'fixture ownership');
    const idsNet = run(['network', 'ls', '-q', '--filter', `label=com.docker.compose.project=${project}`]).split(/\s+/).filter(Boolean);
    for (const n of idsNet.length ? JSON.parse(run(['network', 'inspect', ...idsNet])) : []) {
      assert.equal(n.Labels[label], project); assert.equal(n.Name, project + '_default');
      assert.ok(Object.keys(n.Containers || {}).every(id => containers.some(c => c.Id === id)));
    }
    return containers;
  };
  let createdConfig = false, clean = false;
  const passphrase = randomBytes(32).toString('hex');
  async function request(route, { method = 'GET', cookie, csrf, body, origin, host } = {}) {
    const ca = await fs.readFile(path.join(caDir, 'caddy/pki/authorities/local/root.crt'));
    return new Promise((resolve, reject) => {
      const req = https.request({ hostname: 'localhost', family: 4, port: frontend, path: route, method, ca, rejectUnauthorized: true,
        headers: { Origin: origin || `https://localhost:${frontend}`, ...(host ? { Host: host } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) } }, res => {
        let raw = ''; res.on('data', chunk => { raw += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, raw }));
      });
      req.setTimeout(10_000, () => req.destroy(new Error('Synthetic HTTPS timeout'))); req.on('error', e => reject(new Error(`Synthetic route ${route}, Host ${host || 'localhost'}, ${method}: ${e.message}`))); req.end(body ? JSON.stringify(body) : undefined);
    });
  }
  try {
    for (const dir of [caDir, data]) await fs.mkdir(dir, { mode: 0o700 });
    await fs.writeFile(secretFile, passphrase, { mode: 0o600, flag: 'wx' });
    const caddy = await fs.readFile(path.join(checkout, 'ops/Caddyfile.production-local'), 'utf8');
    await fs.writeFile(proxyFile, caddy.replaceAll(':3080', ':' + backend).replaceAll(':3443', ':' + frontend), { mode: 0o600, flag: 'wx' });
    let retained, caBefore;
    for (const prefix of ['', '/lichtaichinh', '']) {
      const config = productionSettings(Object.entries({ MONEY_SEASONS_PRODUCTION_REPO: checkout.replace(/\/$/, ''), MONEY_SEASONS_RELEASE: 'a'.repeat(40),
        MONEY_SEASONS_DATA_DIR: data, MONEY_SEASONS_CADDY_DIR: caDir, MONEY_SEASONS_PASSPHRASE_FILE: secretFile, MONEY_SEASONS_BASE_PATH: prefix,
        MONEY_SEASONS_ORIGINS: prefix ? 'https://drgnfly.tail10c2c6.ts.net,https://localhost:3443' : 'https://localhost:3443',
        MONEY_SEASONS_DOCKER_HOST: gate.host, MONEY_SEASONS_DOCKER_ID: process.env.MS_ISOLATION_DAEMON_ID }).map(([k, v]) => `${k}=${v}`).join('\n'));
      const rendered = JSON.parse(docker(productionArgs(checkout, ['config', '--format', 'json']), { env: productionEnvironment(config), cwd: checkout }));
      assert.equal(rendered.services.web.environment.MONEY_SEASONS_BASE_PATH, prefix);
      assert.equal(rendered.services.caddy.environment.MONEY_SEASONS_BASE_PATH, prefix);
      assert.equal(rendered.services.caddy.environment.MONEY_SEASONS_PROXY_PROFILE, prefix ? 'tailnet-local' : 'root-local');
      assert.equal(rendered.services.web.ports[0].host_ip, '127.0.0.1'); assert.equal(String(rendered.services.web.ports[0].published), '3080');
      for (const service of Object.values(rendered.services)) {
        assert.equal(service.read_only, true); assert.equal(service.init, true); assert.equal(service.pids_limit, 64);
        assert.deepEqual(service.cap_drop, ['ALL']); assert.ok(service.security_opt.includes('no-new-privileges:true')); assert.equal(service.mem_limit, '134217728');
      }
      // Only fixture identities/ports/origins/mounts change; tracked routing/security directives are exercised.
      rendered.name = project; rendered.networks.default.name = project + '_default'; rendered.networks.default.labels = { [label]: project };
      for (const [name, service] of Object.entries(rendered.services)) {
        service.image = `${project}-${name}:test`; service.labels = { [label]: project }; service.build.labels = { [label]: project };
        service.restart = 'no';
      }
      rendered.services.web.ports[0].published = String(backend);
      rendered.services.web.environment.MONEY_SEASONS_ORIGINS = config.MONEY_SEASONS_ORIGINS.replace('localhost:3443', 'localhost:' + frontend);
      rendered.services.caddy.volumes.find(v => v.target === '/etc/caddy/Caddyfile').source = proxyFile;
      rendered.services.caddy.healthcheck.test = rendered.services.caddy.healthcheck.test.map(v => v.replace('localhost:3443', 'localhost:' + frontend));
      await fs.writeFile(file, JSON.stringify(rendered), { mode: 0o600 }); createdConfig = true;
      owned();
      if (!retained) compose(['build', '--pull=false']);
      compose(['up', '-d', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '90']);
      const containers = owned(); assert.equal(containers.length, 2);
      assert.ok(containers.every(c => c.State.Running && c.State.Health.Status === 'healthy'));
      const ca = await fs.readFile(path.join(caDir, 'caddy/pki/authorities/local/root.crt'));
      if (caBefore) assert.deepEqual(ca, caBefore); else caBefore = ca;
      assert.ok(await fs.readFile(secretFile, 'utf8') === passphrase, 'fixture credential preserved');
      if (retained) assert.deepEqual(await fs.readFile(path.join(data, 'plan.json')), retained);
      assert.equal((await request('/healthz')).status, 200);
      if (prefix) {
        for (const route of ['/', prefix]) for (const query of ['', '?x=%2Fsafe&n=1']) {
          const r = await request(route + query, { method: 'POST', body: { synthetic: true } });
          assert.equal(r.status, 308); assert.equal(r.headers.location, prefix + '/' + query);
        }
        for (const route of ['/app.js', '/api/plan', '/lichtaichinhx/', prefix + prefix + '/']) assert.equal((await request(route)).status, 404);
      }
      const home = await request(prefix + '/'); assert.equal(home.status, 200); assert.ok(home.raw.includes(`data-base-path="${prefix}"`));
      for (const route of ['/app.js', '/base-path.js', '/model.js', '/expense-tags.js', '/styles.css']) assert.equal((await request(prefix + route)).status, 200);
      for (const route of ['/api/session', '/api/plan', '/api/export']) assert.equal((await request(prefix + route)).status, 401);
      const login = await request(prefix + '/api/login', { method: 'POST', body: { passphrase } }); assert.equal(login.status, 200);
      const setCookie = login.headers['set-cookie'][0];
      for (const value of [`Path=${prefix}/`, 'Secure', 'HttpOnly', 'SameSite=Strict']) assert.ok(setCookie.includes(value));
      const session = { cookie: setCookie.split(';')[0], csrf: JSON.parse(login.raw).csrf };
      if (!retained) {
        const r = await request('/api/plan', { ...session, method: 'PUT', body: { plan: blankPlan(), expectedRevision: 0, operation: 'replace', confirmed: true } });
        assert.equal(r.status, 200); retained = await fs.readFile(path.join(data, 'plan.json'));
      }
      assert.deepEqual(JSON.parse((await request(prefix + '/api/plan', session)).raw).plan, blankPlan());
      assert.deepEqual(JSON.parse((await request(prefix + '/api/export', session)).raw), blankPlan());
      for (const extra of [{ origin: 'https://evil.test' }, { csrf: 'wrong' }]) assert.equal((await request(prefix + '/api/logout', { ...session, ...extra, method: 'POST', body: {} })).status, 403);
      // Node derives SNI from Host: an unknown host is rejected by this localhost-only TLS listener.
      await assert.rejects(request(prefix + '/api/logout', { ...session, host: 'evil.test', method: 'POST', body: {} }), /EPROTO/);
      // Exercise the separate gateway's Host/Origin contract on the synthetic HTTP upstream,
      // not by pretending the localhost TLS listener is the real tailnet gateway.
      if (prefix) for (const host of ['drgnfly.tail10c2c6.ts.net', 'evil.test']) {
        const status = await new Promise((resolve, reject) => {
          const req = http.request({ hostname: '127.0.0.1', port: backend, path: '/api/login', method: 'POST',
            headers: { Host: host, Origin: 'https://drgnfly.tail10c2c6.ts.net', 'Content-Type': 'application/json', 'X-Forwarded-Host': 'drgnfly.tail10c2c6.ts.net' } }, res => {
            res.resume(); res.on('end', () => resolve(res.statusCode));
          });
          req.on('error', reject); req.end(JSON.stringify({ passphrase }));
        });
        assert.equal(status, host === 'evil.test' ? 403 : 200);
      }
      const logout = await request(prefix + '/api/logout', { ...session, method: 'POST', body: {} }); assert.equal(logout.status, 200);
      assert.ok(logout.headers['set-cookie'][0].includes(`Path=${prefix}/`)); assert.ok(logout.headers['set-cookie'][0].includes('Max-Age=0'));
      assert.equal((await request(prefix + '/api/plan', session)).status, 401);
      const proxy = containers.find(c => c.Config.Labels['com.docker.compose.service'] === 'caddy');
      const tasks = () => run(['exec', proxy.Id, 'ps', '-o', 'stat,comm']).trim().split('\n').slice(1);
      const before = tasks();
      for (let i = 0; i < 100; i++) run(['exec', proxy.Id, 'wget', '-q', '--no-check-certificate', '-O', '/dev/null', `https://localhost:${frontend}/healthz`]);
      await new Promise(r => setTimeout(r, 1000));
      const after = tasks(); assert.ok(!after.some(line => /^\s*Z/.test(line)), 'no zombies'); assert.ok(after.length <= before.length + 2, 'bounded health helpers');
      assert.deepEqual(await fs.readFile(path.join(data, 'plan.json')), retained);
      owned(); compose(['down', '--timeout', '30']); assert.equal(owned().length, 0);
      await assert.rejects(fs.stat(path.join(data, 'writer.lock')), e => e.code === 'ENOENT');
      console.log(`PASS synthetic production ${prefix || 'root'}: rendered hardening, actual Caddy TLS/routing/auth, 100 health probes, retained bytes/revision/credential/CA and settled writer.`);
    }
    console.log('PASS root -> prefix -> compatible root rollback rehearsal; no production/gateway/device/UAT claim.');
  } finally {
    try {
      if (createdConfig) { owned(); compose(['down', '--timeout', '30']); assert.equal(owned().length, 0); }
      for (const name of ['web', 'caddy']) {
        const image = `${project}-${name}:test`;
        if (run(['image', 'ls', '-q', '--filter', `reference=${image}`])) {
          assert.equal(JSON.parse(run(['image', 'inspect', image]))[0].Config.Labels[label], project);
          run(['image', 'rm', image]);
        }
      }
      clean = true;
    } finally {
      if (clean) await fs.rm(directory, { recursive: true, force: true });
      else console.error(`Fixture cleanup uncertain; retained ${directory}. No global cleanup.`);
    }
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(); } catch (e) { console.error('Synthetic production profile check failed:', e.message); process.exitCode = 1; }
}
