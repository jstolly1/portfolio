'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import * as THREE from 'three';
import styles from './NotFoundScene.module.css';

// World units. The whole scene is laid out around an origin-centred
// ground plane; the camera is elevated so we see the floor in
// foreshortened perspective like the reference image.
const BALL_RADIUS = 0.75;
// Heavier-feeling physics: lower accel, lower top speed, lower jump, more
// gravity, more ground friction. The ball drifts to a stop and doesn't
// fling around — same controls, just more deliberate motion.
const GRAVITY = -0.008;          // per-frame Y velocity decay — lower = slower fall
const MOVE_ACCEL = 0.004;
const GROUND_FRICTION = 0.92;
const AIR_FRICTION = 0.985;
const JUMP_VELOCITY = 0.13;
const MAX_GROUND_SPEED = 0.10;
const LANDING_BOUNCE = 0.55;     // y-velocity retained on landing — more bounce
const DROP_DELAY_MS = 1200;      // wait before the ball drops in
const SPAWN_HEIGHT = 12;          // ball starts this high above the ground

// Hole position on the ground — pushed further to the right past the
// "home" word so it clearly reads as offset from the caption's column.
const HOLE_X = 2.5;
const HOLE_Z = 2.5;
const HOLE_RADIUS = 0.85;        // radius the ball must be within to fall

