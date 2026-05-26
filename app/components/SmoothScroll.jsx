'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Lenis from 'lenis';

// Paths where we want native scrolling (no Lenis at all). On these routes,
// Lenis is fully destroyed — calling `.stop()` alone leaves Lenis's wheel
// hijack in place and blocks native wheel scrolling.
const NO_LENIS_PATHS = new Set(['/', '/projects']);

let lenisInstance = null;
let rafId = 0;

function ensureLenis() {
  if (lenisInstance) return;
  lenisInstance = new Lenis({
    duration: 1.1,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
  });
  const tick = (time) => {
    lenisInstance?.raf(time);
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

function teardownLenis() {
  if (!lenisInstance) return;
  cancelAnimationFrame(rafId);
  rafId = 0;
  lenisInstance.destroy();
  lenisInstance = null;
}

export default function SmoothScroll() {
  const pathname = usePathname();

  useEffect(() => {
    if (NO_LENIS_PATHS.has(pathname)) teardownLenis();
    else ensureLenis();
  }, [pathname]);

  return null;
}
