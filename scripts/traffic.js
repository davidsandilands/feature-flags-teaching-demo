// SYNTHETIC traffic for the guarded rollout demos. Every context and every value is made up.
// Usage: npm run traffic -- latency|tokens [contexts=600] [perSecond=20]
import { init } from '@launchdarkly/node-server-sdk';
import { initAi } from '@launchdarkly/server-sdk-ai';

const mode = process.argv[2];
const total = Number(process.argv[3] ?? 600);
const perSecond = Number(process.argv[4] ?? 20);

if (mode !== 'latency' && mode !== 'tokens') {
  console.error('Usage: npm run traffic -- latency|tokens [contexts=600] [perSecond=20]');
  process.exit(1);
}
if (!process.env.LD_SDK_KEY) {
  console.error('LD_SDK_KEY is missing. Copy .env.example to .env and fill it in (see README).');
  process.exit(1);
}

// Connect the server-side SDK with the secret SDK key, waiting up to 10 seconds
const client = init(process.env.LD_SDK_KEY);
try {
  await client.waitForInitialization({ timeout: 10 });
} catch (err) {
  console.error(`Could not connect to LaunchDarkly: ${err.message} Check LD_SDK_KEY in .env.`);
  process.exit(1);
}
const aiClient = initAi(client);

// A value near `base`, give or take `spread`
const around = (base, spread) => Math.round(base + (Math.random() * 2 - 1) * spread);

// Step 4: one synthetic checkout. Evaluate the flag first, then track the metric for the SAME context:
// LaunchDarkly only counts a metric event for a context that has already seen the flag.
async function checkout(context) {
  const newCheckout = await client.boolVariation('checkout-v2', context, false);
  const latencyMs = newCheckout ? around(900, 100) : around(120, 20);
  client.track('checkout-latency', context, undefined, latencyMs);
  return { arm: newCheckout ? 'new' : 'old', value: latencyMs };
}

// Step 7: one synthetic chat, with no model call. Fetching the config is the evaluation; then record
// token usage on its tracker, which is tied to this context and variation. Verbose answers run long.
async function chat(context) {
  const config = await aiClient.completionConfig('support-assistant', context, { enabled: false });
  const tracker = config.createTracker();
  const { variationKey } = tracker.getTrackData();
  const verbose = variationKey === 'verbose';
  const input = verbose ? around(380, 20) : around(40, 5);
  const output = verbose ? around(2500, 250) : around(150, 30);
  tracker.trackTokens({ input, output, total: input + output });
  return { arm: variationKey || 'no variation', value: output };
}

const run = mode === 'latency' ? checkout : chat;
const unit = mode === 'latency' ? 'ms' : 'tokens';
console.log(`Sending SYNTHETIC ${mode} traffic: ${total} made-up contexts, about ${perSecond} per second.`);
console.log(mode === 'latency' ? 'new = checkout-v2 served true, old = false' : 'avg = output tokens per answer, by variation');
const runId = Date.now(); // fresh context keys on every run, so earlier runs never count
const stats = {};

for (let i = 1; i <= total; i++) {
  // Every context gets evaluated and tracked, whichever variation it lands in
  const context = { kind: 'user', key: `synthetic-${runId}-${i}` };
  const { arm, value } = await run(context);

  stats[arm] ??= { count: 0, sum: 0 };
  stats[arm].count += 1;
  stats[arm].sum += value;
  const arms = Object.entries(stats).map(([name, s]) => `${name}: ${s.count} (avg ${Math.round(s.sum / s.count)} ${unit})`);
  process.stdout.write(`\r${i}/${total} | ${arms.join(' | ')}   `);

  await new Promise((resolve) => setTimeout(resolve, 1000 / perSecond));
}

// The SDK batches events and close() does not send them, so flush first
console.log('\nSending the last events...');
await client.flush();
client.close();
console.log('Done. Watch the guarded rollout in LaunchDarkly.');
