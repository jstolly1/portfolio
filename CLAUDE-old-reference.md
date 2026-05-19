# Jack Stolly — Portfolio Website

Personal portfolio site. Currently a single-file landing page (`index.html`) featuring a 3D bouncing "DVD-logo" ball with a disco-ball easter egg on corner hits. More pages and features planned.

## Stack

- **Single file**, no build step. `index.html` contains all HTML/CSS/JS.
- **Three.js** 0.160.0 via importmap from unpkg. Postprocessing from `three/addons/postprocessing/`.
- **No dependencies installed**, no `package.json`. Everything is CDN.

## Running locally

ES modules + importmap require an HTTP server (not `file://`):

```
cd "$HOME/Documents/Obsidian Vault/Projects/Website" && python3 -m http.server 8765
```

Then open http://localhost:8765. Port 8000 is sometimes taken by an unrelated process — use 8765 or any other free port.

> Note: project lives inside the Obsidian vault (the canonical location). The path contains a space, so any shell command touching these files must quote the path.

## Architecture notes

### Camera & scaling
- Orthographic camera. The world is scaled so `1 world unit = BALL_PIXEL_RADIUS` screen pixels. This keeps the ball at a fixed pixel size regardless of window size — only the surrounding world grows/shrinks on resize.
- `BALL_PIXEL_RADIUS = 220` (~440px ball diameter).

### Mobile cutoff
- Below `MIN_DESKTOP_WIDTH` (768px = iPad portrait), the canvas is hidden via CSS and `.mobile` placeholder div takes over. The animation loop short-circuits when `active === false`. Desktop and mobile will be designed separately — the placeholder is just a stand-in for now.

### Ball composition
Four meshes inside `ballGroup`:
1. `ball` — `MeshBasicMaterial`, white with black "Jack Stolly" text texture. `toneMapped: false` so ACES tone-mapping doesn't grey it.
2. `outline` — `MeshBasicMaterial`, black, `side: THREE.BackSide`, scaled to `1.015`. Classic BackSide-hull silhouette trick. Also `toneMapped: false`.
3. `discoCore` — solid dark sphere at radius `0.985`. Sits behind the disco ball so the tile gaps reveal a dark interior, not the room background. Only visible during disco.
4. `discoBall` — custom `BufferGeometry` of flat-quad tiles (lat/long grid with brick-offset rows, ~14 rows × 28 cols, 4% inset). `MeshPhysicalMaterial` with `metalness: 1`, low roughness, iridescence, env map, vertex-color tints. Only visible during disco.

### Disco effect
- **Trigger**: both X and Y walls bounce in the same frame (a true corner hit).
- **Phases**: `DISCO_DURATION_MS` of full disco + `DISCO_FADE_MS` of fade back to normal. `discoIntensity(now)` returns `d` ∈ [0, 1].
- **Cross-fade**: `discoBall.opacity = d`, `ball.opacity = 1 - d`, `outline.opacity = 1 - d`. `discoCore.opacity = d`.
- **Page bg** lerps from white → midnight purple `#140a26` and back, using a **squared curve** (`d²`) so the bg reaches pure white slightly before `d` hits 0 — kills the 1-frame color snap at the boundary.
- **Sweeping spotlights**: 4 colored additive planes drift across the bg on Lissajous orbits. Opacity uses a **cubed** curve (`d³`) so they fade out fast.
- **Bloom**: `UnrealBloomPass` via `EffectComposer`. **Critically, bloom is hard-disabled (`bloomPass.enabled = false`) the moment `d < 1`**. Reason: the normal ball is pure white at brightness 1.0; if bloom is active while the ball fades in, the bloom pass amplifies the whole ball into a giant lingering halo. Always render through the composer either way to avoid path-switch flash.
- **Click-to-exit**: clicking the ball during full disco shifts `state.discoStart` back so `elapsed = DISCO_DURATION_MS`, jumping straight to the fade.

### Interactivity
- **Grab / throw**: pointer down on the ball captures it; pointer move drags it; pointer up releases with throw velocity computed from the last ~90ms of sample positions.
- **Speed normalization**: after release, ball velocity eases back to baseline `SPEED` over `RESUME_DURATION` seconds via easeOutCubic.
- **Held-too-long shiver**: dragging past `HOLD_BEFORE_SHAKE` (1.0s) applies a smooth two-frequency sine wobble offset (render-only, doesn't pollute physics or throw samples). Tiny rotation jitter too.
- **Cursor**: default everywhere; `grab` cursor only when hovering the ball (toggled by per-frame hit-test using `lastPointer`); `grabbing` while dragging.

## Knobs (top of script)

| Constant | Purpose | Current |
|---|---|---|
| `NAME` | Text on the ball | `'Jack Stolly'` |
| `MIN_DESKTOP_WIDTH` | px below which canvas is hidden | `768` |
| `BALL_PIXEL_RADIUS` | Fixed ball radius in px | `220` |
| `SPEED` | Idle bounce speed (world units/sec) | `1.6` |
| `ROT_SPEED` | Baseline spin (rad/sec) | `0.55` |
| `RESUME_DURATION` | Sec to ease throw → idle speed | `2` |
| `HOLD_BEFORE_SHAKE` | Sec of drag before shiver | `1.0` |
| `DISCO_DURATION_MS` | Full disco length | `4750` |
| `DISCO_FADE_MS` | Snap-fade back to normal | `250` |

## Sharp edges (don't relearn these the hard way)

- **Never toggle `transparent: true ↔ false` mid-frame on the ball materials.** Three.js sorts/renders transparent and opaque objects differently — flipping the flag causes a one-frame visual jump. The fix in place: `matNormal` and `outlineMat` are permanently `transparent: true`; only their `opacity` changes.

- **Don't enable bloom while the normal ball is faded in.** White ball at 1.0 brightness + `toneMapped: false` = guaranteed bloom-threshold-exceeding pixel = enormous halo around the ball. Bloom is gated by `d === 1` for this reason.

- **`audioPrimed` flags need to flip *after* `play()` resolves**, not before — otherwise a failed prime locks out retries. (Audio was removed in the latest pass, but if it comes back, remember this.) Also: only attach the primer to real user-activation events (`pointerdown`/`click`/`keydown`/`touchstart`). `pointermove` doesn't count and spams `NotAllowedError`.

- **The BackSide outline trick depends on the front ball being opaque** to cover the back-facing outline disc. Renders fine when ball opacity is 1; during the cross-fade, the outline can bleed through the transparent ball and dim the interior. Currently accepted because the fade is fast (250ms) — if the fade grows again, this'll need to be addressed (renderOrder or selective rendering).

- **PointLights are NOT visible objects**, but their illumination on the metallic disco ball creates bright pixels that bloom amplifies into halos at the *light's world position* — looks like a stray glow that doesn't track the ball. They were removed for this reason. If you re-add them, fade their intensity off well before bloom turns off.

## Future plans (per the user)

- Mobile experience designed separately from desktop.
- More pages / sections beyond the landing page.
- Audio bite on the disco effect (currently removed, may come back — see audio sharp-edge above if so).
