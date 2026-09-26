# Continuum videos

Two videos: the **live demo** (`exports/demo/continuum-live-demo.mp4`, below first) shows the product working; the **pitch** (`exports/demo/continuum-pitch.mp4`) tells the story over the presentation page.

## Live demo video

`exports/demo/continuum-live-demo.mp4`: 2:35 (155 s), 1920×1080, H.264 with AAC audio, about 76 MB.

- **Opener (0:00–0:12):** the FLUX 3 HD clip with its music lowered under the intro narration.
- **Restart scene:** a replay of a real terminal session captured on 2026-09-25: three separate `demo:rawtree` processes on a fresh run (fictional Acme pricing, live RawTree), each with its real measured runtime (about 5 s), then `replay` showing both restart boundaries. The caption says "fictional example data".
- **Inspector scenes:** headless Chrome drives the real inspector at 127.0.0.1:4700 over `small-models-v1-run-1`. A drawn cursor clicks real cells, and the two `ask` questions are typed and answered live by the local Liquid model (verified Gemma answer; withheld failure answer with the attribution reason). Every frame is a real screencast frame.
- **Brief scene:** the generated evidence brief served by the inspector.
- **Narration:** macOS "Zoe (Premium)" at 182 wpm with `[[slnc]]` pauses, written for listening. Each scene lasts at least as long as its narration.
- **Cost:** $0. Rebuild with `tools/demo-live/make.sh` (needs the inspector running on current code).

### Live demo narration

**Continuum · live demo.** Hi! This is Continuum. It's a research agent built for long jobs. It remembers its work, survives restarts, and won't tell you anything its memory can't back up. Let me show you, live.

**Restart survival · three separate processes · fictional example data.** First, restarts. I start a small research run. This one uses made-up pricing data, so it's quick. It does one step, saves it to RawTree, and the process exits. Now a brand-new process. It picks up exactly where the last one stopped. And one more, to finish. The replay shows every restart boundary, and the final decision. The two prices disagree, so it keeps both, instead of guessing.

**Live run · real web data · stored in RawTree.** Now the real thing. We asked Continuum: which small, open model should we run on our own devices? Five models, four facts each, researched live on the web. Green means two different websites agree. Grey means there's only one source, or none, and the agent says so.

**Every verdict links to exact quotes.** Let's open one. L F M 2 point 5's context length: 128 K. Here are the exact sentences, and where they came from. Some from search snippets, some from full pages the agent went and fetched.

**Contradictions stay visible · follow-ups run automatically.** Gemma is more interesting. Hugging Face says 128 K. A listing site says 32,000. Continuum doesn't pick a winner. It ran a follow-up search on its own, couldn't settle it, and kept both. And Qwen? The follow-up found a source that explains both numbers: 32,768 native, and 131,072 with yarn. So it's marked qualified, and the older decision is still right there, in the history. Nothing gets overwritten.

**Ask the memory · local Liquid LFM2.5 · answered live.** Now, let's ask it why. The question goes to the Liquid model running on this laptop. And before any answer is shown, code checks every citation, number, and source against memory. Verified. With the quotes, right there.

**Ask the memory · a wrong answer, caught.** Here's a harder one. What failed during this run? The model writes a fluent, confident answer. And it's withheld. It blamed Gemma for failures that actually belonged to Phi 4 mini. The check caught it, and shows you the real records instead. That's the difference between an agent that sounds right, and one you can audit.

**Evidence brief · data from RawTree · artwork by FLUX.** Finally, the deliverable. An evidence brief, built entirely from what's stored in RawTree. FLUX made the artwork, and it's labeled as art. It never touches the data. That's Continuum. Most agents remember the conversation. Continuum remembers the work.

### Checks done

Probed with AVFoundation (155.1 s, 1920×1080, one audio track) and 10 keyframes reviewed. A first recording showed an outdated `ask` answer because the inspector server was running pre-fix code; the server was restarted and all scenes re-recorded. Audio not listened to from the CLI.

