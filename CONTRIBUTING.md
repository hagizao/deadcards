# Contribuindo com o Deadlock Cards

Valeu por querer ajudar! Este guia cobre como reportar problemas, rodar o projeto e mandar sua mudança.

## Reportando bugs e sugerindo ideias

- Procure nas issues existentes antes de abrir uma nova.
- Bug: descreva o que esperava, o que aconteceu, os passos para reproduzir e o navegador/dispositivo. Print ou vídeo ajudam muito.
- Ideia: explique o problema que ela resolve antes da solução.
- Falha de segurança: não abra issue pública. Fale direto com os mantenedores.

## Rodando localmente

Requisitos: Node 24+. Conta Cloudflare só é necessária para deploy; o dev roda 100% local.

```bash
npm install
cp .dev.vars.example .dev.vars   # preencha as chaves da Twitch se for mexer no login
npm run db:migrate               # cria as tabelas no D1 local
npm run dev                      # site + Worker + D1 + R2 em http://localhost:5173
```

Para ter os dados reais no local, copie produção (precisa de `npx wrangler login`):

```bash
npm run db:pull
```

Os dados são alterados sempre em produção (pelo Editor do site); o D1 local é só uma cópia para testar código.

## Stack

- **Front:** React 19, TypeScript, Vite, Tailwind v4, Motion
- **Back:** Cloudflare Workers (com Static Assets), D1 (SQLite), R2, Cron Triggers
- **Auth:** Better Auth sem banco (sessão em cookie), login com Twitch
- **Dados externos:** [deadlock-api](https://api.deadlock-api.com), com cache no D1

## Fluxo de contribuição

1. Para mudanças grandes, abra uma issue antes para alinharmos a ideia.
2. Faça um fork e crie uma branch a partir da `main`: `feat/nome-curto`, `fix/nome-curto`.
3. Mantenha o PR focado em um assunto só; PRs pequenos são revisados mais rápido.
4. Rode `npm run build` (inclui checagem de tipos) e `npm test` antes de abrir o PR. O CI roda os dois em todo PR e o merge só sai com ele verde.
5. Abra o PR preenchendo o template e linkando a issue. Mudança visual? Coloque print ou vídeo de desktop e celular.
6. Responda aos comentários da revisão com novos commits; o mantenedor faz o merge.

## Commits

Formato [Conventional Commits](https://www.conventionalcommits.org/):

```
tipo(escopo): descrição curta
```

Tipos: `feat`, `fix`, `refactor`, `style`, `perf`, `docs`, `build`, `ci`, `chore`.
Exemplos: `feat(editor): add hero art upload`, `fix(card): keep tilt inside bounds`.

## Padrões de código

- TypeScript estrito; nada de `any` sem motivo.
- Reaproveite o que já existe em `src/lib` e `src/components`.
- Dependência nova precisa de justificativa no PR.
- Rotas que alteram dados exigem admin e validam a entrada.
- SQL sempre com parâmetros (`prepare(...).bind(...)`).

## Testes

- Ficam em `test/`, separados por área (`test/worker/`, `test/auth/`). Helpers e fixtures compartilhados vão em `test/helpers/`.
- Rodam com Vitest dentro do runtime do Workers (`@cloudflare/vitest-plugin`), usando D1 local com todas as migrations aplicadas. As tabelas são limpas antes de cada teste.
- Mudou uma rota de escrita, o resgate ou a checagem de admin? Adicione ou ajuste o teste correspondente.

## Banco de dados

- Toda mudança de schema é uma nova migration em `migrations/` (`000N_descricao.sql`). Nunca edite uma migration que já foi aplicada.
- O deploy aplica as migrations remotas automaticamente.

## Visual

O visual é a alma do projeto. Ao mexer em UI:

- Teste em desktop e em celular (375 px de largura, sem scroll horizontal).
- Animações com propósito: feedback, continuidade espacial ou mudança de estado. Nada de animar ação repetida o tempo todo.
- Respeite `prefers-reduced-motion` e mantenha a navegação por teclado funcionando.

**Movimento reduzido ligado no sistema?** Para ver as animações em dev, emule a preferência no navegador:

- **Chrome/Edge:** DevTools > `Ctrl+Shift+P` > "Show Rendering" > *Emulate CSS media feature `prefers-reduced-motion`* = `no-preference`. Vale só com o DevTools aberto.
- **Firefox:** em `about:config`, crie `ui.prefersReducedMotion` como **Number**: `0` = animações normais, `1` = reduzido. Apague a chave para voltar a seguir o sistema.
- **Último recurso:** ligar as animações no sistema (Windows: Configurações > Acessibilidade > Efeitos visuais > Efeitos de animação).

Antes de abrir o PR, teste também com `reduce`.

## Dúvidas

Abra uma issue com a etiqueta de pergunta ou comente no PR.
