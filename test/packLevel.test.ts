import { describe, expect, it } from "vitest";
import { DEFAULT_TIER_CONFIG } from "../src/lib/cards";
import { getRarity, levelOf } from "../src/lib/rarity";

describe("levelOf", () => {
  it("walkout só a partir de 88 (S e SS)", () => {
    expect(levelOf(getRarity(87, DEFAULT_TIER_CONFIG))).toBe("base");
    expect(levelOf(getRarity(88, DEFAULT_TIER_CONFIG))).toBe("ascendant");
    expect(levelOf(getRarity(93, DEFAULT_TIER_CONFIG))).toBe("eternus");
    expect(levelOf(null)).toBe("base");
  });

  it("moldura especial ganha walkout", () => {
    expect(levelOf({ ...getRarity(70, DEFAULT_TIER_CONFIG), custom: true })).toBe("special");
  });

  it("carta especial sem moldura também tem walkout", () => {
    expect(levelOf(getRarity(70, DEFAULT_TIER_CONFIG), true)).toBe("special");
  });

  it("88 é Ascendant com a configuração salva de S a partir de 88", () => {
    const cfg = DEFAULT_TIER_CONFIG.map((b) => (b.key === "S" ? { ...b, min: 88 } : b.key === "A" ? { ...b, min: 86, max: 87 } : b));
    expect(levelOf(getRarity(87, cfg))).toBe("base");
    expect(levelOf(getRarity(88, cfg))).toBe("ascendant");
  });
});
