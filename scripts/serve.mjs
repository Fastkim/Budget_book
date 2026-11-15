import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(projectRoot, process.argv.includes('--dist') ? 'dist' : '.');
const port = Number(process.env.PORT || 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT는 1~65535 사이의 정수여야 합니다.');

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function insideRoot(path) {
  const suffix = relative(root, path);
  return suffix !== '..' && !suffix.startsWith(`..${sep}`) && !isAbsolute(suffix);
}

function reply(response, status, message) {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
  response.end(message);
}

const server = createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.setHeader('Allow', 'GET, HEAD');
    return reply(response, 405, '허용되지 않는 요청입니다.');
  }

  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const segments = pathname.split(/[\\/]+/).filter(Boolean);
    if (segments.some(segment => segment.startsWith('.') || segment.includes(':') || segment.includes('\0'))) {
      return reply(response, 403, '접근할 수 없는 경로입니다.');
    }
    const path = pathname === '/' ? 'index.html' : pathname.slice(1);
    // Serve app assets only. Development files and data backups stay private.
    if (path !== 'index.html' && !path.startsWith('src/') && !path.startsWith('public/')) {
      return reply(response, 404, '페이지를 찾을 수 없습니다.');
    }
    const candidate = resolve(root, path);
    if (!insideRoot(candidate)) return reply(response, 403, '접근할 수 없는 경로입니다.');
    const resolved = await realpath(candidate);
    if (!insideRoot(resolved)) return reply(response, 403, '접근할 수 없는 경로입니다.');
    const info = await stat(resolved);
    if (!info.isFile()) return reply(response, 404, '페이지를 찾을 수 없습니다.');
    response.writeHead(200, {
      'Content-Type': contentTypes[extname(resolved).toLowerCase()] || 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    if (request.method === 'HEAD') return response.end();
    const stream = createReadStream(resolved);
    stream.on('error', () => response.destroy());
    stream.pipe(response);
  } catch (error) {
    if (error instanceof URIError || error.code === 'ERR_INVALID_URL') return reply(response, 400, '잘못된 주소입니다.');
    reply(response, error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 404 : 500, '페이지를 불러올 수 없습니다.');
  }
});

server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `${port} 포트가 사용 중입니다. PORT 환경변수로 다른 포트를 지정하세요.` : error.message);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => console.log(`차곡 미리보기: http://127.0.0.1:${port}${process.argv.includes('--dist') ? ' (dist)' : ''}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
