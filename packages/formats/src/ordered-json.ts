export type OrderedJson =
  | { kind: "string"; value: string }
  | { kind: "object"; entries: [string, OrderedJson][] };

export class OrderedJsonError extends Error {
  constructor(
    readonly path: readonly string[],
    readonly reason: string,
  ) {
    super(reason);
  }
}

const VALUE_TYPES: Record<string, string> = {
  "[": "array",
  t: "boolean",
  f: "boolean",
  n: "null",
};

function valueType(char: string) {
  return VALUE_TYPES[char] ?? "number";
}

export function parseOrderedJson(text: string): OrderedJson {
  JSON.parse(text);
  let index = 0;

  const skipWhitespace = () => {
    while (/\s/.test(text[index] ?? "")) index += 1;
  };

  const readString = () => {
    const start = index;
    index += 1;
    while (text[index] !== '"') index += text[index] === "\\" ? 2 : 1;
    index += 1;
    return JSON.parse(text.slice(start, index)) as string;
  };

  const readValue = (path: readonly string[]): OrderedJson => {
    skipWhitespace();
    const char = text[index] ?? "";
    if (char === '"') return { kind: "string", value: readString() };
    if (char !== "{") {
      throw new OrderedJsonError(path, `got ${valueType(char)}`);
    }
    index += 1;
    const entries: [string, OrderedJson][] = [];
    const seen = new Set<string>();
    skipWhitespace();
    if (text[index] === "}") {
      index += 1;
      return { kind: "object", entries };
    }
    for (;;) {
      skipWhitespace();
      const key = readString();
      const childPath = [...path, key];
      if (seen.has(key)) throw new OrderedJsonError(childPath, "duplicate key");
      seen.add(key);
      skipWhitespace();
      index += 1;
      entries.push([key, readValue(childPath)]);
      skipWhitespace();
      const separator = text[index];
      index += 1;
      if (separator === "}") return { kind: "object", entries };
    }
  };

  return readValue([]);
}

export function stringifyOrderedJson(
  node: OrderedJson,
  indent: string,
  depth = 0,
): string {
  if (node.kind === "string") return JSON.stringify(node.value);
  if (node.entries.length === 0) return "{}";
  const inner = indent.repeat(depth + 1);
  const lines = node.entries.map(
    ([key, child]) =>
      `${inner}${JSON.stringify(key)}: ${stringifyOrderedJson(child, indent, depth + 1)}`,
  );
  return `{\n${lines.join(",\n")}\n${indent.repeat(depth)}}`;
}
