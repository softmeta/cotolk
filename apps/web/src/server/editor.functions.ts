import {
  getProject,
  listKeys,
  listOrganizations,
  listProjects,
  submitTranslation,
} from "@cotolk/core";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { principalMiddleware } from "./auth";
import { withCoreErrors } from "./core-errors";

const projectRef = z.object({ organization: z.string(), project: z.string() });

export const loadWorkspaces = createServerFn({ method: "GET" })
  .middleware([principalMiddleware])
  .handler(({ context: { db, principal } }) =>
    withCoreErrors(async () => {
      const organizations = await listOrganizations(db, principal);
      return Promise.all(
        organizations.map(async (organization) => ({
          slug: organization.slug,
          name: organization.name,
          projects: (await listProjects(db, principal, organization.slug)).map(
            ({ slug, name }) => ({ slug, name }),
          ),
        })),
      );
    }),
  );

export const loadEditor = createServerFn({ method: "GET" })
  .middleware([principalMiddleware])
  .validator(projectRef.extend({ locale: z.string().optional() }))
  .handler(({ data, context: { db, principal } }) =>
    withCoreErrors(async () => {
      const project = await getProject(
        db,
        principal,
        data.organization,
        data.project,
      );
      const locale = data.locale ?? project.targetLocales[0];
      const keys = locale
        ? await listKeys(db, principal, data.organization, data.project, locale)
        : [];
      return {
        project: {
          name: project.name,
          sourceLocale: project.sourceLocale,
          targetLocales: project.targetLocales,
        },
        locale: locale ?? null,
        keys,
      };
    }),
  );

export const saveTranslation = createServerFn({ method: "POST" })
  .middleware([principalMiddleware])
  .validator(
    projectRef.extend({
      keyId: z.uuid(),
      locale: z.string(),
      forms: z.record(z.string(), z.string()),
      expectedRevision: z.number().int().min(0),
      approve: z.boolean(),
    }),
  )
  .handler(({ data, context: { db, principal } }) =>
    withCoreErrors(() =>
      submitTranslation(
        db,
        principal,
        data.organization,
        data.project,
        data.keyId,
        data.locale,
        {
          forms: data.forms,
          expectedRevision: data.expectedRevision,
          approve: data.approve,
        },
      ),
    ),
  );
