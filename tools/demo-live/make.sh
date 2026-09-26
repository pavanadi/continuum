#!/bin/zsh
# Rebuilds exports/demo/continuum-live-demo.mp4: drives the real inspector (live `ask` calls) and replays the captured terminal session.
# Needs: `npm run inspector` on :4700 (current code), local Liquid on LIQUID_BASE_URL, Google Chrome, the "Zoe (Premium)" voice, Swift.
# terminal.json / terminal.html hold the real restart session captured on 2026-09-25 (fictional Acme pricing, live RawTree).
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
node -e '
const segs=require(process.argv[1]+"/narration.json");const {execFileSync}=require("child_process");
for (const s of segs) execFileSync("say",["-v","Zoe (Premium)","-r","182","--file-format=AIFF","--data-format=BEI16@44100","-o",`${process.argv[1]}/seg-${s.id}.aiff`,s.text]);' "$DIR"
node "$DIR/record.mjs"
cp "$DIR/assemble.swift" "$DIR/main.swift" && swiftc -O -o "$DIR/assemble" "$DIR/main.swift" && rm "$DIR/main.swift"
"$DIR/assemble" "$DIR" exports/media/small-models-v1-run-1-hd-video-1.mp4 exports/demo/continuum-live-demo.mp4
