@AGENTS.md

# Website — Jack Stolly portfolio

Next.js 16 App Router, JS (not TS), CSS Modules. Deployed via Vercel from `github.com/jstolly1/portfolio`. Domain `jackstolly.io` at IONOS, not yet wired. Single-file preview frozen at `Projects/Website-Preview/` (do not edit — it's a reference snapshot).

## Status

| Area | State |
| --- | --- |
| Home (BouncingBall) | Live. Three.js ball; composer bypass when bloom is off. |
| Projects carousel | 12 real projects in `app/projects/data.js`. Embla + parallax + click-to-detail transition. |
| Project detail | Hero + body + gallery (ScrollShader WebGL) + spring/bounce Footer. |
| About | In progress. Intro paragraph + interactive Matter.js basketball game (`app/about/AboutView.jsx`). |
| Webflow asset import | Done. 580 assets pulled via `~/webflow-asset-downloader/` (Data API v2), bucketed into Projects/Fonts/Icons/Personal/etc. |

## Key patterns

| Pattern | Where | Why |
| --- | --- | --- |
| Matter.js + SVG coord alignment | `app/about/AboutView.jsx`, `.court` in `About.module.css` | Use `box-shadow: inset 0 0 0 2px #000` **not** `border` on the court — border-box vs content-box shift would force per-axis offsets on every matter coord. |
| Hoop geometry in one function | `hoopGeometry(W, H)` in `AboutView.jsx` | Same return value drives both matter bodies and SVG `<g transform=...>` so they can't drift. |
| Mouse velocity capture on `enddrag` | `AboutView.jsx` | Mouse constraint releases feel floppy without it. Sample last ~100ms of pointermove, cap throw at `MAX_THROW = 28`. |
| Goaltend "swat" on `beforeUpdate` | `AboutView.jsx` | Dragging past `noDragX` triggers Body.setVelocity + detach `mouseConstraint.body`, then a `"Not in my house!"` popup. |
| Z-order: balls then hoop SVG | JSX render order in `AboutView.jsx` | Hoop paints over balls so balls visually go *behind* the rim. Only `rimCapLeft`/`rimCapRight` are physics bodies — middle of rim is a sensor for scoring. |
| Ellipse curve mask on `.stage` not `.carousel` | `app/projects/Projects.module.css` | Carousel is scaled by GSAP during entrance; if curves lived on it, they'd shrink too. |
| ScrollShader RAF pause | `app/projects/[id]/ScrollShader.jsx` | IntersectionObserver pauses the WebGL loop when off-screen — required to keep multiple gallery shaders cheap. |
| Click-to-detail uses portal/in-stage overlay, not `position: fixed` inside embla | `app/projects/ProjectsView.jsx` | Embla container has a CSS transform → `position: fixed` resolves to container-relative, not viewport. |

## Active task

**Court 2pt frame must paint above the hoop SVG.** Currently `.court` owns the `box-shadow: inset 0 0 0 2px #000` itself, so the hoop SVG child (no explicit z-index) sits on top and pokes the rim's right edge past the wall.

Fix: move the frame to a sibling overlay — either a `.courtFrame` div appended as the last child of `.court`, or a `.court::after` pseudo-element. Properties: `position: absolute; inset: 0; pointer-events: none; box-shadow: inset 0 0 0 2px #000; border-radius: 28px; z-index: 20;`. Remove the `box-shadow` from `.court` itself, keep `overflow: hidden` and `border-radius`.

## Constants worth remembering (basketball game)

```
BALL_RADIUS = 42
RIM_VERTICAL = 0.45         // rim Y as fraction of court height
HOOP_RIGHT_PAD = 0          // hoop flush against right wall
NO_DRAG_BUFFER = 80         // px left of hoop where dragging is blocked
MAX_THROW = 28              // velocity cap on release
density = 0.0005, frictionAir = 0.008, mouseConstraint.stiffness = 0.45
CAT_BALL = 0x0001, CAT_WALL = 0x0004
```

## Blockers / gotchas

- **Figma View seat**: Starter plan limits to 6 file accesses/month via MCP. When it errors with "file not found / access denied," it's usually quota, not a bad fileKey. Workaround: have the user paste the SVG export manually.
- **APFS case-insensitive collisions on asset import**: `DropoutU_GIF.gif` vs `DropoutU_Gif.gif` collide on macOS. The Webflow downloader needs unique-cased filenames; re-download with a suffix if a collision is detected.
- **Webflow token scope**: needs `assets:read` — without it, the asset listing endpoint silently returns 0 results instead of erroring usefully.
- **Auto-compact is OFF** at the global level (`~/.claude/settings.json`). Use `/preserve` → `/compress` → `/compact` deliberately when context fills.

## Useful paths

- Asset downloader: `~/webflow-asset-downloader/` (`download.mjs`, `organize.mjs`)
- Bucketed assets: `Projects/Website/public/projects/...` (12 projects, also Fonts/Icons/Personal)
- Detail page: `app/projects/[id]/ProjectDetail.jsx` + `ProjectDetail.module.css`
- Scroll shader: `app/projects/[id]/ScrollShader.jsx`
- About game: `app/about/AboutView.jsx` + `About.module.css`
