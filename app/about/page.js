import styles from '../components/RoutePanel.module.css';

export const metadata = { title: 'About — Jack Stolly' };

export default function About() {
  return (
    <main className={styles.panel}>
      <div className={styles.card}>
        <h1>About</h1>
        <p>Placeholder. Tell people who you are here.</p>
      </div>
    </main>
  );
}
