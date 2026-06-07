'use client';

import { useEffect, useRef } from 'react';

// A project asset — used for the detail hero, the carousel card, and the
// click-to-detail transition overlay — can be a still image, an animated GIF
// (both render as <img>), or a video file. A video only *plays* on the
// full-screen detail hero (pass `autoplay`); everywhere else (carousel card,
// transition overlay) it sits paused on a poster frame until the project is
// opened and its hero fills the screen.
const VIDEO_RE = /\.(mp4|webm|mov|m4v|ogv|ogg)$/i;

export function isVideoSrc(src) {
  return VIDEO_RE.test(String(src || '').split('?')[0]);
}

export default function ProjectMedia({
  src,
  alt = '',
  className,
  eager = false,
  priority = false,
  autoplay = false,
}) {
  const ref = useRef(null);
  const video = isVideoSrc(src);

  // Only the full-screen hero autoplays. muted is required for unprompted
  // playback and React doesn't reliably reflect the `muted` prop onto the DOM
  // property — so set it imperatively and kick off play(), retrying once the
  // media has buffered. No-op for image/gif and for paused (non-autoplay) video.
  useEffect(() => {
    if (!video || !autoplay) return undefined;
    const el = ref.current;
    if (!el) return undefined;
    el.muted = true;
    const play = () => {
      const p = el.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    };
    play();
    el.addEventListener('canplay', play, { once: true });
    return () => el.removeEventListener('canplay', play);
  }, [src, video, autoplay]);

  if (video) {
    // Paused videos (card, overlay) load only metadata and use a #t media
    // fragment so the browser paints a poster frame instead of a blank box —
    // and don't stream the whole file until the hero actually plays it.
    const videoSrc = autoplay ? src : `${src}#t=0.1`;
    return (
      <video
        ref={ref}
        src={videoSrc}
        className={className}
        autoPlay={autoplay}
        muted
        loop
        playsInline
        preload={autoplay ? 'auto' : 'metadata'}
        draggable={false}
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      draggable={false}
      decoding="async"
      loading={eager ? 'eager' : 'lazy'}
      {...(priority ? { fetchPriority: 'high' } : {})}
    />
  );
}
