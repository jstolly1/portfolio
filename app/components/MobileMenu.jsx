'use client';

// Mobile-only navigation: a top-right hamburger that morphs to an X and a
// big-letter panel that slides in from the right. Hidden on desktop (the
// inline top nav handles that). Rendered globally from the layout.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from './MobileMenu.module.css';

// Scroll to the one-page homepage sections (or navigate home + scroll from a
// detail page). Hash anchors match the section ids in MobileHome.
const items = [
  { href: '/#about', label: 'About' },
  { href: '/#work', label: 'Work' },
  { href: '/#contact', label: 'Contact' },
];

export default function MobileMenu() {
  const [open, setOpen] = useState(false);

  // Lock body scroll while the panel is open.
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <div className={styles.root}>
      <button
        type="button"
        className={styles.toggle}
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`${styles.bar} ${open ? styles.barTop : ''}`} />
        <span className={`${styles.bar} ${open ? styles.barMid : ''}`} />
        <span className={`${styles.bar} ${open ? styles.barBot : ''}`} />
      </button>

      <div
        className={`${styles.backdrop} ${open ? styles.backdropOpen : ''}`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      <nav
        className={`${styles.panel} ${open ? styles.panelOpen : ''}`}
        aria-label="Mobile navigation"
      >
        {items.map(({ href, label }, i) => (
          <Link
            key={href}
            href={href}
            className={styles.link}
            style={{ transitionDelay: open ? `${140 + i * 60}ms` : '0ms' }}
            onClick={() => setOpen(false)}
          >
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
