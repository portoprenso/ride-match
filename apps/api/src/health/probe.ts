/**
 * Silent container probe. Uses loopback even when the server binds all interfaces;
 * exits nonzero for network/timeout/non-2xx without printing response/environment content.
 */
try {
  const port = process.env.API_PORT ?? '3000';
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error();
  const kind = process.argv[2] === 'live' ? 'live' : 'ready';
  const response = await fetch(`http://127.0.0.1:${port}/v1/health/${kind}`, { signal: AbortSignal.timeout(2500), redirect: 'error' });
  process.exitCode = response.ok ? 0 : 1;
} catch { process.exitCode = 1; }
