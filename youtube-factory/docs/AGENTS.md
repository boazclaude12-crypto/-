# Agents

> Answers section 84.E. Sixteen agents, one contract.

An agent is a pure function `(typed input, context) → typed output` with a versioned prompt.
`Agent.run()` in `src/agents/framework.ts` is the only path from the domain to a model, and it
always performs the same six steps:

1. **Validate the input** against the agent's zod schema. A malformed call fails before it costs
   anything.
2. **Resolve the prompt** — the active version for this channel, from the database. No agent
   contains a prompt literal, so prompts can be revised, compared and rolled back without a deploy.
3. **Select a provider** from the registry by capability, cost and health, and call it with the
   JSON Schema derived from the output type.
4. **Validate the response.** On failure: one repair round-trip that shows the model its own
   output plus the validation errors, then the next provider in the chain.
5. **Record an `AgentRun`** — prompt name and version, provider, model, tokens, cost, latency,
   attempts, verdict.
6. **Return `AgentResult`** — the output plus an explainable `Decision` that names the numbers
   behind it.

Agents may also **refine** their output. This is where rules that must hold are enforced in code
rather than hoped for in a prompt:

| Agent | Enforced after the model answers |
|---|---|
| `RESEARCH_AGENT` | A finding naming no source cannot be `SUPPORTED`, whatever the model claimed. |
| `FACT_CHECK_AGENT` | The aggregate confidence is recomputed from the per-claim verdicts, so it cannot be overstated. |
| `SCRIPT_AGENT` | Duration is computed from the actual word count at the language's speaking rate, not from the model's estimate. |
| `RETENTION_AGENT` | A failed check with no rewrite instruction gets one generated — otherwise the rewrite loop has nothing to act on. |
| `SCENE_AGENT` | Scenes are re-indexed and the character bible is injected into every prompt that names a character. |
| `VOICE_AGENT` | If the segments do not reconstruct the script, they are discarded and the text is split deterministically. The model must not paraphrase narration. |
| `EDITING_AGENT` | Cues past the end are dropped; SFX are thinned to at most one every four seconds. |
| `THUMBNAIL_AGENT` | Overlay text is capped at the three words that actually fit. |
| `SEO_AGENT` | Duplicate tags dropped, YouTube's 500-character tag budget enforced, chapters appended from computed timings. |
| `QC_AGENT` | A failed blocker check forces `passed: false`. The verdict is not the model's to soften. |
| `STRATEGY_AGENT` | The mix is rescaled to the channel's real weekly output. |
| `DECISION_AGENT` | A choice outside the offered options falls back to a valid one and says so. |

## The sixteen

| Agent | Input | Output |
|---|---|---|
| `IDEA_AGENT` | niche, audience, trends, competitor topics, recent titles, learnings | scored `ContentIdea[]` |
| `COMPETITOR_AGENT` | competitor snapshots | working topics, format and title patterns, gaps |
| `RESEARCH_AGENT` | topic, angle, depth, runtime | findings with source, type, date, confidence, verdict |
| `FACT_CHECK_AGENT` | script + findings | per-claim verdict, aggregate confidence, sentences to remove |
| `SCRIPT_AGENT` | topic, research, audience, style, runtime, rewrite instructions | structure, hook, intro, sections, CTA |
| `RETENTION_AGENT` | script | retention score, hook strength, eight checks, rewrite instructions |
| `SCENE_AGENT` | script, visual style, pacing, characters | scenes with prompts, camera, motion, continuity; character bible |
| `VISUAL_AGENT` | one scene, budget, per-option costs | production strategy and the final prompt pair |
| `VOICE_AGENT` | script, voice profile, segment limit | narration segments with delivery notes |
| `EDITING_AGENT` | scenes, voice timings, music mood | transitions, overlays, SFX, music bed |
| `THUMBNAIL_AGENT` | title, topic, hook, style | three distinct concepts with predicted CTR |
| `SEO_AGENT` | script, research, chapters | 10+ scored titles, description, tags, hashtags, keywords |
| `QC_AGENT` | probe report, technical checks, scores, thresholds | pass/fail, score, repair instructions |
| `ANALYTICS_AGENT` | predicted vs actual vs baseline | weighted, falsifiable observations |
| `STRATEGY_AGENT` | last 20 videos, analytics, competitors, trends, learnings | next week's mix and recommendations |
| `DECISION_AGENT` | any decision point, options, data, constraints | chosen option with the numbers that decided it |

## Prompt versioning

Prompts live in `PromptTemplate`, seeded from `src/agents/prompts/seed.ts` by `factory seed`.
The Prompts screen creates a new version, activates it, and shows per-version statistics from
`AgentRun` — run count, success rate, average latency, average cost. Rolling back is activating
the older version. Production prompts are never rewritten automatically by the learning loop
(spec §78); learnings are data the agents read.

## Grounding

Two rules run through every content prompt and are enforced in code as well as stated in text:

- A specific claim — a number, date, name, quotation, causal assertion — must be supported by a
  supplied finding. Otherwise it is `UNVERIFIED` and may not be stated as fact.
- The output is original writing synthesised across sources, never a close paraphrase of one.
  The QC stage measures n-gram overlap against every source and blocks a script that reproduces
  one too closely.
