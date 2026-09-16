# Assets

**Art direction:** Neon arcade sci-fi BomberMan: deep navy arena, electric cyan floor seams, magenta accents, cobalt indestructible pillars, orange beveled crates, a friendly blue-and-white bomber hero, expressive red balloon enemies, warm yellow-orange explosions, and compact glassy HUD panels. The game should feel energetic and premium while remaining readable at small sizes.

## Backgrounds / References

| Name | Description | Size | Image |
|---|---|---:|---|
| arena_reference | In-game visual target showing HUD, board, characters, bombs, explosions, and palette | 2560x1440 reference | `design/reference.png` |

## Textures

| Name | Description | Size | Image |
|---|---|---:|---|
| neon_floor | Seamless deep-navy floor tile with cyan seams and small magenta/teal accents | 512x512 repeat tile | `design/floor-tile.png` |

## Procedural Runtime Art

| Asset | Runtime treatment | Intended display size |
|---|---|---:|
| hero | Layered Canvas shapes: helmet, visor, body, boots, antenna, direction-aware eyes | 80% of a board cell |
| enemy | Layered Canvas shapes: glossy red body, eyes, feet, warning ring | 70% of a board cell |
| bomb | Canvas radial gradients, fuse spark, timer ring | 76% of a board cell |
| explosion | Additive-looking layered circles and cross flames | full board cell per flame |
| crate / wall | Beveled Canvas panels with highlights, seams, and glow | full board cell |
