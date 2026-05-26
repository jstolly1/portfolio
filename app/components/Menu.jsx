'use client';

import Link from 'next/link';
import styles from './Menu.module.css';

const items = [
  { href: '/about', label: 'About' },
  { href: '/projects', label: 'Projects' },
  { href: '/contact', label: 'Contact' },
];

export default function Menu() {
  return (
    <nav className={styles.menu} aria-label="Primary" data-global-menu>
      {items.map(({ href, label }) => (
        <Link key={href} href={href} className={styles.item}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
