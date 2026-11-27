import { env } from "cloudflare:test";

const now = () => new Date().toISOString();

export async function seedPlayer(id = "p1") {
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO teams (id, name, tag) VALUES ('t1', 'Team', 'TM')"),
    env.DB.prepare("INSERT INTO players (id, team_id, name, hero, stats_json, c1, c2) VALUES (?, 't1', 'Player', 'Abrams', '{}', '#000', '#000')").bind(id),
  ]);
}

export async function seedCode(code: string, playerId: string, opts: { maxUses?: number; uses?: number; startsAt?: number | null; expiresAt?: number | null } = {}) {
  await env.DB.prepare("INSERT INTO redeem_codes (code, player_id, max_uses, uses, starts_at, expires_at) VALUES (?,?,?,?,?,?)")
    .bind(code, playerId, opts.maxUses ?? 1, opts.uses ?? 0, opts.startsAt ?? null, opts.expiresAt ?? null).run();
}

// Cria usuário + sessão no D1 e devolve o cookie assinado como o Better Auth espera (token.hmac-base64).
export async function login(name: string, providers: string[] = ["twitch"], twitchId?: string) {
  const userId = crypto.randomUUID();
  const token = crypto.randomUUID().replace(/-/g, "");
  const t = now();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?,?,?,1,?,?)`).bind(userId, name, `${userId}@test.local`, t, t),
    env.DB.prepare(`INSERT INTO "session" (id, expiresAt, token, createdAt, updatedAt, userId) VALUES (?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(), new Date(Date.now() + 86_400_000).toISOString(), token, t, t, userId),
    ...providers.map((p, i) =>
      env.DB.prepare(`INSERT INTO "account" (id, accountId, providerId, userId, createdAt, updatedAt) VALUES (?,?,?,?,?,?)`)
        .bind(crypto.randomUUID(), p === "twitch" && twitchId ? twitchId : crypto.randomUUID(), p, userId, new Date(Date.now() + i * 1000).toISOString(), t)),
  ]);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.BETTER_AUTH_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token)))));
  return { userId, cookie: `better-auth.session_token=${encodeURIComponent(`${token}.${sig}`)}` };
}
