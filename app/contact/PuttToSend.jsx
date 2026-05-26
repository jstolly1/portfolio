'use client';

// Putt-to-send — top-down mini-golf hole that lives on the contact page.
// Drag the ball back to set angle + power, release to putt. Sinking it
// fires the parent's onHoleIn callback (the form submits via that path).
// The whole simulation lives in a single useEffect; ball, cup, flag, and
// aim guide are imperatively-owned <div>s parented to the stage and
// transformed every frame from the matching matter body.

import { useEffect, useRef, useState } from 'react';
import styles from './Contact.module.css';

const BALL_R = 12;
const CUP_R  = 26;
const POWER_CAP_DRAG = 140;   // max drag distance in px that counts toward power
const POWER_DIVISOR  = 8;     // drag-px / divisor = launch velocity units
// Max launch velocity is computed per-shot inside the effect from the
// current tee-to-cup distance: v0 = (cupX - teeX) / 40 makes a full-power
// putt's trajectory decay to zero right at the cup center. (frictionAir
// 0.025 → total distance = v0 / 0.025 = v0 * 40.) Velocity check on sink
// was removed — any overlap with the cup counts as sunk now.

export default function PuttToSend({ onHoleIn, apiRef: externalApiRef }) {
  const stageRef = useRef(null);
  const onHoleInRef = useRef(onHoleIn);
  const [strokes, setStrokes] = useState(0);
  const [sunk, setSunk] = useState(false);
  const [holeInOne, setHoleInOne] = useState(false);

  // Keep the latest onHoleIn in a ref so the game effect doesn't re-init
  // every time the parent re-renders with a new inline function.
  useEffect(() => { onHoleInRef.current = onHoleIn; }, [onHoleIn]);

  useEffect(() => {
    let raf = 0;
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      const MatterMod = await import('matter-js');
      const Matter = MatterMod.default || MatterMod;
      if (disposed) return;
      const { Engine, World, Bodies, Body, Runner, Events } = Matter;

      const stage = stageRef.current;
      if (!stage) return;
      let W = stage.clientWidth;
      let H = stage.clientHeight;

      // Top-down — no gravity. Friction is simulated via frictionAir so
      // the ball decelerates smoothly the same way it would on grass.
      const engine = Engine.create({ gravity: { x: 0, y: 0 } });
      const world  = engine.world;

      // Tee + cup positions are derived from current stage size and kept
      // in sync via ResizeObserver below. Cup sits at 70% of the width so
      // the hole reads as clearly right of center, with plenty of fairway
      // to its left for the ball to roll across.
      let teeX = 80, teeY = H * 0.5;
      let cupX = W * 0.70, cupY = H * 0.5;

      // Max launch velocity for a full-power putt — tuned so the ball
      // travels exactly the tee-to-cup distance before its velocity
      // decays to zero. Derived freshly every shot so resize stays
      // correct. (frictionAir 0.025 → distance = v0 / 0.025 = v0 * 40.)
      const maxPower = () => Math.max(0, (cupX - teeX) / 40);

      // Border walls. Bouncy enough to support bank shots without making
      // every putt pinball — restitution 0.7 plays well in practice.
      const T = 200;
      const wallOpts = { isStatic: true, restitution: 0.7, friction: 0.05 };
      const walls = {
        floor:   Bodies.rectangle(W/2,    H + T/2, W + 2*T, T,       wallOpts),
        ceiling: Bodies.rectangle(W/2,    -T/2,    W + 2*T, T,       wallOpts),
        left:    Bodies.rectangle(-T/2,   H/2,     T,       H + 2*T, wallOpts),
        right:   Bodies.rectangle(W + T/2, H/2,    T,       H + 2*T, wallOpts),
      };
      World.add(world, Object.values(walls));

      // The ball — frictionAir is the "grass drag". Tuned so a ~140px
      // pullback rolls ~700px before stopping.
      const ball = Bodies.circle(teeX, teeY, BALL_R, {
        restitution: 0.6,
        friction: 0.005,
        frictionAir: 0.025,
        density: 0.005,
        label: 'ball',
      });
      World.add(world, ball);

      // ---------- DOM ----------
      // DOM order = z-order, painted in this order from bottom to top:
      //   1. flag        — pole sits behind the cup so it looks rooted
      //   2. cup         — masks the pole's lower portion
      //   3. aim guide   — dashed line; sits below the ball so the ball
      //                    visibly covers the inner segment of the line
      //   4. ball        — always on top so it's visible against everything
      const flagEl = document.createElement('div');
      flagEl.className = styles.flag;
      flagEl.innerHTML = `
        <div class="${styles.flagPole}"></div>
        <div class="${styles.flagCloth}">SEND</div>
      `;
      stage.appendChild(flagEl);

      const cupEl = document.createElement('div');
      cupEl.className = styles.cup;
      stage.appendChild(cupEl);

      const aimEl = document.createElement('div');
      aimEl.className = styles.aimGuide;
      aimEl.style.display = 'none';
      stage.appendChild(aimEl);

      const ballEl = document.createElement('div');
      ballEl.className = styles.golfBall;
      stage.appendChild(ballEl);

      const positionCup = () => {
        cupEl.style.left = (cupX - CUP_R) + 'px';
        cupEl.style.top  = (cupY - CUP_R) + 'px';
        flagEl.style.left = cupX + 'px';
        // Flag div sits 124px above the cup so the 130px pole runs from
        // its top edge down to 6px past the cup center. The cup is
        // painted on top of the pole (flag is appended before the cup
        // in the DOM, so cup's z-order wins), which masks the pole's
        // lower section and leaves it visibly rooted in the hole while
        // the cloth waves high above.
        flagEl.style.top  = (cupY - 124) + 'px';
      };
      positionCup();

      // ---------- Aim state ----------
      const ctrl = {
        aiming: false,
        sunk: false,
        startX: 0, startY: 0,    // ball position at aim start
        curX:   0, curY:   0,    // current cursor position
        strokes: 0,
      };

      const atRest = () => {
        const v = Math.hypot(ball.velocity.x, ball.velocity.y);
        return v < 0.12;
      };

      // ---------- Input ----------
      const getMouse = (e) => {
        const rect = stage.getBoundingClientRect();
        const point = ('touches' in e && e.touches[0]) ? e.touches[0] : e;
        return { x: point.clientX - rect.left, y: point.clientY - rect.top };
      };

      const onDown = (e) => {
        if (ctrl.sunk) return;
        if (!atRest()) return;
        const m = getMouse(e);
        // Forgiving hit target — anywhere within 48px of ball center.
        const dx = m.x - ball.position.x;
        const dy = m.y - ball.position.y;
        if (Math.hypot(dx, dy) > 48) return;
        ctrl.aiming = true;
        ctrl.startX = ball.position.x;
        ctrl.startY = ball.position.y;
        ctrl.curX = m.x;
        ctrl.curY = m.y;
        aimEl.style.display = 'block';
        stage.style.cursor = 'grabbing';
        e.preventDefault();
      };

      const onMove = (e) => {
        if (!ctrl.aiming) return;
        const m = getMouse(e);
        ctrl.curX = m.x;
        ctrl.curY = m.y;
      };

      const onUp = () => {
        if (!ctrl.aiming) return;
        ctrl.aiming = false;
        aimEl.style.display = 'none';
        stage.style.cursor = 'grab';
        // Aim direction = vector from cursor → ball (slingshot — pull back,
        // ball flies opposite).
        const dx = ctrl.startX - ctrl.curX;
        const dy = ctrl.startY - ctrl.curY;
        const dist = Math.min(Math.hypot(dx, dy), POWER_CAP_DRAG);
        const power = Math.min(dist / POWER_DIVISOR, maxPower());
        if (power < 0.5) return;
        const angle = Math.atan2(dy, dx);
        Body.setVelocity(ball, {
          x: Math.cos(angle) * power,
          y: Math.sin(angle) * power,
        });
        ctrl.strokes += 1;
        setStrokes(ctrl.strokes);
      };

      stage.addEventListener('mousedown', onDown);
      stage.addEventListener('touchstart', onDown, { passive: false });
      window.addEventListener('mousemove', onMove);
      window.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('mouseup', onUp);
      window.addEventListener('touchend', onUp);

      // ---------- Sink detection ----------
      // Cup is a pure visual element (no physics body) so the ball never
      // bounces off it. Any overlap with the cup interior sinks the ball
      // regardless of how fast it's going — no lip-out at speed.
      Events.on(engine, 'afterUpdate', () => {
        if (ctrl.sunk) return;
        const dx = ball.position.x - cupX;
        const dy = ball.position.y - cupY;
        const d  = Math.hypot(dx, dy);
        if (d < CUP_R - 4) {
          ctrl.sunk = true;
          Body.setVelocity(ball, { x: 0, y: 0 });
          Body.setPosition(ball, { x: cupX, y: cupY });
          // Slide the ball the final few pixels to the cup's exact center
          // via a CSS transition (the paint loop stops touching transform
          // once sunk is true, so this single inline transform animates
          // smoothly to the center instead of snapping there).
          ballEl.style.transition = 'transform 300ms ease-out';
          ballEl.style.transform =
            `translate(${cupX - BALL_R}px, ${cupY - BALL_R}px)`;
          // Start the opacity fade slightly after the slide so the user
          // sees the ball reach center before it disappears.
          setTimeout(() => {
            ballEl.classList.add(styles.golfBallSunk);
          }, 120);
          setSunk(true);
          setHoleInOne(ctrl.strokes === 1);
          // Form submission (or validation) fires after the slide is done
          // and the ball is well into its fade.
          setTimeout(() => onHoleInRef.current?.(), 600);
        }
      });

      // ---------- Sim + paint ----------
      const runner = Runner.create();
      Runner.run(runner, engine);

      function paint() {
        if (disposed) return;
        if (!ctrl.sunk) {
          ballEl.style.transform =
            `translate(${ball.position.x - BALL_R}px, ${ball.position.y - BALL_R}px)`;
        }
        if (ctrl.aiming) {
          const dx = ctrl.startX - ctrl.curX;
          const dy = ctrl.startY - ctrl.curY;
          const len = Math.min(Math.hypot(dx, dy), POWER_CAP_DRAG);
          const angle = Math.atan2(dy, dx);
          aimEl.style.left   = ball.position.x + 'px';
          aimEl.style.top    = ball.position.y + 'px';
          aimEl.style.width  = len + 'px';
          aimEl.style.transform = `rotate(${angle}rad)`;
        }
        raf = requestAnimationFrame(paint);
      }
      raf = requestAnimationFrame(paint);

      // Keep walls + cup flush with the stage on layout reflow.
      const ro = new ResizeObserver(() => {
        const nw = stage.clientWidth, nh = stage.clientHeight;
        if (nw === W && nh === H) return;
        W = nw; H = nh;
        teeY = H * 0.5;
        cupX = W * 0.70;
        cupY = H * 0.5;
        Body.setPosition(walls.floor,   { x: W/2,    y: H + T/2 });
        Body.setPosition(walls.ceiling, { x: W/2,    y: -T/2 });
        Body.setPosition(walls.left,    { x: -T/2,   y: H/2 });
        Body.setPosition(walls.right,   { x: W + T/2, y: H/2 });
        positionCup();
      });
      ro.observe(stage);

      // ---------- External control surface ----------
      const api = {
        reset() {
          ctrl.sunk = false;
          ctrl.strokes = 0;
          ctrl.aiming = false;
          aimEl.style.display = 'none';
          ballEl.classList.remove(styles.golfBallSunk);
          // Clear the sink-time CSS transition so the ball doesn't tween
          // from the cup back to the tee — we want it to teleport.
          ballEl.style.transition = 'none';
          Body.setVelocity(ball, { x: 0, y: 0 });
          Body.setPosition(ball, { x: teeX, y: teeY });
          // Paint loop resumes setting transform once sunk is false.
          ballEl.style.transform =
            `translate(${teeX - BALL_R}px, ${teeY - BALL_R}px)`;
          setStrokes(0);
          setSunk(false);
          setHoleInOne(false);
        },
      };
      if (externalApiRef) externalApiRef.current = api;

      cleanup = () => {
        cancelAnimationFrame(raf);
        stage.removeEventListener('mousedown', onDown);
        stage.removeEventListener('touchstart', onDown);
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('touchmove', onMove);
        window.removeEventListener('mouseup', onUp);
        window.removeEventListener('touchend', onUp);
        ro.disconnect();
        Runner.stop(runner);
        ballEl.remove();
        cupEl.remove();
        flagEl.remove();
        aimEl.remove();
        World.clear(world, false);
        Engine.clear(engine);
        if (externalApiRef) externalApiRef.current = null;
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [externalApiRef]);

  const handleReset = () => externalApiRef?.current?.reset();

  return (
    <section className={styles.golfSection}>
      <div className={styles.golfHeader}>
        <h2 className={styles.golfTitle}>Putt to send.</h2>
        <span className={styles.golfHint}>
          Drag the ball back to aim, release to putt. Sink it in the cup to send.
        </span>
      </div>

      <div ref={stageRef} className={styles.fairwayStage} />

      <div className={styles.golfStats}>
        <span className={styles.strokes}>Strokes: {strokes}</span>
        {sunk && (
          <span className={styles.sunkBadge}>
            {holeInOne ? 'Hole in one!' : 'Sunk!'}
          </span>
        )}
        <button type="button" className={styles.resetBtn} onClick={handleReset}>
          Reset
        </button>
      </div>
    </section>
  );
}
