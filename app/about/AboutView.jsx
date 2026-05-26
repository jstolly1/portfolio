'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './About.module.css';
import { Break } from 'three/tsl';

const SKILLS = [
  'Creative',
  'Web Developer',
  'Graphic Design',
  'Typography',
  'Branding',
  'Animation',
  'UI/UX',
  'Motion',
  'Layout',
  'Illustration',
  'Print',
  'Editorial',
];

const BALL_RADIUS = 56;

// Uniform scale applied to every dimension of the Figma-exported hoop —
// positions, sizes, and the SVG `<g>` scale. Bump this to grow the hoop;
// matter geometry and the visual stay in lockstep because hoopGeometry()
// reads the same constant.
const HOOP_SCALE = 1.4;

// Collision categories so the backboard / walls collide with balls correctly.
const CAT_BALL = 0x0001;
const CAT_WALL = 0x0004;
// Net nodes live in their own category and only collide with balls — keeps
// the net from tangling with walls, backboard, or the score sensor.
const CAT_NET = 0x0008;

// Vertical placement of the rim — fraction of court height. 0.5 = center.
const RIM_VERTICAL = 0.45;

// Horizontal padding between the hoop's back face and the court's right
// wall. 0 = flush against the wall (the back face's right-edge stroke
// merges with the court frame, but the rect still reads via its top /
// bottom / left edges).
const HOOP_RIGHT_PAD = 0;

// "No-drag" zone — how far to the LEFT of the rim's leftmost edge a user is
// allowed to hold a ball. Cross this with a held ball and it gets swatted
// away with "Not in my house!" — like a goaltend.
const NO_DRAG_BUFFER = 80;

// Swat copy — cycled through on each goaltend so the same phrase doesn't
// pop twice in a row.
const SWAT_MESSAGES = ['Not in my house!', 'Not today!', 'No, No, No!'];

// Arcade mode: timed run with a base scoring phase then a bonus phase. The
// final ARCADE_HIGH_PHASE seconds of the run count triple instead of double.
const ARCADE_DURATION = 30;
const ARCADE_HIGH_PHASE = 10;
const ARCADE_BASE_POINTS = 2;
const ARCADE_BONUS_POINTS = 3;
const HIGH_SCORE_KEY = 'about-arcade-high-score';

// Hoop geometry — derived once from the offset and the source SVG coords,
// uniformly multiplied by HOOP_SCALE so the matter bodies grow with the
// visual. The matter bodies live in court-pixel space using these scaled
// numbers, so physics and visual stay in lockstep.
function hoopGeometry(W, H) {
  const S = HOOP_SCALE;
  // Side-view backboard right edge (SVG x=188) sits HOOP_RIGHT_PAD px from
  // the court's right wall so its own 2pt stroke is visible.
  const ox = W - 188 * S - HOOP_RIGHT_PAD;
  // Position the SVG so the rim (SVG y=155.5 center) sits at RIM_VERTICAL
  // of the court height.
  const oy = H * RIM_VERTICAL - 155.5 * S;
  return {
    ox,
    oy,
    // Main flat backboard face (SVG rect 146,1 19×216)
    bbMain: {
      cx: ox + (146 + 19 / 2) * S,
      cy: oy + (1 + 216 / 2) * S,
      w: 19 * S,
      h: 216 * S,
    },
    // Side-view piece of the backboard (SVG rect 165,91 23×62)
    bbSide: {
      cx: ox + (165 + 23 / 2) * S,
      cy: oy + (91 + 62 / 2) * S,
      w: 23 * S,
      h: 62 * S,
    },
    // Visual rim rect (SVG rect 1,151 129×9).
    rim: {
      leftX: ox + 1 * S,
      rightX: ox + 130 * S,
      topY: oy + 151 * S,
      bottomY: oy + 160 * S,
      midY: oy + 155.5 * S,
      height: 9 * S,
    },
    // Rim caps — the RED ends in the breakdown diagram. Small static bodies
    // at the rim's left and right ends; the long top/bottom edges (the GREEN
    // strips) have no collider so the ball can pass through vertically.
    rimCapLeft: { cx: ox + 2 * S, cy: oy + 155.5 * S, w: 4 * S, h: 11 * S },
    rimCapRight: { cx: ox + 129 * S, cy: oy + 155.5 * S, w: 4 * S, h: 11 * S },
    // Score sensor: a sliver of invisible body in the rim opening that
    // detects a ball passing through downward.
    sensor: {
      cx: ox + (1 + 129 / 2) * S,
      cy: oy + 156 * S,
      w: 110 * S,
      h: 4 * S,
    },
    // Held balls can't be dragged past this X. Beyond it the ball is swatted.
    noDragX: ox + 1 * S - NO_DRAG_BUFFER,
  };
}

