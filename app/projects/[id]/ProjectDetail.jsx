'use client';

import { useEffect, useMemo, useState } from 'react';
import styles from './ProjectDetail.module.css';
import Footer from './Footer';
import ProjectsView from '../ProjectsView';
import ProjectMedia, { isVideoSrc } from '../ProjectMedia';

// Two consecutive gallery items pair into a 50/50 row when they're both
// "portrait-or-square" (aspect <= 1.05) AND share nearly the same aspect ratio,
// so the pair has matching heights with no ragged edge. This pairs true squares
// as well as equal portrait pairs (e.g. two 4:5 frames). Landscapes — and any
// item without a close-aspect neighbour — take their own full-width row.
const PAIR_MAX_ASPECT = 1.05;
const ASPECT_MATCH_TOLERANCE = 0.08;

function isPairable(aspect) {
  return aspect <= PAIR_MAX_ASPECT;
}

// Each row is an array of { src, aspect } — one item (full-width) or two (50/50).
function buildLayout(gallery, aspects) {
  const rows = [];
  let pending = null; // a pairable item awaiting a close-aspect partner
  const flushPending = () => {
    if (pending) {
      rows.push([pending]);
      pending = null;
    }
  };
  for (const src of gallery) {
    const aspect = aspects[src] ?? 1.5;
    if (!isPairable(aspect)) {
      flushPending();
      rows.push([{ src, aspect }]);
    } else if (pending && Math.abs(pending.aspect - aspect) <= ASPECT_MATCH_TOLERANCE) {
      rows.push([pending, { src, aspect }]);
      pending = null;
    } else {
      flushPending();
      pending = { src, aspect };
    }
  }
  flushPending();
  return rows;
}

export default function ProjectDetail({ project, nextProjects }) {
  // On detail pages the top nav rides *on top of* the hero image and stays
  // visible for the whole page (data-detail-hero="true" promotes it above the
  // hero and keeps it from fading — see globals.css). The bouncing-ball
  // corner-nav behaves differently: it stays hidden behind the hero while the
  // user is near the top (data-hide-chrome="true") and fades back in once they
  // scroll past ~half the hero height.
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    document.body.dataset.detailHero = 'true';
    document.body.dataset.hideChrome = 'true';
    document.body.dataset.heroMeta = 'show';
    document.body.dataset.heroLine = 'show';
    const update = () => {
      const threshold = window.innerHeight * 0.5;
      document.body.dataset.hideChrome =
        window.scrollY < threshold ? 'true' : 'false';
      // The side meta labels belong to the hero only — hide them the instant
      // the user scrolls away from the very top.
      document.body.dataset.heroMeta = window.scrollY < 24 ? 'show' : 'hide';
      // The nav's white underline rides with the hero — fade it out as the
      // user scrolls out of the hero (near the bottom of the first viewport).
      document.body.dataset.heroLine =
        window.scrollY < window.innerHeight * 0.85 ? 'show' : 'hide';
    };
    window.addEventListener('scroll', update, { passive: true });
    update();
    return () => {
      window.removeEventListener('scroll', update);
      document.body.dataset.hideChrome = 'false';
      delete document.body.dataset.detailHero;
      delete document.body.dataset.heroMeta;
    };
  }, []);

  // Preload each gallery item so we know its natural aspect ratio before we
  // lay anything out — that way 1:1 items can pair up and nothing gets
  // stretched. Videos report dimensions via loadedmetadata; images via Image().
  const [aspects, setAspects] = useState(null);
  useEffect(() => {
    const gallery = project.gallery || [];
    if (gallery.length === 0) {
      setAspects({});
      return undefined;
    }
    let cancelled = false;
    const measure = (src) =>
      new Promise((resolve) => {
        if (isVideoSrc(src)) {
          const v = document.createElement('video');
          v.preload = 'metadata';
          v.muted = true;
          v.onloadedmetadata = () =>
            resolve([src, v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : 1.5]);
          v.onerror = () => resolve([src, 1.5]);
          v.src = src;
        } else {
          const img = new Image();
          img.onload = () => resolve([src, img.naturalWidth / img.naturalHeight]);
          img.onerror = () => resolve([src, 1.5]);
          img.src = src;
        }
      });
    Promise.all(gallery.map(measure)).then((entries) => {
      if (!cancelled) setAspects(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [project.gallery]);

  const rows = useMemo(
    () => (aspects ? buildLayout(project.gallery || [], aspects) : null),
    [project.gallery, aspects],
  );

  return (
    <article className={styles.page}>
      {/* Full-width white rule sitting just beneath the top nav, layered over
          the hero image. */}
      <div className={styles.navRule} aria-hidden="true" />

      {/* Small meta labels hugging the left/right screen edges, on the hero
          only. Shared placeholder values for now — move to per-project fields
          in data.js when the real metadata is ready. */}
      <aside className={styles.heroMeta} aria-hidden="true">
        <div className={styles.heroMetaLeft}>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Created</span>
            <span className={styles.metaValue}>2024</span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Media</span>
            <span className={styles.metaValue}>Digital</span>
          </div>
        </div>
        <div className={styles.heroMetaRight}>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Focus</span>
            <span className={styles.metaValue}>Typography</span>
            <span className={styles.metaValue}>Branding</span>
            <span className={styles.metaValue}>Identity</span>
          </div>
        </div>
      </aside>

      <header className={styles.hero}>
        <ProjectMedia
          src={project.image}
          alt={project.title}
          className={styles.heroImage}
          eager
          priority
          autoplay
        />
      </header>

      <section className={styles.body}>
        {project.body.map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </section>

      <section className={styles.gallery}>
        {rows &&
          rows.map((row, i) => (
            <div
              key={i}
              className={row.length === 2 ? styles.galleryPair : styles.galleryRow}
            >
              {row.map((item) => (
                <figure key={item.src} className={styles.galleryItem}>
                  <ProjectMedia
                    src={item.src}
                    alt=""
                    className={styles.galleryImage}
                    autoplay
                  />
                </figure>
              ))}
            </div>
          ))}
      </section>

      {nextProjects && nextProjects.length > 0 && (
        <ProjectsView projects={nextProjects} embedded />
      )}

      <Footer />
    </article>
  );
}
