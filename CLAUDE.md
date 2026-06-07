@AGENTS.md

# Website — Jack Stolly portfolio

Next.js 16 App Router, JS (not TS), CSS Modules. Deployed via Vercel from `github.com/jstolly1/portfolio`. Domain `jackstolly.io` at IONOS, not yet wired. Single-file preview frozen at `Projects/Website-Preview/` (do not edit — it's a reference snapshot).

## Status

| Area | State |
| --- | --- |
| **Mobile ≠ desktop landing** | Deliberate split — the two are different experiences. Desktop landing = Three.js disco ball; mobile (≤767px) landing = `NameMarbles`. |
| Home (BouncingBall) | **Desktop only.** Three.js ball; composer bypass when bloom off. Hidden ≤767px (`.stage{display:none}`). |
| Mobile landing (NameMarbles) | `app/components/NameMarbles.jsx` — Matter.js "jack stolly" letter-marbles (flat outlined circles). Tap → drop; gyro tilt rolls them; roll = travel/R. |
| Mobile nav (MobileMenu) | `app/components/MobileMenu.jsx` — top-right hamburger → big-letter panel slides from right. Inline `Menu` hidden ≤767px. |
| Projects carousel | **10** projects in `data.js`; heroes/gallery **disk-driven by `scan.js`**. Embla + parallax + click-to-detail. Nav says **Work** (route still `/projects`). |
| Project detail | Nav-on-hero + 1px white rule + side meta (Created/Media/Focus). Hero & gallery via `ProjectMedia` (img/gif/**video autoplay**). Square/portrait pairs render 50/50. Gold `AwardBadge` if project has `award` (Guardian). |
| Contact | Putt-to-send mini-golf + ghost-cursor "how to putt" hint (shows once a message is typed). |
| About | In progress. Matter.js basketball game (`app/about/AboutView.jsx`). |
| Webflow asset import | Done. 580 assets bucketed into Projects/Fonts/Icons/Personal/etc. |

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
| Heroes/gallery are disk-driven, NOT data.js | `app/projects/scan.js` + `[id]/page.js` | `enrichProjects` overrides `image`; detail gallery = `scanProjectFolder(slug).gallery`. Editing `data.js` image/gallery is a **no-op**. A `"hero"`-stemmed file (image OR video) is the hero; rest = gallery in numeric order. |
| One media field → card + hero + overlay | `app/projects/ProjectMedia.jsx` | Branches on extension. Video autoplays **only** on the full-screen detail hero; paused poster (`preload=metadata` + `#t=0.1`) in carousel/overlay so the file isn't streamed there. |
| 50/50 gallery pairing | `buildLayout` in `ProjectDetail.jsx` | Pairs two consecutive items when both `aspect<=1.05` AND within `0.08` of each other (squares + matching portraits). Crop an asset to true 1:1 to force a square pair. |
| Marble roll = travel ÷ radius | `app/components/NameMarbles.jsx` | Letter rotates *with* the ball (stays on its face). Matter `body.angle` barely turns on a falling ball — don't use it for roll. |
| Matter drop tuning | `NameMarbles.jsx` | High `frictionAir` caps terminal velocity (balls barely fall). Use low `frictionAir` (~0.004) + raise `engine.gravity.scale` (default 0.001 → 0.01). |
| Gyro needs HTTPS + iOS gesture | `NameMarbles.jsx` | `DeviceMotionEvent.requestPermission()` on first tap (the tap also drops the balls). Test on a phone via tunnel — LAN HTTP won't expose sensors. |

## Active task

**Mobile-landing gyro — verify on a real phone (HTTPS).** Untestable in-tool (no sensors). `npm run dev`, then `npx cloudflared tunnel --url http://localhost:3000`, open the HTTPS URL on a phone. Most likely needs the **gravity sign/axis flipped** in `NameMarbles.onMotion` so "upright → balls fall to the bottom"; then tune `engine.gravity.scale` (currently `0.01`) for feel.

Also pending:
- **BSN SPORTS real assets** — `public/assets/projects/bsn-sports/` currently holds Verde Valle (tequila) placeholder images.
- **Real copy** for all projects (`data.js` body), `/about`, `/contact`. Domain `jackstolly.io` → Vercel (IONOS, deferred).
- **About court frame** (older task): move `box-shadow: inset 0 0 0 2px #000` off `.court` to a `.court::after` sibling (`position:absolute; inset:0; pointer-events:none; border-radius:28px; z-index:20`) so the hoop SVG doesn't poke past the rim.

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
- **Gyro untested in-tool**: no device sensors in headless/desktop, and the mobile CSS path isn't hit at desktop width. Verify on a phone over HTTPS (tunnel); the gravity sign is the likely tweak.
- **`data.js` `image`/`gallery` are fallbacks only** — actual heroes/gallery come from disk via `scan.js`. Edit the folder + scanner, not data.js.
- **BSN SPORTS shows tequila (Verde Valle) placeholder images** until real assets land in `public/assets/projects/bsn-sports/`.

## Useful paths

- Asset downloader: `~/webflow-asset-downloader/` (`download.mjs`, `organize.mjs`)
- Bucketed assets: `Projects/Website/public/projects/...` (12 projects, also Fonts/Icons/Personal)
- Detail page: `app/projects/[id]/ProjectDetail.jsx` + `ProjectDetail.module.css`
- Scroll shader: `app/projects/[id]/ScrollShader.jsx`
- About game: `app/about/AboutView.jsx` + `About.module.css`
- Mobile landing: `app/components/NameMarbles.jsx` (+ `.module.css`)
- Mobile nav: `app/components/MobileMenu.jsx` (+ `.module.css`)
- Project media + folder scan: `app/projects/ProjectMedia.jsx`, `app/projects/scan.js`
- Award badge (data-gated by `award`): `app/projects/AwardBadge.jsx`
- Phone testing (gyro): `npx cloudflared tunnel --url http://localhost:3000` → open the HTTPS URL on phone
- Video compress: `ffmpeg -i in.mp4 -an -c:v libx264 -crf 26 -preset slow -movflags +faststart out.mp4` (27MB→5MB on Guardian)
- Latest session log: `CC-Session-Logs/27-05-2026-11_48-website-mobile-landing-and-polish.md`
