# Continuum demo video

`exports/demo/continuum-demo.mp4`: 2:53 (173 s), 1920×1080, H.264 with AAC audio, 77 MB.

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
