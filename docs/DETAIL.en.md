# Edgerunners

Anime companion for DeepSeek Harness: the hero lives in the corner of the window and reacts to what
the agent is doing, while a compact HUD under the sprite shows the hero's name, current action and the
file or command the agent is working on.

This plugin is a DeepSeek Harness port of
[`Alexanderadon/edgerunners`](https://github.com/Alexanderadon/edgerunners), a fan mod for Claude Code:
same heroes, clips and lines, rendered inside the DSH window without PowerShell.

## Heroes

| Hero | How they talk |
|---|---|
| **Roman** | "MOTOR!", "That's a wrap!", "Into the edit!" |
| **Talia** | "Breaching…", "Clean.", "Into the shadows." |
| **Di** | "Fixing.", "Works — don't touch.", "We'll resolder." |
| **Wick** | "Working.", "Here's the plan…", "Clean job, kid." |

## What it does

- **Pet in the window corner** — sprite animation from the original frames, about 49 clips: idle,
  walk, read, type, search, film, fix, dance, laugh, facepalm, scared, sleep and posture transitions.
- **Reacts to agent tools**: reading a file shows a tablet, searching looks around, editing types,
  running a command plays the hero's signature work, an error is a facepalm, a finished turn celebrates.
- **HUD under the character**: hero name, status ("READING", "TYPING", "ERROR"…) and the target
  (file, search pattern or the first two words of a command; command values are never shown).
- **Click the pet** for a reaction and a line; click the hero name to switch to the next hero.
- **Drag anywhere**: grab the hero and move it anywhere in the window — the position is saved,
  and the "Back to the corner" button in the settings returns it to the right edge.
- **⚙ in the HUD row** opens the settings panel over the window: hero, size, language, updates.
- **Rest**: after 90 / 160 / 260 seconds without work the hero sits down, lies down and falls asleep.
- **`/persona <hero>`** — pick a hero from the command line (`roman`, `talia`, `di`, `wick`).

## Settings

**Settings → Edgerunners** (a separate page next to "Plugins"):

- **Hero** — four hero cards. The choice is stored in `~/.dsh/edgerunners.json` and switches the pet
  and the HUD immediately, including after a Harness restart.
- **Size** — a 70–400 % slider, applied on the fly. The hero stands at the right edge and grows
  leftwards; the right margin stays 18 px.
- **Language** — Russian or English: lines, HUD statuses, hero names and this page. Frames and clips
  do not depend on the language.
- **Position** — drag the hero anywhere in the window; the position is stored in the browser and the
  "Back to the corner" button resets it.
- **Updates** — the "Check for updates" button: reads `.claude-plugin/plugin.json` in the original,
  compares versions and, if the original is newer (or autoport data is missing), downloads the archive
  from `codeload.github.com` and ports frames, clips, lines and hero data itself. Parsing runs in an
  isolated `node:vm` sandbox with size and time limits. Collected data is stored in
  `~/.dsh/edgerunners-upstream.json` and applied without a restart.

## Enable and disable

The plugin is a regular profile bundle: **Plugins** in the left sidebar → the **Edgerunners** row —
enable or disable it. Disabling removes the pet, the HUD and the settings page; enabling brings them
back without a restart.

## Plugin code updates

Settings has a **Plugin update** section: it reads the repository's `marketplace.json`, compares
versions and asks the DSH plugin manager to replace the installed copy with the new one (pinned to a
commit) — no removing and re-adding the plugin. It works only when the plugin was installed from a
pinned commit spec (`git+https://…git#<commit>`); for a branch install the button is disabled and
shows the spec to use. If DSH reports that a restart is required, restart the Harness.

## Security

- Updates are downloaded over HTTPS from `Alexanderadon/edgerunners` only; content is checked by size
  and structure, and nothing outside `assets/pet/**` and `assets/sounds/**` is written.
- The mod sources are parsed in an isolated `node:vm` context: host objects are not passed in, string
  code generation (`eval`, `new Function`) is disabled, the literal size is bounded, suspicious
  constructs are rejected and parsing has a timeout.
- Plugin HTTP routes live on the DSH loopback server and accept same-origin requests only; cross-site
  browser calls are rejected, `POST` requires `application/json`, and updates are rate-limited.
- Archive signature and hash are not verified: trust extends to the original `main` branch, so a
  compromise of that repository affects the plugin. The version and last check time are visible in
  the settings.

## Image quality

Frames are 420×372 PNGs from the original; the mod has no higher-resolution source. So that the
sprite does not look soft on HiDPI screens and at 200–400 % scale, every frame has an `@2x.webp`
neighbour (840×744, Lanczos plus a light unsharp mask) that the browser picks through `srcset` only
on high-density displays and when the sprite is large enough. The original PNGs stay canonical and
are the fallback; the autoport from the original updates them, while the 2× variants are rebuilt on
release with `python tools/make2x.py [--quality 80]`.

## Limitations

- Autoport transfers **data**: frames, clips, lines, hero names. The scene logic (which tool triggers
  which animation, rest, click, call) is plugin code: changes to the original's behavior have to be
  ported by hand.
- Version checks follow the original `main`; tags and releases are not considered.
- If the original sources change so the literals no longer parse, the plugin reports an autoport error
  in the settings and keeps running on the previous data.
- There is no "window not in focus" call: a browser cannot reliably report window focus.
- The characters are fan use of Cyberpunk: Edgerunners; rights belong to CD PROJEKT RED, Netflix and
  Studio Trigger. The mod code is MIT, author — Alexanderadon.
