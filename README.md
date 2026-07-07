# Pyry Kiviluoma · Cinematic scroll portfolio

Static site: GSAP ScrollTrigger + Lenis + canvas frame sequence. No build step.

## Run

```bash
python -m http.server 8641 --directory portfolio
```

## Media pipeline (Higgsfield Seedance 2.0, std, 1080p, 16:9, no audio, ~8s)

1. Upload headshot as identity reference on every generation.
2. Clips: `hero.mp4` (360 orbit), `builder.mp4` (desk + holographic dashboards), `closer.mp4` (gallery walk).
3. Hero frames:

```bash
ffmpeg -i hero.mp4 -vf "fps=30,scale=1440:-2" -q:v 4 assets/frames/hero/f_%04d.jpg
```

4. Set the frame count in `assets/sequence.js` (`hero.frames`).
5. Drop `builder.mp4` and `closer.mp4` into `assets/video/`.

Missing media degrades gracefully: hero falls back to an animated teal void,
video sections fall back to gradient backgrounds.

## Editing content

All site copy lives in `content.json` and can be edited through an admin panel:

```bash
python scripts/serve.py
```

Then open `http://localhost:8641/admin/`, set the admin key (matches the
`ADMIN_PASSWORD` env var on the server, default `pyry-admin`), edit the
fields, and click "Save changes". Reload the site to see the update.

Each save writes a timestamped backup to `content.backups/` before
overwriting `content.json`. If you're hosting statically without the
`/api/content` endpoint, use "Download content.json" instead and replace the
file manually.

## Contact notes

The "Schedule a call" button opens a modal where visitors leave a note (name,
email, message). Notes are appended to `messages/messages.jsonl` and are
viewable in the admin panel under "Messages" (click "Load messages").

To also get each note emailed, set these environment variables on the server:

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=your-app-password   # Gmail: an App Password, not your login password
CONTACT_TO=pyry.kiviluoma@aalto.fi
```

Email is best-effort: if SMTP is unset or fails, the note is still stored and
the visitor still sees a success message. A hidden honeypot field and a
30-second per-IP rate limit keep out basic spam.
