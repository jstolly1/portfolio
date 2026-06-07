'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import * as THREE from 'three';
import {
  discoVertexShader,
  discoFragmentShader,
  postFragmentShader,
} from './discoShaders';
import styles from './BouncingBall.module.css';

const NAME = 'Jack Stolly';
const INITIALS = 'JS';
const NAME_FONT_PX = 70;
const INITIALS_FONT_PX = 360;
// Emoticons that replace "JS" on each scroll-spin on /projects, after the
// initial JS state. One is picked at random per spin and swapped in at the
// midpoint of the rotation (when the face is pointing away from the camera).
const SPIN_FACES = [':)', ':P', ':D', '=)', ':]', '=D', ';)'];
const SPIN_FACE_FONT_PX = 320;
const MIN_DESKTOP_WIDTH = 768;
const BALL_PIXEL_RADIUS = 220;
const SPEED = 1.6;
const ROT_SPEED = 0.55;
const RESUME_DURATION = 2;
const HOLD_BEFORE_SHAKE = 1.0;
const DISCO_DURATION_MS = 4750;
const DISCO_FADE_MS = 250;
const DISCO_TOTAL_MS = DISCO_DURATION_MS + DISCO_FADE_MS;

// Corner-mode constants
const CORNER_TARGET_RADIUS_PX = 64; // visible radius in the corner
const CORNER_SCALE = CORNER_TARGET_RADIUS_PX / BALL_PIXEL_RADIUS;
const CORNER_MARGIN_PX = 32; // distance from viewport edges to ball edge
const TRANSITION_MS = 800;
const TRANSITION_SPIN_RATE = 9.0; // rad/s extra spin during travel
const SCROLL_ROT_PER_PX = 0.006; // rad of rotation per pixel of scroll
// Outline scale (BackSide silhouette trick). Stays at OUTLINE_SCALE for
// physics/hit detection; OUTLINE_SCALE_CORNER is the *visual* outline in
// corner mode so the stroke doesn't shrink into invisibility with the ball.
const OUTLINE_SCALE_CORNER = 1.04;

