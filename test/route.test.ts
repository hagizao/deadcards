import { describe, expect, it } from "vitest";
import { parseRoute, routePath } from "../src/lib/route";

describe("rotas do site", () => {
  it("lê carta, time, perfil e abas do endereço", () => {
    expect(parseRoute("/c/p-123")).toEqual({ tab: "home", card: "p-123" });
    expect(parseRoute("/t/t-9")).toEqual({ tab: "teams", team: "t-9" });
    expect(parseRoute("/u/%40hagizao")).toEqual({ tab: "profile", profile: "@hagizao" });
    expect(parseRoute("/tierlist/")).toEqual({ tab: "tierlist" });
    expect(parseRoute("/")).toEqual({ tab: "home" });
  });

  it("endereço desconhecido ou inválido cai na Home", () => {
    expect(parseRoute("/nada")).toEqual({ tab: "home" });
    expect(parseRoute("/profile")).toEqual({ tab: "home" });
    expect(parseRoute("/c/<script>")).toEqual({ tab: "home" });
  });

  it("monta o endereço: carta aberta ganha de tudo, depois perfil e time", () => {
    expect(routePath({ tab: "teams", team: "t1", card: "p1" })).toBe("/c/p1");
    expect(routePath({ tab: "profile", profile: "hagizao" })).toBe("/u/hagizao");
    expect(routePath({ tab: "teams", team: "t1" })).toBe("/t/t1");
    expect(routePath({ tab: "teams" })).toBe("/teams");
    expect(routePath({ tab: "home" })).toBe("/");
  });

  it("ida e volta dão o mesmo estado", () => {
    for (const r of [{ tab: "compare" }, { tab: "teams", team: "t1" }, { tab: "home", card: "p1" }, { tab: "profile", profile: "x" }] as const) {
      expect(parseRoute(routePath(r))).toEqual(r);
    }
  });
});
