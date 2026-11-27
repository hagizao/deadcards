# AGENTS.md

Contexto para agentes de IA trabalhando neste repositório. Para o fluxo de contribuição humano, veja [CONTRIBUTING.md](CONTRIBUTING.md).

## Visão geral

Deadlock Cards é um site de cartas estilo FIFA para jogadores de Deadlock. Front em React servido por um Cloudflare Worker, que também expõe a API, guarda dados no D1 e imagens no R2. O visual é a prioridade do produto.

## Setup

```bash
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate
npm run dev
```

O dev roda tudo local (Vite + `@cloudflare/vite-plugin`) em `http://localhost:5173`. Se já houver um servidor de dev rodando, reutilize-o.

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Site + Worker + D1 + R2 locais |
| `npm run lint` | ESLint: TypeScript, hooks do React, acessibilidade e classes do Tailwind (`-- --fix` corrige ordem e forma das classes) |
| `npm run build` | Checagem de tipos + build de produção |
| `npm test` | Testes (Vitest) em `test/` |
| `npm run db:migrate` | Aplica migrations no D1 local |
| `npm run db:pull` | Substitui o D1 local por uma cópia de produção (guarda o antigo em `.wrangler/backup/`) |
| `npm run db:import -- <save.json> [--remote]` | Importa um save JSON para D1 e R2 |
| `npm run design:guide` | Depois do `build`, regenera `public/design/app.css` e `card.html` a partir do código |
| `npm run deploy` | Build + deploy no Cloudflare |

## Arquitetura

```
src/worker.ts        Worker: /api/*, /img/* (R2), cron de sync da deadlock-api
src/auth.ts          Better Auth stateless (Twitch) + checagem de admin
src/lib/             Tipos, regras das cartas (OVR, tiers, raridade), DataProvider
src/components/      Card, Spotlight, Account e peças reutilizáveis
src/views/           Telas (Home, Teams, TierList, Collection, Editor, Login...)
src/styles/cards.css CSS das cartas
migrations/          Schema do D1, uma migration por mudança
scripts/             Scripts de manutenção
public/design/       Guia do design system, servido em /design/
```

Antes de criar helper ou componente, procure um existente em `src/lib` e `src/components`.

## Convenções

- TypeScript estrito; o build falha com erro de tipo.
- Dependência nova precisa de justificativa no PR.
- Texto visível passa pelo i18n (`src/lib/i18n.tsx`), nunca literal no JSX de uma tela já traduzida.

## Visual

O visual é o produto. Mudança de UI segue estas regras; código antigo que não segue não precisa ser corrigido junto, só não piore.

**Brief e guia**

- Leia o [DESIGN.md](DESIGN.md) antes de qualquer tarefa de design: produto, público, clima, referências e o que o site nunca pode parecer.
- O guia do design system fica em `public/design/` e abre em `/design/` (local e produção). Ele não tem link no site e está com `noindex`: só abre digitando a URL. Não adicione link para ele na navegação.
- O código é a fonte da verdade e o guia o espelha com os mesmos nomes; `design-sync.json` guarda os valores combinados. Mudou token, carta ou classe de `src/lib/ui.ts`? Atualize `public/design/tokens.css` e as páginas, rode `npm run build && npm run design:guide` e atualize o `design-sync.json`.

**Onde vai o estilo**

- Utilitários do Tailwind v4 no `className`. Classe escrita inteira, nunca montada (`` `bg-${cor}` ``).
- CSS próprio só para o que o Tailwind não expressa bem (efeitos das cartas, máscaras, keyframes): cartas em `src/styles/cards.css`, o resto em `src/index.css`.
- `style={{ }}` só para valor realmente dinâmico (cor do jogador, posição calculada, variável CSS).
- Componente com muitas classes repetidas vira componente, não uma string de classes copiada.

**Layout**

- `flex` + `gap` para linhas, colunas, toolbars e grupos de botões. `grid` só para estrutura 2D de verdade (galerias, tier list, tabelas).
- Espaço entre irmãos é `gap`; espaço interno é `padding`. Não alinhe com margin, margin negativa ou valor mágico: corrija o container.
- `mx-auto` só para centralizar um bloco com largura limitada (`max-w-*`).
- Prefira a escala do Tailwind (`p-4`, `gap-3`, `rounded-xl`) a valores arbitrários (`p-[13px]`). Arbitrário só quando a escala não serve, e o lint (`enforce-canonical-classes`) troca pela forma canônica quando existe.
- Layout fluido (`flex-wrap`, `minmax`, `clamp`, `max-w-*`) em vez de larguras e posições fixas. Não esconda overflow com `overflow-hidden` sem achar a causa.

