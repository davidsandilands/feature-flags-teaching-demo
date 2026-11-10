# Feature flags teaching demo

A small, readable Node.js demo of [LaunchDarkly](https://launchdarkly.com) feature flags, built for a 20 to 30 minute talk to students at the University of Edinburgh. Every LaunchDarkly call is visible in a few short files, so the code reads well on a projector, and you can run the whole thing against your own LaunchDarkly account afterwards.

> [!IMPORTANT]
> This is an unofficial teaching demo, not a supported LaunchDarkly product.

## What's in the repo

| File | What it does |
| --- | --- |
| [`public/index.html`](public/index.html) | The page: a context form and a banner, using the LaunchDarkly JavaScript (browser) SDK |
| [`server.js`](server.js) | A small Express server: serves the page and the browser SDK, and answers the chat box using the server-side SDK, the AI SDK and Claude |
| [`scripts/traffic.js`](scripts/traffic.js) | Sends synthetic traffic for the two guarded rollouts (steps 4 and 7), using the Node.js server-side SDK and the AI SDK |
| [`slides/`](slides/LaunchDarkly_Feature_Flags_Edinburgh.pdf) | The slides from the talk, as a PDF |

## Set up (about 15 minutes)

You need Node.js 20.6 or newer (`node --version`) and a LaunchDarkly account. A [free trial](https://app.launchdarkly.com/signup) is enough.

### 1. Pick a project and environment

A new LaunchDarkly account starts with a *Default* project that has **Production** and **Test** environments. Use **Test**. To keep the demo apart from anything else, create a project instead: click the **gear** icon, then **All projects**, then **Create project**.

### 2. Get the code and add your keys

```bash
git clone https://github.com/davidsandilands/feature-flags-teaching-demo.git
cd feature-flags-teaching-demo
npm install
cp .env.example .env
```

In LaunchDarkly, click the **gear** icon (Organization settings), then **SDK keys** under "Security". Select your project and environment, then copy:

- the **Client-side ID** into `LD_CLIENT_SIDE_ID`
- the **SDK key** into `LD_SDK_KEY`. The server and the traffic script both use it, and it is a secret.

`MODEL_API_KEY` is optional: put an Anthropic API key there if you want the chat box (step 6) to call Claude. Without one, the chat runs in echo mode and costs nothing.

`.env` is listed in `.gitignore`, so it is never committed.

### 3. Create the `welcome-banner` flag

1. Click **Create**, then **Flag**.
2. Name it `welcome-banner` and check that the key is `welcome-banner` too.
3. Choose **Boolean** variations.
4. Make sure the flag is available to client-side SDKs: leave the availability setting on **All SDKs** (the default), or tick **SDKs using Client-side ID** if you see checkboxes instead.
5. Click **Create flag**. New flags start **Off**, so they serve `false`.

### 4. Start the app

```bash
npm start
```

Open <http://localhost:3000>. You should see **welcome-banner is OFF for student-1**.

## The demo

### Step 1: flip a flag without a deploy

In LaunchDarkly, open `welcome-banner` in your environment, turn it **On** and save. The banner appears within a couple of seconds, with no reload. Turn it **Off** and the banner goes away.

How it works, in the `<script>` block at the bottom of [`public/index.html`](public/index.html):

1. `createClient(clientSideId, context)` and `start()` connect to LaunchDarkly with the context from the form. `waitForInitialization()` waits up to five seconds for flag values.
2. `boolVariation('welcome-banner', false)` evaluates the flag. `false` is the fallback, used if LaunchDarkly can't be reached.
3. `on('change:welcome-banner', render)` re-renders when the flag changes. Subscribing to changes is what opens the streaming connection.

### Step 2: target by country and plan

Targeting rules pick a variation based on the context's attributes. Open the page once before you start, so LaunchDarkly has seen a context with `country` and `plan`.

1. In `welcome-banner`, set the **Default rule** to serve `false`, then **Review and save**. The banner disappears. (Once a boolean flag is on, its default rule serves `true` until you change it.)
2. Click **+**, choose **Build a custom rule**, and set context kind `user`, attribute `country`, operator **is one of**, value `GB`, serving `true`. Save. Switch **country** in the form between `GB` and `US`: the banner follows.
3. Add a second rule: `plan` **is one of** `pro`, serving `true`. Now `pro` users see the banner in any country. Rules are checked from top to bottom, and the first rule that matches wins.
4. To require both, edit the `country` rule and click **+** to add a condition: `plan` **is one of** `student`. Every condition in a rule must match, so that rule now covers only students in `GB`.

Values are case sensitive: `GB` works, `gb` doesn't.

How it works: when a field in the form changes, the page calls `identify(context)` with the new context, which fetches that context's flag values, and then re-renders. With a client-side SDK, LaunchDarkly evaluates the rules and sends the page only the results, so you can change the rules without touching the code.

### Step 3: roll out to a percentage

A percentage rollout serves `true` to a share of contexts, chosen by their key.

1. In `welcome-banner`, change the **Default rule** to a **Percentage rollout**: 50% `true` and 50% `false`, by context kind `user` and attribute `key`. Save.
2. Set the form to `US` and `free`, so no step 2 rule matches and the default rule decides.
3. Type new keys (`student-2`, `student-3`, and so on), pressing Enter after each. Some keys get the banner and some don't. Go back to a key you've already tried and it gets the same answer as before.

No code changed. LaunchDarkly hashes the context key, together with the flag key, into one of 100,000 buckets, so a key always lands in the same bucket and nothing needs to be stored. Raising the rollout from 50% to 70% adds buckets 50,001 to 70,000, so everyone who already had the banner keeps it. A guarded rollout (step 4) automates this: it raises the percentage in stages, and rolls back by itself if a metric gets worse.

### Step 4: a guarded rollout that rolls itself back

A guarded rollout releases a variation in stages while it watches a metric. Here the new checkout is deliberately slow, LaunchDarkly notices, and it rolls the release back by itself.

> [!WARNING]
> [`scripts/traffic.js`](scripts/traffic.js) sends **synthetic data**: made-up contexts and made-up latency values, straight into your LaunchDarkly environment. Each run adds 600 contexts. After the 14-day trial, the free Developer plan covers 1,000 contexts a month.
>
> Guarded rollouts need an Enterprise plan with the Guardian add-on, but every account includes a limited trial of them. Each run below starts a new guarded rollout, so save them for when you mean it.

Set up once:

1. Create a flag called `checkout-v2` with **Boolean** variations, and check that its key is exactly `checkout-v2`: the script evaluates that key, and a flag's key can't be changed later. Only the server-side script uses this flag.
2. Create the metric: open the **Data** section, go to **Metrics**, and click **Create metric**.
   - Event kind **Custom**, event key `checkout-latency`.
   - In the metric definition, choose **Average**, keep the analysis unit as `user`, and choose **Lower is better**.
   - Choose **Exclude units that generate no events**, the docs' recommendation for latency.
   - Unit of measure `ms`. Name it `checkout-latency`, then click **Create**.
3. Turn `checkout-v2` **On**, set its **Default rule** to serve `false`, and save. Everyone gets the old checkout.

Run it:

1. Edit the **Default rule** and choose **Guarded rollout** from the **Serve** menu, releasing `true`:
   - Metric to monitor: `checkout-latency`, with **Automatic rollback** ticked.
   - **Target by**: `user`.
   - **Rollout duration**: set a custom schedule with a first stage of **10%** that lasts at least 5 minutes. LaunchDarkly needs at least 10 contexts on each variation before it can call a regression. In testing, a 10% first stage put about 5% of the 600 contexts (30 to 40) on the new variation, which is plenty.
   - Save. The health check shows **Health check waiting** until traffic arrives. That's expected.
2. Start the traffic:

   ```bash
   npm run traffic -- latency
   ```

   For each made-up context, the script evaluates `checkout-v2` and then tracks `checkout-latency` for the same context: about 900 ms on the new checkout, 120 ms on the old one. The progress line shows both, and how many contexts got each.
3. Watch the flag's **Monitoring** tab. LaunchDarkly checks for a regression about every 10 seconds. Once each variation has enough data, it flags `checkout-latency` as a regression and rolls the flag back to `false`. In testing, that happened within a minute of the script starting.

To run it again, start a new guarded rollout first, then the script. Each run uses fresh context keys, so earlier runs never count. To send more traffic, add a count and a rate: `npm run traffic -- latency 1200 40` sends 1,200 contexts at 40 a second.

Why the script looks the way it does:

- It evaluates the flag first, then tracks the metric for the same context. LaunchDarkly only counts metric events from contexts that have already seen the flag.
- It evaluates and tracks every context, whichever variation it gets. If one variation reported less often, LaunchDarkly would see a sample ratio mismatch and roll back for that reason instead.
- It calls `flush()` before `close()`, because the Node.js SDK does not send queued events when it closes.

### Step 5: experiments

Shown from screenshots in the talk, so there is nothing to run here. To try one yourself, see [Experimentation](https://launchdarkly.com/docs/home/experimentation).

### Step 6: an AI assistant configured in LaunchDarkly

AgentControl configs (formerly AI Configs) work like flags for AI: LaunchDarkly serves each context a model and a prompt, and you can change either without a deploy. AgentControl is an add-on. The 14-day trial lets you try all of LaunchDarkly; if **Agents** doesn't appear in the sidebar, your plan doesn't include it.

Set up once:

1. In the left sidebar, click **Agents**, then **Configs**, and create a **Completion** config named `support-assistant`. Check that the key is `support-assistant`.
2. On the **Variations** tab, create two variations named exactly `concise` and `verbose` (the scripts look for these keys). Give both the Anthropic model `claude-opus-5-5`. If it isn't in the **Select a model** list, choose **Add a model** and enter the model ID. Then set each one's **system** message, replacing any text already there:
   - `concise`: `You are the support assistant for a small online shop. Answer in at most two sentences.`
   - `verbose`: the deliberately absurd prompt below.
3. On the **Targeting** tab, set the **Default rule** to serve `concise`, and save.

<details>
<summary>The <code>verbose</code> system prompt</summary>

```text
You are the support assistant for a small online shop, and you are convinced that no answer can ever be too thorough. Whatever the customer asks, however simple, follow every one of these rules.

Begin by restating the question in full, then restate it again in different words to show you have understood it. Explain the history and background of the topic before you answer. List every possible interpretation of the question and answer each one separately. Give step-by-step instructions with at least ten numbered steps, and explain the reasoning behind each step in its own paragraph. Describe every edge case, exception and caveat you can think of, then think of more. Compare at least five alternative approaches in a table of pros and cons. Provide worked examples for a complete beginner, an intermediate user and an expert. Anticipate at least twenty follow-up questions and answer every one of them in detail. Add a glossary that defines every term you used, including common words. Close with a summary of the whole answer, followed by a summary of that summary, followed by a list of further reading.

Never use one word where ten will do. Never say "it depends" without exploring every dependency in depth. Never leave out a detail because it seems obvious: obvious details are your speciality. If you finish and the answer seems complete, go back to the start and expand every section by half again.
```

</details>

Then ask the **Support assistant** box a question:

- **Echo mode** (no `MODEL_API_KEY`): the reply shows the model and system prompt LaunchDarkly served. Token counts are estimates, at about four characters per token, and the page marks them "(estimated)".
- **With `MODEL_API_KEY`**: the server calls Claude with that model and prompt. Calls are billed to your Anthropic account, and `verbose` answers are long and slow.

Now target it like a flag: add a rule to the config, `plan` **is one of** `pro`, serving `verbose`. Switch the form's plan to `pro` and ask again.

How it works, in [`server.js`](server.js):

1. The page posts the message together with the current context.
2. `aiClient.completionConfig('support-assistant', context, { enabled: false })` asks LaunchDarkly which variation this context gets. The fallback, `{ enabled: false }`, switches the assistant off if LaunchDarkly can't serve the config.
3. `config.createTracker()` starts one tracked run, and `tracker.trackMetricsOf(...)` wraps the call to Claude (or the echo). It records duration, success and token usage, which feed LaunchDarkly's autogenerated AI metrics, such as average output tokens. Step 7 uses that metric.

### Step 7: a guarded rollout on the AI config

Step 4 again, this time on `support-assistant`: release `verbose` in stages while LaunchDarkly watches token usage, and let it roll itself back.

> [!WARNING]
> This also sends **synthetic data**: 600 made-up contexts with made-up token counts. It never calls a model, so it costs nothing on your Anthropic account, but it does start another guarded rollout from your trial.

1. Check that the **Default rule** of `support-assistant` serves `concise` (step 6).
2. Edit the **Default rule** and choose **Guarded rollout** from the **Serve** menu, releasing `verbose`:
   - Metric to monitor: **Average output tokens per AI completion**, with **Automatic rollback** ticked. LaunchDarkly generates this metric from the AI SDK's `$ld:ai:tokens:output` events; if it isn't listed yet, ask the chat box a question first.
   - **Target by**: `user`. The metric's analysis unit must be `user` too. LaunchDarkly sets it to your account's default context kind for experiments, which is `user` on a new account. If yours differs, edit the metric.
   - **Rollout duration**: a custom schedule with a first stage of **10%** that lasts at least 5 minutes, as in step 4.
   - Save.
3. Start the traffic:

   ```bash
   npm run traffic -- tokens
   ```

   For each made-up context, the script fetches `support-assistant` and records token usage on that config's tracker: about 2,500 output tokens when `verbose` is served, about 150 for `concise`.
4. Watch the config's **Monitoring** tab. LaunchDarkly flags the output token metric as a regression and rolls back to `concise`.

The rules from step 4 still apply: fetching the config is the evaluation, so the script fetches before it tracks, for the same context; it tracks every context; and it flushes before it exits.

## Your data

The values in the context form are sent to LaunchDarkly and appear on its **Contexts** page, so enter made-up values. Attributes you mark as private still work for targeting, but the SDK leaves them out of the context data it sends back to LaunchDarkly: see [Private attributes](https://launchdarkly.com/docs/sdk/features/private-attributes).

## Troubleshooting

- **`node: .env: not found`**: run `cp .env.example .env` and fill it in.
- **The page says "SDK failed"**: `LD_CLIENT_SIDE_ID` must be the **Client-side ID**, not the SDK key.
- **The banner never turns on**: check that you are changing the flag in the same environment as your client-side ID, and that the flag is available to client-side SDKs.
- **The banner doesn't follow a new key**: press Enter or Tab after typing. The page calls `identify()` when a field changes, and a text box only reports a change when you leave it or press Enter.
- **Port 3000 is busy**: run `PORT=3001 npm start`.
- **The traffic progress line only ever shows `old` (or `concise`)**: the guarded rollout hasn't started yet, or the flag or config key doesn't match exactly.
- **`npm start` or `npm run traffic` says it could not connect**: `LD_SDK_KEY` must be the **SDK key** (it starts with `sdk-`) for the same environment.
- **The chat says the assistant is switched off**: check that the config key is `support-assistant` and that its default rule serves a variation.
- **The chat says "Something went wrong"**: the message comes from the model call. A 401 means `MODEL_API_KEY` isn't a valid Anthropic API key. Clear it to go back to echo mode.
- **The guarded rollout rolled back, but not for a regression**: check the reason on the **Monitoring** tab. If the new variation didn't reach enough contexts, the first stage was too small for 600 contexts: use 10% or more, or send more traffic. Start the guarded rollout before the script, so that every evaluation counts.

## License

[MIT](LICENSE)
