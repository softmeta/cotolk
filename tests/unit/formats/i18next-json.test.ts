import { readFileSync } from "node:fs";
import path from "node:path";
import {
  I18nextFormatError,
  messageKey,
  parseI18nextJson,
  pluralCategoriesFor,
  serializeI18nextJson,
} from "@cotolk/formats";
import { describe, expect, it } from "vitest";

const fixturesDir = path.join(import.meta.dirname, "fixtures");

function fixture(name: string) {
  return readFileSync(path.join(fixturesDir, name), "utf8");
}

describe("i18next JSON", () => {
  it.each(["en-US.json", "zh-CN.json", "crlf-tabs.json"])(
    "round-trips %s byte for byte",
    (name) => {
      const text = fixture(name);
      expect(serializeI18nextJson(parseI18nextJson(text))).toBe(text);
    },
  );

  it("groups plural forms into one message at the first form's position", () => {
    const keys = parseI18nextJson(fixture("en-US.json")).messages.map(
      (message) => messageKey(message.path),
    );
    expect(keys).toEqual([
      "devices.empty",
      "devices.pair.expires",
      "devices.pair.title",
      "devices.pair.ttlMinutes",
      "invite",
      "place_ordinal",
      "quote",
      "step_one",
    ]);
  });

  it("keeps the plural forms a locale file actually has", () => {
    const messages = parseI18nextJson(fixture("zh-CN.json")).messages;
    const forms = Object.fromEntries(
      messages.map((message) => [messageKey(message.path), message.value]),
    );
    expect(forms["devices.pair.ttlMinutes"]).toEqual({
      plural: { one: "{{count}} 分钟", other: "{{count}} 分钟" },
    });
    expect(forms.files).toEqual({ plural: { other: "{{count}} 个文件" } });
  });

  it("treats a category suffix without an other form as a plain key", () => {
    const messages = parseI18nextJson(fixture("en-US.json")).messages;
    expect(messages.find((m) => messageKey(m.path) === "step_one")?.value).toBe(
      "First step",
    );
  });

  it("writes a new resource with two-space indentation and a final newline", () => {
    const text = serializeI18nextJson({
      messages: [
        { path: ["pair", "title"], value: "配对设备" },
        {
          path: ["pair", "minutes"],
          value: { plural: { other: "{{count}} 分钟" } },
        },
      ],
    });
    expect(text).toBe(
      '{\n  "pair": {\n    "title": "配对设备",\n    "minutes_other": "{{count}} 分钟"\n  }\n}\n',
    );
  });

  it("rejects values that are not strings or objects, naming the path", () => {
    expect(() => parseI18nextJson('{"a": {"b": 3}}')).toThrow(
      new I18nextFormatError("a.b: expected a string or an object, got number"),
    );
    expect(() => parseI18nextJson('["a"]')).toThrow(I18nextFormatError);
  });

  it("rejects messages whose paths collide", () => {
    expect(() =>
      serializeI18nextJson({
        messages: [
          { path: ["a"], value: "x" },
          { path: ["a", "b"], value: "y" },
        ],
      }),
    ).toThrow(I18nextFormatError);
  });

  it("keeps numeric keys where the file puts them", () => {
    const text =
      '{\n  "title": "Errors",\n  "404": "Not found",\n  "10": "Ten"\n}\n';
    expect(serializeI18nextJson(parseI18nextJson(text))).toBe(text);
  });

  it("rejects duplicate keys instead of silently keeping the last one", () => {
    expect(() => parseI18nextJson('{"a": "x", "a": "y"}')).toThrow(
      new I18nextFormatError("a: duplicate key"),
    );
  });

  it("strips a byte order mark", () => {
    const text = '{\n  "a": "b"\n}\n';
    expect(serializeI18nextJson(parseI18nextJson(`﻿${text}`))).toBe(text);
  });
});

describe("pluralCategoriesFor", () => {
  it("lists the CLDR categories a locale needs, in i18next order", () => {
    expect(pluralCategoriesFor("zh-CN")).toEqual(["other"]);
    expect(pluralCategoriesFor("en-US")).toEqual(["one", "other"]);
    expect(pluralCategoriesFor("ar")).toEqual([
      "zero",
      "one",
      "two",
      "few",
      "many",
      "other",
    ]);
  });
});
