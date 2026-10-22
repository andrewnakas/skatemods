// DEV: node -r ./test/dev/mem_sampler.cjs ... : prints peak memory (rss / heap / arrayBuffers, MB) at exit.
const peak = { rss: 0, heapUsed: 0, arrayBuffers: 0, external: 0 };
const t = setInterval(() => {
  const m = process.memoryUsage();
  for (const k of Object.keys(peak)) peak[k] = Math.max(peak[k], m[k]);
}, 250);
t.unref();
process.on('exit', () => {
  const mb = (v) => (v / 1e6).toFixed(0);
  process.stderr.write(`[mem] peak rss ${mb(peak.rss)} MB, heap ${mb(peak.heapUsed)} MB, arrayBuffers ${mb(peak.arrayBuffers)} MB, external ${mb(peak.external)} MB\n`);
});
