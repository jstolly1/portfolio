'use client';

import { useRef, useState } from 'react';
import styles from './Contact.module.css';
import PuttToSend from './PuttToSend';

export default function ContactView() {
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const formRef = useRef(null);
  const puttRef = useRef(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    const subject = `Portfolio contact from ${form.name}`;
    const body = `${form.message}\n\n— ${form.name} <${form.email}>`;
    window.location.href =
      `mailto:stollyj@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  // The putt sinks → either submit (mailto opens, page navigates) or
  // bounce the user back to the form to fill in required fields. Native
  // validation handles the messaging; we just re-tee the ball.
  const handleHoleIn = () => {
    const f = formRef.current;
    if (!f) return;
    if (f.checkValidity()) {
      f.requestSubmit();
    } else {
      f.reportValidity();
      setTimeout(() => puttRef.current?.reset(), 1400);
    }
  };

  return (
    <main className={styles.page}>
      <section>
        <h1 className={styles.title}>Wow, you must like me a lot.</h1>
        <p className={styles.subtitle}>
          Fill out your message, then sink the putt below to send it.
        </p>
        <form ref={formRef} className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.row}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Name</span>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                autoComplete="name"
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Email</span>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
                autoComplete="email"
              />
            </label>
          </div>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Message</span>
            <textarea
              rows={5}
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              required
            />
          </label>
        </form>
      </section>

      <PuttToSend
        onHoleIn={handleHoleIn}
        apiRef={puttRef}
        armed={form.message.trim().length > 0}
      />
    </main>
  );
}
