import ProjectsView from './ProjectsView';
import { projects } from './data';
import { enrichProjects } from './scan';

export const metadata = { title: 'Work — Jack Stolly' };

export default function ProjectsPage() {
  return <ProjectsView projects={enrichProjects(projects)} />;
}
