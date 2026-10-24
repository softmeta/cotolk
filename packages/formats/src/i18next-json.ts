import {
  type OrderedJson,
  OrderedJsonError,
  parseOrderedJson,
  stringifyOrderedJson,
} from "./ordered-json";
import { isPluralCategory, type PluralForms } from "./plural";

export type MessageValue = string | { plural: PluralForms };

export interface Message {
  path: readonly string[];
  value: MessageValue;
}

export interface I18nextLayout {
  indent: string;
  eol: "\n" | "\r\n";
  finalNewline: boolean;
}

export interface I18nextResource {
  messages: Message[];
  layout?: I18nextLayout;
}

const DEFAULT_LAYOUT: I18nextLayout = {
  indent: "  ",
  eol: "\n",
  finalNewline: true,
};

const PLURAL_SUFFIX = /^(.+)_([a-z]+)$/;

export class I18nextFormatError extends Error {
  override name = "I18nextFormatError";
}

export function messageKey(path: readonly string[], separator = ".") {
  return path.join(separator);
}

function detectLayout(text: string): I18nextLayout {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const indent = /^[{[][ \t]*\r?\n([ \t]+)\S/.exec(text)?.[1] ?? "  ";
  return { indent, eol, finalNewline: /\r?\n$/.test(text) };
}

type JsonObject = Extract<OrderedJson, { kind: "object" }>;

function pluralBase(key: string, siblings: ReadonlyMap<string, OrderedJson>) {
  const match = PLURAL_SUFFIX.exec(key);
  if (!match) return null;
  const [, base, category] = match;
  if (!base || !category || !isPluralCategory(category)) return null;
  return siblings.get(`${base}_other`)?.kind === "string"
    ? { base, category }
    : null;
}

function collectMessages(
  node: JsonObject,
  parent: readonly string[],
  messages: Message[],
) {
  const siblings = new Map(node.entries);
  const plurals = new Map<string, PluralForms>();
  for (const [key, child] of node.entries) {
    const path = [...parent, key];
    if (child.kind === "object") {
      collectMessages(child, path, messages);
      continue;
    }
    const plural = pluralBase(key, siblings);
    if (!plural) {
      messages.push({ path, value: child.value });
      continue;
    }
    const existing = plurals.get(plural.base);
    if (existing) {
      existing[plural.category] = child.value;
      continue;
    }
    const forms: PluralForms = { [plural.category]: child.value };
    plurals.set(plural.base, forms);
    messages.push({ path: [...parent, plural.base], value: { plural: forms } });
  }
}

function describeError(error: OrderedJsonError) {
  if (error.path.length === 0) {
    return `expected an object at the root, ${error.reason}`;
  }
  const detail =
    error.reason === "duplicate key"
      ? error.reason
      : `expected a string or an object, ${error.reason}`;
  return `${messageKey(error.path)}: ${detail}`;
}

function readTree(source: string) {
  try {
    return parseOrderedJson(source);
  } catch (cause) {
    if (cause instanceof OrderedJsonError) {
      throw new I18nextFormatError(describeError(cause));
    }
    throw new I18nextFormatError("Invalid JSON", { cause });
  }
}

export function parseI18nextJson(text: string): I18nextResource {
  const source = text.startsWith("\uFEFF") ? text.slice(1) : text;
  const root = readTree(source);
  if (root.kind !== "object") {
    throw new I18nextFormatError("expected an object at the root, got string");
  }
  const messages: Message[] = [];
  collectMessages(root, [], messages);
  return { messages, layout: detectLayout(source) };
}

function childObject(node: JsonObject, segment: string, path: string[]) {
  const existing = node.entries.find(([key]) => key === segment)?.[1];
  if (existing?.kind === "object") return existing;
  if (existing) {
    throw new I18nextFormatError(
      `${messageKey(path)}: a message and a group share this path`,
    );
  }
  const created: JsonObject = { kind: "object", entries: [] };
  node.entries.push([segment, created]);
  return created;
}

function assign(
  root: JsonObject,
  path: readonly string[],
  key: string,
  value: string,
) {
  let node = root;
  for (const [index, segment] of path.entries()) {
    node = childObject(node, segment, path.slice(0, index + 1));
  }
  if (node.entries.some(([existing]) => existing === key)) {
    throw new I18nextFormatError(
      `${messageKey([...path, key])}: more than one message has this path`,
    );
  }
  node.entries.push([key, { kind: "string", value }]);
}

export function serializeI18nextJson(resource: I18nextResource): string {
  const layout = resource.layout ?? DEFAULT_LAYOUT;
  const root: JsonObject = { kind: "object", entries: [] };
  for (const { path, value } of resource.messages) {
    const parent = path.slice(0, -1);
    const name = path.at(-1);
    if (name === undefined) throw new I18nextFormatError("empty message path");
    if (typeof value === "string") {
      assign(root, parent, name, value);
      continue;
    }
    for (const [category, form] of Object.entries(value.plural)) {
      if (form !== undefined) assign(root, parent, `${name}_${category}`, form);
    }
  }
  const body = stringifyOrderedJson(root, layout.indent).replaceAll(
    "\n",
    layout.eol,
  );
  return layout.finalNewline ? `${body}${layout.eol}` : body;
}
