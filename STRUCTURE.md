# Structure

## Runtime

The game remains a dependency-free static browser build. `index.html` owns the DOM shell, styles, Canvas renderer, gameplay state, input bindings, and animation loop.

## Layers

| Layer | Responsibility |
|---|---|
| DOM shell | HUD panels, overlays, pause state, mobile controls, status messages |
| Canvas world | arena floor, walls, crates, bombs, explosions, power-ups, player, enemies, particles |
| Game state | map tiles, entity arrays, player progression, level state, timers |
| Input | keyboard, pointer/touch buttons, pause and audio toggles |
| Persistence | best score via `localStorage` |
| QA | `?demo` deterministic autopilot and data attributes on key UI elements |

## Core State

- `map[y][x]`: tile grid with wall, crate, bomb, or empty cells.
- `player`: fractional grid position plus lives, score, bomb capacity, flame range, animation state, and invulnerability timer.
- `bombs`: bomb positions, fuse timers, flame range, and owner escape state.
- `explosions`: short-lived flame cell lists with damage and fade timers.
- `entities`: enemy actors with deterministic movement decisions and visual animation phases.
- `powerups`: hidden or revealed bomb/flame upgrades.
- `particles`: bounded transient visual effects.

## Asset Hints

- Use `design/floor-tile.png` as a Canvas repeating pattern when it has loaded; fall back to the same palette rendered procedurally if unavailable.
- `design/reference.png` is a visual target and is not loaded at runtime.

## Verification Hooks

- `?demo` turns on the deterministic showcase autopilot.
- `data-testid` attributes identify HUD and overlay elements for browser checks.
- The renderer never uses CSS variable tokens as Canvas fill values; all Canvas colors are explicit strings.
