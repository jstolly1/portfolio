'use client';

import { useEffect, useMemo, useState } from 'react';
import styles from './ProjectDetail.module.css';
import Footer from './Footer';
import ProjectsView from '../ProjectsView';

const SQUARE_TOLERANCE = 0.05;

function isSquare(aspect) {
  return Math.abs(aspect - 1) < SQUARE_TOLERANCE;
}

// Group the gallery so 1:1 images pair up side-by-side; everything else
// occupies its own full-width row. Each row is an array of { src, aspect }.
function buildLayout(gallery, aspects) {
  const rows = [];
  let pendingSquare = null;
  for (const src of gallery) {
    const aspect = aspects[src] ?? 1.5;
    if (isSquare(aspect)) {
      if (pendingSquare) {
        rows.push([pendingSquare, { src, aspect }]);
        pendingSquare = null;
      } else {
        pendingSquare = { src, aspect };
      }
    } else {
      if (pendingSquare) {
        rows.push([pendingSquare]);
        pendingSquare = null;
      }
      rows.push([{ src, aspect }]);
    }
  }
  if (pendingSquare) rows.push([pendingSquare]);
  return rows;
}

export default function ProjectDetail({ project, nextProjects }) {
  // While the user is looking at the hero (scroll near top), the bottom-
  // center menu and the bouncing-ball corner-nav stay hidden behind the
  // hero (data-hide-chrome="true" on body fades them via globals.css). Once
  // the user scrolls past ~half the hero height, they fade back in.
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    document.body.dataset.hideChrome = 'true';
    const update = () => {
      const threshold = window.innerHeight * 0.5;
      document.body.dataset.hideChrome =
        window.scrollY < threshold ? 'true' : 'false';
    };
    window.addEventListener('scroll', update, { passive: true });
    update();
    return () => {
      window.removeEventListener('scroll', update);
      document.body.dataset.hideChrome = 'false';
    };
  }, []);

  // Preload each gallery image so we know its natural aspect ratio before
  // we lay anything out — that way 1:1 images can pair up and nothing gets
  // stretched into the wrong shape.
  const [aspects, setAspects] = useState(null);
  useEffect(() => {
    const gallery = project.gallery || [];
    if (gallery.length === 0) {
      setAspects({});
      return undefined;
    }
    let cancelled = false;
    Promise.all(
      gallery.map(
        (src) =>
          new Promise((resolve) => {
            const img = new Image();
            img.onload = () =>
              resolve([src, img.naturalWidth / img.naturalHeight]);
            img.onerror = () => resolve([src, 1.5]);
            img.src = src;
          }),
      ),
    ).then((entries) => {
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
      <header className={styles.hero}>
        <img
          src={project.image}
          alt={project.title}
          className={styles.heroImage}
          draggable={false}
          decoding="async"
          fetchPriority="high"
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
                  <img
                    src={item.src}
                    alt=""
                    className={styles.galleryImage}
                    loading="lazy"
                    decoding="async"
                    draggable={false}
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
