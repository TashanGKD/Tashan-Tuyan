try {
  const response = await fetch('http://127.0.0.1:3005/ready', { signal: AbortSignal.timeout(8000) });
  const result = await response.json();
  process.exit(response.ok && result.ok ? 0 : 1);
} catch { process.exit(1); }
