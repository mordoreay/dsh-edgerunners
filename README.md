# Edgerunners for DeepSeek Harness

Anime companion for [DeepSeek Harness](https://github.com/deepseek-ai/dsh): a hero stands in the corner of the
window, reacts to what the agent is doing, and speaks in character. A compact HUD under the sprite shows the
current action and the file or command the agent is working on.

> **Unofficial adaptation.** This repository is a DeepSeek Harness port of the original mod
> [**Alexanderadon/edgerunners**](https://github.com/Alexanderadon/edgerunners) by
> **Alexander Kurchakov (Alexanderadon)**. Same heroes, clips and lines — re-hosted inside DSH,
> without PowerShell or an external pet process. All credit for the characters, artwork and writing
> goes to the original author.

![Talia in the corner](assets/pet/talia/idle_01.png)

*Русская версия: [README.ru.md](README.ru.md).*

## Heroes

| Hero | Who | How they talk |
|---|---|---|
| **Roman** | kid blogger with a camera | "MOTOR!", "That's a wrap!", "Into the edit!" |
| **Talia** | cyber ninja, netrunner | "Breaching…", "Clean.", "Into the shadows." |
| **Di** | sleepy mechanic | "Fixing.", "Works — don't touch.", "We'll resolder." |
| **Wick** | veteran fixer | "Working.", "Here's the plan…", "Clean job, kid." |

## Quick install

You need DeepSeek Harness with plugin support (Desktop or Web). No admin rights, no separate process.

1. **Get the folder.** `git clone https://github.com/mordoreay/dsh-edgerunners.git`
   or on GitHub: **Code → Download ZIP**, then unpack.
2. **Open DSH → Settings → Plugins.**
3. Press **Add plugin** and choose the folder that contains `package.json` (the repository root).
4. Check that the **Edgerunners** row is enabled. If it was just installed and nothing appeared,
   refresh the page (`Ctrl+R`).
5. **Open Settings → Edgerunners** to choose a hero, size and language. The same panel opens from
   the ⚙ button in the row under the pet.

To remove it, press the remove action on the Edgerunners row — the plugin keeps nothing outside its
own folder except a small `edgerunners.json` in the DSH home directory.

## What it does

- **Pet in the window corner** — sprite animation from the original frames, ~49 clips: idle, walk,
  read, type, search, film, fix, dance, laugh, facepalm, scared, sleep and posture transitions.
- **Reacts to tools**: reading a file shows the tablet, searching looks around, editing types, running
  a command plays the hero's signature work, an error is a facepalm, the end of a turn is a celebration.
- **HUD under the character**: hero name, status word and the target the agent is working on
  (file name, search pattern or the first two words of a command; command values are never shown).
- **Click** the pet for a reaction, click the hero name to switch to the next hero.
- **Rest**: after 90 / 160 / 260 seconds without work the hero sits down, lies down and falls asleep.
- **`/persona <hero>`** — pick a hero from the command line (`roman`, `talia`, `di`, `wick`).

## Settings

**Settings → Edgerunners** (or ⚙ under the pet):

| Setting | Values | Notes |
|---|---|---|
| Hero | Roman / Talia / Di / Wick | saved to `~/.dsh/edgerunners.json`, applies instantly |
| Size | 70–400 % | the hero stands at the right edge and grows leftwards |
| Language | Русский / English | lines, HUD statuses, hero names and this page |
| Updates | button | checks the original repository and ports new content |

## Updates from the original

The **Check for updates** button compares the version with
[`.claude-plugin/plugin.json`](https://github.com/Alexanderadon/edgerunners/blob/main/.claude-plugin/plugin.json)
in the original repository, downloads the archive and ports it automatically:

- frames and sounds → `assets/pet/**`, `assets/sounds/**`;
- clips and timings from `hooks/animation.ts` (including per-hero scenes);
- lines for Russian and English from `hooks/deeds.ts`;
- hero names, roles and poke lines from `hooks/characters.ts`.

The sources are parsed in an isolated `node:vm` context: host objects are not shared, string code
generation (`eval`, `new Function`) is disabled, the literal size and parse time are bounded.
Collected data is stored in `~/.dsh/edgerunners-upstream.json` and applied without a restart.

## Security

- Updates are downloaded over HTTPS from `Alexanderadon/edgerunners` only; only
  `assets/pet/**` and `assets/sounds/**` are written, with a hero allow-list and a frame-name pattern.
- Plugin HTTP routes live on the DSH loopback server and accept same-origin requests only;
  other origins get `403`. `POST` must be `application/json`; updates are rate-limited.
- No archive signature or hash pinning: trust extends to the original `main` branch.
  The version and the last check time are visible in the settings.

## Project layout

```
package.json          DSH bundle manifest (host + client halves)
cordis.patch.yml      loader row for the bundle
index.js              host half: tool events, scene, settings, HTTP bridge
brain.js              heroes, clips, lines, deed mapping, autoport data
update.js             version check, archive download, TS literal compilation
client.js             browser half: pet overlay, HUD, settings page
assets/pet/<hero>/    sprite frames (PNG)
docs/DETAIL.md        plugin page (Russian), DETAIL.en.md (English)
locale/               plugin metadata for the Plugins page
```

## Credits and licence

- Original mod, characters, artwork and writing: **Alexander Kurchakov
  ([Alexanderadon](https://github.com/Alexanderadon))** — [original repository](https://github.com/Alexanderadon/edgerunners), MIT.
- DeepSeek Harness adaptation: this repository, MIT. See [LICENSE](LICENSE).

Fan project. Not affiliated with or endorsed by CD PROJEKT RED, Netflix or Studio Trigger.
Cyberpunk: Edgerunners and its characters belong to their respective owners; the MIT licence covers
the code, not the trademarks or third-party characters.
