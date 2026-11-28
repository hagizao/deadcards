import { describe, expect, it } from "vitest";
import { parseRoute, routePath, squadName, squadPath, teamByKey, teamKey, teamSlug } from "../src/lib/route";

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
    for (const r of [{ tab: "compare" }, { tab: "compare", lab: "compare" }, { tab: "compare", squad: "p-1.p-2" }, { tab: "teams", team: "t1" }, { tab: "home", card: "p1" }, { tab: "profile", profile: "x" }] as const) {
      expect(parseRoute(routePath(r))).toEqual(r);
    }
  });

  it("time no link pela sigla; sigla repetida ou vazia usa o id; link antigo por id continua valendo", () => {
    const teams = [{ id: "t-1", tag: "LEV" }, { id: "t-2", tag: "C9" }, { id: "t-3", tag: "BE" }, { id: "t-4", tag: "B.E." }, { id: "t-5", tag: "?!" }];
    expect(teamSlug("Ação 9")).toBe("acao9");
    expect(teamKey(teams, "t-1")).toBe("lev");
    expect(teamKey(teams, "t-2")).toBe("c9");
    expect(teamKey(teams, "t-3")).toBe("t-3");
    expect(teamKey(teams, "t-5")).toBe("t-5");
    expect(teamByKey(teams, "lev")?.id).toBe("t-1");
    expect(teamByKey(teams, "LEV")?.id).toBe("t-1");
    expect(teamByKey(teams, "t-1")?.id).toBe("t-1");
    expect(teamByKey(teams, "be")).toBeUndefined();
    expect(teamByKey(teams, "t-4")?.id).toBe("t-4");
    expect(teamByKey(teams, "nada")).toBeUndefined();
  });

  it("Lab: /lab abre o Elenco dos sonhos; /lab/comparar e o /compare antigo, o Comparar; elenco com até 6 cartas", () => {
    expect(parseRoute("/lab")).toEqual({ tab: "compare" });
    expect(parseRoute("/lab/elenco")).toEqual({ tab: "compare" });
    expect(parseRoute("/lab/comparar")).toEqual({ tab: "compare", lab: "compare" });
    expect(parseRoute("/compare")).toEqual({ tab: "compare", lab: "compare" });
    expect(parseRoute("/lab/elenco/a.b-1.c_2")).toEqual({ tab: "compare", squad: "a.b-1.c_2" });
    expect(parseRoute("/lab/elenco/a.b.c.d.e.f.g")).toEqual({ tab: "home" });
    expect(parseRoute("/lab/elenco/a..b")).toEqual({ tab: "home" });
    expect(parseRoute("/lab/elenco/a,b")).toEqual({ tab: "home" });
    expect(routePath({ tab: "compare" })).toBe("/lab");
  });

  it("link do elenco: vagas vazias saem, nome curto e sem espaço sobrando", () => {
    expect(squadPath(["a", "", "b"], "  Melhor   dos EUA ")).toBe("/lab/elenco/a.b?n=Melhor%20dos%20EUA");
    expect(squadPath([], "")).toBe("/lab");
    expect(squadName("x".repeat(80))).toHaveLength(40);
    expect(squadName(null)).toBe("");
  });
});
