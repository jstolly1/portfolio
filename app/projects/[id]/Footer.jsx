'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import styles from './Footer.module.css';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

// Springy footer: sits below the page content translated 100% down (so it's
// off-screen). When its top edge enters the viewport (user scrolls within
// 40px of where the footer should appear), ScrollTrigger fires once and
// bounces it up with an elastic ease.
export default function Footer() {
  const footerRef = useRef(null);

  useEffect(() => {
    const footer = footerRef.current;
    if (!footer) return undefined;
    gsap.set(footer, { yPercent: 100 });
    const trigger = ScrollTrigger.create({
      trigger: footer,
      start: 'top bottom-=40',
      once: true,
      onEnter: () => {
        gsap.to(footer, {
          yPercent: 0,
          duration: 1.4,
          ease: 'elastic.out(1, 0.45)',
        });
      },
    });
    return () => {
      trigger.kill();
    };
  }, []);

  return (
    <footer ref={footerRef} className={styles.footer}>
      <div className={styles.columns}>
        <div className={styles.column}>
          <span className={styles.label}>Contact</span>
          <a href="mailto:stollyj@gmail.com" className={styles.link}>
            stollyj@gmail.com
          </a>
        </div>
        <nav className={styles.column} aria-label="Footer">
          <span className={styles.label}>Site</span>
          <Link href="/about" className={styles.link}>About</Link>
          <Link href="/projects" className={styles.link}>Work</Link>
          <Link href="/contact" className={styles.link}>Contact</Link>
        </nav>
        <div className={styles.column}>
          <span className={styles.label}>Social</span>
          <a
            href="https://www.linkedin.com/"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.link}
          >
            LinkedIn
          </a>
          <a
            href="https://github.com/jstolly1"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.link}
          >
            GitHub
          </a>
        </div>
      </div>
      <div className={styles.bottomLine}>
        <span>© {new Date().getFullYear()}</span>
      </div>
    </footer>
  );
}
