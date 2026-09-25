# Continuum: judge demo script

About 6 minutes plus Q&A. Every number and output below was checked against the recorded run `small-models-v1-run-1` and a rehearsal on 2026-09-25. Answers from `ask` are deterministic (local model, temperature 0), so what you see here is what judges will see.

**One-line pitch:** *Most agents remember the conversation. Continuum remembers the work, and it can't give you an answer its memory doesn't support.*

---

## Before you start (5 minutes ahead)

| Check | Command / action | Expected |
|---|---|---|
| Local Liquid is up | `curl -s http://127.0.0.1:4625/v1/models` | shows `LFM2.5-2.6B-Q4_K_M` |
| Inspector is running | `npm run inspector` | `http://127.0.0.1:4700` |
| Browser tab 1 | http://127.0.0.1:4700/?run=small-models-v1-run-1 | matrix loads (✓7 ◐1 ⚠1 ?11) |
| Browser tab 2 | **Open brief** in the inspector | brief with cover, cards, HD clip |
| Browser tab 3 (audience page) | https://claude.ai/artifact/HDMFprYhTJjkspcxSGnzbN, or offline `exports/presentation/index.html` | presentation page; share it first so others can open it |
| Terminal | project folder, large font, cleared | — |
| Fresh run ID for the live beat | pick one, e.g. `judge-demo-1` | must not exist yet |

Layout: terminal on the left, browser on the right. Keep the HD clip (`exports/media/small-models-v1-run-1-hd-video-1.mp4`) ready to play full-screen.

---

## 0. Hook: 30 s

**Do:** Play the 12-second HD clip (muted if the room is noisy).

**Say:** "Agents are fine for five minutes. Give one a job that takes hours, like researching a market or doing due diligence, and three things break: it forgets what it did, a crash throws away the work, and when you ask *why*, it makes up an answer. Continuum fixes all three by writing every step to durable memory in RawTree, and by refusing to state anything that memory doesn't support."

> The clip is AI-generated (FLUX 3). It's mood only; say so if asked.

## 1. The goal and a live start: 40 s

**Say:** "Our goal is a real buyer's question: which small open model should we run on our own devices? Five models, four facts each, twenty claims."

**Do:** `cat goals/small-models-v1.json`

**Say:** "Before the demo we ran this live. Nimble searched the web, Liquid's LFM2.5 extracted quotes, running locally on this laptop, and RawTree stored everything. Let me start a small run right now so you can see a restart happen."

**Do:** `npm run demo:rawtree -- judge-demo-1`

**See (about 5 s):** `"nextTask": { … "role": "skeptic" … }`, with evidence `$49/month` recorded. This run uses fictional pricing; persistence is real RawTree.

## 2. Evidence you can check: 45 s

**Do (browser, tab 1):** Point at the matrix. Click **LFM2.5-2.6B → context length (✓ 128K)**.

**Say:** "Every cell links to exact quotes. This one is supported because two different websites agree. The detail shows each quote, its source, when it was seen, and whether it came from a search snippet or a full page the agent fetched when snippets weren't enough. ✓ means sources agree, not that it's true, and we say so on screen."

**Point out:** 40 quoted observations from 18 websites; 16 came from full pages.

## 3. Stop, restart, continue: 60 s

**Do (terminal):** Run the same command again, which starts a brand-new process:
`npm run demo:rawtree -- judge-demo-1`

**See:** `"nextTask": { … "role": "verifier" … }` and both prices recorded. It resumed from RawTree; nothing was redone.

**Do:** `npm run demo:rawtree -- judge-demo-1` (third process) and then `npm run demo:rawtree -- judge-demo-1 replay`

**See:** The timeline with `── restart boundary: new process session ──` lines, and a final decision `unresolved`: the agent kept both prices instead of picking one.

**Do (browser):** In the real run, open the **Timeline** tab.

**Say:** "The real run lived through 9 process sessions. A bot-protected page failed twice. The agent logged it, retried only after a recorded failure, and never repeated a paid call whose outcome was unknown. Later it learned to skip pages it can't fetch: here's `page fetch failed … skipped`."

## 4. Contradictions it didn't hide: 60 s

**Do:** Click **Gemma-3-4B → context length (⚠)**.

**Say:** "Hugging Face says 128K; a listing site says 32,000. The agent doesn't pick one. It saw a real disagreement and automatically planned a follow-up search; the follow-up didn't settle it, so it's still ⚠, visible, with both quotes."

**Do:** Click **Qwen3-4B → context length (◐)**. Show the **decision history** (unresolved, then qualified).