**Cor e superfície**

- Use a paleta do Tailwind já usada no projeto (`zinc` para superfícies e texto) e as superfícies existentes (`noir-glass`, `noir-glass-strong`) antes de criar outra.
- Cor reutilizada em mais de um lugar vira token em `@theme` no `src/index.css`. Hex solto no JSX só para dado (cor de time/jogador).
- Poucas bordas: separe áreas com contraste de fundo, espaço, sombra suave e hierarquia. Borda só quando melhora a leitura ou a affordance.

**Estados e acessibilidade**

- Todo controle interativo tem `hover`, `focus-visible` visível (nunca `outline-none` sem substituto), `active` e `disabled`; carregamento é visível e não só por cor.
- Elemento clicável é `<button>` ou `<a>`, imagem tem `alt`, campo tem rótulo. Preserve teclado, `aria-*` e `cursor`.
- Alvo de toque com pelo menos 44 px no celular. Não esconda conteúdo em telas menores.

**Movimento**

- Motion, com propósito (feedback, continuidade, estado), UI < 300 ms, só `transform`/`opacity` quando der, e respeitando `prefers-reduced-motion`. Nada de animar ação de alta frequência.

**Responsivo**

- Funciona a 375 px sem scroll horizontal e em desktop largo. Use os breakpoints do Tailwind (`sm`, `md`, `lg`) antes de criar outro.

## Backend e dados

**Produção é a fonte da verdade dos dados.**

- Toda mudança de dado (tiers, times, cartas, packs, configurações) é feita em produção: pelo Editor do site em produção ou, por agente, com `wrangler d1 execute deadcards --remote`.
- Nunca altere dados só no D1 local, nem gere arquivos `.sql` para outra pessoa importar. Mudança de dado feita só no local se perde e não chega a ninguém.
- Antes de escrever em produção, leia o valor atual com `--remote` e mude só o necessário. Nada de `DELETE` ou sobrescrita em massa sem confirmação.
- O D1 local serve só para testar código. Para ter os dados reais nele, rode `npm run db:pull`.
- `npm run dev` continua 100% local: código de branch pode depender de migrations que ainda não estão em produção.
- Migrations novas só vão para produção (`npm run db:migrate:remote`) junto com o deploy do código que as usa.

- Toda rota que altera dados exige admin via `currentUser(...).admin`. Admins são definidos em `ADMINS` no `wrangler.jsonc`.
- Valide entrada em toda API de escrita e upload.
- SQL sempre com bind (`prepare(...).bind(...)`), nunca concatenando valores.
- Schema muda só por migration nova em `migrations/` (`000N_descricao.sql`). Nunca edite migration já aplicada.
- Imagens vão para o R2 e são servidas por `/img/<key>`; nada de base64 no banco.

## Verificação

Antes de considerar uma tarefa pronta:

1. `npm run lint` sem erros. Não silencie regra com `eslint-disable` sem um comentário dizendo o porquê.
2. `npm run build` passa.
3. `npm test` passa. Mudança de regra no worker, auth ou import ganha um teste em `test/`.
4. Mudanças de UI foram conferidas no navegador, em desktop e a 375 px, sem erro no console.
5. Mudança visual passou pelo checklist de [Visual](#visual): estilo no lugar certo, `flex`/`gap` em vez de margin, escala do Tailwind, cor reutilizada como token, sem borda à toa, estados `hover`/`focus-visible`/`active`/`disabled`, texto no i18n.

## Segurança

`BETTER_AUTH_SECRET`, `TWITCH_CLIENT_ID` e `TWITCH_CLIENT_SECRET` ficam em `.dev.vars` (local) e `wrangler secret put` (produção). Nunca commite `.dev.vars` nem exponha segredos em logs ou respostas da API.

## Git

- Commits em [Conventional Commits](https://www.conventionalcommits.org/), um por etapa lógica.
- Não faça push nem deploy sem pedido explícito.
