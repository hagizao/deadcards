import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { login } from "../helpers/fixtures";

const admin = () => login("admvicli", ["twitch"], "190835130");

const put = (cookie: string, path: string, body: unknown) => SELF.fetch(`http://test/api/${path}`, {
  method: "PUT",
  headers: { cookie, origin: "http://test", "content-type": "application/json" },
  body: JSON.stringify(body),
});
const del = (cookie: string, path: string) => SELF.fetch(`http://test/api/${path}`, { method: "DELETE", headers: { cookie, origin: "http://test" } });

type Data = { tournaments: { id: string; name: string; description: string; logo?: string; stream?: string; watch?: string }[]; schedule: { id: string; tournamentId: string; startsAt: number; label: string; brazil: boolean }[] };
const data = async () => (await (await SELF.fetch("http://test/api/data")).json()) as Data;
const soon = () => Math.floor(Date.now() / 1000) + 7 * 86400;

describe("Calendário de campeonatos", () => {
  it("cria campeonato com logo e link, marca um dia e mostra no /api/data", async () => {
    const { cookie } = await admin();
    expect((await put(cookie, "tournaments/cup", { name: "  Copa Teste ", description: "Uma copa.", logo: "/img/events/cup.png", stream: "https://youtube.com/@copa/live", watch: "https://youtube.com/@hagizao/live" })).status).toBe(200);
    const at = soon();
    expect((await put(cookie, "schedule/cup-1", { tournamentId: "cup", startsAt: at, label: "Final" })).status).toBe(200);
    const d = await data();
    expect(d.tournaments.find((t) => t.id === "cup")).toEqual({ id: "cup", name: "Copa Teste", description: "Uma copa.", logo: "/img/events/cup.png", stream: "https://youtube.com/@copa/live", watch: "https://youtube.com/@hagizao/live" });
    expect(d.schedule.find((s) => s.id === "cup-1")).toEqual({ id: "cup-1", tournamentId: "cup", startsAt: at, label: "Final", brazil: false });
  });

  it("aceita logo estática de /tournaments/ e descarta caminho estranho", async () => {
    const { cookie } = await admin();
    await put(cookie, "tournaments/st", { name: "Estática", description: "", logo: "/tournaments/st.webp" });
    await put(cookie, "tournaments/bad", { name: "Ruim", description: "", logo: "https://evil.example/x.png" });
    const d = await data();
    expect(d.tournaments.find((t) => t.id === "st")?.logo).toBe("/tournaments/st.webp");
    expect(d.tournaments.find((t) => t.id === "bad")?.logo).toBeUndefined();
    const ns = d.tournaments.find((t) => t.id === "night-shift");
    expect(ns?.logo).toBe("/tournaments/night-shift.webp");
    expect(ns?.stream).toBe("https://www.youtube.com/@DeadlockNightShift/live");
    expect(ns?.watch).toBe("https://www.youtube.com/@hagizao/live");
  });

  it("marca e desmarca o dia em que o Brasil joga", async () => {
    const { cookie } = await admin();
    await put(cookie, "tournaments/br", { name: "Copa BR", description: "" });
    const at = soon();
    expect((await put(cookie, "schedule/br-1", { tournamentId: "br", startsAt: at, label: "", brazil: true })).status).toBe(200);
    expect((await data()).schedule.find((s) => s.id === "br-1")?.brazil).toBe(true);
    expect((await put(cookie, "schedule/br-1", { tournamentId: "br", startsAt: at, label: "", brazil: false })).status).toBe(200);
    expect((await data()).schedule.find((s) => s.id === "br-1")?.brazil).toBe(false);
    expect((await put(cookie, "schedule/br-1", { tournamentId: "br", startsAt: at, label: "", brazil: "sim" })).status).toBe(400);
  });

  it("apagar o campeonato apaga os dias dele", async () => {
    const { cookie } = await admin();
    await put(cookie, "tournaments/gone", { name: "Some", description: "" });
    await put(cookie, "schedule/gone-1", { tournamentId: "gone", startsAt: soon(), label: "" });
    expect((await del(cookie, "tournaments/gone")).status).toBe(200);
    const d = await data();
    expect(d.tournaments.some((t) => t.id === "gone")).toBe(false);
    expect(d.schedule.some((s) => s.tournamentId === "gone")).toBe(false);
  });

  it("não manda para o site dias de mais de um mês atrás", async () => {
    const { cookie } = await admin();
    await put(cookie, "tournaments/old", { name: "Antiga", description: "" });
    await put(cookie, "schedule/old-1", { tournamentId: "old", startsAt: Math.floor(Date.now() / 1000) - 60 * 86400, label: "" });
    expect((await data()).schedule.some((s) => s.id === "old-1")).toBe(false);
  });

  it("recusa entrada inválida", async () => {
    const { cookie } = await admin();
    expect((await put(cookie, "tournaments/x", { name: "", description: "" })).status).toBe(400);
    expect((await put(cookie, "tournaments/x", { name: "a".repeat(61), description: "" })).status).toBe(400);
    expect((await put(cookie, "tournaments/x", { name: "X", description: "a".repeat(281) })).status).toBe(400);
    expect((await put(cookie, "tournaments/x", { name: "X", description: "", stream: "javascript:alert(1)" })).status).toBe(400);
    expect((await put(cookie, "tournaments/x", { name: "X", description: "", watch: "ftp://x" })).status).toBe(400);
    await put(cookie, "tournaments/ok", { name: "Ok", description: "" });
    expect((await put(cookie, "schedule/s", { tournamentId: "nope", startsAt: soon(), label: "" })).status).toBe(404);
    expect((await put(cookie, "schedule/s", { tournamentId: "ok", startsAt: 1.5, label: "" })).status).toBe(400);
    expect((await put(cookie, "schedule/s", { tournamentId: "ok", startsAt: 100, label: "" })).status).toBe(400);
    expect((await put(cookie, "schedule/s", { tournamentId: "ok", startsAt: soon(), label: "a".repeat(25) })).status).toBe(400);
  });

  it("exige admin para escrever", async () => {
    const { cookie } = await login("visitante");
    expect((await put(cookie, "tournaments/y", { name: "Y", description: "" })).status).toBe(403);
    expect((await put(cookie, "schedule/y", { tournamentId: "night-shift", startsAt: soon(), label: "" })).status).toBe(403);
    expect((await del(cookie, "tournaments/night-shift")).status).toBe(403);
  });
});
