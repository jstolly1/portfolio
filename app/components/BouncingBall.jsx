'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import styles from './BouncingBall.module.css';

const NAME = 'Jack Stolly';
const COMING_SOON = 'Coming Soon';
const MIN_DESKTOP_WIDTH = 768;
const BALL_PIXEL_RADIUS = 220;
const SPEED = 1.6;
const ROT_SPEED = 0.55;
const RESUME_DURATION = 2;
const HOLD_BEFORE_SHAKE = 1.0;
const DISCO_DURATION_MS = 4750;
const DISCO_FADE_MS = 250;
const DISCO_TOTAL_MS = DISCO_DURATION_MS + DISCO_FADE_MS;

export default function BouncingBall({ fontFamily = 'Inter' }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const fontStack = `${fontFamily}, -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif`;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0xffffff, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);

    // Env map for the disco-ball facets: bright studio with pastel washes,
    // hotspots, and pinpoint sparkles that bloom into stars.
    function makeEnvMap() {
      const c = document.createElement('canvas');
      c.width = 1024; c.height = 512;
      const ctx = c.getContext('2d');

      const grad = ctx.createLinearGradient(0, 0, 0, c.height);
      grad.addColorStop(0.0, '#b8bcc6');
      grad.addColorStop(0.3, '#dde0e6');
      grad.addColorStop(0.55, '#c0c4cc');
      grad.addColorStop(0.8, '#8c9098');
      grad.addColorStop(1.0, '#5e6268');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, c.width, c.height);

      const washes = [
        { x: 0.12, y: 0.32, r: 280, color: 'rgba(255, 180, 200, 0.55)' },
        { x: 0.40, y: 0.20, r: 320, color: 'rgba(180, 220, 255, 0.55)' },
        { x: 0.70, y: 0.40, r: 300, color: 'rgba(220, 200, 255, 0.55)' },
        { x: 0.92, y: 0.25, r: 260, color: 'rgba(255, 230, 180, 0.50)' },
        { x: 0.30, y: 0.70, r: 280, color: 'rgba(190, 255, 220, 0.40)' },
        { x: 0.80, y: 0.72, r: 260, color: 'rgba(255, 210, 230, 0.40)' },
      ];
      for (const t of washes) {
        const cx = t.x * c.width;
        const cy = t.y * c.height;
        const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, t.r);
        rg.addColorStop(0, t.color);
        rg.addColorStop(1, t.color.replace(/[\d.]+\)$/, '0)'));
        ctx.fillStyle = rg;
        ctx.fillRect(cx - t.r, cy - t.r, t.r * 2, t.r * 2);
      }

      const hots = [
        { x: 0.22, y: 0.18, r: 70 },
        { x: 0.55, y: 0.10, r: 90 },
        { x: 0.82, y: 0.22, r: 65 },
        { x: 0.45, y: 0.55, r: 55 },
        { x: 0.10, y: 0.50, r: 50 },
        { x: 0.65, y: 0.62, r: 55 },
      ];
      for (const h of hots) {
        const cx = h.x * c.width;
        const cy = h.y * c.height;
        const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, h.r);
        rg.addColorStop(0, 'rgba(255,255,255,1)');
        rg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = rg;
        ctx.fillRect(cx - h.r, cy - h.r, h.r * 2, h.r * 2);
      }

      for (let i = 0; i < 380; i++) {
        const x = Math.random() * c.width;
        const y = Math.random() * c.height * 0.92;
        const r = 2 + Math.random() * 11;
        const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
        rg.addColorStop(0, 'rgba(255,255,255,1)');
        rg.addColorStop(0.3, 'rgba(255,255,255,0.9)');
        rg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = rg;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }

      const tex = new THREE.CanvasTexture(c);
      tex.mapping = THREE.EquirectangularReflectionMapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envMap = pmrem.fromEquirectangular(tex).texture;
      tex.dispose();
      pmrem.dispose();
      return envMap;
    }
    const envMap = makeEnvMap();

    // Flat-quad lat/long disco geometry with brick-offset rows and tile insets.
    function sphToCart(lat, lon, r) {
      const cl = Math.cos(lat);
      return [r * cl * Math.cos(lon), r * Math.sin(lat), r * cl * Math.sin(lon)];
    }
    function buildDiscoGeometry(radius, rows, cols) {
      const positions = []; const normals = []; const colors = []; const indices = [];
      const tileColor = new THREE.Color();
      for (let i = 0; i < rows; i++) {
        const lat0 = (i / rows) * Math.PI - Math.PI / 2;
        const lat1 = ((i + 1) / rows) * Math.PI - Math.PI / 2;
        const cosFactor = Math.cos((lat0 + lat1) / 2);
        const lonShift = (i % 2) * (Math.PI / cols);
        const effectiveCols = Math.max(4, Math.round(cols * Math.max(0.25, cosFactor)));
        for (let j = 0; j < effectiveCols; j++) {
          const lon0 = (j / effectiveCols) * Math.PI * 2 + lonShift;
          const lon1 = ((j + 1) / effectiveCols) * Math.PI * 2 + lonShift;
          const inset = 0.04;
          const dlat = (lat1 - lat0) * inset;
          const dlon = (lon1 - lon0) * inset;
          const la0 = lat0 + dlat, la1 = lat1 - dlat;
          const lo0 = lon0 + dlon, lo1 = lon1 - dlon;
          const c00 = sphToCart(la0, lo0, radius);
          const c01 = sphToCart(la0, lo1, radius);
          const c11 = sphToCart(la1, lo1, radius);
          const c10 = sphToCart(la1, lo0, radius);
          const center = sphToCart((la0 + la1) / 2, (lo0 + lo1) / 2, 1);
          if (Math.random() < 0.78) {
            const v = 0.93 + Math.random() * 0.07;
            tileColor.setRGB(v, v, v);
          } else {
            tileColor.setHSL(Math.random(), 0.18 + Math.random() * 0.2, 0.84 + Math.random() * 0.08);
          }
          const baseIdx = positions.length / 3;
          for (const c of [c00, c01, c11, c10]) {
            positions.push(c[0], c[1], c[2]);
            normals.push(center[0], center[1], center[2]);
            colors.push(tileColor.r, tileColor.g, tileColor.b);
          }
          indices.push(baseIdx, baseIdx + 1, baseIdx + 2);
          indices.push(baseIdx, baseIdx + 2, baseIdx + 3);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geo.setIndex(indices);
      return geo;
    }

    // White base texture with "Jack Stolly" at u=0.25 and "Coming Soon" at u=0.75.
    function makeBaseTexture() {
      const c = document.createElement('canvas');
      c.width = 2048; c.height = 1024;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `500 70px ${fontStack}`;
      ctx.letterSpacing = '-3px';
      ctx.fillText(NAME, c.width * 0.25, c.height * 0.5);
      ctx.fillText(COMING_SOON, c.width * 0.75, c.height * 0.5);
      ctx.letterSpacing = '0px';
      const tex = new THREE.CanvasTexture(c);
      tex.anisotropy = 8;
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    }

    const RADIUS = 1;
    const OUTLINE_SCALE = 1.015;
    const EFFECTIVE_RADIUS = RADIUS * OUTLINE_SCALE;
    const sphereGeo = new THREE.SphereGeometry(RADIUS, 96, 64);
    const discoGeo = buildDiscoGeometry(RADIUS, 14, 28);

    const matNormal = new THREE.MeshBasicMaterial({
      map: makeBaseTexture(),
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
    const matDisco = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      vertexColors: true,
      metalness: 1.0,
      roughness: 0.06,
      envMap,
      envMapIntensity: 1.1,
      iridescence: 0.45,
      iridescenceIOR: 1.5,
      iridescenceThicknessRange: [120, 1200],
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
    });
    const matDiscoCore = new THREE.MeshBasicMaterial({
      color: 0x0a0a12,
      toneMapped: false,
      transparent: true,
      opacity: 1,
    });
    const coreGeo = new THREE.SphereGeometry(RADIUS * 0.985, 64, 48);

    const ballGroup = new THREE.Group();
    scene.add(ballGroup);
    const ball = new THREE.Mesh(sphereGeo, matNormal);
    ballGroup.add(ball);
    const outline = new THREE.Mesh(sphereGeo, outlineMat);
    outline.scale.setScalar(OUTLINE_SCALE);
    ballGroup.add(outline);
    const discoCore = new THREE.Mesh(coreGeo, matDiscoCore);
    discoCore.visible = false;
    discoCore.renderOrder = 0;
    ballGroup.add(discoCore);
    const discoBall = new THREE.Mesh(discoGeo, matDisco);
    discoBall.visible = false;
    discoBall.renderOrder = 1;
    ballGroup.add(discoBall);

    function makeSpotTexture(rgb) {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 256;
      const ctx = c.getContext('2d');
      const rg = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
      rg.addColorStop(0.0, `rgba(${rgb}, 1)`);
      rg.addColorStop(0.4, `rgba(${rgb}, 0.45)`);
      rg.addColorStop(1.0, `rgba(${rgb}, 0)`);
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, 256, 256);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    }
    const spotlightColors = ['255, 80, 160', '80, 200, 255', '255, 220, 100', '200, 110, 255'];
    const spotlightTextures = [];
    const spotlightPlaneGeos = [];
    const spotlights = spotlightColors.map((rgb, i) => {
      const tex = makeSpotTexture(rgb);
      spotlightTextures.push(tex);
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0,
        toneMapped: false,
      });
      const geo = new THREE.PlaneGeometry(5, 5);
      spotlightPlaneGeos.push(geo);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.z = -3;
      mesh.visible = false;
      mesh.userData = {
        phase: (i / spotlightColors.length) * Math.PI * 2,
        speedX: 0.00022 + Math.random() * 0.00018,
        speedY: 0.00016 + Math.random() * 0.00012,
      };
      scene.add(mesh);
      return mesh;
    });

    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.0, 0.35, 0.92,
    );
    composer.addPass(bloomPass);

    // Re-bake the texture once the font is actually available; the first
    // render uses fallback fonts, which would shift on font load.
    if (document.fonts && document.fonts.load) {
      document.fonts.load(`500 70px ${fontFamily}`).then(() => {
        matNormal.map.dispose();
        matNormal.map = makeBaseTexture();
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
    };
    const lastPointer = new THREE.Vector2(NaN, NaN);
    let viewWidth = 10, viewHeight = 10;
    let active = true;

    const bgNormal = new THREE.Color(0xffffff);
    const bgDisco = new THREE.Color(0x140a26);
    const bgCurrent = new THREE.Color(0xffffff);

    function resize() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      active = w >= MIN_DESKTOP_WIDTH;
      if (!active) return;
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      bloomPass.setSize(w, h);
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

    // Launch on one of the four 45° diagonals to maximize corner-hit odds.
    {
      const angle = (Math.floor(Math.random() * 4) * 0.5 + 0.25) * Math.PI;
      state.vel.set(Math.cos(angle) * SPEED, Math.sin(angle) * SPEED);
    }

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

    function onPointerDown(e) {
      if (!active) return;
      if (e.button !== undefined && e.button !== 0) return;
      screenToWorld(e.clientX, e.clientY, pointerWorld);
      lastPointer.copy(pointerWorld);
      const dx = pointerWorld.x - state.pos.x;
      const dy = pointerWorld.y - state.pos.y;
      if (dx * dx + dy * dy > EFFECTIVE_RADIUS * EFFECTIVE_RADIUS) return;
      const nowT = performance.now();
      const sinceDisco = nowT - state.discoStart;
      if (sinceDisco >= 0 && sinceDisco < DISCO_DURATION_MS) {
        state.discoStart = nowT - DISCO_DURATION_MS;
      }
      state.dragging = true;
      state.dragStart = performance.now();
      state.vel.set(0, 0);
      grabOffset.set(dx, dy);
      samples.length = 0;
      pushSample(performance.now(), state.pos.x, state.pos.y);
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

    let last = performance.now();
    let raf = 0;
    function tick(now) {
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      if (!active) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const maxX = viewWidth / 2 - EFFECTIVE_RADIUS;
      const maxY = viewHeight / 2 - EFFECTIVE_RADIUS;
      const d = discoIntensity(now);
      const timeScale = 1 - d * 0.65;

      if (!state.dragging) {
        state.pos.addScaledVector(state.vel, dt * timeScale);
        let bouncedX = false, bouncedY = false;
        if (state.pos.x > maxX) { state.pos.x = maxX; state.vel.x = -Math.abs(state.vel.x); bouncedX = true; }
        if (state.pos.x < -maxX) { state.pos.x = -maxX; state.vel.x = Math.abs(state.vel.x); bouncedX = true; }
        if (state.pos.y > maxY) { state.pos.y = maxY; state.vel.y = -Math.abs(state.vel.y); bouncedY = true; }
        if (state.pos.y < -maxY) { state.pos.y = -maxY; state.vel.y = Math.abs(state.vel.y); bouncedY = true; }
        if (bouncedX && bouncedY) { state.discoStart = now; }
        const sinceRelease = (now - state.releaseTime) / 1000;
        if (sinceRelease >= 0 && sinceRelease <= RESUME_DURATION && state.vel.lengthSq() > 1e-6) {
          const t = sinceRelease / RESUME_DURATION;
          const eased = 1 - Math.pow(1 - t, 3);
          const targetSpeed = THREE.MathUtils.lerp(state.releaseSpeed, SPEED, eased);
          state.vel.setLength(targetSpeed);
        }
      }

      let shakeX = 0, shakeY = 0, wobbleRot = 0;
      if (state.dragging) {
        const held = (now - state.dragStart) / 1000;
        if (held > HOLD_BEFORE_SHAKE) {
          const intensity = Math.min((held - HOLD_BEFORE_SHAKE) / 1.5, 1);
          const amp = intensity * 0.07;
          shakeX = Math.sin(now * 0.024) * amp + Math.sin(now * 0.041) * amp * 0.35;
          shakeY = Math.cos(now * 0.028) * amp + Math.cos(now * 0.044) * amp * 0.35;
          wobbleRot = Math.sin(now * 0.032) * 0.02 * intensity;
        }
      }
      const renderX = THREE.MathUtils.clamp(state.pos.x + shakeX, -maxX, maxX);
      const renderY = THREE.MathUtils.clamp(state.pos.y + shakeY, -maxY, maxY);
      ballGroup.position.set(renderX, renderY, 0);

      if (!state.dragging && !Number.isNaN(lastPointer.x)) {
        const dx = lastPointer.x - state.pos.x;
        const dy = lastPointer.y - state.pos.y;
        const over = dx * dx + dy * dy <= EFFECTIVE_RADIUS * EFFECTIVE_RADIUS;
        canvas.classList.toggle(styles.grabbable, over);
      }

      if (d > 0) {
        discoBall.visible = true;
        discoCore.visible = true;
        matDisco.opacity = d;
        matDiscoCore.opacity = d;
        const normalOpacity = 1 - d;
        ball.visible = normalOpacity > 0;
        outline.visible = normalOpacity > 0;
        matNormal.opacity = normalOpacity;
        outlineMat.opacity = normalOpacity;
        const bgT = d * d;
        bgCurrent.copy(bgNormal).lerp(bgDisco, bgT);
        renderer.setClearColor(bgCurrent, 1);
        const xRange = Math.max(0.5, viewWidth / 2 - 1.5);
        const yRange = Math.max(0.5, viewHeight / 2 - 1.5);
        const spotFade = d * d * d;
        for (const sl of spotlights) {
          const u = sl.userData;
          sl.position.x = Math.cos(now * u.speedX + u.phase) * xRange;
          sl.position.y = Math.sin(now * u.speedY + u.phase * 1.3) * yRange;
          sl.material.opacity = spotFade * 0.55;
          sl.visible = true;
        }
      } else {
        if (discoBall.visible) discoBall.visible = false;
        if (discoCore.visible) discoCore.visible = false;
        if (!ball.visible) ball.visible = true;
        if (!outline.visible) outline.visible = true;
        if (matNormal.opacity !== 1) matNormal.opacity = 1;
        if (outlineMat.opacity !== 1) outlineMat.opacity = 1;
        if (!bgCurrent.equals(bgNormal)) {
          bgCurrent.copy(bgNormal);
          renderer.setClearColor(bgCurrent, 1);
        }
        for (const sl of spotlights) if (sl.visible) sl.visible = false;
      }

      if (state.dragging) {
        if (wobbleRot) ballGroup.rotateOnWorldAxis(state.rotAxis, wobbleRot * dt * 60);
      } else {
        const speed = state.vel.length();
        const spin = Math.max(ROT_SPEED, (speed / SPEED) * ROT_SPEED);
        const spinBoost = 1 + d * 0.6;
        ballGroup.rotateOnWorldAxis(state.rotAxis, spin * dt * spinBoost);
      }

      const bloomOn = d >= 1;
      bloomPass.enabled = bloomOn;
      bloomPass.strength = bloomOn ? 0.28 : 0;
      composer.render();
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      sphereGeo.dispose();
      discoGeo.dispose();
      coreGeo.dispose();
      matNormal.map?.dispose();
      matNormal.dispose();
      outlineMat.dispose();
      matDisco.dispose();
      matDiscoCore.dispose();
      envMap.dispose();
      for (const t of spotlightTextures) t.dispose();
      for (const g of spotlightPlaneGeos) g.dispose();
      for (const sl of spotlights) sl.material.dispose();
      bloomPass.dispose();
      composer.dispose?.();
      renderer.dispose();
    };
  }, [fontFamily]);

  return (
    <>
      <canvas ref={canvasRef} className={styles.stage} />
      <div className={styles.mobile}>Jack Stolly</div>
    </>
  );
}
