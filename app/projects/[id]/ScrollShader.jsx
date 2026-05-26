'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

// Vertex shader: very subtle vertical bend. The middle column of the plane
// lifts / drops by sin(uv.x * π) * uVelocity * SMALL, so the left/right
// edges stay anchored and the center floats slightly as you scroll.
const vertexShader = /* glsl */ `
  uniform float uVelocity;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec3 pos = position;
    float bend = sin(uv.x * 3.14159) * uVelocity * 0.025;
    pos.y += bend;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

// Fragment shader: tiny vertical RGB chromatic-aberration so the only sign
// of the shader at rest is a touch of color fringe when you're scrolling
// fast. Magnitude is intentionally minuscule.
const fragmentShader = /* glsl */ `
  uniform sampler2D uTexture;
  uniform float uVelocity;
  varying vec2 vUv;

  void main() {
    vec2 uv = vUv;
    float offset = uVelocity * 0.0025;
    float r = texture2D(uTexture, vec2(uv.x, uv.y + offset)).r;
    vec4 g = texture2D(uTexture, uv);
    float b = texture2D(uTexture, vec2(uv.x, uv.y - offset)).b;
    gl_FragColor = vec4(r, g.g, b, g.a);
  }
`;

export default function ScrollShader({ src, aspectRatio = 1.5 }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return undefined;

    let mounted = true;
    let visible = false;
    let rafId = 0;
    const resources = {};
    let lastY = typeof window !== 'undefined' ? window.scrollY : 0;
    let rawVel = 0;
    let smoothedVel = 0;

    // Schedule the next frame only when there's something to do: we're
    // visible, the renderer is ready, and either velocity is non-trivial or
    // we just received a wake-up signal (scroll, resize, visibility flip).
    const requestFrame = () => {
      if (rafId || !mounted || !visible || !resources.renderer) return;
      rafId = requestAnimationFrame(tick);
    };

    const tick = () => {
      rafId = 0;
      if (!mounted || !visible || !resources.material) return;
      smoothedVel += (rawVel * 0.04 - smoothedVel) * 0.18;
      rawVel *= 0.82;
      resources.material.uniforms.uVelocity.value = smoothedVel;
      resources.renderer.render(resources.scene, resources.camera);
      // Keep ticking only while the shader still has a signal to ride out.
      // Once velocity settles below the threshold the loop sleeps until the
      // next scroll/resize/visibility event fires requestFrame again.
      if (Math.abs(smoothedVel) > 0.001 || Math.abs(rawVel) > 0.5) {
        rafId = requestAnimationFrame(tick);
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const wasVisible = visible;
          visible = entry.isIntersecting;
          if (visible && !wasVisible) {
            requestFrame();
          } else if (!visible && rafId) {
            cancelAnimationFrame(rafId);
            rafId = 0;
          }
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(wrap);

    const onScroll = () => {
      const y = window.scrollY;
      rawVel = y - lastY;
      lastY = y;
      if (visible) requestFrame();
    };
    const onResize = () => {
      if (!resources.renderer) return;
      const rect = wrap.getBoundingClientRect();
      resources.renderer.setSize(rect.width, rect.height, false);
      requestFrame();
    };

    const loader = new THREE.TextureLoader();
    loader.crossOrigin = 'anonymous';
    loader.load(src, (texture) => {
      if (!mounted) {
        texture.dispose();
        return;
      }
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.colorSpace = THREE.SRGBColorSpace;
      resources.texture = texture;

      const renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      resources.renderer = renderer;

      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
      camera.position.z = 1;
      resources.scene = scene;
      resources.camera = camera;

      const geometry = new THREE.PlaneGeometry(2, 2, 48, 48);
      resources.geometry = geometry;

      const material = new THREE.ShaderMaterial({
        uniforms: {
          uTexture: { value: texture },
          uVelocity: { value: 0 },
        },
        vertexShader,
        fragmentShader,
      });
      resources.material = material;

      const mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);

      onResize();
      window.addEventListener('resize', onResize);
      window.addEventListener('scroll', onScroll, { passive: true });

      // Paint the resting frame so the image is visible without waiting for
      // a scroll event.
      requestFrame();
    });

    return () => {
      mounted = false;
      if (rafId) cancelAnimationFrame(rafId);
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      if (resources.geometry) resources.geometry.dispose();
      if (resources.material) resources.material.dispose();
      if (resources.texture) resources.texture.dispose();
      if (resources.renderer) resources.renderer.dispose();
    };
  }, [src]);

  return (
    <div
      ref={wrapRef}
      style={{
        aspectRatio: String(aspectRatio),
        width: '100%',
        position: 'relative',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
    </div>
  );
}