export default function AboutView() {
  const courtRef = useRef(null);
  const ballRefs = useRef([]);
  const confettiCanvasRef = useRef(null);
  const netSvgRef = useRef(null);
  const [score, setScore] = useState(0);
  const [courtSize, setCourtSize] = useState({ W: 0, H: 0 });
  // Transient swat popup — set when a held ball crosses the no-drag line.
  // Key changes per-swat so the CSS animation re-runs. `message` rotates
  // through SWAT_MESSAGES so repeated swats don't feel canned.
  const [swat, setSwat] = useState(null); // { x, y, key, message }
  const swatMessageIndexRef = useRef(0);
  // Arcade state.
  const [arcadeActive, setArcadeActive] = useState(false);
  const [arcadeTimeLeft, setArcadeTimeLeft] = useState(ARCADE_DURATION);
  const [highScore, setHighScore] = useState(0);
  const [hasHighScore, setHasHighScore] = useState(false);
  // Bumped every time we want to play the confetti animation. Initial value
  // 0 is treated as "don't run" so confetti doesn't fire on mount.
  const [confettiKey, setConfettiKey] = useState(0);
  // Pre-arcade countdown: null while idle, otherwise 3 → 2 → 1 → 'GO!' → null.
  // The real arcade timer doesn't start until this drops back to null.
  const [countdown, setCountdown] = useState(null);
  const countdownRef = useRef(null);
  useEffect(() => {
    countdownRef.current = countdown;
  }, [countdown]);

  // Mirror arcade state in a ref so the matter `collisionStart` listener
  // (registered once inside the matter setup effect) can read the latest
  // arcade timeLeft / active flag without re-binding the listener.
  const arcadeRef = useRef({ active: false, timeLeft: ARCADE_DURATION });
  useEffect(() => {
    arcadeRef.current = { active: arcadeActive, timeLeft: arcadeTimeLeft };
  }, [arcadeActive, arcadeTimeLeft]);

  // Load the stored high score on mount. Wrapped in try/catch because
  // localStorage can throw in private-mode / SSR-edge conditions.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(HIGH_SCORE_KEY);
      if (stored != null) {
        setHighScore(Number(stored) || 0);
        setHasHighScore(true);
      }
    } catch {}
  }, []);

  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};

    (async () => {
      const MatterModule = await import('matter-js');
      const Matter = MatterModule.default || MatterModule;
      if (cancelled) return;

      const court = courtRef.current;
      if (!court) return;

      const { width: W, height: H } = court.getBoundingClientRect();
      setCourtSize({ W, H });
      const geo = hoopGeometry(W, H);
      const { Engine, World, Bodies, Mouse, MouseConstraint, Runner, Events } = Matter;

      // Set of pending swat-popup timeout IDs. Each setTimeout pushes
      // here; the timer callback removes itself; unmount clears any
      // still in flight (see cleanup() below). Prevents setSwat-on-
      // unmounted-component warnings if the user navigates mid-swat.
      const swatTimeouts = new Set();

      const engine = Engine.create();
      engine.world.gravity.y = 1.2;

      // Court walls
      const wt = 60;
      const wallOpts = { isStatic: true, collisionFilter: { category: CAT_WALL } };
      const walls = [
        Bodies.rectangle(W / 2, -wt / 2, W, wt, { ...wallOpts }),
        Bodies.rectangle(W / 2, H + wt / 2, W, wt, {
          ...wallOpts,
          label: 'floor',
          // Low friction so balls carry their leftward momentum across
          // the floor after sliding off the (now shorter) return ramp.
          friction: 0.01,
        }),
        Bodies.rectangle(-wt / 2, H / 2, wt, H, { ...wallOpts }),
        Bodies.rectangle(W + wt / 2, H / 2, wt, H, { ...wallOpts }),
      ];

      // Backboard physics — the two rectangles from the SVG. The rim itself
      // has no collider so a ball can pass straight through it.
      const backboardMain = Bodies.rectangle(
        geo.bbMain.cx,
        geo.bbMain.cy,
        geo.bbMain.w,
        geo.bbMain.h,
        { isStatic: true },
      );
      const backboardSide = Bodies.rectangle(
        geo.bbSide.cx,
        geo.bbSide.cy,
        geo.bbSide.w,
        geo.bbSide.h,
        { isStatic: true },
      );

      // Rim end caps — the RED segments in the breakdown. Small static
      // bodies at the rim's left and right ends. The long top/bottom edges
      // of the rim have no collider (the GREEN passage), so a ball can fall
      // straight through the rim from above and exit through the bottom.
      const rimCapLeft = Bodies.rectangle(
        geo.rimCapLeft.cx,
        geo.rimCapLeft.cy,
        geo.rimCapLeft.w,
        geo.rimCapLeft.h,
        { isStatic: true },
      );
      const rimCapRight = Bodies.rectangle(
        geo.rimCapRight.cx,
        geo.rimCapRight.cy,
        geo.rimCapRight.w,
        geo.rimCapRight.h,
        { isStatic: true },
      );

      // Invisible score sensor in the rim opening. Category/mask
      // explicitly scoped to balls so the net (CAT_NET) can never trigger
      // it — the score listener stays clean of net traffic.
      const scoreSensor = Bodies.rectangle(
        geo.sensor.cx,
        geo.sensor.cy,
        geo.sensor.w,
        geo.sensor.h,
        {
          isStatic: true,
          isSensor: true,
          label: 'scoreSensor',
          collisionFilter: { category: 0x0002, mask: CAT_BALL },
        },
      );

      // Net — NOT a Matter soft body. Matter constraints kept settling into
      // tangled stable configurations when a ball blew through. Instead
      // this is a procedural grid: each node has a rest position and runs
      // its own spring-damper toward it, with an explicit cap on how far
      // it can deviate. That cap mathematically prevents tangling — a node
      // can't swap places with its neighbour because it can't move more
      // than MAX_DEV pixels from rest.
      const NET_COLS = 3;
      const NET_ROWS = 3;
      const NET_DROP = 75 * HOOP_SCALE;
      const rimSpan = geo.rim.rightX - geo.rim.leftX;
      const netBottomSpan = rimSpan * 0.5;
      const netGrid = [];
      for (let row = 0; row <= NET_ROWS; row++) {
        netGrid[row] = [];
        const t = row / NET_ROWS;
        const wRow = rimSpan + (netBottomSpan - rimSpan) * t;
        const xOffsetRow = (rimSpan - wRow) / 2;
        const yRest = geo.rim.bottomY + t * NET_DROP;
        for (let col = 0; col <= NET_COLS; col++) {
          const xRest = geo.rim.leftX + xOffsetRow + (col / NET_COLS) * wRow;
          netGrid[row][col] = {
            restX: xRest,
            restY: yRest,
            x: xRest,
            y: yRest,
            vx: 0,
            vy: 0,
            isAnchor: row === 0,
          };
        }
      }

      // Pair list used both for rendering and as the visual structure of
      // the net. Verticals (one per column) + an X across each cell give
      // the woven diamond look.
      const netPairs = [];
      for (let row = 0; row < NET_ROWS; row++) {
        for (let col = 0; col <= NET_COLS; col++) {
          netPairs.push({ a: netGrid[row][col], b: netGrid[row + 1][col] });
        }
      }
      for (let row = 0; row < NET_ROWS; row++) {
        for (let col = 0; col < NET_COLS; col++) {
          netPairs.push({ a: netGrid[row][col], b: netGrid[row + 1][col + 1] });
          netPairs.push({ a: netGrid[row][col + 1], b: netGrid[row + 1][col] });
        }
      }

      // Single SVG <path> for the whole net, redrawn each frame from the
      // current node positions.
      let netPathEl = null;
      const netSvg = netSvgRef.current;
      if (netSvg) {
        while (netSvg.firstChild) netSvg.removeChild(netSvg.firstChild);
        netPathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        netPathEl.setAttribute('stroke', '#0a0a0a');
        netPathEl.setAttribute('stroke-width', '2.5');
        netPathEl.setAttribute('stroke-linecap', 'round');
        netPathEl.setAttribute('fill', 'none');
        netSvg.appendChild(netPathEl);
      }

      // Invisible return ramp — a short thin static body angled so balls
      // exiting the rim (or bouncing off the backboard) land on its right
      // side and slide back down-and-LEFT toward the ball pool, instead of
      // piling up on the floor beneath the hoop. Compact footprint: just
      // under the hoop, not a court-spanning slide. Low friction, low
      // restitution so balls don't bounce off it.
      const rampRightX = geo.rim.rightX;
      // Compact ramp under the hoop. Width capped at ~260 so it doesn't
      // sprawl across the court. Right-end Y is forced below the net's
      // visible bottom so balls fall fully through the cone before
      // hitting the ramp — otherwise they'd catch on the ramp mid-cone
      // and visibly slide out the side of the net.
      const rampLeftX = Math.max(540, rampRightX - 260);
      const netBottomY = geo.rim.bottomY + NET_DROP;
      const rampRightY = Math.max(H - 180, netBottomY + 25);
      const rampLeftY = H - 30;
      const rampDx = rampRightX - rampLeftX;
      const rampDy = rampRightY - rampLeftY;
      const ramp = rampDx > 80
        ? Bodies.rectangle(
            (rampLeftX + rampRightX) / 2,
            (rampLeftY + rampRightY) / 2,
            Math.hypot(rampDx, rampDy),
            14,
            {
              isStatic: true,
              angle: Math.atan2(rampDy, rampDx),
              friction: 0.01,
              restitution: 0.05,
              collisionFilter: { category: CAT_WALL },
              label: 'ramp',
            },
          )
        : null;

      // Ball pool — 4 × 2 grid at the bottom-left.
      // Density / air-friction tuned for easier throws (lighter ball, less
      // drag, so a normal swipe carries the ball further).
      const balls = SKILLS.map((skill, i) => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        const x = 70 + col * (BALL_RADIUS * 2 + 18);
        const y = H - BALL_RADIUS - 30 - row * (BALL_RADIUS * 2 + 18);
        return Bodies.circle(x, y, BALL_RADIUS, {
          restitution: 0.55,
          // Low friction + low air drag so balls keep momentum after the
          // ramp and roll back into the pool without help.
          friction: 0.02,
          frictionAir: 0.005,
          density: 0.0005,
          label: skill,
          collisionFilter: { category: CAT_BALL },
        });
      });

      World.add(engine.world, [
        ...walls,
        backboardMain,
        backboardSide,
        rimCapLeft,
        rimCapRight,
        scoreSensor,
        ...(ramp ? [ramp] : []),
        ...balls,
      ]);

      // Drag-to-throw via matter MouseConstraint. Stiffness bumped so the
      // ball tracks the cursor tightly during the drag — combined with the
      // velocity-capture below, throws feel responsive instead of mushy.
      const mouse = Mouse.create(court);
      const mouseConstraint = MouseConstraint.create(engine, {
        mouse,
        constraint: { stiffness: 0.45, render: { visible: false } },
      });
      World.add(engine.world, mouseConstraint);
      if (mouse.mousewheel) {
        mouse.element.removeEventListener('wheel', mouse.mousewheel);
        mouse.element.removeEventListener('DOMMouseScroll', mouse.mousewheel);
      }

      // Mouse-velocity capture: track the last ~100ms of pointer positions
      // so that on release we can overwrite the ball's velocity with the
      // actual swipe velocity. Gives a much snappier "throw" feel than the
      // spring-based release alone.
      const mouseSamples = [];
      const SAMPLE_WINDOW = 100; // ms
      const onPointerMove = (e) => {
        const now = performance.now();
        const rect = court.getBoundingClientRect();
        mouseSamples.push({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
          t: now,
        });
        while (mouseSamples.length > 0 && now - mouseSamples[0].t > SAMPLE_WINDOW) {
          mouseSamples.shift();
        }
      };
      court.addEventListener('pointermove', onPointerMove);

      Events.on(mouseConstraint, 'enddrag', (event) => {
        if (!event.body || mouseSamples.length < 2) return;
        const first = mouseSamples[0];
        const last = mouseSamples[mouseSamples.length - 1];
        const dt = (last.t - first.t) / 1000;
        if (dt <= 0.02) return;
        // px / sec → matter px / step (60 step/sec)
        let vx = ((last.x - first.x) / dt) / 60;
        let vy = ((last.y - first.y) / dt) / 60;
        // Soft cap so a frantic swipe can't break physics.
        const MAX_THROW = 28;
        const speed = Math.hypot(vx, vy);
        if (speed > MAX_THROW) {
          const k = MAX_THROW / speed;
          vx *= k;
          vy *= k;
        }
        Matter.Body.setVelocity(event.body, { x: vx, y: vy });
      });

      // Score detection — ball passing through the sensor while moving down.
      // Points: 1 casually, 2 during the arcade base phase, 3 during the
      // bonus phase. arcadeRef is updated by a separate effect so we read
      // the live value without re-binding this listener.
      Events.on(engine, 'collisionStart', (event) => {
        for (const pair of event.pairs) {
          const a = pair.bodyA;
          const b = pair.bodyB;
          const sensor =
            a.label === 'scoreSensor' ? a : b.label === 'scoreSensor' ? b : null;
          if (!sensor) continue;
          const ball = sensor === a ? b : a;
          if (ball.velocity && ball.velocity.y > 0.5) {
            // Pre-arcade warm-up throws shouldn't count — skip scoring
            // entirely while the 3-2-1-GO! countdown is on screen.
            if (countdownRef.current !== null) continue;
            const arcade = arcadeRef.current;
            let points = 1;
            if (arcade.active && arcade.timeLeft > 0) {
              points = arcade.timeLeft <= ARCADE_HIGH_PHASE
                ? ARCADE_BONUS_POINTS
                : ARCADE_BASE_POINTS;
            }
            setScore((s) => s + points);
          }
        }
      });

      // Net guide: funnels downward-moving balls toward the cone's
      // centerline so they always exit through the BOTTOM of the net.
      // The strength RAMPS IN over the first ~40px of descent — so a ball
      // entering at an angle gets its natural sideways momentum carried
      // into the top of the cone (which is what pushes the net asymmetrically,
      // i.e. a right-side swish flares the right side of the net first).
      // Deeper into the cone the guide is fully active and the ball is
      // centred for a clean exit. Held balls are exempt.
      Events.on(engine, 'beforeUpdate', () => {
        const coneCenterX = (geo.rim.leftX + geo.rim.rightX) / 2;
        const RAMP_DEPTH = 40;
        for (let i = 0; i < balls.length; i++) {
          const ball = balls[i];
          if (mouseConstraint.body === ball) continue;
          const by = ball.position.y;
          if (by < geo.rim.bottomY || by > netBottomY) continue;
          if (ball.velocity.y < 0.3) continue;
          const t = (by - geo.rim.bottomY) / NET_DROP;
          const wAtY = rimSpan + (netBottomSpan - rimSpan) * t;
          const bx = ball.position.x;
          if (Math.abs(bx - coneCenterX) > wAtY / 2 + BALL_RADIUS) continue;
          // 0 at the very top of the cone, 1 once the ball has descended
          // RAMP_DEPTH pixels. Lets the entry angle push the net first.
          const guide = Math.min(1, (by - geo.rim.bottomY) / RAMP_DEPTH);
          const dampFactor = 1 - guide * 0.6;   // 1 → 0.4
          const pullFactor = guide * 0.08;       // 0 → 0.08
          Matter.Body.setVelocity(ball, {
            x: ball.velocity.x * dampFactor + (coneCenterX - bx) * pullFactor,
            y: ball.velocity.y,
          });
        }
      });

      // Goaltend: if the user drags a ball past the no-drag line, swat it
      // away with a strong leftward velocity, force-release the mouse
      // constraint, and pop a rotating message at the ball's current
      // position. Message text cycles between three options so repeats
      // don't feel canned.
      Events.on(engine, 'beforeUpdate', () => {
        const held = mouseConstraint.body;
        if (!held) return;
        if (held.position.x <= geo.noDragX) return;
        const swatX = held.position.x;
        const swatY = held.position.y;
        // Random downward / upward jitter so repeated swats don't look canned.
        const vy = -8 - Math.random() * 4;
        Matter.Body.setVelocity(held, { x: -18, y: vy });
        // Force-release the mouse constraint so the user can't keep dragging.
        mouseConstraint.constraint.bodyB = null;
        mouseConstraint.body = null;
        const key = performance.now();
        const message = SWAT_MESSAGES[swatMessageIndexRef.current % SWAT_MESSAGES.length];
        swatMessageIndexRef.current += 1;
        setSwat({ x: swatX, y: swatY - 36, key, message });
        // Clear the popup ~1.8s later, but only if it's still the same swat
        // (a new swat would have replaced the key). Tracked in
        // swatTimeouts so unmount can cancel any pending callbacks —
        // otherwise they'd fire setSwat on an unmounted component.
        const tid = setTimeout(() => {
          swatTimeouts.delete(tid);
          setSwat((prev) => (prev && prev.key === key ? null : prev));
        }, 1800);
        swatTimeouts.add(tid);
      });

      const runner = Runner.create();
      Runner.run(runner, engine);

      let rafId = 0;
      const tick = () => {
        for (let i = 0; i < balls.length; i++) {
          const ball = balls[i];
          const el = ballRefs.current[i];
          if (el) {
            el.style.transform =
              `translate(${ball.position.x - BALL_RADIUS}px, ${ball.position.y - BALL_RADIUS}px) ` +
              `rotate(${ball.angle}rad)`;
          }
        }
        // Net — procedural spring step. Each non-anchor node pulls back to
        // its rest position; nearby balls push it away. A hard deviation
        // cap (MAX_DEV) prevents the mesh from ever entering a tangled
        // configuration: regardless of how hard a ball blows through,
        // every node stays within a small radius of where it belongs, so
        // the net always relaxes back to a clean cone.
        const NET_SPRING = 0.18;
        const NET_DAMP = 0.78;
        const NET_GRAVITY = 0.22;
        const NET_MAX_DEV = 18;
        const NET_PUSH_REACH = BALL_RADIUS + 14;
        const NET_PUSH_REACH2 = NET_PUSH_REACH * NET_PUSH_REACH;
        for (let row = 1; row <= NET_ROWS; row++) {
          const gridRow = netGrid[row];
          for (let col = 0; col <= NET_COLS; col++) {
            const node = gridRow[col];
            // Spring back to rest + a touch of gravity for natural hang.
            node.vx += (node.restX - node.x) * NET_SPRING;
            node.vy += (node.restY - node.y) * NET_SPRING + NET_GRAVITY;
            // Push from balls — radial + downward bias scaled by speed.
            for (let b = 0; b < balls.length; b++) {
              const ball = balls[b];
              const dx = node.x - ball.position.x;
              const dy = node.y - ball.position.y;
              const d2 = dx * dx + dy * dy;
              if (d2 >= NET_PUSH_REACH2 || d2 < 1) continue;
              const d = Math.sqrt(d2);
              const falloff = 1 - d / NET_PUSH_REACH;
              const speed = Math.hypot(ball.velocity.x, ball.velocity.y);
              const f = (0.9 + speed * 0.2) * falloff;
              node.vx += (dx / d) * f;
              node.vy += (dy / d) * f + 0.5 * f;
            }
            node.vx *= NET_DAMP;
            node.vy *= NET_DAMP;
            node.x += node.vx;
            node.y += node.vy;
            // Hard clamp deviation from rest. This is what prevents the
            // tangling the Matter constraint version was prone to.
            const ddx = node.x - node.restX;
            const ddy = node.y - node.restY;
            const dev2 = ddx * ddx + ddy * ddy;
            if (dev2 > NET_MAX_DEV * NET_MAX_DEV) {
              const k = NET_MAX_DEV / Math.sqrt(dev2);
              node.x = node.restX + ddx * k;
              node.y = node.restY + ddy * k;
              node.vx *= 0.4;
              node.vy *= 0.4;
            }
          }
        }
        if (netPathEl) {
          let d = '';
          for (let i = 0; i < netPairs.length; i++) {
            const p = netPairs[i];
            d += `M${p.a.x},${p.a.y}L${p.b.x},${p.b.y}`;
          }
          netPathEl.setAttribute('d', d);
        }
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);

      cleanup = () => {
        cancelAnimationFrame(rafId);
        court.removeEventListener('pointermove', onPointerMove);
        for (const tid of swatTimeouts) clearTimeout(tid);
        swatTimeouts.clear();
        Runner.stop(runner);
        World.clear(engine.world, false);
        Engine.clear(engine);
      };
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);

  // Arcade timer — decrements 1s at a time while a run is active. Clamped at
  // 0 so the end-effect can latch on it.
  useEffect(() => {
    if (!arcadeActive) return;
    const id = setInterval(() => {
      setArcadeTimeLeft((t) => Math.max(0, t - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [arcadeActive]);

  // Arcade end — when time hits 0 we stop the run, persist the high score,
  // and fire confetti if it's a beat OR the very first playthrough (no
  // previously-stored score).
  useEffect(() => {
    if (!arcadeActive || arcadeTimeLeft > 0) return;
    setArcadeActive(false);
    const isBeat = !hasHighScore || score > highScore;
    if (isBeat) {
      setHighScore(score);
      setHasHighScore(true);
      try {
        localStorage.setItem(HIGH_SCORE_KEY, String(score));
      } catch {}
      setConfettiKey((k) => k + 1);
    }
  }, [arcadeActive, arcadeTimeLeft, score, highScore, hasHighScore]);

  // Confetti — fires when confettiKey changes (skips the initial 0). Two
  // jets from the bottom corners, gravity + air drag, rotating rectangles
  // for "ribbon" pieces. Runs ~3.8s then clears.
  useEffect(() => {
    if (confettiKey === 0) return;
    const canvas = confettiCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const W = window.innerWidth;
    const H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    const colors = ['#ff3b3b', '#ffd166', '#06d6a0', '#118ab2', '#ef476f', '#fcbf49', '#0a0a0a'];
    const N_PER_SIDE = 90;
    const particles = [];
    for (let i = 0; i < N_PER_SIDE; i++) {
      // Bottom-left jet — up and to the right.
      particles.push({
        x: 0, y: H,
        vx: 5 + Math.random() * 18,
        vy: -(18 + Math.random() * 22),
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 0.4,
        color: colors[(Math.random() * colors.length) | 0],
        w: 6 + Math.random() * 8,
        h: 3 + Math.random() * 4,
      });
      // Bottom-right jet — up and to the left.
      particles.push({
        x: W, y: H,
        vx: -(5 + Math.random() * 18),
        vy: -(18 + Math.random() * 22),
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 0.4,
        color: colors[(Math.random() * colors.length) | 0],
        w: 6 + Math.random() * 8,
        h: 3 + Math.random() * 4,
      });
    }

    const DURATION = 3800;
    const start = performance.now();
    let rafId = 0;
    const tick = (now) => {
      const elapsed = now - start;
      const t = elapsed / DURATION;
      ctx.clearRect(0, 0, W, H);
      for (const p of particles) {
        p.vy += 0.45;        // gravity
        p.vx *= 0.992;       // air drag horizontal
        p.vy *= 0.997;       // mild air drag vertical
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vrot;
        const alpha = Math.max(0, 1 - Math.pow(t, 1.6));
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (elapsed < DURATION) {
        rafId = requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, W, H);
      }
    };
    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      ctx.clearRect(0, 0, W, H);
    };
  }, [confettiKey]);

  // Idempotent start/restart: zeroes everything and kicks off a fresh
  // 3-2-1-GO! countdown. Safe to call mid-countdown or mid-arcade — the
  // existing timer / countdown effects will see the deps change and clean
  // themselves up before re-running for the new state.
  const startArcade = () => {
    setArcadeActive(false);
    setScore(0);
    setArcadeTimeLeft(ARCADE_DURATION);
    setCountdown(3);
  };

  // Pre-arcade countdown ticker: 3 → 2 → 1 → 'GO!' → null. Each numeric
  // step lingers ~1s; the 'GO!' frame is a hair shorter so the real timer
  // starts feeling immediate. Setting arcadeActive happens when GO! ends.
  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 'GO!') {
      const id = setTimeout(() => {
        setCountdown(null);
        setArcadeActive(true);
      }, 600);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => {
      setCountdown((c) => (c === 1 ? 'GO!' : c - 1));
    }, 1000);
    return () => clearTimeout(id);
  }, [countdown]);

  // SVG hoop drawing — verbatim from the Figma export, translated into
  // position by the hoopGeometry() offset so it lines up with the matter
  // bodies pixel-perfect.
  const geoSvg = courtSize.W > 0 ? hoopGeometry(courtSize.W, courtSize.H) : null;

  return (
    <main className={styles.page}>
      <div className={styles.content}>
      <p className={styles.intro}>
        Hi, I&apos;m Jack{' '}
        <img src="/assets/about/eyes.png" alt="" className={styles.eyesInline} decoding="async" />{' '}
        a <span className={styles.pill}>Graphic Designer</span> from Dallas, Texas.{' '}
        <img src="/assets/about/wave.gif" alt="" className={styles.iconInline} decoding="async" />
        <br />
        I specialize in crafting thoughtful, visually engaging{' '}
        <img src="/assets/about/eye.gif" alt="" className={styles.iconInline} decoding="async" />{' '}
        solutions
        <br />
        that help brands{' '}
        <span>stand out</span>.{' '}
        <img src="/assets/about/star.gif" alt="" className={styles.iconInline} decoding="async" />{' '}
        I&apos;m passionate about clean design, creative{' '}
        <span className={styles.pillOval}>problem-solving</span>, and building digital experiences.
      </p>

      <div className={styles.court} ref={courtRef}>
        <div className={styles.score} aria-live="polite">{score}</div>

        {arcadeActive && (
          <div className={styles.timer} aria-live="polite">
            <span>{arcadeTimeLeft}</span>
            <span className={styles.multiplier}>
              ×{arcadeTimeLeft <= ARCADE_HIGH_PHASE ? ARCADE_BONUS_POINTS : ARCADE_BASE_POINTS}
            </span>
          </div>
        )}

        {countdown !== null && (
          <div
            key={String(countdown)}
            className={styles.countdown}
            aria-live="assertive"
          >
            {countdown === 'GO!' ? 'GO!' : countdown}
          </div>
        )}

        {swat && (
          <div
            key={swat.key}
            className={styles.swat}
            style={{ left: `${swat.x}px`, top: `${swat.y}px` }}
            aria-hidden
          >
            {swat.message}
          </div>
        )}

        {SKILLS.map((skill, i) => (
          <div
            key={skill}
            ref={(el) => {
              ballRefs.current[i] = el;
            }}
            className={styles.ball}
            style={{ width: BALL_RADIUS * 2, height: BALL_RADIUS * 2 }}
          >
            <span>{skill}</span>
          </div>
        ))}

        {/* Net SVG — rendered between the balls and the hoop, so the net
            strands sit on top of balls passing through but the rim is still
            painted over both. Path content is set imperatively each frame
            by the matter rAF tick (see setAttribute('d', ...)). */}
        <svg className={styles.netSvg} ref={netSvgRef} aria-hidden />

        {/* Hoop SVG rendered AFTER the balls so it sits on top in DOM
            paint order — the rim's top and bottom edges visually pass IN
            FRONT of any ball that's currently going through the rim, which
            is the "ball is behind the rim" effect the user wants. */}
        {geoSvg && (
          <svg className={styles.hoopSvg} aria-hidden>
            <g
              transform={`translate(${geoSvg.ox}, ${geoSvg.oy}) scale(${HOOP_SCALE})`}
              stroke="#0a0a0a"
              strokeWidth={2 / HOOP_SCALE}
            >
              {/* Closed shapes get the white fill so they sit opaque on top
                  of any ball passing through. The open paths (diagonal and
                  top divider) need fill="none" so the line itself doesn't
                  fill in to a wedge. */}
              <rect x="146" y="1" width="19" height="216" fill="#ffffff" />
              <rect x="165" y="91" width="23" height="62" fill="#ffffff" />
              <path d="M130 151H146V167L130 160V151Z" fill="#ffffff" />
              <rect x="1" y="151" width="129" height="9" fill="#ffffff" />
              <path d="M165 90.5L188.5 153.5" fill="none" />
              <path d="M146 43.5H164.5" fill="none" />
            </g>
          </svg>
        )}
      </div>
      </div>

      <div className={styles.arcadeControls}>
        <button
          type="button"
          className={styles.playButton}
          onClick={startArcade}
        >
          {arcadeActive || countdown !== null ? 'Restart' : 'Play'}
        </button>
        {hasHighScore && (
          <span className={styles.highScoreLabel}>
            High Score: <strong>{highScore}</strong>
          </span>
        )}
      </div>

      <canvas
        ref={confettiCanvasRef}
        className={styles.confettiCanvas}
        aria-hidden
      />
    </main>
  );
}
