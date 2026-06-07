import fs from 'node:fs';
import path from 'node:path';

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif']);
const VIDEO_EXT = new Set(['.mp4', '.webm', '.mov', '.m4v', '.ogv', '.ogg']);

// Naming convention inside `public/assets/projects/<slug>/`:
//   • A file whose stem contains "hero" (case-insensitive) is the hero. It may
//     be an image, an animated GIF, or a video (e.g. Hero.mp4) — a video hero
//     plays as a muted, autoplaying background (rendered by ProjectMedia).
//   • Every other image OR video is the gallery, ordered by the FIRST integer
//     in its filename, ascending. Files without a number land at the end,
//     alphabetised. Gallery videos autoplay muted/looping on the detail page.
//   • If no Hero file exists, the first sorted *image* is promoted to the hero
//     slot so the carousel card stays a still; everything else (videos
//     included) remains in the gallery.
export function scanProjectFolder(slug) {
  const dir = path.join(process.cwd(), 'public', 'assets', 'projects', slug);
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return { hero: null, gallery: [] };
  }
  const ext = (name) => path.extname(name).toLowerCase();
  const isImage = (name) => IMAGE_EXT.has(ext(name));
  const isVideo = (name) => VIDEO_EXT.has(ext(name));
  // The hero can be any image or video whose stem contains "hero".
  const heroName = entries.find(
    (name) =>
      (isImage(name) || isVideo(name)) &&
      path.parse(name).name.toLowerCase().includes('hero'),
  );
  const leadingNumber = (name) => {
    const m = name.match(/\d+/);
    return m ? parseInt(m[0], 10) : Number.POSITIVE_INFINITY;
  };
  // The gallery holds every other image and video, in filename-number order.
  const others = entries
    .filter((name) => (isImage(name) || isVideo(name)) && name !== heroName)
    .sort((a, b) => {
      const na = leadingNumber(a);
      const nb = leadingNumber(b);
      if (na !== nb) return na - nb;
      return a.localeCompare(b);
    });
  const toPath = (name) => `/assets/projects/${slug}/${name}`;
  if (heroName) {
    return { hero: toPath(heroName), gallery: others.map(toPath) };
  }
  // No explicit hero — promote the first still image so the carousel card
  // isn't a video; everything else (including videos) stays in the gallery.
  const promoted = others.find(isImage);
  if (!promoted) return { hero: null, gallery: others.map(toPath) };
  return {
    hero: toPath(promoted),
    gallery: others.filter((name) => name !== promoted).map(toPath),
  };
}

// Resolve the carousel-card image for every project in one pass. Used by
// both the /projects list and the bottom-of-detail-page "Next project"
// carousel so every place that surfaces a project card pulls from the
// same disk-driven source of truth.
export function enrichProjects(rawProjects) {
  return rawProjects.map((p) => {
    const { hero } = scanProjectFolder(p.slug);
    return { ...p, image: hero || p.image };
  });
}
