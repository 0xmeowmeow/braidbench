# Sharing clips

Two original, silent, captioned videos rendered from the actual Braidbench model. Each is 18 seconds, 1080 × 1920 (9:16), 24 fps, H.264 / yuv420p with MP4 fast-start. No music rights are needed. Optional SRT captions and poster frames are alongside the MP4s.

- [Eight-strand tabletop machine](braidbench-tabletop.mp4): carrier movement → bobbin payout and slack storage → exposed braid formation.
- [576-wire industrial study](braidbench-industrial.mp4): 72 carriers → eight parallel ends per bobbin → individual crossings around the core.

Suggested accompanying text:

> How does moving a bobbin make a braid? Follow the thread from its spool, through the guides, and into the crossing. Braidbench is an interactive geometric study; its physical mechanism is still in development.

> 72 moving carriers. Eight ends per bobbin. 576 individual wire paths. This close-up follows the braid where it forms around the cable core. A geometric simulation, with prototype hardware still being developed.

The videos do not claim a tested physical machine or twist-free wire delivery. No social-media posting has been performed.

To reproduce: `npm install`, `npx playwright install chromium`, start `npm start`, then `node tools/export_social.cjs all`. Set `CHROMIUM_PATH` for an existing browser executable. `--preview` exports representative stills before rendering. FFmpeg with libx264 must be on PATH. The simulation phase advances deterministically for each frame; export time does not affect playback speed.