export default function NotFoundScene() {
  const canvasRef = useRef(null);
  const router = useRouter();
  const routerRef = useRef(router);
  useEffect(() => { routerRef.current = router; }, [router]);

  // Hide the global BouncingBall + corner-nav while the 404 page is
  // mounted — they share the canvas/data-global-ball selector and would
  // otherwise overlap the scene. Hidden via a CSS rule in globals.css
  // that watches `body[data-not-found="true"]`.
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    document.body.dataset.notFound = 'true';
    return () => {
      delete document.body.dataset.notFound;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    // Skip MSAA when devicePixelRatio is high — the extra pixel density
    // already smooths edges; doubling up via antialias is wasted GPU.
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: typeof window !== 'undefined' && window.devicePixelRatio < 2,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0xffffff, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);

    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    // Low, dramatic 3/4 view — camera close to the ground with a wider
    // FOV so the 404 reads in foreshortened perspective like the
    // reference image instead of the previous near-top-down framing.
    camera.position.set(-2, 6, 6);
    camera.lookAt(0, 0.4, 0);

    // === Ground ===
    const groundGeo = new THREE.PlaneGeometry(50, 50);
    const groundMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // === "404" text — baked to a canvas and laid flat on the ground.
    // Transparent canvas with bold black numerals; the underlying ground
    // shows through everywhere else.
    function make404Texture() {
      const c = document.createElement('canvas');
      c.width = 2048;
      c.height = 1024;
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.fillStyle = '#0a0a0a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // Very heavy weight + tight tracking matches the reference image.
      ctx.font = '900 720px "Helvetica Neue", Helvetica, Arial, sans-serif';
      ctx.letterSpacing = '-20px';
      ctx.fillText('404', c.width / 2, c.height / 2);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      return tex;
    }
    const textTex = make404Texture();
    const textGeo = new THREE.PlaneGeometry(14, 7);
    const textMat = new THREE.MeshBasicMaterial({
      map: textTex,
      transparent: true,
      depthWrite: false,
    });
    const textMesh = new THREE.Mesh(textGeo, textMat);
    // Lie flat on the ground, then tilt a touch around the vertical
    // axis. The slight rotation skews the lettering off-axis in the
    // camera view — that's the dynamic, non-straight-on perspective.
    textMesh.rotation.x = -Math.PI / 2;
    textMesh.rotation.z = Math.PI / 14;
    textMesh.position.set(0, 0.005, -0.6);
    scene.add(textMesh);

    // === Caption — just "Please return home", baked to a thin canvas and
    // laid flat on the ground DIRECTLY UNDER the 404. Plane width matches
    // the 404 plane (14 units) so they look like a single block of text.
    // The full instructions live as an HTML overlay at the bottom of the
    // viewport (see the JSX below).
    function makeCaptionTexture() {
      const c = document.createElement('canvas');
      c.width = 4096;
      c.height = 320;
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.fillStyle = '#0a0a0a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // Smaller text — the 200px size read as competing with the 404
      // numerals; 130px sits as a subtitle under them.
      ctx.font = '700 130px "Helvetica Neue", Helvetica, Arial, sans-serif';
      // No trailing period — the period adds asymmetric mass to the
      // right of center and makes the otherwise centered string read as
      // slightly offset under the 404.
      ctx.fillText('Please return home', c.width / 2, c.height / 2);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 16;
      return tex;
    }
    const captionTex = makeCaptionTexture();
    // 14 × 1.1 to match the 404 plane's width (14) — keeps it from
    // running wider than the numbers it sits underneath.
    const captionGeo = new THREE.PlaneGeometry(14, 1.1);
    const captionMat = new THREE.MeshBasicMaterial({
      map: captionTex,
      transparent: true,
      depthWrite: false,
    });
    const captionMesh = new THREE.Mesh(captionGeo, captionMat);
    captionMesh.rotation.x = -Math.PI / 2;
    captionMesh.rotation.z = Math.PI / 14;
    // Pulled tight against the 404 numerals: 404 text bottom lands at
    // z ≈ 1.86; placing the caption's text centre at z = 1.92 leaves
    // just ~0.06 of breathing room so the two rows read as one block.
    // x is shifted right of centre so the caption sits beneath the
    // right half of the 404 (under "04" rather than centred on the row).
    captionMesh.position.set(1.0, 0.006, 1.3);
    scene.add(captionMesh);

    // === Hole — dark ellipse on the ground that the ball drops into.
    // A flat circle in 3D viewed from a low angle naturally projects to
    // an ellipse from the camera's POV; no manual squish needed.
    const holeGeo = new THREE.CircleGeometry(HOLE_RADIUS, 64);
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x0a0a0a });
    const hole = new THREE.Mesh(holeGeo, holeMat);
    hole.rotation.x = -Math.PI / 2;
    hole.position.set(HOLE_X, 0.01, HOLE_Z);
    scene.add(hole);

    // === Ball texture (re-uses the same idea as BouncingBall: a white
    // canvas with "JS" text baked at the "front" UV so something is on
    // the ball besides solid white). After load, the /assets/name.png
    // overlay swaps in. Matches the corner-ball cosmetic.
    function makeBallTexture(text, fontPx) {
      const c = document.createElement('canvas');
      c.width = 2048;
      c.height = 1024;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.fillStyle = '#0a0a0a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${fontPx}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
      ctx.fillText(text, c.width * 0.25, c.height * 0.5);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      return tex;
    }
    let ballTex = makeBallTexture('JS', 320);
    const ballMat = new THREE.MeshBasicMaterial({ map: ballTex });
    const ballGeo = new THREE.SphereGeometry(BALL_RADIUS, 64, 32);
    const ball = new THREE.Mesh(ballGeo, ballMat);
    scene.add(ball);

    // Black outline via the BackSide silhouette trick — same as the main
    // bouncing ball. Slightly enlarged backface-only sphere reads as a
    // 2pt stroke around the visible front sphere.
    const outlineMat = new THREE.MeshBasicMaterial({
      color: 0x0a0a0a,
      side: THREE.BackSide,
    });
    const outline = new THREE.Mesh(ballGeo, outlineMat);
    outline.scale.setScalar(1.04);
    ball.add(outline);

    // Async-load the name image and overlay it onto the ball texture
    // (mirrors the cosmetic in BouncingBall.jsx).
    {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = 2048;
        c.height = 1024;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, c.width, c.height);
        const maxW = c.width * 0.32;
        const maxH = c.height * 0.54;
        const scale = Math.min(maxW / img.width, maxH / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, c.width * 0.25 - w / 2, c.height * 0.5 - h / 2, w, h);
        const newTex = new THREE.CanvasTexture(c);
        newTex.colorSpace = THREE.SRGBColorSpace;
        newTex.anisotropy = 8;
        ballTex.dispose();
        ballTex = newTex;
        ballMat.map = newTex;
        ballMat.needsUpdate = true;
      };
      img.src = '/assets/name.png';
    }

    // === Fake shadow — a flat dark circle on the ground beneath the
    // ball. Its scale and opacity track the ball's height: low ball =
    // tight dark shadow, high ball = wide faint shadow. Way cheaper
    // than enabling Three.js shadow maps and matches the soft elliptical
    // look in the reference image.
    const shadowGeo = new THREE.CircleGeometry(BALL_RADIUS * 1.05, 32);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.006;
    scene.add(shadow);

    // === Physics state
    const state = {
      pos: new THREE.Vector3(-2.5, SPAWN_HEIGHT, 0),
      vel: new THREE.Vector3(0, 0, 0),
      // Drop timer: ball is parked above the ground until this elapses.
      dropAt: performance.now() + DROP_DELAY_MS,
      // Set true when the ball settles inside the hole and starts falling
      // through; locks input + plays a quick fall-into-hole animation.
      fallingIntoHole: false,
      fallStart: 0,
      onGround: false,
      done: false,
    };

    // Reused quaternion + axis vector for ball rolling math, no per-frame allocs.
    const rollAxis = new THREE.Vector3();
    const rollQuat = new THREE.Quaternion();

    // Set the ball's INITIAL orientation so the logo (baked at canvas
    // u=0.25 — the sphere's +Z face on Three's SphereGeometry) faces
    // the camera once it's on the ground. The orientation is computed
    // against the *landed* position (same x/z as the spawn point but at
    // ground height = BALL_RADIUS), NOT the high-up spawn position. If
    // we use the spawn position, the +Z face ends up pointing down
    // toward where the camera was beneath the ball during the drop; as
    // the ball falls to ground level the camera is now above and sees
    // the back of the ball. The orientation is then frozen — the ball
    // falls and lands in this pose, and only the rolling math (when the
    // player rolls it) ever changes the quaternion after that.
    {
      const fwd = new THREE.Vector3(0, 0, 1);
      const landedPos = new THREE.Vector3(
        state.pos.x,
        BALL_RADIUS,
        state.pos.z,
      );
      const toCam = new THREE.Vector3()
        .copy(camera.position)
        .sub(landedPos)
        .normalize();
      const startQuat = new THREE.Quaternion().setFromUnitVectors(fwd, toCam);
      ball.quaternion.copy(startQuat);
    }

    // === Input — arrow keys / WASD = ground motion, space = jump.
    const keys = Object.create(null);
    const onKeyDown = (e) => {
      const k = e.key.toLowerCase();
      keys[k] = true;
      // Prevent space from scrolling the page.
      if (k === ' ' || k === 'arrowup' || k === 'arrowdown' ||
          k === 'arrowleft' || k === 'arrowright') {
        e.preventDefault();
      }
    };
    const onKeyUp = (e) => { keys[e.key.toLowerCase()] = false; };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    function resize() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    window.addEventListener('resize', resize);
    resize();

    let rafId = 0;
    let lastT = performance.now();
    function tick(now) {
      const dt = Math.min((now - lastT) / 1000, 1 / 30);
      lastT = now;

      // === Fall-into-hole animation: once triggered, just sink the ball
      // toward the hole's centre and shrink it, then navigate home.
      if (state.fallingIntoHole) {
        const t = (now - state.fallStart) / 700;
        if (t >= 1) {
          if (!state.done) {
            state.done = true;
            try { sessionStorage.setItem('from404', '1'); } catch {}
            routerRef.current?.push('/');
          }
        } else {
          state.pos.x += (HOLE_X - state.pos.x) * 0.18;
          state.pos.z += (HOLE_Z - state.pos.z) * 0.18;
          state.pos.y = THREE.MathUtils.lerp(BALL_RADIUS, -2, t);
          const s = THREE.MathUtils.lerp(1, 0.25, t);
          ball.scale.setScalar(s);
        }
      } else if (now >= state.dropAt) {
        // Player-controlled physics, but only after the drop delay.
        // Horizontal input → impulses on x/z.
        let ax = 0, az = 0;
        if (keys.arrowup || keys.w)    az -= MOVE_ACCEL;
        if (keys.arrowdown || keys.s)  az += MOVE_ACCEL;
        if (keys.arrowleft || keys.a)  ax -= MOVE_ACCEL;
        if (keys.arrowright || keys.d) ax += MOVE_ACCEL;
        state.vel.x += ax;
        state.vel.z += az;

        // Jump — only when grounded.
        if ((keys[' '] || keys.space || keys.spacebar) && state.onGround) {
          state.vel.y = JUMP_VELOCITY;
          state.onGround = false;
        }

        // Cap horizontal speed.
        const sp = Math.hypot(state.vel.x, state.vel.z);
        if (sp > MAX_GROUND_SPEED) {
          const k = MAX_GROUND_SPEED / sp;
          state.vel.x *= k;
          state.vel.z *= k;
        }

        // Gravity.
        state.vel.y += GRAVITY;

        // Friction — more on the ground than in the air.
        const fric = state.onGround ? GROUND_FRICTION : AIR_FRICTION;
        state.vel.x *= fric;
        state.vel.z *= fric;

        // Integrate.
        state.pos.add(state.vel);

        // Ground collision. Heavy ball → small rebound, settles fast.
        if (state.pos.y <= BALL_RADIUS) {
          state.pos.y = BALL_RADIUS;
          if (state.vel.y < -0.05) state.vel.y = -state.vel.y * LANDING_BOUNCE;
          else state.vel.y = 0;
          state.onGround = true;
        } else {
          state.onGround = false;
        }

        // Soft world bounds so the ball can't fly into the void.
        const BOUND_X = 9;
        const BOUND_Z_NEAR = 4.5;
        const BOUND_Z_FAR = -5;
        if (state.pos.x >  BOUND_X) { state.pos.x =  BOUND_X; state.vel.x = -Math.abs(state.vel.x) * 0.4; }
        if (state.pos.x < -BOUND_X) { state.pos.x = -BOUND_X; state.vel.x =  Math.abs(state.vel.x) * 0.4; }
        if (state.pos.z >  BOUND_Z_NEAR) { state.pos.z =  BOUND_Z_NEAR; state.vel.z = -Math.abs(state.vel.z) * 0.4; }
        if (state.pos.z <  BOUND_Z_FAR)  { state.pos.z =  BOUND_Z_FAR;  state.vel.z =  Math.abs(state.vel.z) * 0.4; }

        // Hole detection — ball is over the hole AND low enough to drop.
        const dxh = state.pos.x - HOLE_X;
        const dzh = state.pos.z - HOLE_Z;
        if (
          state.onGround &&
          dxh * dxh + dzh * dzh < HOLE_RADIUS * HOLE_RADIUS
        ) {
          state.fallingIntoHole = true;
          state.fallStart = now;
        }
      } else {
        // Pre-drop: ball hovers above the spawn point with a gentle hover
        // animation so the user knows it's about to enter.
        const wait = (state.dropAt - now) / DROP_DELAY_MS;
        state.pos.y = SPAWN_HEIGHT + Math.sin(now * 0.004) * 0.25;
      }

      // === Rolling — convert horizontal velocity into a rotation around
      // the axis perpendicular to motion (and to up). For a ball on a
      // flat surface, displacement = radius * rotation around that axis.
      const spXZ = Math.hypot(state.vel.x, state.vel.z);
      if (!state.fallingIntoHole && spXZ > 0.0005) {
        rollAxis.set(-state.vel.z, 0, state.vel.x).normalize();
        const angle = spXZ / BALL_RADIUS;
        rollQuat.setFromAxisAngle(rollAxis, angle);
        ball.quaternion.premultiply(rollQuat);
      }
      // Stationary: ball.quaternion holds whatever it was last set to
      // — initially the camera-facing pose from setup; after the
      // player has rolled the ball, the pose it stopped rolling in.

      // Apply the position to the ball mesh.
      ball.position.copy(state.pos);

      // === Shadow tracks the ball's x/z, scales/fades with height.
      shadow.position.x = state.pos.x;
      shadow.position.z = state.pos.z;
      const h = Math.max(0, state.pos.y - BALL_RADIUS);
      const heightT = Math.min(h / 6, 1);
      shadow.scale.setScalar(1 + heightT * 1.4);
      shadow.material.opacity = 0.42 * (1 - heightT * 0.75);
      // Hide the shadow entirely while the ball falls into the hole.
      if (state.fallingIntoHole) shadow.material.opacity = 0;

      renderer.render(scene, camera);
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', resize);
      groundGeo.dispose();
      groundMat.dispose();
      textGeo.dispose();
      textMat.dispose();
      textTex.dispose();
      captionGeo.dispose();
      captionMat.dispose();
      captionTex.dispose();
      holeGeo.dispose();
      holeMat.dispose();
      ballGeo.dispose();
      ballMat.dispose();
      outlineMat.dispose();
      ballTex?.dispose();
      shadowGeo.dispose();
      shadowMat.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div className={styles.page}>
      <canvas ref={canvasRef} className={styles.stage} />
      {/* "Please return home" is rendered in the 3D scene as a plane on
          the ground beneath the 404. The controls hint stays as an HTML
          overlay anchored to the bottom of the viewport. */}
      <div className={styles.caption}>
        <p className={styles.captionHint}>
          Use <kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> or <kbd>WASD</kbd> to move,
          {' '}<kbd>Space</kbd> to jump. Roll into the hole.
        </p>
      </div>
    </div>
  );
}
