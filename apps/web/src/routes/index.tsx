import { createFileRoute, Link } from "@tanstack/react-router";
import { loadWorkspaces } from "../server/editor.functions";

export const Route = createFileRoute("/")({
  loader: () => loadWorkspaces(),
  component: Workspaces,
});

function Workspaces() {
  const organizations = Route.useLoaderData();
  return (
    <main>
      <h1>Projects</h1>
      {organizations.map((organization) => (
        <section key={organization.slug} aria-label={organization.name}>
          <h2>{organization.name}</h2>
          <ul>
            {organization.projects.map((project) => (
              <li key={project.slug}>
                <Link
                  to="/$org/$project/editor"
                  params={{ org: organization.slug, project: project.slug }}
                >
                  {project.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
