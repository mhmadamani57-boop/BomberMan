# BomberMan: Neon Arena Upgrade Plan

## Goal

Turn the original single-file BomberMan prototype into a stable, polished browser game while preserving its familiar rules: move, place bombs, clear blocks, collect power-ups, defeat enemies, reveal the exit, and clear levels.

## Risk Tasks

### 1. Grid movement, bombs, and collision safety
- **Why isolated:** The original game mixes grid tiles, fractional movement, bombs, and player/enemy hitboxes. This caused edge cases where the player could re-enter a bomb, chain reactions could miss state cleanup, and enemies could spawn or move inconsistently.
- **Approach:** Keep all entities in grid-space coordinates, centralize tile occupancy helpers, make bomb pass-through explicit per entity, and resolve movement axis-by-axis with safe clamping. Add a short post-placement escape grace window and ensure every bomb is removed from the map before its explosion is evaluated.
- **Verify:** The player can walk away from a newly placed bomb, cannot walk through walls/crates, chain reactions resolve once, and no stale bomb tiles remain after explosions.

### 2. Animation and visual effects lifecycle
- **Why isolated:** The original canvas renderer applied transforms inconsistently and used CSS variable strings as Canvas fill styles. The player bobbing transform also leaked into later draw calls in some frames.
- **Approach:** Use explicit canvas palette constants, isolate every animated entity with `save()/restore()`, render the background through a generated repeating texture, and use bounded particle arrays plus a finite screen-shake timer.
- **Verify:** No canvas rendering errors, no accumulated transform drift, animations remain smooth after several explosions, and particle counts stay bounded during a long session.

## Main Build

- Replace the duplicated `index (2).html` with one canonical `index.html`.
- Add a neon sci-fi arena visual system: textured floor, beveled walls/crates, glowing bombs, readable cross-shaped explosions, expressive hero/enemies, and floating score feedback.
- Add a responsive HUD with score, best score, lives, level, bomb capacity, flame range, and a progress bar for level clearing.
- Add pause/resume, sound toggle state, keyboard shortcuts, restart flow, and mobile controls with pointer events.
- Add persistent best score using `localStorage`.
- Improve map generation with a guaranteed reachable route to the hidden exit and avoid unfair enemy spawns.
- Add deterministic `?demo` autopilot mode for visual QA and screenshots.

## Assets

- `design/reference.png` — generated visual target for the neon arena direction.
- `design/floor-tile.png` — generated repeating floor texture used by the Canvas renderer.

## Verification

- Keyboard controls: WASD/arrows move, Space drops a bomb, P/Escape pauses, M toggles sound state.
- Mobile controls use pointer events and do not leave stuck movement keys.
- Score and lives update immediately; best score persists across reloads.
- Level completion requires the exit to be revealed and every enemy to be defeated.
- Player death consumes exactly one life and respawns safely with temporary invulnerability.
- Bomb flames stop at indestructible walls, destroy one destructible crate, and trigger chain reactions.
- HUD remains readable at desktop and mobile viewport sizes without overlap.
- No missing assets, uncaught browser exceptions, or canvas style errors.
- `?demo` visibly demonstrates movement, bombs, explosions, score feedback, and HUD updates.

## Proof Bundle

Capture a final browser screenshot and a short demo recording after local verification. The repository itself is static HTML and can be opened directly or served with any static file server.

## Out of Scope

No external backend, multiplayer service, or native packaging is introduced; browser audio remains opt-in because browsers require a user gesture before sound playback.
