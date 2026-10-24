import type { ColumnType, Generated } from "kysely";

type CreatedAt = ColumnType<Date, never, never>;
type Json = ColumnType<unknown, string | undefined, string>;

export interface OrganizationsTable {
  id: Generated<string>;
  slug: string;
  name: string;
  createdAt: CreatedAt;
}

export interface ProjectsTable {
  id: Generated<string>;
  organizationId: string;
  slug: string;
  name: string;
  sourceLocale: string;
  targetLocales: ColumnType<string[], string[] | undefined, string[]>;
  formatConfig: Json;
  createdAt: CreatedAt;
}

export type MembershipRole = "owner" | "member";

export interface UsersTable {
  id: Generated<string>;
  email: string;
  name: string;
  passwordHash: string | null;
  createdAt: CreatedAt;
}

export interface MembershipsTable {
  organizationId: string;
  userId: string;
  role: MembershipRole;
  createdAt: CreatedAt;
}

export interface ApiTokensTable {
  id: Generated<string>;
  organizationId: string;
  name: string;
  tokenHash: string;
  createdByUserId: string | null;
  createdAt: CreatedAt;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

export interface UserSessionsTable {
  id: Generated<string>;
  userId: string;
  tokenHash: string;
  createdAt: CreatedAt;
  expiresAt: Date;
}

export type TranslationStatus =
  | "missing"
  | "needs_review"
  | "approved"
  | "rejected"
  | "stale";

export type TranslationOrigin = "human" | "agent" | "tm" | "import";

export type RevisionKind =
  | "submit"
  | "suggest"
  | "approve"
  | "reject"
  | "source_changed";

export type ActorKind = "user" | "api_token" | "system";

export type Forms = Record<string, string>;

type JsonForms = ColumnType<Forms, string, string>;
type NullableJsonForms = ColumnType<Forms | null, string | null, string | null>;
type UpdatedAt = ColumnType<Date, Date | undefined, Date>;

export interface NamespacesTable {
  id: Generated<string>;
  projectId: string;
  name: string;
  createdAt: CreatedAt;
}

export interface KeysTable {
  id: Generated<string>;
  namespaceId: string;
  path: string[];
  plural: ColumnType<boolean, boolean | undefined, boolean>;
  sourceForms: JsonForms;
  sourceHash: string;
  description: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface TranslationsTable {
  id: Generated<string>;
  keyId: string;
  locale: string;
  forms: NullableJsonForms;
  status: TranslationStatus;
  origin: TranslationOrigin | null;
  translatedFromHash: string | null;
  revision: number;
  updatedAt: UpdatedAt;
}

export interface TranslationRevisionsTable {
  id: Generated<string>;
  translationId: string;
  revision: number;
  kind: RevisionKind;
  forms: NullableJsonForms;
  status: TranslationStatus;
  origin: TranslationOrigin | null;
  reason: string | null;
  actorKind: ActorKind;
  actorUserId: string | null;
  actorTokenId: string | null;
  actorName: string;
  createdAt: CreatedAt;
}

export interface Database {
  organizations: OrganizationsTable;
  projects: ProjectsTable;
  users: UsersTable;
  memberships: MembershipsTable;
  apiTokens: ApiTokensTable;
  userSessions: UserSessionsTable;
  namespaces: NamespacesTable;
  keys: KeysTable;
  translations: TranslationsTable;
  translationRevisions: TranslationRevisionsTable;
}
