import MobileHome from './components/MobileHome';
import { projects } from './projects/data';
import { enrichProjects } from './projects/scan';

// Desktop renders this tree too, but MobileHome is display:none there — the
// Three.js ball (rendered globally) is the desktop hero. On mobile (<=767px)
// MobileHome is the scrollable one-page site (hero → about → work → contact).
export default function Home() {
  return <MobileHome projects={enrichProjects(projects)} />;
}
