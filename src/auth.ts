import { betterAuth } from "better-auth";
import type { Env } from "./worker";
import { syncHandle } from "./handles";

export function createAuth(env: Env, request: Request) {
  return betterAuth({
    baseURL: new URL(request.url).origin,
    secret: env.BETTER_AUTH_SECRET,
    database: env.DB,
    // nome e e-mail vêm do provedor de login; o usuário não edita
    disabledPaths: ["/update-user", "/change-email", "/link-social"],
    socialProviders: {
      twitch: { clientId: env.TWITCH_CLIENT_ID, clientSecret: env.TWITCH_CLIENT_SECRET },
      google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET },
    },
    databaseHooks: {
      account: {
        create: { after: (account) => syncHandle(env, account) },
        update: { after: (account) => syncHandle(env, account) },
      },
    },
    session: { cookieCache: { enabled: true, maxAge: 5 * 60, strategy: "jwe" } },
    account: { storeStateStrategy: "cookie", storeAccountCookie: false },
    advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] } },
  });
}

export async function currentUser(env: Env, request: Request) {
  const session = await createAuth(env, request).api.getSession({ headers: request.headers });
  if (!session) return null;
  const admins = env.ADMINS.split(",").map((s) => s.trim()).filter(Boolean);
  const { id, name, image } = session.user;
  // ADMINS guarda ids do Twitch: nome e ordem das contas o usuário controla (nome do Google, unlink)
  const admin = admins.length > 0 && !!(await env.DB.prepare(
    `SELECT 1 FROM account WHERE userId = ? AND providerId = 'twitch' AND accountId IN (${admins.map(() => "?").join(",")})`,
  ).bind(id, ...admins).first());
  return { id, name, image: image ?? null, admin };
}
