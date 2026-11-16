const SEEN = "intro-seen";

/** Só na página inicial, uma vez por sessão; links diretos (perfil, termos, retorno de login) pulam a entrada. */
export function shouldShowIntro() {
  if (location.pathname !== "/" || new URLSearchParams(location.search).has("link")) return false;
  try { return sessionStorage.getItem(SEEN) !== "1"; } catch { return true; }
}

export function markIntroSeen() {
  try { sessionStorage.setItem(SEEN, "1"); } catch { /* sem storage */ }
}
