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

export interface Database {
  organizations: OrganizationsTable;
  projects: ProjectsTable;
  users: UsersTable;
  memberships: MembershipsTable;
  apiTokens: ApiTokensTable;
  userSessions: UserSessionsTable;
}