export default function BouncingBall({ fontFamily = 'Inter' }) {
  const canvasRef = useRef(null);
  const pathname = usePathname();
  const router = useRouter();
  const pathnameRef = useRef(pathname);
  const routerRef = useRef(router);

  useEffect(() => { pathnameRef.current = pathname; }, [pathname]);
  useEffect(() => { routerRef.current = router; }, [router]);

  // Canvas pointer-events: capture on the landing route (so the user can
  // grab/throw the ball); transparent-to-clicks elsewhere so the carousel
  // / cards / page content underneath can be interacted with. The corner
  // nav button below handles the click-home gesture for the parked ball.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.style.pointerEvents = pathname === '/' ? 'auto' : 'none';
  }, [pathname]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const fontStack = `${fontFamily}, -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif`;

    // alpha:true so the canvas can be transparent on non-landing routes —
    // that lets the carousel (under the canvas in z-order, but visually
    // above page background) show through everywhere except where the ball
    // is actually drawn.
    // Antialiasing is expensive (MSAA samples per pixel × every frame).
    // On retina+ displays the higher pixel density does the job on its
    // own — skip MSAA there. On DPR 1 displays we keep antialiasing so
    // the ball's outline doesn't look jaggy. Saves measurable GPU time
    // on Retina laptops / phones.
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: typeof window !== 'undefined' && window.devicePixelRatio < 2,
      alpha: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0xffffff, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);

    // Bake a base texture: white sphere with `text` at u=0.25 in the given font size.
    function makeBaseTexture(text, fontPx) {
      const c = document.createElement('canvas');
      c.width = 2048; c.height = 1024;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `500 ${fontPx}px ${fontStack}`;
      ctx.letterSpacing = '-3px';
      ctx.fillText(text, c.width * 0.25, c.height * 0.5);
      ctx.letterSpacing = '0px';
      const tex = new THREE.CanvasTexture(c);
      tex.anisotropy = 8;
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    }

    let landingTex = makeBaseTexture(NAME, NAME_FONT_PX);
    let cornerTex = makeBaseTexture(INITIALS, INITIALS_FONT_PX);

    // Once the NameButBigger.png art loads, swap the landing-face text out
    // for it. Drawn at the same baseline (canvas u=0.25, v=0.5) so the
    // ball's "front" face replaces the rendered text 1:1.
    //
    // `effectDisposed` is set to true by the useEffect cleanup; if the
    // user unmounts before the image finishes loading we early-return
    // here instead of writing to a disposed material / texture.
    let effectDisposed = false;
    {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (effectDisposed) return;
        const c = document.createElement('canvas');
        c.width = 2048;
        c.height = 1024;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, c.width, c.height);
        // Fit within ~32% of canvas width × ~54% of canvas height, preserving
        // image aspect. Smaller box → smaller "Jack Stolly" name image on
        // the front of the ball.
        const maxW = c.width * 0.20;
        const maxH = c.height * 0.34;
        const scale = Math.min(maxW / img.width, maxH / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        const x = c.width * 0.25 - w / 2;
        const y = c.height * 0.5 - h / 2;
        ctx.drawImage(img, x, y, w, h);
        const newTex = new THREE.CanvasTexture(c);
        newTex.anisotropy = 8;
        newTex.colorSpace = THREE.SRGBColorSpace;
        const wasLanding = matNormal.map === landingTex;
        landingTex.dispose();
        landingTex = newTex;
        if (wasLanding) {
          matNormal.map = landingTex;
          matNormal.needsUpdate = true;
        }
      };
      img.src = '/assets/name.png';
    }
    // Pre-bake the emoticon faces once so each project-advance swap is free.
    const faceTextures = {};
    for (const face of SPIN_FACES) {
      faceTextures[face] = makeBaseTexture(face, SPIN_FACE_FONT_PX);
    }

    const RADIUS = 1;
    const OUTLINE_SCALE = 1.015;
    const EFFECTIVE_RADIUS = RADIUS * OUTLINE_SCALE;
    const sphereGeo = new THREE.SphereGeometry(RADIUS, 96, 64);

    const matNormal = new THREE.MeshBasicMaterial({
      map: landingTex,
      color: 0xffffff,
      transparent: true,
      opacity: 1,
      toneMapped: false,
    });
    const outlineMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      side: THREE.BackSide,
      transparent: true,
      opacity: 1,
      toneMapped: false,
    });

    const ballGroup = new THREE.Group();
    scene.add(ballGroup);
    const ball = new THREE.Mesh(sphereGeo, matNormal);
    ballGroup.add(ball);
    const outline = new THREE.Mesh(sphereGeo, outlineMat);
    outline.scale.setScalar(OUTLINE_SCALE);
    ballGroup.add(outline);

    // === Disco-mode shader scene (ported from sabosugi's CodePen) ===
    // A separate fullscreen scene with its own HDR render target + god-ray
    // post-processing pass. During disco mode (discoIntensity > 0) we render
    // this on TOP of the normal ball scene; the post material's fade uniform
    // is driven by the disco intensity so the overlay cross-fades in/out.
    //
    // Disco/post pipeline renders at a FIXED resolution measured in CSS
    // pixels (= window dimensions × CODEPEN_DPR), independent of
    // window.devicePixelRatio. The CodePen runs the same shader at
    // currentDPR = 1.0 (its default) without dropping frames, so matching
    // that exactly is the simplest way to get the same performance.
    // Without this, a DPR 2 display would render disco at 4× the pixel
    // count the CodePen does — that was the real cause of the lag, not
    // the per-pixel shader work. The blit pass below handles upscaling
    // the result onto the (higher-DPR) screen framebuffer.
    const CODEPEN_DPR = 1.0;
    // Hard cap on disco RT max dimension. On 4K/5K monitors `window.innerWidth`
    // can run 3000–5000+, which blows the ray-traced shader's per-pixel
    // cost back up. discoScale() returns the uniform scale factor that
    // both keeps the per-pixel workload at CodePen's reference baseline
    // and bounds the largest RT axis at DISCO_MAX_DIM. Single scale (not
    // per-axis) so aspect ratio is preserved on wide monitors. The blit
    // pass linearly upscales onto the actual framebuffer.
    const DISCO_MAX_DIM = 1440;
    const discoScale = (w, h) =>
      Math.min(CODEPEN_DPR, DISCO_MAX_DIM / w, DISCO_MAX_DIM / h);
    const discoScene = new THREE.Scene();
    const discoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const _initScale = discoScale(window.innerWidth, window.innerHeight);
    const discoRT = new THREE.WebGLRenderTarget(
      Math.max(1, Math.round(window.innerWidth * _initScale)),
      Math.max(1, Math.round(window.innerHeight * _initScale)),
      {
        type: THREE.HalfFloatType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
      },
    );
    const discoUniforms = {
      iTime: { value: 0 },
      iResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      // CodePen default 0.135 — adds a steady disco spin on top of the
      // bouncing ball's quaternion-driven yaw/pitch (uManualRot, updated
      // every frame in tick).
      uAutoRotSpeed: { value: 0.135 },
      // .x = yaw, driven each frame by the bouncing ball's quaternion so
      // the disco ball spins along with the bounce. .y = pitch, fixed at
      // the CodePen's signature 0.9 rad downward tilt onto the ball —
      // letting it move freely would let the quaternion's extreme YXZ
      // pitch swings rotate the virtual camera above/below the ball, so
      // you'd see only one pole at a time.
      uManualRot: { value: new THREE.Vector2(0, 0.9) },
      uZoom: { value: 1.0 },
      uRoughness: { value: 0.01 },
      // White / platinum atmosphere instead of the CodePen's pink-cyan-
      // purple. The disco ball's facets sample these as reflected
      // highlights — uniform whites give a traditional mirror-ball look.
      // Tiny tinting keeps the facets from looking flat.
      uColor1: { value: new THREE.Color('#ffffff') },
      uColor2: { value: new THREE.Color('#e8ecf2') },
      uColor3: { value: new THREE.Color('#f2eee8') },
      uFractalScale: { value: 1.4355 },
      uBgFractalSpeed: { value: 0.0 },
      uCoreFractalSpeed: { value: 0.0 },
      uFractalAmp: { value: 0.589 },
      uBallCenter: { value: new THREE.Vector2(0, 0) },
      uBallPixelRadius: { value: 1 },
    };
    const discoMaterial = new THREE.ShaderMaterial({
      uniforms: discoUniforms,
      vertexShader: discoVertexShader,
      fragmentShader: discoFragmentShader,
    });
    const discoPlane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), discoMaterial);
    discoScene.add(discoPlane);

    const postScene = new THREE.Scene();
    const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const postUniforms = {
      tDiffuse: { value: discoRT.texture },
      uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      uShowLights: { value: true },
      // Ray Length, Fade Out, Intensity. Higher uRayDensity = each per-
      // sample step covers more UV distance toward the ball, so the walk
      // reaches further and the rays visibly extend out from the ball.
      // Higher uRayDecay = far-from-ball samples retain more brightness
      // along the way, so the rays don't fade out as quickly.
      uRayDensity: { value: 0.35 },
      uRayDecay: { value: 0.88 },
      uRayWeight: { value: 0.05643 },
      uTime: { value: 0 },
      uFade: { value: 0 },
      uBallCenterUV: { value: new THREE.Vector2(0.5, 0.5) },
    };
    const postMaterial = new THREE.ShaderMaterial({
      uniforms: postUniforms,
      vertexShader: discoVertexShader,
      fragmentShader: postFragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });
    const postPlane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMaterial);
    postScene.add(postPlane);

    // Post-pass also runs at half framebuffer res. We render into postRT
    // and then do a cheap textured-quad blit to the actual screen. Without
    // this, the 20-sample god-ray loop runs at the full framebuffer (4x
    // more pixels) — by far the next biggest disco-mode cost. LDR is fine
    // here since the post shader already tonemapped + gamma-applied.
    const postRT = new THREE.WebGLRenderTarget(
      Math.max(1, Math.round(window.innerWidth * _initScale)),
      Math.max(1, Math.round(window.innerHeight * _initScale)),
      {
        type: THREE.UnsignedByteType,
        format: THREE.RGBAFormat,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
      },
    );
    const blitScene = new THREE.Scene();
    const blitCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const blitMaterial = new THREE.ShaderMaterial({
      uniforms: { tInput: { value: postRT.texture } },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tInput;
        varying vec2 vUv;
        void main() {
          // Pre-multiplied output for additive compositing. The post pass
          // already baked uFade into the RGB so we just hand it straight
          // through; the One/One blend below adds those bright bits to
          // whatever's already in the framebuffer (the bouncing ball +
          // dimmed background), which makes the god rays read like
          // emitted light instead of fading via alpha mixing.
          gl_FragColor = vec4(texture2D(tInput, vUv).rgb, 1.0);
        }
      `,
      transparent: true,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendEquation: THREE.AddEquation,
      depthWrite: false,
      depthTest: false,
    });
    const blitPlane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blitMaterial);
    blitScene.add(blitPlane);

    // Re-bake textures once the font has actually loaded (initial render uses
    // fallbacks, which would shift afterwards otherwise).
    if (document.fonts && document.fonts.load) {
      document.fonts.load(`500 ${NAME_FONT_PX}px ${fontFamily}`).then(() => {
        const newLanding = makeBaseTexture(NAME, NAME_FONT_PX);
        const newCorner = makeBaseTexture(INITIALS, INITIALS_FONT_PX);
        const wasLanding = matNormal.map === landingTex;
        landingTex.dispose();
        cornerTex.dispose();
        landingTex = newLanding;
        cornerTex = newCorner;
        matNormal.map = wasLanding ? landingTex : cornerTex;
        matNormal.needsUpdate = true;
      }).catch(() => {});
    }

    const state = {
      pos: new THREE.Vector2(0, 0),
      vel: new THREE.Vector2(0, 0),
      rotAxis: new THREE.Vector3(-0.2, -1, -0.1).normalize(),
      dragging: false,
      dragStart: 0,
      releaseTime: -Infinity,
      releaseSpeed: SPEED,
      discoStart: -Infinity,
      mode: pathnameRef.current === '/' ? 'landing' : 'corner',
      transitionStart: -Infinity,
      transFromX: 0,
      transFromY: 0,
      transFromScale: 1,
      transFromOutlineScale: 1.015,
      transTextureSwapped: true,
      // For the corner-mode transition: at t=0.6 we capture the current
      // orientation, then slerp from there to identity so the JS face
      // (baked at u=0.25) lands pointed at the camera.
      cornerSettleStarted: false,
      cornerSettleFromQuat: new THREE.Quaternion(),
      scrollDelta: 0,
      lastScrollY: typeof window !== 'undefined' ? window.scrollY : 0,
      // Return-transition (corner → landing) state. The position follows a
      // cubic Hermite curve from the corner to (0,0) whose tangent at t=1
      // matches the bouncing velocity, so physics inherits a moving ball
      // instead of restarting from rest.
      transReturnAngle: null,
      transReturnV1X: 0,
      transReturnV1Y: 0,
      physicsResumed: true,
      // Pipe-entry animation flag — true while the ball is rising out
      // of the bottom of the viewport after returning from /not-found.
      // Set by the from404 transition branch above; cleared after the
      // rise + hover finishes.
      pipeEntry: false,
      pipeEntryStart: -Infinity,
      // One-full-rotation spin used on /projects when a 'project-advance'
      // event fires. The ball starts at identity, sweeps 2π around world X,
      // and lands back at identity. The face that ends up pointing at the
      // viewer is swapped mid-spin: the first spin reveals a random emoticon,
      // and each subsequent spin picks a new random one from SPIN_FACES.
      spinAnimStart: -Infinity,
      spinAnimDurationMs: 800,
      nextFaceTex: null,
      spinTextureSwapped: false,
    };

    const lastPointer = new THREE.Vector2(NaN, NaN);
    let viewWidth = 10, viewHeight = 10;
    let active = true;
    let lastRenderX = 0, lastRenderY = 0, lastRenderScale = 1;

    const bgNormal = new THREE.Color(0xffffff);
    const bgDisco = new THREE.Color(0x000000);
    const bgCurrent = new THREE.Color(0xffffff);

    function cornerPos() {
      const m = CORNER_MARGIN_PX / BALL_PIXEL_RADIUS;
      const r = CORNER_SCALE * EFFECTIVE_RADIUS;
      return { x: viewWidth / 2 - m - r, y: -viewHeight / 2 + m + r };
    }

    function resize() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      active = w >= MIN_DESKTOP_WIDTH;
      if (!active) return;
      renderer.setSize(w, h, false);
      // Disco/post RTs sized at CodePen-equivalent CSS pixels × discoScale,
      // which is bounded by DISCO_MAX_DIM. Uniform scale preserves aspect.
      const s = discoScale(w, h);
      const dw = Math.max(1, Math.round(w * s));
      const dh = Math.max(1, Math.round(h * s));
      discoRT.setSize(dw, dh);
      postRT.setSize(dw, dh);
      discoUniforms.iResolution.value.set(dw, dh);
      postUniforms.uResolution.value.set(dw, dh);
      viewWidth = w / BALL_PIXEL_RADIUS;
      viewHeight = h / BALL_PIXEL_RADIUS;
      camera.left = -viewWidth / 2;
      camera.right = viewWidth / 2;
      camera.top = viewHeight / 2;
      camera.bottom = -viewHeight / 2;
      camera.updateProjectionMatrix();
      const maxX = viewWidth / 2 - EFFECTIVE_RADIUS;
      const maxY = viewHeight / 2 - EFFECTIVE_RADIUS;
      state.pos.x = THREE.MathUtils.clamp(state.pos.x, -maxX, maxX);
      state.pos.y = THREE.MathUtils.clamp(state.pos.y, -maxY, maxY);
    }
    window.addEventListener('resize', resize);
    resize();

    function launchDiagonal() {
      const angle = (Math.floor(Math.random() * 4) * 0.5 + 0.25) * Math.PI;
      state.vel.set(Math.cos(angle) * SPEED, Math.sin(angle) * SPEED);
    }
    if (state.mode === 'landing') launchDiagonal();
    // If mounting in corner mode, seed transition so the ball just appears there.
    if (state.mode === 'corner') {
      const cp = cornerPos();
      lastRenderX = cp.x; lastRenderY = cp.y; lastRenderScale = CORNER_SCALE;
      matNormal.map = cornerTex;
      matNormal.needsUpdate = true;
    }

    // Scroll listener — accumulates delta consumed in tick().
    function onScroll() {
      const y = window.scrollY;
      state.scrollDelta += y - state.lastScrollY;
      state.lastScrollY = y;
    }
    window.addEventListener('scroll', onScroll, { passive: true });

    // Project-advance: each fire triggers one full rotation of the corner ball
    // and queues a random emoticon to land facing the camera after the spin.
    function onProjectAdvance() {
      const face = SPIN_FACES[Math.floor(Math.random() * SPIN_FACES.length)];
      state.nextFaceTex = faceTextures[face];
      state.spinTextureSwapped = false;
      state.spinAnimStart = performance.now();
    }
    window.addEventListener('project-advance', onProjectAdvance);

    const pointerWorld = new THREE.Vector2();
    const grabOffset = new THREE.Vector2();
    const samples = [];
    const SAMPLE_WINDOW_MS = 90;

    function screenToWorld(clientX, clientY, out) {
      const rect = canvas.getBoundingClientRect();
      const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -(((clientY - rect.top) / rect.height) * 2 - 1);
      out.x = nx * camera.right;
      out.y = ny * camera.top;
      return out;
    }
    function pushSample(t, x, y) {
      samples.push({ t, x, y });
      const cutoff = t - SAMPLE_WINDOW_MS * 2;
      while (samples.length > 2 && samples[0].t < cutoff) samples.shift();
    }
    function throwVelocity(now) {
      const cutoff = now - SAMPLE_WINDOW_MS;
      let base = samples[0];
      for (const s of samples) { if (s.t >= cutoff) { base = s; break; } }
      const last = samples[samples.length - 1];
      if (!base || !last || last === base) return new THREE.Vector2(0, 0);
      const dt = (last.t - base.t) / 1000;
      if (dt <= 0) return new THREE.Vector2(0, 0);
      return new THREE.Vector2((last.x - base.x) / dt, (last.y - base.y) / dt);
    }

    function isInTransition(now) {
      return now - state.transitionStart < TRANSITION_MS;
    }
    function hitsBall(worldX, worldY) {
      const dx = worldX - lastRenderX;
      const dy = worldY - lastRenderY;
      const r = EFFECTIVE_RADIUS * lastRenderScale;
      return dx * dx + dy * dy <= r * r;
    }

    function onPointerDown(e) {
      if (!active) return;
      if (e.button !== undefined && e.button !== 0) return;
      const now = performance.now();
      if (isInTransition(now)) return; // ignore clicks mid-flight
      screenToWorld(e.clientX, e.clientY, pointerWorld);
      lastPointer.copy(pointerWorld);
      if (!hitsBall(pointerWorld.x, pointerWorld.y)) return;

      if (state.mode === 'corner') {
        // Click on parked ball → go home.
        routerRef.current?.push('/');
        e.preventDefault();
        return;
      }

      // Landing mode: existing grab/throw/disco-cancel.
      const dx = pointerWorld.x - state.pos.x;
      const dy = pointerWorld.y - state.pos.y;
      const sinceDisco = now - state.discoStart;
      if (sinceDisco >= 0 && sinceDisco < DISCO_DURATION_MS) {
        state.discoStart = now - DISCO_DURATION_MS;
      }
      state.dragging = true;
      state.dragStart = now;
      state.vel.set(0, 0);
      grabOffset.set(dx, dy);
      samples.length = 0;
      pushSample(now, state.pos.x, state.pos.y);
      canvas.classList.add(styles.grabbing);
      canvas.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    }

    function onPointerMove(e) {
      if (!active) return;
      screenToWorld(e.clientX, e.clientY, lastPointer);
      if (state.dragging) {
        const maxX = viewWidth / 2 - EFFECTIVE_RADIUS;
        const maxY = viewHeight / 2 - EFFECTIVE_RADIUS;
        state.pos.x = THREE.MathUtils.clamp(lastPointer.x - grabOffset.x, -maxX, maxX);
        state.pos.y = THREE.MathUtils.clamp(lastPointer.y - grabOffset.y, -maxY, maxY);
        pushSample(performance.now(), state.pos.x, state.pos.y);
      }
    }
    function onPointerUp(e) {
      if (!state.dragging) return;
      state.dragging = false;
      canvas.classList.remove(styles.grabbing);
      canvas.releasePointerCapture?.(e.pointerId);
      const v = throwVelocity(performance.now());
      const MAX_THROW = 18;
      if (v.length() > MAX_THROW) v.setLength(MAX_THROW);
      if (v.length() < 0.25) {
        const angle = (Math.random() * 0.5 + 0.25) * Math.PI;
        const sign = Math.random() < 0.5 ? -1 : 1;
        v.set(Math.cos(angle) * SPEED * sign, Math.sin(angle) * SPEED);
      }
      state.vel.copy(v);
      state.releaseTime = performance.now();
      state.releaseSpeed = v.length();
    }
    function onPointerLeave() {
      lastPointer.set(NaN, NaN);
      canvas.classList.remove(styles.grabbable);
      canvas.classList.remove(styles.clickable);
    }

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerLeave);

    function discoIntensity(now) {
      const t = now - state.discoStart;
      if (t < 0 || t > DISCO_TOTAL_MS) return 0;
      if (t < DISCO_DURATION_MS) return 1;
      const fadeT = (t - DISCO_DURATION_MS) / DISCO_FADE_MS;
      return 1 - fadeT;
    }

    // Cubic ease in/out for smooth transition feel.
    function easeInOutCubic(t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }
    const IDENTITY_QUAT = new THREE.Quaternion();
    // Reused per-frame scratch objects for the project-advance spin —
    // avoids `new THREE.Quaternion()` + `new THREE.Vector3()` allocations
    // on every tick during the spin animation.
    const spinAxis = new THREE.Vector3(1, 0, 0);
    const spinQuat = new THREE.Quaternion();
    const scrollAxis = new THREE.Vector3(1, 0, 0);
    // Re-used each frame to extract yaw/pitch from the ball's quaternion
    // without allocating. YXZ order: euler.y is yaw, euler.x is pitch —
    // those map directly onto the disco shader's uManualRot.x / .y.
    const ballEuler = new THREE.Euler(0, 0, 0, 'YXZ');

    let last = performance.now();
    let raf = 0;

    function tick(now) {
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      if (!active) {
        raf = requestAnimationFrame(tick);
        return;
      }

      // Detect pathname change → start a transition.
      const wantMode = pathnameRef.current === '/' ? 'landing' : 'corner';
      if (wantMode !== state.mode && !isInTransition(now)) {
        // 404 entry: if the user just rolled the ball into the hole on the
        // /not-found page, that scene set a sessionStorage flag before
        // routing to '/'. Skip the smooth corner→center Hermite curve and
        // instead drop the ball from above the viewport with downward
        // velocity so it falls in, hits the floor wall, bounces, and the
        // existing physics integration picks up from there.
        let from404 = false;
        if (wantMode === 'landing') {
          try {
            if (sessionStorage.getItem('from404') === '1') {
              from404 = true;
              sessionStorage.removeItem('from404');
            }
          } catch {}
        }

        if (from404) {
          state.mode = 'landing';
          state.transitionStart = -Infinity;
          state.cornerSettleStarted = false;
          // Texture is already landing (face image); short-circuit the
          // texture-swap state so the corner→landing midpoint swap
          // doesn't fire and snap us to the corner texture.
          state.transTextureSwapped = true;
          matNormal.map = landingTex;
          matNormal.needsUpdate = true;
          // PIPE ENTRY: ball spawns BELOW the viewport, then rises up
          // (Mario-coming-out-of-a-pipe), holds at the bottom of the
          // viewport for a beat, then launches into normal bouncing.
          // Quaternion locked to identity so the logo face (u=0.25 on
          // the texture, the sphere's +Z face) points at the camera
          // for the entire rise + hold — no per-frame spin applied
          // until pipeEntry clears (see the rotation block below).
          state.pipeEntry = true;
          state.pipeEntryStart = now;
          state.pos.set(0, -(viewHeight / 2 + EFFECTIVE_RADIUS * 1.5));
          state.vel.set(0, 0);
          ballGroup.quaternion.identity();
          state.releaseTime = -Infinity;
          state.physicsResumed = false;
          state.transReturnAngle = null;
        } else {
          state.transFromX = lastRenderX;
          state.transFromY = lastRenderY;
          state.transFromScale = lastRenderScale;
          state.transFromOutlineScale = outline.scale.x;
          state.transTextureSwapped = false;
          state.cornerSettleStarted = false;
          state.transitionStart = now;
          state.mode = wantMode;
          if (wantMode === 'landing') {
            // Pick the diagonal up front so the Hermite curve can exit with
            // exactly that velocity as its tangent. Physics state is NOT seeded
            // yet — it gets initialized on the first frame after the curve ends.
            const angle = (Math.floor(Math.random() * 4) * 0.5 + 0.25) * Math.PI;
            const T = TRANSITION_MS / 1000;
            state.transReturnAngle = angle;
            state.transReturnV1X = T * SPEED * Math.cos(angle);
            state.transReturnV1Y = T * SPEED * Math.sin(angle);
            state.physicsResumed = false;
            state.releaseTime = -Infinity;
          }
        }
      }

      const inTrans = isInTransition(now);
      const t = inTrans ? (now - state.transitionStart) / TRANSITION_MS : 1;
      const eased = easeInOutCubic(Math.min(t, 1));
      const isLanding = state.mode === 'landing';
      const d = isLanding ? discoIntensity(now) : 0;
      const timeScale = 1 - d * 0.65;

      // First frame after the return transition: snap physics state to (0,0)
      // with the velocity whose tangent matched the Hermite curve's exit, so
      // there's no discontinuity between curve-driven render and physics-driven render.
      if (isLanding && !inTrans && state.transReturnAngle !== null && !state.physicsResumed) {
        state.pos.set(0, 0);
        state.vel.set(SPEED * Math.cos(state.transReturnAngle), SPEED * Math.sin(state.transReturnAngle));
        state.physicsResumed = true;
        state.transReturnAngle = null;
      }

      // Pipe entry — Mario coming out of a pipe. The ball spawns BELOW
      // the viewport (off-screen bottom), rises with an ease-out until
      // it's fully on screen (its bottom edge sits at the bottom screen
      // wall), and the moment that's true it launches into a random
      // upward diagonal — the regular bouncing physics takes over from
      // there. No hover at centre: the ball is moving the instant it's
      // completely visible. Upward-only angles keep it from instantly
      // clipping back through the floor it just popped up onto.
      const PIPE_RISE_S = 1.8;   // slow, deliberate rise out of the bottom
      const PIPE_HOLD_S = 1.0;   // pause stuck to the bottom of the viewport
      if (state.pipeEntry) {
        const elapsed = (now - state.pipeEntryStart) / 1000;
        const startY = -(viewHeight / 2 + EFFECTIVE_RADIUS * 1.5);
        const targetY = -viewHeight / 2 + EFFECTIVE_RADIUS; // fully on-screen
        if (elapsed < PIPE_RISE_S) {
          // RISE phase: ease the ball up from below the viewport.
          const t = elapsed / PIPE_RISE_S;
          const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
          state.pos.x = 0;
          state.pos.y = startY + (targetY - startY) * eased;
        } else if (elapsed < PIPE_RISE_S + PIPE_HOLD_S) {
          // HOLD phase: ball sits stuck to the bottom of the viewport.
          // state.vel is still (0,0) so the rotation block below falls
          // back to its min spin rate (ROT_SPEED) — the ball keeps
          // rotating in place during the hold, which is exactly the
          // "stays stationary with the spin" look.
          state.pos.x = 0;
          state.pos.y = targetY;
        } else {
          // Done — kick into regular bouncing. Upward diagonal only so
          // the ball doesn't immediately clip back through the floor
          // wall it's sitting against.
          state.pos.x = 0;
          state.pos.y = targetY;
          state.pipeEntry = false;
          state.physicsResumed = true;
          const angle = Math.PI / 4 + (Math.random() < 0.5 ? 0 : Math.PI / 2);
          state.vel.set(Math.cos(angle) * SPEED, Math.sin(angle) * SPEED);
        }
      }

      // Landing physics — only when in landing mode and not transitioning, not dragging,
      // and not in the pipe-entry animation.
      const maxX = viewWidth / 2 - EFFECTIVE_RADIUS;
      const maxY = viewHeight / 2 - EFFECTIVE_RADIUS;
      if (isLanding && !inTrans && !state.dragging && !state.pipeEntry) {
        state.pos.addScaledVector(state.vel, dt * timeScale);
        let bouncedX = false, bouncedY = false;
        if (state.pos.x > maxX) { state.pos.x = maxX; state.vel.x = -Math.abs(state.vel.x); bouncedX = true; }
        if (state.pos.x < -maxX) { state.pos.x = -maxX; state.vel.x = Math.abs(state.vel.x); bouncedX = true; }
        if (state.pos.y > maxY) { state.pos.y = maxY; state.vel.y = -Math.abs(state.vel.y); bouncedY = true; }
        if (state.pos.y < -maxY) { state.pos.y = -maxY; state.vel.y = Math.abs(state.vel.y); bouncedY = true; }
        if (bouncedX && bouncedY) { state.discoStart = now; }
        const sinceRelease = (now - state.releaseTime) / 1000;
        if (sinceRelease >= 0 && sinceRelease <= RESUME_DURATION && state.vel.lengthSq() > 1e-6) {
          const t2 = sinceRelease / RESUME_DURATION;
          const easedR = 1 - Math.pow(1 - t2, 3);
          const targetSpeed = THREE.MathUtils.lerp(state.releaseSpeed, SPEED, easedR);
          state.vel.setLength(targetSpeed);
        }
      }

      // Hold-drag wobble (landing only).
      let shakeX = 0, shakeY = 0, wobbleRot = 0;
      if (isLanding && state.dragging) {
        const held = (now - state.dragStart) / 1000;
        if (held > HOLD_BEFORE_SHAKE) {
          const intensity = Math.min((held - HOLD_BEFORE_SHAKE) / 1.5, 1);
          const amp = intensity * 0.07;
          shakeX = Math.sin(now * 0.024) * amp + Math.sin(now * 0.041) * amp * 0.35;
          shakeY = Math.cos(now * 0.028) * amp + Math.cos(now * 0.044) * amp * 0.35;
          wobbleRot = Math.sin(now * 0.032) * 0.02 * intensity;
        }
      }

      // Scale: same eased lerp on both directions.
      const targetScale = isLanding ? 1 : CORNER_SCALE;
      const renderScale = inTrans
        ? THREE.MathUtils.lerp(state.transFromScale, targetScale, eased)
        : targetScale;

      // Position. Away (landing → corner) uses a simple eased lerp. Return
      // (corner → landing) uses a cubic Hermite curve whose tangent at t=1
      // equals the bouncing velocity, so the ball never stops at center —
      // physics seamlessly picks up an already-moving ball.
      let renderX, renderY;
      if (inTrans && isLanding) {
        const tLin = Math.min(Math.max(t, 0), 1);
        const t2 = tLin * tLin;
        const t3 = t2 * tLin;
        const h00 = 2 * t3 - 3 * t2 + 1;
        const h11 = t3 - t2;
        // P0 = (transFromX, transFromY) with v0 = 0; P1 = (0,0) with v1 sized
        // so dH/dτ at τ=T equals SPEED·dir.
        renderX = h00 * state.transFromX + h11 * state.transReturnV1X;
        renderY = h00 * state.transFromY + h11 * state.transReturnV1Y;
      } else if (inTrans && !isLanding) {
        const cp = cornerPos();
        renderX = THREE.MathUtils.lerp(state.transFromX, cp.x, eased);
        renderY = THREE.MathUtils.lerp(state.transFromY, cp.y, eased);
      } else if (isLanding) {
        // Pipe-entry deliberately starts the ball below the viewport
        // (state.pos.y < -maxY) and rises it into frame. Clamping would
        // pin it to the bottom edge and we'd never see the rise.
        if (state.pipeEntry) {
          renderX = state.pos.x;
          renderY = state.pos.y;
        } else {
          renderX = THREE.MathUtils.clamp(state.pos.x + shakeX, -maxX, maxX);
          renderY = THREE.MathUtils.clamp(state.pos.y + shakeY, -maxY, maxY);
        }
      } else {
        const cp = cornerPos();
        renderX = cp.x;
        renderY = cp.y;
      }

      // Swap texture at the midpoint so the change is masked by the spin.
      if (inTrans && !state.transTextureSwapped && t >= 0.5) {
        matNormal.map = isLanding ? landingTex : cornerTex;
        matNormal.needsUpdate = true;
        state.transTextureSwapped = true;
      }
      lastRenderX = renderX;
      lastRenderY = renderY;
      lastRenderScale = renderScale;
      ballGroup.position.set(renderX, renderY, 0);
      ballGroup.scale.setScalar(renderScale);

      // Outline thickness: keep landing's 1.015, fatten to OUTLINE_SCALE_CORNER
      // in corner mode so the stroke still reads at the smaller ball size.
      const targetOutlineScale = isLanding ? OUTLINE_SCALE : OUTLINE_SCALE_CORNER;
      const currentOutlineScale = inTrans
        ? THREE.MathUtils.lerp(state.transFromOutlineScale, targetOutlineScale, eased)
        : targetOutlineScale;
      outline.scale.setScalar(currentOutlineScale);

      // Cursor hover (landing: grabbable; corner: clickable). Disabled mid-transition.
      if (!inTrans && !state.dragging && !Number.isNaN(lastPointer.x)) {
        const over = hitsBall(lastPointer.x, lastPointer.y);
        if (isLanding) {
          canvas.classList.toggle(styles.grabbable, over);
          canvas.classList.remove(styles.clickable);
        } else {
          canvas.classList.toggle(styles.clickable, over);
          canvas.classList.remove(styles.grabbable);
        }
      } else if (inTrans) {
        canvas.classList.remove(styles.grabbable);
        canvas.classList.remove(styles.clickable);
      }

      // Disco visuals — landing only. The disco shader renders a circular
      // patch at the bouncing ball's exact on-screen location/size, so the
      // ball appears to TURN INTO the disco ball in place. The original
      // ball mesh fades out as the disco fades in.
      if (isLanding && d > 0) {
        const bgT = d * d;
        bgCurrent.copy(bgNormal).lerp(bgDisco, bgT);
        renderer.setClearColor(bgCurrent, 1);
        const normalOpacity = 1 - d;
        matNormal.opacity = normalOpacity;
        outlineMat.opacity = normalOpacity;
        ball.visible = normalOpacity > 0;
        outline.visible = normalOpacity > 0;
      } else {
        if (!bgCurrent.equals(bgNormal)) {
          bgCurrent.copy(bgNormal);
        }
        if (matNormal.opacity !== 1) matNormal.opacity = 1;
        if (outlineMat.opacity !== 1) outlineMat.opacity = 1;
        if (!ball.visible) ball.visible = true;
        if (!outline.visible) outline.visible = true;
        // Transparent clear — only the ball pixels are drawn, everything
        // else (carousel, overlays, body background) shows through.
        renderer.setClearColor(bgCurrent, 0);
      }

      // Rotation: transition flair → landing physics spin → corner scroll roll.
      // Going to corner: free-spin for ~60% of the transition, then slerp to
      // identity over the remainder so the JS face lands pointed at the camera.
      // Going to landing: just keep spinning — bouncing physics resumes after.
      if (inTrans) {
        if (state.mode === 'corner') {
          if (t < 0.6) {
            ballGroup.rotateOnWorldAxis(state.rotAxis, TRANSITION_SPIN_RATE * dt);
          } else {
            if (!state.cornerSettleStarted) {
              state.cornerSettleFromQuat.copy(ballGroup.quaternion);
              state.cornerSettleStarted = true;
            }
            const settleT = Math.min((t - 0.6) / 0.4, 1);
            const settleEased = easeInOutCubic(settleT);
            ballGroup.quaternion
              .copy(state.cornerSettleFromQuat)
              .slerp(IDENTITY_QUAT, settleEased);
          }
        } else {
          ballGroup.rotateOnWorldAxis(state.rotAxis, TRANSITION_SPIN_RATE * dt);
        }
      } else if (isLanding) {
        if (state.dragging) {
          if (wobbleRot) ballGroup.rotateOnWorldAxis(state.rotAxis, wobbleRot * dt * 60);
        } else if (state.pipeEntry) {
          // During pipe entry the ball rises + holds with the logo
          // pinned at the camera. Skip the per-frame spin so the texture
          // doesn't drift while the ball is "in the pipe". The launch
          // step at the end of pipeEntry clears the flag, after which
          // the normal speed-proportional spin resumes.
        } else {
          const speed = state.vel.length();
          const spin = Math.max(ROT_SPEED, (speed / SPEED) * ROT_SPEED);
          const spinBoost = 1 + d * 0.6;
          ballGroup.rotateOnWorldAxis(state.rotAxis, spin * dt * spinBoost);
        }
      } else {
        // Corner rotation. On /projects, scroll-roll is replaced by discrete
        // one-full-rotation spins driven by 'project-advance' events — the
        // ball sits at identity (JS facing the viewer) at rest. Other corner
        // pages keep the original continuous scroll-driven roll.
        const isProjects = pathnameRef.current === '/projects';
        if (isProjects) {
          state.scrollDelta = 0;
          const spinElapsed = now - state.spinAnimStart;
          if (spinElapsed >= 0 && spinElapsed < state.spinAnimDurationMs) {
            const tt = spinElapsed / state.spinAnimDurationMs;
            const easedSpin = easeInOutCubic(tt);
            const angle = 2 * Math.PI * easedSpin;
            spinQuat.setFromAxisAngle(spinAxis, angle);
            ballGroup.quaternion.identity().multiply(spinQuat);
            // Halfway through the spin the textured face is pointing directly
            // away from the camera — swap to the queued emoticon then so the
            // change is invisible and the new face lands at the spin's end.
            if (!state.spinTextureSwapped && tt >= 0.5 && state.nextFaceTex) {
              matNormal.map = state.nextFaceTex;
              matNormal.needsUpdate = true;
              state.spinTextureSwapped = true;
            }
          } else {
            ballGroup.quaternion.identity();
          }
        } else if (state.scrollDelta !== 0) {
          ballGroup.rotateOnWorldAxis(scrollAxis, state.scrollDelta * SCROLL_ROT_PER_PX);
          state.scrollDelta = 0;
        }
      }

      // 1) Render the normal ball scene to the screen.
      renderer.setRenderTarget(null);
      renderer.autoClear = true;
      renderer.render(scene, camera);

      // 2) If disco is active enough to be visible, render the codepen
      // shader scene to its HDR render target and composite the god-ray
      // post pass on top of the ball with alpha = d (cross-fade). The
      // shader is positioned and clipped to the bouncing ball's on-screen
      // footprint via uBallCenter / uBallPixelRadius — so the disco ball
      // draws exactly where the bouncing ball was, at the same size. The
      // 0.03 threshold skips the fade tails (the brief windows at the very
      // start and end where d is below 3%) so the heavy ray-traced shader
      // doesn't run for an effectively-invisible result.
      if (isLanding && d > 0.03) {
        const tSec = now / 1000;
        const winW = window.innerWidth;
        const winH = window.innerHeight;
        // Ball position/radius in DISCO-RT pixel coords (CSS pixels ×
        // discoScale, which equals dw/winW so the math lines up with
        // the RT's actual dimensions even on capped large monitors).
        const s = discoScale(winW, winH);
        const ballCx = (winW / 2 + lastRenderX * BALL_PIXEL_RADIUS) * s;
        const ballCy = (winH / 2 + lastRenderY * BALL_PIXEL_RADIUS) * s;
        const ballR  = BALL_PIXEL_RADIUS * lastRenderScale * s;

        discoUniforms.iTime.value = tSec;
        discoUniforms.uBallCenter.value.set(ballCx, ballCy);
        discoUniforms.uBallPixelRadius.value = ballR;
        // Drive both yaw and pitch from the bouncing ball's quaternion
        // (YXZ Euler: y → uManualRot.x = yaw, x → uManualRot.y = pitch)
        // so the disco ball spins exactly like the ball it's replacing.
        ballEuler.setFromQuaternion(ballGroup.quaternion, 'YXZ');
        discoUniforms.uManualRot.value.set(ballEuler.y, ballEuler.x);

        // 2a) Ray-traced disco ball → HDR half-res RT.
        renderer.setRenderTarget(discoRT);
        renderer.setClearColor(0x000000, 0);
        renderer.clear();
        renderer.render(discoScene, discoCamera);

        // 2b) God-ray post pass → LDR half-res RT (NOT directly to screen).
        // Running this at half res is the single biggest speedup vs the
        // earlier full-framebuffer version of the same pass.
        postUniforms.uTime.value = tSec;
        postUniforms.uFade.value = d;
        // UV is resolution-independent — scale cancels out.
        postUniforms.uBallCenterUV.value.set(
          (winW / 2 + lastRenderX * BALL_PIXEL_RADIUS) / winW,
          (winH / 2 + lastRenderY * BALL_PIXEL_RADIUS) / winH,
        );
        renderer.setRenderTarget(postRT);
        renderer.setClearColor(0x000000, 0);
        renderer.clear();
        renderer.render(postScene, postCamera);

        // 2c) Cheap textured-quad blit of postRT to the screen, blended
        // over the bouncing ball scene. One texture read per output pixel.
        renderer.setRenderTarget(null);
        renderer.autoClear = false;
        renderer.render(blitScene, blitCamera);
        renderer.autoClear = true;
        // Restore the normal clear colour for the next frame's first pass.
        renderer.setClearColor(bgCurrent, isLanding && d > 0 ? 1 : 0);
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    // Pause the render loop while the tab is hidden — Three.js otherwise
    // keeps drawing at 60fps in a background tab, which both burns the
    // user's battery and competes for GPU with whatever foreground tab
    // they switched to. Resuming on visibilitychange restarts the loop.
    const onVisibilityChange = () => {
      if (document.hidden) {
        if (raf) {
          cancelAnimationFrame(raf);
          raf = 0;
        }
      } else if (!raf && !effectDisposed) {
        raf = requestAnimationFrame(tick);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      effectDisposed = true;
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('project-advance', onProjectAdvance);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      sphereGeo.dispose();
      landingTex?.dispose();
      cornerTex?.dispose();
      for (const tex of Object.values(faceTextures)) tex.dispose();
      matNormal.dispose();
      outlineMat.dispose();
      discoMaterial.dispose();
      postMaterial.dispose();
      blitMaterial.dispose();
      discoPlane.geometry.dispose();
      postPlane.geometry.dispose();
      blitPlane.geometry.dispose();
      discoRT.dispose();
      postRT.dispose();
      renderer.dispose();
    };
  }, [fontFamily]);

  return (
    <>
      <canvas ref={canvasRef} className={styles.stage} data-global-ball />
      {pathname !== '/' && (
        <button
          type="button"
          className={styles.cornerNav}
          onClick={() => router.push('/')}
          aria-label="Home"
          data-global-ball
        />
      )}
    </>
  );
}
