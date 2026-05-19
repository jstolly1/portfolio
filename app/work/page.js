import styles from '../components/RoutePanel.module.css';

export const metadata = { title: 'Work — Jack Stolly' };

export default function Work() {
  return (
    <main className={styles.panel}>
      <div className={styles.card}>
        <h1>Work</h1>
        <p>Placeholder. List or showcase projects here.</p>
      </div>
    </main>
  );
}
