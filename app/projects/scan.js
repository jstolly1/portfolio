import fs from 'node:fs';
import path from 'node:path';

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif']);

// Naming convention inside `public/assets/projects/<slug>/`:
//   • A file whose stem contains "hero" (case-insensitive) is the hero.
//   • Every other image is the gallery, ordered by the FIRST integer in
//     its filename, ascending. Files without a number land at the end,
//     alphabetised.
//   • If no Hero file exists, the first sorted image is promoted to the
//     hero slot so the carousel never shows a broken card. The promoted
//     image is removed from the returned gallery so it doesn't appear
//     twice on the detail page.
//
// Non-image files (e.g. .mp4 reels) are ignored here.
export function scanProjectFolder(slug) {
  const dir = path.join(process.cwd(), 'public', 'assets', 'projects', slug);
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return { hero: null, gallery: [] };
  }
  const images = entries.filter((name) =>
    IMAGE_EXT.has(path.extname(name).toLowerCase()),
  );
  const heroName = images.find((name) =>
    path.parse(name).name.toLowerCase().includes('hero'),
  );
  const leadingNumber = (name) => {
    const m = name.match(/\d+/);
    return m ? parseInt(m[0], 10) : Number.POSITIVE_INFINITY;
  };
  const others = images
    .filter((name) => name !== heroName)
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
  if (others.length === 0) return { hero: null, gallery: [] };
  return { hero: toPath(others[0]), gallery: others.slice(1).map(toPath) };
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
