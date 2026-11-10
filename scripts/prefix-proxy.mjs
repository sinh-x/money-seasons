// Synthetic loopback-only prefix-stripping contract fixture; not a production proxy.
import http from 'node:http';
import { validateBasePath } from '../public/base-path.js';
export function prefixProxy(backendPort, basePath, requests = []) {
  validateBasePath(basePath);
  if (!basePath) throw new Error('Synthetic prefix required');
  return http.createServer((req, res) => {
    requests.push({ path: req.url, method: req.method });
    const url = new URL(req.url, 'http://fixture.test');
    if (url.pathname === '/' || url.pathname === basePath) {
      res.writeHead(308, { Location: basePath + '/' + url.search }); res.end(); return;
    }
    if (url.pathname !== '/healthz' && !url.pathname.startsWith(basePath + '/')) {
      res.writeHead(404); res.end('synthetic sibling sentinel'); return;
    }
    const upstream = http.request({ hostname: '127.0.0.1', port: backendPort, method: req.method,
      path: url.pathname === '/healthz' ? req.url : req.url.slice(basePath.length), headers: req.headers }, reply => {
      res.writeHead(reply.statusCode, reply.headers); reply.pipe(res);
    });
    upstream.on('error', () => { res.writeHead(502); res.end(); });
    req.pipe(upstream);
  });
}
