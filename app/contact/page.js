import styles from '../components/RoutePanel.module.css';

export const metadata = { title: 'Contact — Jack Stolly' };

export default function Contact() {
  return (
    <main className={styles.panel}>
      <div className={styles.card}>
        <h1>Contact</h1>
        <p>Placeholder. Add ways for people to reach you here.</p>
      </div>
    </main>
  );
}
