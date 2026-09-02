import { describe, expect, it } from "vitest";
import { cachedImagePath, rememberImagePath } from "./imageCache";

describe("imageCache", () => {
  it("remembers local temp image paths by id", () => {
    rememberImagePath("a.png", "C:\\\\Temp\\\\a.png");
    expect(cachedImagePath("a.png")).toBe("C:\\\\Temp\\\\a.png");
  });
});
