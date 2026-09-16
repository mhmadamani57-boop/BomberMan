# Memory

## Initial findings

- `index.html` and `index (2).html` were byte-for-byte duplicates; keeping both creates ambiguity for GitHub Pages and future edits.
- Canvas drawing used `var(--wall-color)` and similar CSS tokens as `ctx.fillStyle`. Canvas does not resolve CSS variable strings as a valid color, producing invalid fill styles.
- `drawPlayer()` could call `createDebris(player.x, player.y, player.color)` even though `player.color` was never defined.
- The original bomb collision path always passed `ignoreBomb=true` for player movement, allowing the player to walk through every bomb after placement.
- Random block placement could hide the exit or power-ups in unreachable pockets and enemy spawning only checked the current tile.
- CSS touch handling used `touchstart`/`touchend` only, which can leave keys stuck after a canceled gesture.
- There was no pause state, best-score persistence, or deterministic demo mode.

## Decisions

- Keep the static single-file architecture to minimize deployment risk.
- Use an explicit neon palette and a generated floor texture while keeping characters and effects procedural for runtime performance.
- Add `?demo` mode for repeatable visual QA without requiring a human to play during screenshots.

## Verification notes

- Local static server ran successfully on port 4173 and the browser loaded both normal and `?demo` modes.
- The generated floor texture loaded into the Canvas pattern and the neon arena rendered with readable beveled walls, crates, characters, bombs, and HUD panels.
- `?demo` started automatically, moved the player, placed bombs, and updated the score without browser console errors.
- Normal mode: Start Run hides the intro overlay; Space changes the bomb counter from `1 / 1` to `0 / 1`; after the fuse completes it returns to `1 / 1`.
- Pause button shows `SYSTEM HOLD // PAUSED` and resume returns to `SECTOR 01 // LIVE`.
- Sound toggle changes from `♪` to `×` and back without throwing an exception.
- Browser console remained clean during the tested interactions.
