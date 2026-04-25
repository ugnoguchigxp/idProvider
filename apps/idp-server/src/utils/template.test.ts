import { describe, expect, it } from "vitest";
import { renderTemplate } from "./template.js";

describe("template utils", () => {
  it("should replace placeholders correctly", () => {
    const template = "Hello {{name}}!";
    const result = renderTemplate(template, { name: "World" });
    expect(result).toBe("Hello World!");
  });

  it("should handle multiple placeholders", () => {
    const template = "{{greeting}} {{name}}!";
    const result = renderTemplate(template, { greeting: "Hi", name: "User" });
    expect(result).toBe("Hi User!");
  });

  it("should ignore missing placeholders", () => {
    const template = "Hello {{name}}!";
    const result = renderTemplate(template, {});
    expect(result).toBe("Hello {{name}}!");
  });
});
