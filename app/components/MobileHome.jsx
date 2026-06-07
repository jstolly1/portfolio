'use client';

// Mobile-only homepage — a single scrollable page (brunocis.co style):
// marbles hero → About → Work → Contact. Rendered by app/page.js (which passes
// the disk-enriched projects). Hidden on desktop, where the Three.js ball +
// separate routes take over. The hamburger (MobileMenu) scrolls to #about /
// #work / #contact.

import Link from 'next/link';
import NameMarbles from './NameMarbles';
import ProjectMedia from '../projects/ProjectMedia';
import styles from './MobileHome.module.css';

export default function MobileHome({ projects = [] }) {
  return (
    <div className={styles.root}>
      <section className={styles.hero}>
        <NameMarbles />
        <div className={styles.scrollCue} aria-hidden="true">scroll</div>
      </section>

      <section id="about" className={styles.section}>
        <h2 className={styles.heading}>About</h2>
        <p className={styles.about}>
          Hi, I&apos;m Jack — a Graphic Designer from Dallas, Texas. I specialize in
          crafting thoughtful, visually engaging solutions that help brands stand
          out. I&apos;m passionate about clean design, creative problem-solving, and
          building digital experiences.
        </p>
      </section>

      <section id="work" className={styles.section}>
        <h2 className={styles.heading}>Work</h2>
        <div className={styles.workList}>
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className={styles.workItem}>
              <div className={styles.workThumb}>
                <ProjectMedia src={p.image} alt={p.title} className={styles.workMedia} />
              </div>
              <span className={styles.workTitle}>{p.title}</span>
            </Link>
          ))}
        </div>
      </section>

      <section id="contact" className={styles.section}>
        <h2 className={styles.heading}>Contact</h2>
        <p className={styles.contactCta}>Let&apos;s build something.</p>
        <a className={styles.contactLink} href="mailto:stollyj@gmail.com">
          stollyj@gmail.com
        </a>
        <a
          className={styles.contactLink}
          href="https://www.linkedin.com/"
          target="_blank"
          rel="noreferrer"
        >
          LinkedIn ↗
        </a>
      </section>
    </div>
  );
}
