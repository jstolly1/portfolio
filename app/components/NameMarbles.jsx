'use client';

// Mobile-landing hero — "jack stolly" as a cluster of flat outlined marble-
// balls, one letter each. They start arranged as the name (no gravity).
// Tapping the screen "drops" them: gravity switches on so they fall, bounce
// off each other, and roll. Then the phone's tilt drives gravity, so tilting
// rolls the balls around. Each ball's letter rolls WITH the ball — rotation =
// distance travelled along the current ground (perpendicular to gravity) over
// the radius — so it spins correctly in any tilt direction. Phones only.

import { useEffect, useRef, useState } from 'react';
import styles from './NameMarbles.module.css';

const TOP_ROW = ['j', 'a', 'c', 'k'];
const BOTTOM_ROW = ['s', 't', 'o', 'l', 'l', 'y'];

// Minimal quaternion math so each letter rolls like a logo painted on a 3D
// sphere — it rides to the back of the ball (hidden) and front (visible) as it
// rotates, instead of just spinning flat in 2D.
function quatMul(a, b) {
  return [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ];
}
function quatToMatrix3d([w, x, y, z]) {
  // Row-major rotation → CSS matrix3d (column-major).
  const m00 = 1 - 2 * (y * y + z * z);
  const m01 = 2 * (x * y - w * z);
  const m02 = 2 * (x * z + w * y);
  const m10 = 2 * (x * y + w * z);
  const m11 = 1 - 2 * (x * x + z * z);
  const m12 = 2 * (y * z - w * x);
  const m20 = 2 * (x * z - w * y);
  const m21 = 2 * (y * z + w * x);
  const m22 = 1 - 2 * (x * x + y * y);
  return `matrix3d(${m00},${m10},${m20},0,${m01},${m11},${m21},0,${m02},${m12},${m22},0,0,0,0,1)`;
}

