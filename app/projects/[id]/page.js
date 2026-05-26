import { notFound } from 'next/navigation';
import { getProjectById, projects } from '../data';
import { scanProjectFolder, enrichProjects } from '../scan';
import ProjectDetail from './ProjectDetail';

export function generateStaticParams() {
  return projects.map((p) => ({ id: String(p.id) }));
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const project = getProjectById(id);
  if (!project) return { title: 'Project — Jack Stolly' };
  return { title: `${project.title} — Jack Stolly` };
}

export default async function ProjectPage({ params }) {
  const { id } = await params;
  const project = getProjectById(id);
  if (!project) notFound();
  const { hero, gallery } = scanProjectFolder(project.slug);
  // Build the "next projects" list for the bottom-of-page carousel — every
  // project except the current one, rotated so the project that comes
  // immediately AFTER the current one sits in the leading focal slot.
  const allProjects = enrichProjects(projects);
  const currentIdx = allProjects.findIndex((p) => p.id === project.id);
  const nextProjects = [];
  for (let i = 1; i <= allProjects.length - 1; i++) {
    nextProjects.push(allProjects[(currentIdx + i) % allProjects.length]);
  }
  return (
    <ProjectDetail
      project={{
        ...project,
        // Hero from disk wins; fall back to whatever data.js had if no
        // image file exists in the folder at all.
        image: hero || project.image,
        gallery,
      }}
      nextProjects={nextProjects}
    />
  );
}