## Pitch video

`exports/demo/continuum-pitch.mp4`: 2:53 (173 s), 1920×1080, H.264 with AAC audio, 77 MB.

## How it was made

- **Opener (0:00–0:12):** the existing FLUX 3 HD clip (`exports/media/small-models-v1-run-1-hd-video-1.mp4`) with its own ambient audio. No new FLUX generation.
- **Page traversal (0:12–2:53):** a pixel-exact render of the real presentation page (`exports/presentation/index.html`, the offline copy of the published artifact) in headless Chrome, dark theme, 1920 px wide. A code-driven camera moves between the measured section positions, holding on each section while it is narrated. The FLUX clip is drawn into the page's own video player while the brief section is on screen. Nothing on the page is generated or redrawn by a model.
- **Narration:** written from the stored run data and spoken by macOS text-to-speech (voice Samantha, 186 wpm), one file per section. Some words are spelled phonetically for the voice ("L F M 2 point 5", "Gemma 3, 4 B"); the facts are unchanged.
- **Assembly:** AVFoundation (Swift) renders frames and mixes the opener audio with the narration.
- **Cost:** $0 (no Nimble, OpenRouter, or FLUX calls). Rebuild with `tools/demo-video/make.sh` from the repo root.

## Narration script

**0:12 · Hero.** This is Continuum. Most agents remember the conversation. Continuum remembers the work. It's a research agent that saves every step to durable memory, survives restarts, keeps disagreements visible, and refuses to say anything its memory can't support.

**0:28 · The problem.** Agents are fine for five minutes. Give one hours of research, and three things break. It forgets, because its memory is the chat window. A crash throws away the work. And when you ask why, you get a plausible story instead of what it actually saw.

**0:43 · How it works.** Continuum makes every step leave a record. Nimble searches the live web, and fetches the full page when snippets aren't enough. Liquid's L F M 2 point 5 model, running locally on this laptop, extracts each value with an exact quote. Plain code checks the values, and needs two different websites before anything is marked supported. Underneath it all, RawTree keeps two append-only tables: what the agent knows, and everything it did.

**1:08 · The run.** Here's a live run. Which small open model should we run on our own devices? Five models, four facts each. The agent collected forty quoted observations from eighteen websites, and survived nine process sessions, two failures, and two recorded retries. Green means two websites agree. Grey means one source or none, and the agent says so, instead of guessing.

**1:30 · Contradictions.** It keeps disagreements visible. For Gemma 3, 4 B, Hugging Face says 128 K tokens, and a listing site says 32,000. A follow-up search couldn't settle it, so both quotes stay on record. For Qwen 3, 4 B, the follow-up found a source saying the native window is 32,768 tokens, expandable to 131,072 with yarn. Both are right, under different conditions, so the claim is marked qualified. Nothing is overwritten.

**2:01 · Ask the memory.** You can ask the memory why. Code pulls the records from RawTree, the local model phrases an answer, and code checks every citation, number, link, time, and which model each fact belongs to. This answer about Gemma passes. But asked what failed, the model blamed Gemma for page failures that belonged to Phi 4 mini. The check caught it, and the answer was withheld, instead of a confident, wrong story.

**2:25 · The brief.** The final brief is drawn from stored evidence. FLUX made only the artwork. We asked it for five chips on the cover, and it drew three. That's why generated pixels never carry facts here.

**2:36 · Stack and close.** Nimble gives it eyes. Liquid gives it reasoning, on device. RawTree gives it memory. FLUX gives it a face. The research run cost about six cents in search. Continuum. Most agents remember the conversation. Continuum remembers the work.

## Checks done

Probed with AVFoundation: 173.0 s, 1920×1080, one audio track. Eight keyframes reviewed (opener, crossfade to the hero, problem, matrix with stats, contradictions, ask side by side, brief with the clip playing in the page player, limits). The final audio mix was not listened to from the CLI; play it once before sharing.
