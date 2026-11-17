# DESIGN.md · Deadlock Cards

> Se este arquivo e o código discordarem, o código vale até a pessoa decidir. Anote o conflito em Perguntas abertas.

## Produto
Cartas estilo FIFA para jogadores de Deadlock. Projeto 4fun do Hagizao, sem afiliação com a Valve. Telas: Home, Times, Tier List, Coleção, Comparar, Perfil, Resgatar, Editor (admin). O visual é o produto.
Tarefa principal: achar e mostrar uma carta (a sua ou a do streamer) (assumido).

## Público e voz
Quem assiste a stream do Hagizao e chega pela Twitch. Voz curta, de comunidade, sem formalidade (assumido). Português, inglês e espanhol, todo texto via i18n.

## Clima
Palavras: colecionável, emoção de abrir pacote, carta que dá vontade de mostrar.
Nunca parecer: cassino ou loja de pacotes (moedas, "compre agora", contador de oferta); site genérico feito por IA (degradê roxo, brilho em tudo, emoji nos rótulos); site oficial da Valve (nada que sugira afiliação).

## Marca
Fonte do design system: `src/index.css` (tokens `@theme`, `noir-glass`, `noir-glass-strong`) e `src/styles/cards.css` (efeitos das cartas); o guia em `public/design/` (servido em `/design/`) espelha esses arquivos (ver `design-sync.json`).
- Cores: tokens do Panorama do Deadlock: `dl-text` #ffefd7 (offWhite), `dl-black` #10130d (offBlack), degradê `dl-bevel` #373d45 → #4d5860 (hover #4c5561 → #6c7d88). Telas em `zinc`; estados em `red`, `emerald`, `amber`.
- Fontes: VALVE Oracle no texto, VALVE Pulp (`font-display`) nos títulos.
- Movimento: `--ease-out` cubic-bezier(0.23, 1, 0.32, 1); botões encolhem para 0.97 no clique.
- A arte das cartas é feita por pessoas, não por IA.

## Referências
- Cartas do FIFA (Ultimate Team), a principal: pegar a carta em si (OVR grande no canto, posição, atributos em grade, moldura que muda por raridade). Evitar: os menus do FUT (assumido, não confirmado).
- Marvel Snap: pegar a arte saindo da moldura (3D/parallax ao inclinar), as variantes da mesma carta (artes e acabamentos diferentes) e a coleção com progresso. Evitar: moeda e loja na interface (pela regra de "nunca parecer cassino").

## Restrições
- Funciona a 375 px sem scroll horizontal e em desktop largo; alvo de toque de 44 px no celular.
- Foco visível, `hover`/`active`/`disabled` em todo controle, `alt` nas imagens.
- Movimento com propósito, UI < 300 ms, só `transform`/`opacity` quando der, respeitando `prefers-reduced-motion`.
- Tema escuro apenas (assumido).
- Regras completas de estilo em `AGENTS.md`, seção Visual.

## Registro de decisões
- 2026-11-17 — Público principal: quem assiste a stream do Hagizao — é quem chega pela Twitch.
- 2026-11-17 — FIFA pesa mais que Marvel Snap como referência — a carta estilo FUT é a identidade do site.
- 2026-11-17 — Design system já existe no código (`src/index.css`, `src/styles/cards.css`); estender, não renomear.
- 2026-11-17 — Importado para o guia HTML em `public/design/` (`/design/`, fora da navegação): tokens, Card (6 raridades), pill, primaryBtn, field e noir-glass. Os demais componentes ficam só no código — eles são desenhados quando uma tela precisar deles.
- 2026-11-17 — Home = opção A, "vitrine em leque": cartas em destaque no topo, depois uma entrada por área (Times, Tier List, Coleção, Comparar, Resgatar) e o top 4 do ranking com "Ver os N times" — quem chega da stream vê as cartas primeiro e acha cada área sem caçar abas. Escolhida entre 3 direções (B: duas colunas; C: carta do dia).
- 2026-11-17 — As cartas em destaque são escolhidas pelo admin (até 5, Editor › Aparência); sem escolha, a Home mostra as 5 maiores OVR — a vitrine nunca fica vazia.
- 2026-11-17 — O leque só existe a partir de `xl`; abaixo disso a vitrine rola na horizontal começando pela carta principal, sem rotação — 5 cartas não cabem lado a lado em telas menores.
- 2026-11-17 — O carrossel de heróis saiu da Home; a imagem da capa (`homeHero`) virou o fundo da vitrine.
- 2026-11-17 — Header = opção A: abaixo de `lg` as 5 áreas ficam numa barra fixa embaixo (ícone + nome) e o topo mostra só marca, idioma e conta; a partir de `lg` as áreas são abas de texto e só a ativa tem a pílula clara — no celular todas as áreas ficam visíveis e ao alcance do polegar, e no desktop sobra um único destaque. Escolhida entre 3 direções (B: menu em folha; C: abas em formato de carta).
- 2026-11-17 — A marca aparece sempre como "Cardslock" (o "CL" do celular saiu) e o Editor saiu das abas para o menu da conta — é ferramenta de admin e libera espaço para as áreas.
- 2026-11-17 — Ícones novos no `Icon`: `shield` (Times), `bars` (Tier List), `cards` (Coleção), `versus` (Comparar), `ticket` (Resgatar).

## Perguntas abertas
- A tarefa principal é achar e mostrar a sua carta ou a do streamer? (assumido) A Home ainda não personaliza nada para quem está logado ("sua carta").
- A maioria acessa pelo celular (vindo do chat da Twitch) ou pelo desktop (com a stream aberta)?
- Do FIFA, evitar os menus do FUT? (assumido)
- Tema claro algum dia, ou só escuro? (assumido: só escuro)
- Voz: brincadeira de comunidade ou neutra? (assumido: comunidade)
- Tokens duplicados: `platinum-*` (cards.css) têm os mesmos valores de `zinc-100/300/400`. Unificar?
- Cores de estado (erro, sucesso, destaque) viram tokens no `@theme`?
- Raridade e região só existem em TS e em classes. Viram tokens CSS?
- `pill` e `field` não têm estado desabilitado no código; o guia propõe opacidade 50%.