export default function NameMarbles() {
  const stageRef = useRef(null);
  const tiltPermRef = useRef(null); // set by the effect; called by the card button
  const [hint, setHint] = useState(null); // 'tap' | 'tilt' | null
  const [needsTiltPrompt, setNeedsTiltPrompt] = useState(false); // iOS lead-in card

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia('(max-width: 767px)');
    let disposed = false;
    let booting = false;
    let teardown = null;

    const start = async () => {
      if (teardown || booting || disposed) return;
      booting = true;
      const stage = stageRef.current;
      if (!stage) { booting = false; return; }

      const MatterMod = await import('matter-js');
      const Matter = MatterMod.default || MatterMod;
      if (disposed || teardown) { booting = false; return; }
      const { Engine, World, Bodies, Body, Runner } = Matter;

      let W = stage.clientWidth;
      let H = stage.clientHeight;

      // Gravity starts at zero — the balls hold the name until the first tap.
      // Gravity scale tunes how fast they fall and roll (Matter default is
      // 0.001). Lower = slower, calmer roll; higher = snappier.
      const engine = Engine.create();
      engine.gravity.x = 0;
      engine.gravity.y = 0;
      engine.gravity.scale = 0.005;
      const world = engine.world;

      const R = Math.max(16, Math.min(34, Math.floor(W / 13)));
      const gap = R * 2 + 3;
      const cx = W / 2;
      const cy = H / 2;
      const rowOffset = R + 6;

      const layout = [];
      const place = (row, y) => {
        const startX = cx - ((row.length - 1) * gap) / 2;
        row.forEach((ch, i) => layout.push({ ch, x: startX + i * gap, y }));
      };
      place(TOP_ROW, cy - rowOffset);
      place(BOTTOM_ROW, cy + rowOffset);

      const T = 200;
      const wallOpts = { isStatic: true, restitution: 0.5, friction: 0.4 };
      const walls = [
        Bodies.rectangle(W / 2, H + T / 2, W + 2 * T, T, wallOpts),
        Bodies.rectangle(W / 2, -T / 2, W + 2 * T, T, wallOpts),
        Bodies.rectangle(-T / 2, H / 2, T, H + 2 * T, wallOpts),
        Bodies.rectangle(W + T / 2, H / 2, T, H + 2 * T, wallOpts),
      ];
      World.add(world, walls);

      // Each ball: a flat outlined circle holding an inner letter that rolls
      // with the body (rotation written every frame from how far it travels).
      const balls = layout.map(({ ch, x, y }) => {
        const body = Bodies.circle(x, y, R, {
          restitution: 0.55,
          friction: 0.1,
          // Low air drag so they accelerate when dropped and keep rolling,
          // instead of drifting down at a slow terminal velocity.
          frictionAir: 0.004,
          density: 0.005,
        });
        const el = document.createElement('div');
        el.className = styles.ball;
        el.style.width = `${R * 2}px`;
        el.style.height = `${R * 2}px`;
        const letterEl = document.createElement('span');
        letterEl.className = styles.ballLetter;
        letterEl.textContent = ch;
        letterEl.style.fontSize = `${Math.round(R * 0.9)}px`;
        el.appendChild(letterEl);
        stage.appendChild(el);
        return { body, el, letterEl, q: [1, 0, 0, 0], prevX: x, prevY: y };
      });
      World.add(world, balls.map((b) => b.body));

      const runner = Runner.create();
      Runner.run(runner, engine);

      let raf = 0;
      const paint = () => {
        if (disposed) return;
        for (const b of balls) {
          const { body, el, letterEl } = b;
          el.style.transform = `translate(${body.position.x - R}px, ${body.position.y - R}px)`;
          // Roll the letter on a 3D sphere: rotate the ball about the in-plane
          // axis perpendicular to its travel by (distance / R) each frame.
          // With perspective + backface-visibility:hidden on the letter, it
          // rides to the back (hidden) and front (visible) like a real logo —
          // instead of spinning flat. Works in any tilt direction.
          const dx = body.position.x - b.prevX;
          const dy = body.position.y - b.prevY;
          b.prevX = body.position.x;
          b.prevY = body.position.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 0.05) {
            const theta = dist / R;
            const s = Math.sin(theta / 2);
            const qinc = [Math.cos(theta / 2), (s * dy) / dist, (s * dx) / dist, 0];
            const q = quatMul(qinc, b.q);
            const ql = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
            b.q = [q[0] / ql, q[1] / ql, q[2] / ql, q[3] / ql];
          }
          // translateZ(R) sits the letter ON the sphere's front surface, so the
          // rotation orbits it ACROSS the face and around to the hidden back —
          // a logo fixed to one spot — rather than pivoting at the centre.
          letterEl.style.transform = `perspective(${R * 7}px) ${quatToMatrix3d(b.q)} translateZ(${R}px)`;
        }
        raf = requestAnimationFrame(paint);
      };
      raf = requestAnimationFrame(paint);

      const ro = new ResizeObserver(() => {
        const nw = stage.clientWidth;
        const nh = stage.clientHeight;
        if (nw === W && nh === H) return;
        W = nw;
        H = nh;
        Body.setPosition(walls[0], { x: W / 2, y: H + T / 2 });
        Body.setPosition(walls[1], { x: W / 2, y: -T / 2 });
        Body.setPosition(walls[2], { x: -T / 2, y: H / 2 });
        Body.setPosition(walls[3], { x: W + T / 2, y: H / 2 });
      });
      ro.observe(stage);

      // ---------- Tilt → gravity ----------
      let dropped = false;
      let motionHandler = null;
      let orientHandler = null;
      let hintTimer = 0;
      let motionDrives = false;
      const clamp = (v) => Math.max(-1, Math.min(1, v));

      const showTiltHint = () => {
        setHint('tilt');
        clearTimeout(hintTimer);
        hintTimer = window.setTimeout(() => setHint(null), 6000);
      };

      const onMotion = (e) => {
        const g = e.accelerationIncludingGravity;
        if (!dropped || !g || (g.x == null && g.y == null)) return;
        motionDrives = true;
        const landscape = window.innerWidth > window.innerHeight;
        const gx = landscape ? (g.y || 0) : (g.x || 0);
        const gy = landscape ? (g.x || 0) : (g.y || 0);
        engine.gravity.x = clamp(gx / 9.81);
        engine.gravity.y = clamp(-gy / 9.81);
      };

      const onOrient = (e) => {
        // Used when accelerationIncludingGravity isn't available (e.g. iOS with
        // only orientation permission): derive gravity from tilt angles.
        if (!dropped || motionDrives) return;
        const d2r = Math.PI / 180;
        const landscape = window.innerWidth > window.innerHeight;
        const gx = landscape ? (e.beta || 0) : (e.gamma || 0);
        const gy = landscape ? (e.gamma || 0) : (e.beta || 0);
        engine.gravity.x = clamp(Math.sin(gx * d2r));
        engine.gravity.y = clamp(Math.sin(gy * d2r));
      };

      const addSensorListeners = () => {
        if (motionHandler) return;
        motionHandler = onMotion;
        orientHandler = onOrient;
        window.addEventListener('devicemotion', motionHandler, true);
        window.addEventListener('deviceorientation', orientHandler, true);
      };

      // Called from the in-page "Enable tilt" card's button — a real button
      // click is the most reliable iOS user-activation for requestPermission.
      const requestSensorPerm = async () => {
        if (motionHandler) { setNeedsTiltPrompt(false); return; }
        try {
          const res = await DeviceOrientationEvent.requestPermission();
          if (res === 'granted') {
            addSensorListeners();
            showTiltHint();
          }
        } catch {
          /* denied / unsupported — balls still fall, just no tilt */
        }
        setNeedsTiltPrompt(false);
      };
      tiltPermRef.current = requestSensorPerm;

      const dropBalls = () => {
        if (dropped) return;
        dropped = true;
        engine.gravity.x = 0;
        engine.gravity.y = 1;
        setHint(null); // clear "tap" hint; the tilt path shows its own
      };

      // Enable tilt after the first tap. iOS needs a permission gesture, so we
      // surface a friendly card (its button does the request); everywhere else
      // we just start listening.
      const enableTilt = () => {
        if (motionHandler) return;
        const needsPerm =
          typeof DeviceOrientationEvent !== 'undefined' &&
          typeof DeviceOrientationEvent.requestPermission === 'function';
        if (needsPerm) {
          setNeedsTiltPrompt(true);
        } else {
          addSensorListeners();
          showTiltHint();
        }
      };

      const onPointerUp = () => {
        dropBalls();
        enableTilt();
      };
      stage.addEventListener('pointerdown', dropBalls);
      stage.addEventListener('pointerup', onPointerUp);

      setHint('tap');

      teardown = () => {
        cancelAnimationFrame(raf);
        clearTimeout(hintTimer);
        stage.removeEventListener('pointerdown', dropBalls);
        stage.removeEventListener('pointerup', onPointerUp);
        if (motionHandler) window.removeEventListener('devicemotion', motionHandler, true);
        if (orientHandler) window.removeEventListener('deviceorientation', orientHandler, true);
        ro.disconnect();
        Runner.stop(runner);
        balls.forEach((b) => b.el.remove());
        World.clear(world, false);
        Engine.clear(engine);
        tiltPermRef.current = null;
        setHint(null);
        setNeedsTiltPrompt(false);
        teardown = null;
      };
      booting = false;
    };

    const handleMq = () => {
      if (mq.matches) start();
      else if (teardown) teardown();
    };
    if (mq.matches) start();
    mq.addEventListener('change', handleMq);

    return () => {
      disposed = true;
      mq.removeEventListener('change', handleMq);
      if (teardown) teardown();
    };
  }, []);

  // The overlays are siblings of the stage (not children) so taps on the card
  // button don't bubble through Matter's drag listener on the stage — that
  // listener preventDefault()s the touch, which would cancel the button click.
  return (
    <>
      <div ref={stageRef} className={styles.stage} />
      {hint === 'tap' && <div className={styles.hint}>Tap the screen</div>}
      {hint === 'tilt' && (
        <div className={styles.hint}>
          <svg className={styles.hintPhone} viewBox="0 0 24 40" width="22" height="36" aria-hidden="true">
            <rect x="2" y="2" width="20" height="36" rx="4" fill="none" stroke="#0a0a0a" strokeWidth="2.5" />
          </svg>
          Tilt your phone to roll them
        </div>
      )}
      {needsTiltPrompt && (
        <div className={styles.tiltCard}>
          <svg className={styles.hintPhone} viewBox="0 0 24 40" width="26" height="42" aria-hidden="true">
            <rect x="2" y="2" width="20" height="36" rx="4" fill="none" stroke="#0a0a0a" strokeWidth="2.5" />
          </svg>
          <p className={styles.tiltCardText}>Want to roll the letters around? Tilt your phone after you enable motion.</p>
          <button
            type="button"
            className={styles.tiltCardBtn}
            onClick={() => tiltPermRef.current?.()}
          >
            Enable tilt
          </button>
        </div>
      )}
    </>
  );
}
