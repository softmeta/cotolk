import { argon2, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const argon2Async = promisify(argon2);

const PASSWORD_PARAMS = { memory: 19_456, passes: 2, parallelism: 1 };
const TAG_LENGTH = 32;
const PHC_PATTERN =
  /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

export type SecretKind = "apiToken" | "session";

const SECRET_PREFIX: Record<SecretKind, string> = {
  apiToken: "ctk_",
  session: "cts_",
};

export function generateSecret(kind: SecretKind) {
  const secret = `${SECRET_PREFIX[kind]}${randomBytes(32).toString("base64url")}`;
  return { secret, hash: hashSecret(secret) };
}

export function secretKind(secret: string): SecretKind | null {
  for (const [kind, prefix] of Object.entries(SECRET_PREFIX)) {
    if (secret.startsWith(prefix)) {
      return kind as SecretKind;
    }
  }
  return null;
}

export function hashSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

function deriveKey(
  password: string,
  nonce: Buffer,
  params: typeof PASSWORD_PARAMS,
) {
  return argon2Async("argon2id", {
    message: password,
    nonce,
    tagLength: TAG_LENGTH,
    ...params,
  });
}

function phcBase64(buffer: Buffer) {
  return buffer.toString("base64").replace(/=+$/, "");
}

export async function hashPassword(password: string) {
  const nonce = randomBytes(16);
  const key = await deriveKey(password, nonce, PASSWORD_PARAMS);
  const { memory, passes, parallelism } = PASSWORD_PARAMS;
  return `$argon2id$v=19$m=${memory},t=${passes},p=${parallelism}$${phcBase64(nonce)}$${phcBase64(key)}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const match = PHC_PATTERN.exec(encoded);
  if (!match) {
    return false;
  }
  const [, memory, passes, parallelism, nonce, expected] = match;
  const expectedKey = Buffer.from(expected ?? "", "base64");
  const key = await deriveKey(password, Buffer.from(nonce ?? "", "base64"), {
    memory: Number(memory),
    passes: Number(passes),
    parallelism: Number(parallelism),
  });
  return key.length === expectedKey.length && timingSafeEqual(key, expectedKey);
}

let decoyHash: Promise<string> | undefined;

export function passwordDecoy() {
  decoyHash ??= hashPassword(randomBytes(16).toString("hex"));
  return decoyHash;
}
