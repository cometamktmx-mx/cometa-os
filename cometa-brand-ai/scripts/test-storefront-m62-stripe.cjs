// Test process preload: intercept ONLY Stripe's external HTTPS transport.
// Next handlers, Supabase clients, Auth and PostgREST are not replaced.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Node --require preload must patch before Next loads.
const https = require('node:https');
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Same synchronous preload boundary.
const http = require('node:http');
const original = https.request;
const port = Number(process.env.M62_STRIPE_PORT);
if (!Number.isInteger(port) || port < 1024) throw Error('Isolated Stripe fixture port required');
https.request = function (options, ...args) {
  if (options && typeof options === 'object' && (options.hostname === 'api.stripe.com' || options.host === 'api.stripe.com')) {
    const request = http.request({ ...options, hostname: '127.0.0.1', host: '127.0.0.1', port, protocol: 'http:', agent: undefined }, ...args);
    // The real SDK waits for TLS secureConnect before writing. Only this synthetic
    // provider socket is plain HTTP; signal its simulated handshake after connect.
    request.on('socket', socket => { if (socket.connecting) socket.once('connect', () => socket.emit('secureConnect')); });
    return request;
  }
  return original.call(this, options, ...args);
};
