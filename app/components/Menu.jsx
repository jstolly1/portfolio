import Link from 'next/link';
import styles from './Menu.module.css';

const items = [
  { href: '/about', label: 'About' },
  { href: '/work', label: 'Work' },
  { href: '/contact', label: 'Contact' },
];

export default function Menu() {
  return (
    <nav className={styles.menu} aria-label="Primary">
      {items.map(({ href, label }) => (
        <Link key={href} href={href} className={styles.item}>
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
