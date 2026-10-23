// Isolated test transport only. Never use this gateway in production.
const http = require('node:http');
http.createServer((req, res) => {
  const auth = req.url.startsWith('/auth/v1/');
  const rest = req.url.startsWith('/rest/v1/');
  if (!auth && !rest) { res.writeHead(404); return res.end(); }
  const target = http.request({ host: '127.0.0.1', port: auth ? 55439 : 55438, path: req.url.replace(auth ? '/auth/v1' : '/rest/v1', ''), method: req.method, headers: { ...req.headers, host: 'localhost' } }, response => {
    res.writeHead(response.statusCode, response.headers); response.pipe(res);
  });
  target.on('error', () => { res.writeHead(502); res.end('Local test service unavailable'); });
  req.pipe(target);
}).listen(55431, '127.0.0.1', () => console.log('Synthetic Supabase gateway: 127.0.0.1:55431'));
