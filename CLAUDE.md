# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Feature flags teaching demo

Read the spec first: @BRIEF.md

## How to work in this repo

- Build in the order of the demo flow in the brief: banner, targeting,
  rollout, latency guarded rollout, chat, token guarded rollout. Stop after
  each step and show what changed before starting the next.
- Plain Node 20+ ESM and Express only. No TypeScript, no bundler, no
  front-end framework, no extra dependencies without asking.
- Confirm LaunchDarkly SDK method names and signatures against the docs linked
  in the brief before using them. If a call is uncertain, say so and link the
  page you checked.
- Keep files small and readable. The audience reads this code on a projector.
  Comments explain the LaunchDarkly call, not the JavaScript.
- Never write a key or ID into a tracked file. Use `.env` and `.env.example`.
- The traffic scripts send synthetic data. Keep that visible in script output
  and in the README.
- When finished, run `/init` to add build and test commands here, keeping this
  file under 60 lines.

## Commands

- `npm install`, then `cp .env.example .env` and fill in `LD_CLIENT_SIDE_ID` and
  `LD_SDK_KEY` (`MODEL_API_KEY` is optional). Both scripts run `node --env-file=.env`.
- `npm start` serves the page and `POST /api/chat` on http://localhost:3000.
- `npm run traffic -- latency|tokens [contexts=600] [perSecond=20]`
- No build, lint or test tooling. Check changes by running the app and scripts
  against a LaunchDarkly environment set up as the README describes.

## Architecture

- Three entry points share one environment: `public/index.html` (browser SDK,
  imported from `/sdk`, which Express serves out of `node_modules`), `server.js`
  (server SDK and AI SDK) and `scripts/traffic.js` (synthetic guarded rollout load).
- The page sends one `user` context (`key`, `country`, `plan`) to both `identify()`
  and `/api/chat`, so targeting applies to the banner and the AI config alike.
- Keys shared by code and README: flags `welcome-banner`, `checkout-v2`; event
  key `checkout-latency`; config `support-assistant` with variations `concise`
  and `verbose` (`traffic.js tokens` branches on the variation key).
- The chat echoes when `MODEL_API_KEY` is unset. Both paths run in one
  `tracker.trackMetricsOf(...)`. Don't spread the config's model parameters into
  the Claude call: sampling parameters return a 400 on the current API version.
- `traffic.js` follows the guarded rollout rules: evaluate, then track the same
  context; track every context; fresh keys per run; `flush()` before `close()`.
  The 600-context default assumes a first rollout stage of at least 10%.

## Deliberate departures from BRIEF.md

- Browser SDK is v4 `@launchdarkly/js-client-sdk`: the brief's v3 package reaches
  end of life on 2027-02-04.
- `@anthropic-ai/sdk` was added with the owner's approval. `@launchdarkly/server-sdk-ai`
  is now LaunchDarkly's legacy AI SDK; it stays because its tracker calls are the lesson.
