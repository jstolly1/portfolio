'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import useEmblaCarousel from 'embla-carousel-react';
import WheelGesturesPlugin from 'embla-carousel-wheel-gestures';
import gsap from 'gsap';
import styles from './Projects.module.css';
import { projects as defaultProjects } from './data';

// How much each image shifts within its card as the carousel scrolls.
// At ±1 snap away from centered, the image shifts ±10% of its own width.
const PARALLAX_TWEEN_BASE = 0.1;

// `projects` arrives as a prop from app/projects/page.js with each card's
// hero image already resolved from disk. The data.js import is only used
// as a defensive fallback in case the component is ever mounted without
// the prop (e.g. during a Fast Refresh edge case).
//
// `embedded` switches off behaviors that only make sense for the standalone
// /projects page: the body scroll lock, the roulette spin entrance, the
// initial hide/scale-down state, and the motion blur. When embedded the
// carousel renders at its final resting state inside the detail page's
// flow, and the user can drag/swipe/click the same way they would on the
// main page.
export default function ProjectsView({ projects = defaultProjects, embedded = false }) {
  const router = useRouter();
  // WheelGesturesPlugin converts vertical wheel deltas into horizontal
  // carousel scroll. That's desirable on the standalone /projects page
  // (body scroll is locked, so the wheel has nothing else to do) but
  // would hijack vertical page scroll on the embedded "next project"
  // section of a detail page. Skipping the plugin when embedded lets the
  // page scroll naturally past the carousel.
  const [emblaRef, emblaApi] = useEmblaCarousel(
    {
      loop: true,
      align: 'center',
      dragFree: false,
      containScroll: false,
      duration: 28,
    },
    embedded ? [] : [WheelGesturesPlugin()],
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const current = projects[activeIndex];

  const imageNodesRef = useRef([]);
  const cardNodesRef = useRef([]);
  const tweenFactorRef = useRef(0);
  const stageRef = useRef(null);
  const carouselRef = useRef(null);
  const headerRef = useRef(null);
  const btnRef = useRef(null);
  const blurFilterRef = useRef(null);
  const overlayRef = useRef(null);
  // When non-null, an image overlay is rendered as a direct child of .stage
  // (not via portal — putting it inside .stage at a z-index *below* the
  // ellipses lets the curves mask it the same way they mask the original
  // card, so the image doesn't visually pop above the ellipses on click).
  // .stage itself has no transform, so position: fixed on the overlay still
  // resolves to viewport coords — embla's transformed container is a sibling
  // sub-tree, not an ancestor of this overlay.
  const [overlayProject, setOverlayProject] = useState(null);

  // Lock body scroll while mounted — only on the standalone /projects page.
  // When embedded inside a detail page the visitor must still be able to
  // scroll vertically past the carousel.
  useEffect(() => {
    if (embedded) return undefined;
    document.body.classList.add('no-scroll');
    return () => document.body.classList.remove('no-scroll');
  }, [embedded]);

  // Initial state — set before first paint so nothing flashes at final position.
  // Carousel starts invisible and pre-blurred; header + button also invisible
  // and reveal once the spin lands on Project 1. Embedded mode skips this
  // entirely so the carousel renders at its final state immediately.
  useLayoutEffect(() => {
    if (embedded) return;
    if (headerRef.current) {
      gsap.set(headerRef.current, { opacity: 0 });
    }
    if (btnRef.current) {
      gsap.set(btnRef.current, { opacity: 0 });
    }
    if (blurFilterRef.current) {
      blurFilterRef.current.setAttribute('stdDeviation', '16 0');
    }
    if (stageRef.current) {
      // Circular reveal mask — collapses the stage to a point at center so
      // the scale-up appears to "expand outward in every direction" rather
      // than as a tiny constrained box. Grows past the corners on enter.
      gsap.set(stageRef.current, { clipPath: 'circle(0% at 50% 50%)' });
    }
    if (carouselRef.current) {
      gsap.set(carouselRef.current, {
        opacity: 0,
        scale: 0.12,
        transformOrigin: '50% 50%',
        filter: 'url(#projects-motion-blur)',
      });
    }
  }, [embedded]);

  // Roulette entrance:
  //  • Stage clip-path circle expands from 0% → 150% (covers the corners) so
  //    the reveal grows outward from center in every direction
  //  • Carousel fades in (opacity 0 → 1) and scales up from really tiny
  //    (0.12 → 1.0) with ease-out (1.05s)
  //  • Carousel spins 2 full loops (18 slides), decelerating, ending on Project 1
  //  • Horizontal motion blur drops from 16 → 0 across the spin (0.85s) so the
  //    blur tail matches the spin deceleration
  //  • Header + button fade in as the spin lands
  useEffect(() => {
    if (embedded) return undefined;
    if (!emblaApi || !carouselRef.current || !headerRef.current || !btnRef.current) {
      return undefined;
    }

    const carousel = carouselRef.current;
    const header = headerRef.current;
    const btn = btnRef.current;
    const stage = stageRef.current;

    // Circular reveal — expands outward from center to cover the viewport.
    if (stage) {
      gsap.to(stage, {
        clipPath: 'circle(150% at 50% 50%)',
        duration: 1.05,
        ease: 'power3.out',
        onComplete: () => {
          gsap.set(stage, { clipPath: 'none' });
        },
      });
    }

    // Fade + scale up — slows on its own via power3.out ease.
    gsap.to(carousel, {
      opacity: 1,
      scale: 1,
      duration: 1.05,
      ease: 'power3.out',
    });

    // Motion blur — horizontal-only via SVG feGaussianBlur. Tracks spin
    // velocity (high at start, zero by the time the wheel settles).
    const blurState = { value: 16 };
    gsap.to(blurState, {
      value: 0,
      duration: 0.85,
      ease: 'power3.out',
      onUpdate: () => {
        if (blurFilterRef.current) {
          blurFilterRef.current.setAttribute(
            'stdDeviation',
            `${blurState.value} 0`,
          );
        }
      },
      onComplete: () => {
        gsap.set(carousel, { filter: 'none' });
      },
    });

    // 18 steps = 2 full revolutions, landing back on slide 0 (Project 1).
    // Ease-out cubic on step delays stretches them as the spin slows.
    // Tuned so the last scrollNext fires right as the slide-in tween completes
    // (~850ms): T_18 ≈ 20 + 17*5 + 12.99*57 ≈ 845ms.
    const TOTAL_STEPS = 18;
    const BASE_DELAY = 5;   // ms — fastest step at the start
    const RAMP = 57;        // ms — extra delay at the end (slowest)

    let step = 0;
    let timer = null;

    const tick = () => {
      if (step >= TOTAL_STEPS) {
        gsap.to([header, btn], {
          opacity: 1,
          duration: 0.25,
          ease: 'power3.out',
        });
        return;
      }
      emblaApi.scrollNext();
      step++;
      const p = step / TOTAL_STEPS;
      const eased = 1 - Math.pow(1 - p, 3);
      timer = setTimeout(tick, BASE_DELAY + eased * RAMP);
    };

    timer = setTimeout(tick, 20);

    return () => { if (timer) clearTimeout(timer); };
  }, [emblaApi, embedded]);

  // Track centered slide → header + corner-ball spin.
  useEffect(() => {
    if (!emblaApi) return undefined;
    const onSelect = () => {
      const idx = emblaApi.selectedScrollSnap();
      setActiveIndex(idx);
      window.dispatchEvent(
        new CustomEvent('project-advance', { detail: { index: idx } }),
      );
    };
    emblaApi.on('select', onSelect);
    onSelect();
    return () => { emblaApi.off('select', onSelect); };
  }, [emblaApi]);

  // Fallback custom wheel handler in case the plugin isn't picking up events
  // — accumulates deltaY and steps the carousel one slide at a time. Also
  // skipped in embedded mode for the same reason the plugin is.
  useEffect(() => {
    if (embedded) return undefined;
    if (!emblaApi) return undefined;
    const viewport = emblaApi.rootNode();
    if (!viewport) return undefined;

    let accum = 0;
    let lastTime = 0;
    const THRESHOLD = 80;

    const onWheel = (e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      const now = performance.now();
      if (now - lastTime > 200) accum = 0;
      lastTime = now;
      accum += e.deltaY;
      while (Math.abs(accum) >= THRESHOLD) {
        if (accum > 0) emblaApi.scrollNext();
        else emblaApi.scrollPrev();
        accum -= Math.sign(accum) * THRESHOLD;
      }
    };

    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', onWheel);
  }, [emblaApi, embedded]);

  // Parallax: shift each card's image horizontally based on the slide's
  // distance from the centered snap. Loop-aware so wrap points don't pop.
  const setImageNodes = useCallback((api) => {
    imageNodesRef.current = api.slideNodes().map((slide) =>
      slide.querySelector(`.${styles.cardImage}`),
    );
  }, []);

  const setTweenFactor = useCallback((api) => {
    tweenFactorRef.current = PARALLAX_TWEEN_BASE * api.scrollSnapList().length;
  }, []);

  const tweenParallax = useCallback((api, eventName) => {
    const engine = api.internalEngine();
    const scrollProgress = api.scrollProgress();
    const slidesInView = api.slidesInView();
    const isScrollEvent = eventName === 'scroll';

    api.scrollSnapList().forEach((scrollSnap, snapIndex) => {
      let diffToTarget = scrollSnap - scrollProgress;
      const slidesInSnap = engine.slideRegistry[snapIndex];

      slidesInSnap.forEach((slideIndex) => {
        if (isScrollEvent && !slidesInView.includes(slideIndex)) return;

        if (engine.options.loop) {
          engine.slideLooper.loopPoints.forEach((loopItem) => {
            const target = loopItem.target();
            if (slideIndex === loopItem.index && target !== 0) {
              const sign = Math.sign(target);
              if (sign === -1) diffToTarget = scrollSnap - (1 + scrollProgress);
              if (sign === 1) diffToTarget = scrollSnap + (1 - scrollProgress);
            }
          });
        }

        const translate = diffToTarget * (-1) * tweenFactorRef.current * 100;
        const node = imageNodesRef.current[slideIndex];
        if (node) node.style.setProperty('--parallax-x', `${translate}%`);
      });
    });
  }, []);

  useEffect(() => {
    if (!emblaApi) return undefined;
    setImageNodes(emblaApi);
    setTweenFactor(emblaApi);
    tweenParallax(emblaApi);
    emblaApi
      .on('reInit', setImageNodes)
      .on('reInit', setTweenFactor)
      .on('reInit', tweenParallax)
      .on('scroll', tweenParallax)
      .on('slideFocus', tweenParallax);
    return () => {
      emblaApi
        .off('reInit', setImageNodes)
        .off('reInit', setTweenFactor)
        .off('reInit', tweenParallax)
        .off('scroll', tweenParallax)
        .off('slideFocus', tweenParallax);
    };
  }, [emblaApi, setImageNodes, setTweenFactor, tweenParallax]);

  // Sweep the top ellipse up and the bottom ellipse down off the viewport,
  // at the same time send the left/right neighbor cards out sideways (left
  // card to the left, right card to the right), and stretch the active card's
  // bounds outward so its left edge runs to 0 and its right edge to 100vw —
  // all on the same 0.7s power3.inOut timeline. Then navigate.
  const goToProject = useCallback(
    (index) => {
      const project = projects[index];
      if (!project) return;
      const stage = stageRef.current;
      if (!stage) {
        router.push(`/projects/${project.id}`);
        return;
      }

      const n = cardNodesRef.current.length;
      const activeIdx = emblaApi ? emblaApi.selectedScrollSnap() : index;
      const leftCard = n > 0 ? cardNodesRef.current[(activeIdx - 1 + n) % n] : null;
      const rightCard = n > 0 ? cardNodesRef.current[(activeIdx + 1) % n] : null;
      const activeCard = n > 0 ? cardNodesRef.current[activeIdx] : null;
      const activeRect = activeCard ? activeCard.getBoundingClientRect() : null;

      // Hide the active card's painted contents (visibility, not display, so
      // its slot in embla flow is preserved). The overlay rendered below
      // paints the image in its place and animates it outward.
      if (activeCard) {
        activeCard.style.visibility = 'hidden';
      }
      setOverlayProject({ project, rect: activeRect });

      // Hide the global page chrome (bottom-center menu + bouncing ball) for
      // the duration of the transition (and beyond, until the detail page
      // decides otherwise based on scroll position).
      if (typeof document !== 'undefined') {
        document.body.dataset.hideChrome = 'true';
      }

      const tl = gsap.timeline({
        onComplete: () => {
          router.push(`/projects/${project.id}`);
        },
      });

      // Top ellipse sweeps up off the top of the viewport, bottom ellipse
      // sweeps down off the bottom — animated via CSS custom properties that
      // .stage::before / .stage::after read from. The shift value goes from
      // 0 to -110vh which guarantees the ellipses fully clear the viewport.
      tl.to(
        stage,
        {
          '--curve-top-shift': '-110vh',
          '--curve-bottom-shift': '-110vh',
          duration: 0.7,
          ease: 'power3.inOut',
        },
        0,
      );

      // Fade the page chrome (header text + View Project button) — the
      // ellipses and side cards stay opaque so their motion is visible as
      // they slide out of frame.
      const fadeTargets = [headerRef.current, btnRef.current].filter(Boolean);
      if (fadeTargets.length) {
        tl.to(
          fadeTargets,
          {
            opacity: 0,
            duration: 0.4,
            ease: 'power2.out',
          },
          0,
        );
      }

      if (leftCard) {
        tl.to(
          leftCard,
          { x: '-110vw', duration: 0.7, ease: 'power3.inOut' },
          0,
        );
      }
      if (rightCard) {
        tl.to(
          rightCard,
          { x: '110vw', duration: 0.7, ease: 'power3.inOut' },
          0,
        );
      }
    },
    [emblaApi, router],
  );

  // Animate the overlay's clip-path from the captured card rect out to a
  // full-viewport inset(0), and simultaneously zoom the project title in
  // from huge ("behind the camera") to its final normal size as the image
  // finishes growing.
  useLayoutEffect(() => {
    if (!overlayProject) return undefined;
    const overlay = overlayRef.current;
    if (!overlay) return undefined;
    const rect = overlayProject.rect;
    if (!rect) return undefined;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    gsap.set(overlay, {
      clipPath: `inset(${rect.top}px ${vw - rect.right}px ${vh - rect.bottom}px ${rect.left}px)`,
    });
    const tl = gsap.timeline();
    tl.to(
      overlay,
      {
        clipPath: 'inset(0px 0px 0px 0px)',
        duration: 0.7,
        ease: 'power3.inOut',
      },
      0,
    );
    return () => {
      tl.kill();
    };
  }, [overlayProject]);

  const handleSlideClick = useCallback(
    (index) => {
      if (!emblaApi) return;
      if (typeof emblaApi.clickAllowed === 'function' && !emblaApi.clickAllowed()) return;
      if (index === emblaApi.selectedScrollSnap()) {
        goToProject(index);
      } else {
        emblaApi.scrollTo(index);
      }
    },
    [emblaApi, goToProject],
  );

  return (
    <div className={styles.stage} ref={stageRef}>
      <svg
        aria-hidden="true"
        style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }}
      >
        <defs>
          <filter
            id="projects-motion-blur"
            x="-10%"
            y="-10%"
            width="120%"
            height="120%"
          >
            <feGaussianBlur ref={blurFilterRef} stdDeviation="0 0" />
          </filter>
        </defs>
      </svg>

      <header className={styles.header} ref={headerRef}>
        <h1>{current.title}</h1>
        <p>{current.description}</p>
      </header>

      <section className={styles.carousel} ref={carouselRef}>
        <div className={styles.embla} ref={emblaRef}>
          <div className={styles.emblaContainer}>
            {projects.map((p, i) => (
              <div key={p.id} className={styles.emblaSlide}>
                <button
                  type="button"
                  ref={(el) => {
                    cardNodesRef.current[i] = el;
                  }}
                  className={styles.card}
                  onClick={() => handleSlideClick(i)}
                  aria-label={`Open ${p.title}`}
                >
                  <img
                    src={p.image}
                    alt={p.title}
                    className={styles.cardImage}
                    draggable={false}
                    decoding="async"
                    loading={i === 0 ? 'eager' : 'lazy'}
                  />
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <button
        className={styles.viewBtn}
        type="button"
        ref={btnRef}
        onClick={() => goToProject(activeIndex)}
      >
        View Project
      </button>

      {overlayProject && (
        <div ref={overlayRef} className={styles.transitionOverlay}>
          <img
            src={overlayProject.project.image}
            alt=""
            className={styles.transitionImage}
            draggable={false}
          />
        </div>
      )}
    </div>
  );
}
