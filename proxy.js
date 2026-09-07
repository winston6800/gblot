// Optional fallback. Only needed if your browser refuses the direct call to the
// recognition service (CORS). Run it with:  node proxy.js
//
// Then add this line to index.html, just above <script src="script.js">:
//   <script>window.RECOGNIZER_URL = 'http://localhost:8787/recognize';</script>
//
// Zero dependencies.

const http = require('http');
const https = require('https');

const PORT = 8787;
const UPSTREAM = 'https://inputtools.google.com/request?itc=en-t-i0-handwrit&app=demopage';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  if (req.method !== 'POST' || !req.url.startsWith('/recognize')) {
    res.writeHead(404, CORS);
    res.end('POST /recognize');
    return;
  }

  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    const upstream = https.request(
      UPSTREAM,
      { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      (up) => {
        let out = '';
        up.on('data', (chunk) => { out += chunk; });
        up.on('end', () => {
          res.writeHead(up.statusCode || 502, { ...CORS, 'Content-Type': 'application/json' });
          res.end(out);
        });
      },
    );

    upstream.on('error', (err) => {
      res.writeHead(502, { ...CORS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    });

    upstream.end(body);
  });
}).listen(PORT, () => {
  console.log(`handwriting proxy listening on http://localhost:${PORT}/recognize`);
});
