import { strings, useLocale, useT } from "../lib/i18n";

type Items = [string, string][];
type Page = { title: string; items: Items };

const S = strings<{ updated: (date: string) => string; privacy: Page; terms: Page }>({
  pt: {
    updated: (d) => `Atualizado em ${d}`,
    privacy: {
      title: "Privacidade",
      items: [
        ["O que coletamos", "Só ao entrar com Twitch ou Google: nome, e-mail, foto de perfil e o ID da conta, fornecidos pelo próprio serviço. Da Twitch, lemos seu nick. Guardamos também as cartas que você resgatou e a carta que você montar no perfil."],
        ["Para que usamos", "Para manter você logado e mostrar seu perfil. Não vendemos e não usamos para anúncios."],
        ["Perfil público", "Seu perfil tem um link público. Qualquer pessoa com o link vê seu nome, sua foto de perfil, a carta que você montou e as cartas que você resgatou. Seu @ (nick da Twitch ou do canal do YouTube) aparece no link. E-mail e ID da conta nunca aparecem. Se você vincular uma conta da Twitch e uma do Google, elas viram um perfil só, com as cartas das duas."],
        ["Cookies", "Usamos apenas cookies essenciais: o de sessão, para o login, e o cookie \"lang\", que guarda o idioma escolhido. Não há cookies de rastreamento nem analytics."],
        ["Idioma e país", "Na primeira visita, usamos o país, derivado do seu IP pela Cloudflare, só para sugerir o idioma do site. Esse dado não é armazenado."],
        ["Onde fica", "Os dados ficam na Cloudflare, que hospeda o site. Estatísticas de jogo vêm da API pública deadlock-api."],
        ["Seus direitos (LGPD)", "Você pode pedir acesso, correção ou exclusão dos seus dados a qualquer momento abrindo uma issue no GitHub do projeto."],
      ],
    },
    terms: {
      title: "Termos de uso",
      items: [
        ["O projeto", "Cardslock é um projeto de fã, gratuito e feito por diversão. Não é afiliado à Valve nem ao Deadlock."],
        ["Cartas", "As cartas são colecionáveis digitais sem valor monetário. Não podem ser vendidas nem trocadas por dinheiro."],
        ["Seu perfil", "Você define o nome e os atributos da sua carta, e ela fica pública no seu perfil. Ela não entra na tier list nem em rankings. Nomes ofensivos ou que se passem por outra pessoa podem ser removidos."],
        ["Uso justo", "Não tente burlar códigos de resgate, automatizar acessos ou atrapalhar o site. Contas que fizerem isso podem ser removidas."],
        ["Sem garantias", "O site é oferecido como está e pode mudar, ficar fora do ar ou ser encerrado a qualquer momento."],
        ["Mudanças", "Estes termos podem ser atualizados. Usar o site depois de uma mudança significa aceitar a nova versão."],
      ],
    },
  },
  en: {
    updated: (d) => `Updated on ${d}`,
    privacy: {
      title: "Privacy",
      items: [
        ["What we collect", "Only when you sign in with Twitch or Google: your name, email, profile picture and account ID, provided by the service itself. From Twitch, we read your username. We also store the cards you have redeemed and the card you build on your profile."],
        ["What we use it for", "To keep you signed in and show your profile. We don't sell it or use it for ads."],
        ["Public profile", "Your profile has a public link. Anyone with the link can see your name, your profile picture, the card you built and the cards you have redeemed. Your @ (Twitch username or YouTube channel handle) shows in the link. Your email and account ID are never shown. If you link a Twitch and a Google account, they become a single profile with the cards from both."],
        ["Cookies", "We only use essential cookies: the session cookie, for sign-in, and the \"lang\" cookie, which stores the language you picked. There are no tracking cookies and no analytics."],
        ["Language and country", "On your first visit, we use your country, derived from your IP by Cloudflare, only to suggest the site's language. This data is not stored."],
        ["Where it lives", "The data is kept on Cloudflare, which hosts the site. Game stats come from the public deadlock-api."],
        ["Your rights (LGPD)", "You can ask for access to, correction of or deletion of your data at any time by opening an issue on the project's GitHub. LGPD is Brazil's data protection law."],
      ],
    },
    terms: {
      title: "Terms of use",
      items: [
        ["The project", "Cardslock is a free fan project made for fun. It is not affiliated with Valve or Deadlock."],
        ["Cards", "Cards are digital collectibles with no monetary value. They can't be sold or exchanged for money."],
        ["Your profile", "You set the name and attributes of your card, and it is public on your profile. It doesn't enter the tier list or any ranking. Offensive names or names that impersonate someone else may be removed."],
        ["Fair use", "Don't try to bypass redeem codes, automate access or disrupt the site. Accounts that do so may be removed."],
        ["No warranties", "The site is provided as is and may change, go offline or be shut down at any time."],
        ["Changes", "These terms may be updated. Using the site after a change means you accept the new version."],
      ],
    },
  },
  es: {
    updated: (d) => `Actualizado el ${d}`,
    privacy: {
      title: "Privacidad",
      items: [
        ["Qué recopilamos", "Solo cuando inicias sesión con Twitch o Google: nombre, correo, foto de perfil e ID de la cuenta, que nos da el propio servicio. De Twitch, leemos tu nick. También guardamos las cartas que canjeaste y la carta que armes en tu perfil."],
        ["Para qué lo usamos", "Para mantenerte con la sesión iniciada y mostrar tu perfil. No lo vendemos y no lo usamos para anuncios."],
        ["Perfil público", "Tu perfil tiene un enlace público. Cualquiera con el enlace ve tu nombre, tu foto de perfil, la carta que armaste y las cartas que canjeaste. Tu @ (nick de Twitch o del canal de YouTube) aparece en el enlace. El correo y el ID de la cuenta nunca aparecen. Si vinculas una cuenta de Twitch y una de Google, se convierten en un solo perfil con las cartas de ambas."],
        ["Cookies", "Solo usamos cookies esenciales: la de sesión, para el inicio de sesión, y la cookie \"lang\", que guarda el idioma que elegiste. No hay cookies de rastreo ni analíticas."],
        ["Idioma y país", "En tu primera visita usamos el país, que Cloudflare deriva de tu IP, solo para sugerirte el idioma del sitio. Ese dato no se almacena."],
        ["Dónde se guarda", "Los datos están en Cloudflare, que aloja el sitio. Las estadísticas de juego vienen de la API pública deadlock-api."],
        ["Tus derechos (LGPD)", "Puedes pedir acceso, corrección o eliminación de tus datos en cualquier momento abriendo un issue en el GitHub del proyecto. La LGPD es la ley de protección de datos de Brasil."],
      ],
    },
    terms: {
      title: "Términos de uso",
      items: [
        ["El proyecto", "Cardslock es un proyecto de fans, gratuito y hecho por diversión. No está afiliado a Valve ni a Deadlock."],
        ["Cartas", "Las cartas son coleccionables digitales sin valor monetario. No se pueden vender ni cambiar por dinero."],
        ["Tu perfil", "Tú defines el nombre y los atributos de tu carta, y queda pública en tu perfil. No entra en la tier list ni en ningún ranking. Los nombres ofensivos o que suplanten a otra persona pueden eliminarse."],
        ["Uso justo", "No intentes saltarte los códigos de canje, automatizar accesos ni perjudicar el sitio. Las cuentas que lo hagan pueden ser eliminadas."],
        ["Sin garantías", "El sitio se ofrece tal cual y puede cambiar, quedar fuera de línea o cerrarse en cualquier momento."],
        ["Cambios", "Estos términos pueden actualizarse. Usar el sitio después de un cambio significa aceptar la nueva versión."],
      ],
    },
  },
});

export function Legal({ page }: { page: "privacy" | "terms" }) {
  const t = useT(S);
  const locale = useLocale();
  const { title, items } = t[page];
  return (
    <article className="mx-auto max-w-2xl">
      <h1 className="font-display text-2xl font-extrabold tracking-wider text-area uppercase">{title}</h1>
      <p className="mt-1 text-xs text-zinc-500">{t.updated(new Date(2026, 10, 16).toLocaleDateString(locale))}</p>
      {items.map(([h, p]) => (
        <section key={h} className="mt-5">
          <h2 className="text-sm font-bold tracking-wider text-zinc-200 uppercase">{h}</h2>
          <p className="mt-1 text-sm/relaxed text-zinc-400">{p}</p>
        </section>
      ))}
    </article>
  );
}