**Say:** "Here the follow-up worked. Its targeted search found a source saying *'Native context window is 32,768 tokens, expandable to 131,072 tokens using YaRN.'* Both numbers are right, under different conditions. We call that **qualified**. And notice the earlier decision is still there: memory is append-only, nothing gets rewritten."

## 5. Ask why, with a verified answer: 45 s

**Do (browser):** Click **Gemma-3-4B → context length (⚠)**, then **Ask the memory** → type *Why is the Gemma-3-4B context length unresolved?* → **Ask**. (About 7 s.)

**See:** `✓ Verified: 3 citation(s) exist in stored records; all numbers grounded`, and an answer naming huggingface.co (128K) against aimodelcomparison.org (32,000 tokens), with quotes and URLs.

**Say:** "Code pulls the relevant records from RawTree; the local Liquid model only phrases the answer; then code checks every citation, number, URL, time and which model each fact belongs to before we show it."

> Use the Gemma question rather than Qwen's. The Qwen answer also verifies, but it overstates what one cited source (apxml.com) says. That's a good Q&A example of why citations are always shown, but not the one to lead with.

## 6. The answer it refused to give: 45 s

**Do:** Ask *What failed during this run, and was it retried?* (About 12 s.)

**See:** `✗ Answer withheld: attributes 22:08:00… to Gemma-3-4B but the stored record belongs to Phi-4-mini …`, followed by the stored records.

**Say:** "This is my favourite part. The model wrote a fluent answer, and it blamed the wrong model. Every timestamp it used was real, but it attached Phi's failures to Gemma. Our verifier caught the mismatch and withheld the answer. Most agents would have shown you that confident, wrong story."

## 7. The brief: 45 s

**Do (browser, tab 2):** Scroll the brief: cover → Candidates → matrix → "What is uncertain, and why" → "How we know" → the clip → Provenance.

**Say:** "This is the deliverable. Every fact is drawn by code from RawTree. FLUX made only the artwork, and it's labelled. One detail: we asked FLUX for five chips and it drew three. That's exactly why generated pixels never carry data here; the numbers are all rendered from evidence. Even the artwork has provenance: model, request ID, seed, cost."

## 8. Close: 15 s

**Say:** "Nimble gives it eyes, Liquid gives it reasoning on-device, RawTree gives it memory and self-observation, and FLUX gives it a voice. **Most agents remember the conversation. Continuum remembers the work.**"

---

## Likely questions

| Question | Answer |
|---|---|
| How much did the run cost? | About $0.06 of Nimble for the 20-claim run (search plus page extracts, list-price estimate). Liquid ran locally for free. FLUX artwork about $2.50, mostly the 12-second HD clip. RawTree usage wasn't a constraint. |
| Why so many "?" cells? | We only mark ✓ when two different websites agree. One source, or no usable evidence, stays "?". Guessing would be easy; we chose not to. |
| Is ✓ proof? | No. It's source agreement, and the UI says so. Quotes are exact, so anyone can check. |
| What if it crashes mid-call? | Each step is saved before and after. A task that started but never recorded an outcome isn't retried automatically, because a paid call may have happened; it's flagged for inspection. |
| Does "verified" mean the answer is correct? | It means every citation, number, URL, time and model attribution matches stored records. It doesn't prove every inference; that's why citations are always shown. |
| Why a local model? | Privacy and cost: extraction runs on-device (LFM2.5, 2.6B, via llama.cpp). The same code switches to hosted Liquid on OpenRouter. |
| Did you rewrite results after fixing rules? | No. Re-verification appends new decisions next to the old ones; you can see both in the decision history. |

## If something goes wrong

- **Local model down:** Start `llama-server` again (command in README, port 4625). If there's no time, skip beats 5–6 in the UI and show them from the terminal history, or describe them from this script: outputs are deterministic.
- **Inspector won't load a run:** Restart `npm run inspector`. The brief file opens directly: `open exports/small-models-v1-run-1-brief.html`.
- **No network (RawTree unreachable):** Open the brief file directly (the cover and cards are embedded; the clip is at `exports/media/`). For the matrix and claim details, `open inspector/index.html` (offline mode) and use **Open JSON** on `exports/small-models-v1-run-1.json`, already exported; re-export with `npm run inspector -- export small-models-v1-run-1`. `ask` needs the live server and model.
- **The live start fails:** Pick a new run ID; the fixture run needs only RawTree.

## Say it accurately

- The Acme pricing in beats 1 and 3 is **fictional**; the model comparison is **live web data**.
- Don't call ✓ "true", and don't present LFM2.5's "Aug 2026" or other single-run values as independently confirmed facts.
- The clip and images are **AI illustrations**; the model doesn't speak (listen to the clip's audio beforehand to confirm).
