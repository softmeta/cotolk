import type { TranslationKey } from "@cotolk/core";
import { pluralCategoriesFor } from "@cotolk/formats";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { type FormEvent, useState } from "react";
import { z } from "zod";
import { loadEditor, saveTranslation } from "../../../server/editor.functions";

const STATUSES = [
  "missing",
  "needs_review",
  "approved",
  "rejected",
  "stale",
] as const;

const editorSearch = z.object({
  locale: z.string().min(2).max(35).optional().catch(undefined),
  status: z.enum(STATUSES).optional().catch(undefined),
});

export const Route = createFileRoute("/$org/$project/editor")({
  validateSearch: editorSearch,
  loaderDeps: ({ search }) => ({ locale: search.locale }),
  loader: ({ params, deps }) =>
    loadEditor({
      data: {
        organization: params.org,
        project: params.project,
        locale: deps.locale,
      },
    }),
  component: EditorPage,
});

function EditorPage() {
  const { project, locale, keys } = Route.useLoaderData();
  const { status } = Route.useSearch();
  const visible = status
    ? keys.filter((key) => key.translation.status === status)
    : keys;
  return (
    <main>
      <h1>{project.name}</h1>
      <p>
        {project.sourceLocale} → {locale ?? "no target locale"}
      </p>
      <ul aria-label="Keys">
        {visible.map((key) => (
          <KeyEditor
            key={`${key.id}:${key.translation.revision}`}
            entry={key}
          />
        ))}
      </ul>
    </main>
  );
}

function KeyEditor({ entry }: { entry: TranslationKey }) {
  const params = Route.useParams();
  const router = useRouter();
  const save = useServerFn(saveTranslation);
  const [error, setError] = useState<string | null>(null);
  const name = entry.path.join(".");
  const categories = entry.plural
    ? pluralCategoriesFor(entry.translation.locale)
    : ["other"];

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const approve =
      (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ===
      "approve";
    try {
      await save({
        data: {
          organization: params.org,
          project: params.project,
          keyId: entry.id,
          locale: entry.translation.locale,
          forms: Object.fromEntries(
            categories.map((category) => [
              category,
              String(form.get(category) ?? ""),
            ]),
          ),
          expectedRevision: entry.translation.revision,
          approve,
        },
      });
      setError(null);
      await router.invalidate();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }

  return (
    <li data-key={name} data-status={entry.translation.status}>
      <form onSubmit={onSubmit} aria-label={name}>
        <h2>{name}</h2>
        <p>{entry.translation.status}</p>
        {categories.map((category) => (
          <label key={category}>
            {entry.sourceForms[category] ?? entry.sourceForms.other}
            <textarea
              name={category}
              defaultValue={entry.translation.forms?.[category] ?? ""}
            />
          </label>
        ))}
        <button type="submit" value="save">
          Save
        </button>
        <button type="submit" value="approve">
          Save and approve
        </button>
        {error && <p role="alert">{error}</p>}
      </form>
    </li>
  );
}
