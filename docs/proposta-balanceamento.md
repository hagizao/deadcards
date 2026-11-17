# Proposta de balanceamento: custo pelo herói, poder pelo OVR

Status: **proposta para revisão**, nada implementado. Os números vêm de uma simulação no próprio motor do jogo e dos 45 jogadores do banco local. Os dados de produção podem ser diferentes.

## 1. Regras novas

### Custo: vem só do herói (1 a 8)

Cada herói tem um custo fixo. O jogador não muda o custo da carta.

O custo reflete quando a habilidade brilha:

- Efeitos contínuos e armadilhas são mais baratos, porque rendem mais quando jogados cedo.
- Remoção, troca e anulação são mais caras, porque decidem o jogo no fim.

### Poder: vem do OVR do jogador

A **faixa de OVR** sobe 1 a cada 10 pontos:

| OVR | até 64 | 65–74 | 75–84 | 85–94 | 95+ |
| --- | --- | --- | --- | --- | --- |
| faixa | 0 | 1 | 2 | 3 | 4 |

Cada herói tem um de dois perfis:

| Perfil | Quem | Poder | Valor da habilidade |
| --- | --- | --- | --- |
| **Poder** (carry) | quem bate | base do herói + faixa | fixo |
| **Habilidade** (consistente / suporte) | quem vive da habilidade | base + metade da faixa | +1 com OVR 85+ |

É a sua regra: uma Wraith de 65 sai com 6 de poder e o ZERGGY (95) com 9, os dois com o mesmo custo. Um carry melhor bate mais forte. Um suporte melhor tem a habilidade mais forte.

O poder mínimo é 1, e há cartas de 1 de poder: Vyper, Mina, Paige, Graves, Violet e Baba.

### Teto para remoção

Efeitos que zeram, transformam, destroem ou trocam poder só pegam alvos com poder até **2 × o custo da carta**.

- Uma carta barata não apaga uma cara.
- A Wraith (custo 7) zera até 14, ou seja, praticamente tudo. Ela continua forte como você pediu.

### Orçamento por custo

Uma carta sem habilidade teria este poder. Cada herói recebe o orçamento menos o quanto a habilidade vale.

| Custo | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Orçamento | 2 | 4 | 6 | 8 | 10 | 11 | 13 | 15 |

## 2. Quanto cada habilidade vale (simulação)

### Como medi

São partidas espelhadas, 4 000 por ponto, em locais neutros e sem itens:

- Os dois lados têm o mesmo baralho.
- Só uma carta do jogador tem a habilidade; a da IA é igual, mas sem habilidade.
- A diferença de vitórias foi convertida em "pontos de poder", comparando com a mesma carta com +1, +2, +3… de poder.

### Mais fortes

Valem 3 ou mais de poder, ou crescem muito no fim:

| Herói | Valor (custo 2 / 4 / 6) | Observação |
| --- | --- | --- |
| Wraith | 1,2 / 1,5 / **6,8** | Inofensiva cedo, decisiva no fim. |
| Baba | 1,6 / 3,7 / **6,7** | Remoção que cresce com o alvo. |
| Ivy | 2,1 / 3,5 / 5,6 | |
| Pocket | 1,3 / 2,6 / 4,9 | |
| Rem | 0,8 / 1,0 / 4,9 | |
| Mina | **7,0** / 4,3 / 2,0 | A drenagem por turno é a mais forte do jogo quando jogada cedo. |
| Mo & Krill | +4 fixo | |
| Victor | 1,2 / 1,9 / 2,6 | Já vem com +2 de poder. |
| Violet | **3,7** / 2,7 / 1,0 | Bola de neve se jogada cedo. |

### Medianas

Valem de 1,5 a 3:

- Nurse Harrow, Yamato, Celeste, Viscous, Seven, Warden, McGinnis, Grey Talon, Infernus, Deadman Danny.

### Modestas

Valem menos de 1,5:

- Billy, Venator, Vindicta, Calico, Drifter, Shiv, Paradox, Rat King, Dynamo, Abrams, Lash, Graves, Solomon.

### A simulação não mede bem

O robô não usa a habilidade direito ou ela depende do adversário. Para estas, usei avaliação manual:

- Apollo, Mirage, Sinclair, Silver, Kelvin, Haze, Holliday, Vyper, The Doorman.
- Lady Geist: na carta atual ela tem poder baixo de propósito, e a troca rende de 10 a 20 pontos de diferença no fim. É a mais forte de todas quando acerta.

## 3. Custo de cada herói

Com os 45 jogadores de hoje, a mesa fica com 6, 6, 6, 6, 5, 6, 6 e 4 cartas nos custos de 1 a 8.

| Custo | Heróis (P = poder, H = habilidade) | Cartas reais |
| --- | --- | --- |
| 1 | Calico P, Holliday P, Vyper P, Venator P, Violet P, Graves P | 6 |
| 2 | Abrams P, Mina P, Paige H, Lash P, Bebop P, Rat King P | 6 |
| 3 | Viscous H, Kelvin P, Nurse Harrow H, Mirage P, Seven P, Dynamo H | 6 |
| 4 | Billy P, Celeste P, Mo & Krill P, Infernus P, McGinnis H, Warden P | 6 |
| 5 | Pocket P, Grey Talon P, Rem H, Apollo P, Sinclair P, The Doorman P | 5 |
| 6 | Vindicta P, Shiv H, Ivy H, Drifter P, Silver P, Deadman Danny H | 6 |
| 7 | **Wraith P**, Yamato P, Lady Geist H, Haze P | 6 |
| 8 | Baba P, Paradox P, Victor P, Solomon P | 4 |

O custo 8 tem menos cartas de propósito: só dá para jogá-lo no round 8, ou no 7 com almas extras.

## 4. Nerfs e buffs de habilidade

| Herói | Mudança | Por quê |
| --- | --- | --- |
| **Mina** | Drena só nos 3 turnos depois de revelar. Custo 2, poder 1. | Com 8 rounds, jogada no round 1 ela drenaria 7 vezes. É a mais forte cedo. |
| **Violet** | Ganho permanente limitado a +4. Custo 1, poder 1. | Bola de neve sem teto em 8 rounds. |
| **Lady Geist** | A troca move no máximo 5 de poder (6 com OVR 85+). Custo 7, poder fixo baixo. | Hoje ela pode trocar 2 por 14. |
| **Shiv** | Executa alvos com até 3 de poder (4 com OVR 85+), em vez de 2. Custo 6. | Com 2 de limite quase nunca acerta no fim (valor 0,5). |
| **Baba** | Custo 8, poder 3. O Mestre passa a dar +3 à Baba se o alvo custava 6+, no lugar de "+1 alma no próximo turno". | No round 8 não existe próximo turno, então a alma não serve para nada. |
| **Wraith** | Sem nerf na habilidade. Custo 7, perfil poder, base 5. | Carry de controle, como você pediu. O contra-jogo continua: um Suporte inimigo revelado ali a solta. |
| **Paradox** | Custo 8 com corpo grande (10–11). | A troca de lugar decide o fim, e são justamente os OVR mais altos (93–96). |
| Demais | Sem mudança de texto, só custo e poder novos. | |

### The Doorman

**Hoje:**
- O portal só abre no turno seguinte ao da revelação.
- Só passam aliados que já estavam revelados nos dois locais. Carta jogada naquele turno ainda está virada e não passa.
- Cada carta passa uma vez.
- Não há limite de quantas cartas passam.
- O Mestre dá +2 a cada carta que viaja.

**Proposta:**
- No máximo 2 cartas passam pelo portal.
- O Mestre dá +1 por viagem.

**Por quê:** revelado no round 7, ele deixa a mesa inteira se reposicionar no round 8 e ainda ganhar +2 por carta.

### Suportes com efeito Constante

Os suportes ganham um bônus fixo enquanto estão no local, no lugar do ganho por turno. É mais fácil de ler, não vira bola de neve em 8 rounds e tem contra-jogo: se a carta perde a habilidade ou sai dali, o bônus some.

| Herói | Hoje (ao revelar) | Novo (Constante) |
| --- | --- | --- |
| **Paige** | Aliados aqui +2, uma vez. | Seus aliados aqui têm +1 (+2 com OVR 85+). |
| **Nurse Harrow** | Tira 2 da inimiga mais forte e dá ao aliado mais fraco, uma vez. | A inimiga mais forte daqui tem −1 e seu aliado mais fraco daqui tem +1 (2 e 2 com OVR 85+). |

**Continuam como estão:**
- Ao revelar: Kelvin (o abrigo é a ultimate dele), Ivy, Viscous, Rem e Dynamo.
- Fim do turno: só o que acumula de verdade, ou seja, Mina (por 3 turnos), Violet (até +4), Seven e Graves.

Os valores são ponto de partida e vão ser calibrados na simulação de 8 rounds.

Efeitos "até o fim do próximo turno" jogados no round 8 valem até o placar (Wraith, Rem, Kelvin). Isso já está no preço alto deles.

## 5. Como as cartas reais ficam

Formato: custo/poder; "valor" é o número da habilidade (−X, +X) quando ela usa um.

| Jogador | Herói | OVR | Antes | Depois | Valor da habilidade |
| --- | --- | --- | --- | --- | --- |
| OSES | Venator | 91 | 4/7 | **1/2** | 3 |
| VRAIC | Calico | 89 | 3/7 | **1/2** | 1 |
| REYACHE | Holliday | 89 | 3/6 | **1/2** | — |
| SNIPER | Holliday | 87 | 3/6 | **1/2** | — |
| ZENO | Holliday | 85 | 2/4 | **1/2** | — |
| SEPHUKU | Vyper | 77 | 1/3 | **1/1** | — |
| LYSTIC | Abrams | 89 | 3/5 | **2/3** | 3 |
| OVERSEAS | Abrams | 89 | 3/7 | **2/3** | 3 |
| FRITZ | Abrams | 82 | 1/2 | **2/2** | 3 |
| AVERAGE | Mina | 86 | 3/5 | **2/1** | 1 por 3 turnos |
| LAROKASHI | Mina | 85 | 2/4 | **2/1** | 1 por 3 turnos |
| Hagizão | Paige | 67 | 1/1 | **2/1** | +2 |
| HOOT | Mirage | 94 | 5/9 | **3/4** | +2 |
| SAIAH | Kelvin | 86 | 3/6 | **3/4** | — |
| 1WORST | Seven | 86 | 3/6 | **3/3** | 1 |
| leefa | Seven | 85 | 2/2 | **3/3** | 1 |
| goober | Viscous | 86 | 3/6 | **3/3** | +3 |
| machine | Nurse Harrow | 85 | 2/4 | **3/3** | 3 |
| TOGETHER | Billy | 91 | 4/9 | **4/6** | 2 |
| KAPTEN | Billy | 88 | 3/5 | **4/6** | 2 |
| SOYER | Billy | 83 | 1/2 | **4/5** | 2 |
| douge | Billy | 83 | 1/3 | **4/5** | 2 |
| LOMEIN | Celeste | 91 | 4/9 | **4/6** | 2 |
| coldy | Mo & Krill | 78 | 1/1 | **4/3** (emerge com 7) | +4 |
| ABL | Grey Talon | 95 | 6/10 | **5/9** | 2 |
| DK | Grey Talon | 83 | 1/1 | **5/7** | 2 |
| COSMETICAL | Pocket | 93 | 5/9 | **5/6** | 2 |
| EMPTY DREAMS | Pocket | 90 | 4/6 | **5/6** | 2 |
| balaclava | Rem | 89 | 3/4 | **5/5** | 3 |
| zxcbobi | Shiv | 90 | 4/8 | **6/8** | executa até 4 |
| BACALHAU | Shiv | 84 | 2/5 | **6/8** | executa até 3 |
| shadovis | Drifter | 84 | 2/5 | **6/8** | 3 |
| SKADUSH | Vindicta | 75 | 1/3 | **6/8** | 3 |
| cartoon | Ivy | 84 | 2/2 | **6/6** | +2 |
| saga | Ivy | 75 | 1/2 | **6/6** | +2 |
| ZERGGY | Wraith | 95 | 6/9 | **7/9** | — |
| SANYA SNIPER | Wraith | 90 | 4/7 | **7/8** | — |
| LEAGUE | Wraith | 83 | 1/1 | **7/7** | — |
| NAVARS | Wraith | 80 | 1/1 | **7/7** | — |
| DAMAGE-13 | Yamato | 85 | 2/4 | **7/9** | +4 |
| JONJON | Lady Geist | 87 | 3/3 | **7/2** | troca até 6 |
| DIMOV | Paradox | 96 | 6/10 | **8/11** | — |
| MikaelS | Paradox | 94 | 5/9 | **8/10** | — |
| TAS | Paradox | 93 | 5/11 | **8/10** | — |
| OBIKYM | Baba | 90 | 4/6 | **8/3** | Pombo (até 16) |

### O que muda na prática

- **Jogador de OVR alto com herói barato vira carta barata.** HOOT (Mirage 94) sai de 5/9 para 3/4, e OSES (Venator 91) de 4/7 para 1/2. O OVR agora mexe só no poder, de 1 em 1 por faixa.
- **Jogador de OVR baixo com herói caro vira carta cara.** LEAGUE e NAVARS (Wraith 80–83) saem de 1/1 para 7/7, e SKADUSH (Vindicta 75) de 1/3 para 6/8. Continuam mais fracos que o ZERGGY no mesmo custo.
- **A diferença de OVR pesa menos que antes.** Hoje o OVR define o custo inteiro. Na proposta, entre 75 e 95 a diferença é de 2 pontos de poder, que é a proporção do seu exemplo (65 → 6, 95 → 9).
- A curva fica com cerca de 6 cartas por custo, então todo round tem jogada.

## 6. Palavras-chave de momento

### Saem as palavras-chave de atributo

Saem da carta, do motor, do editor, dos textos e dos testes. Cada uma tinha um efeito:

| Palavra-chave | Atributo 90+ | Efeito que sai |
| --- | --- | --- |
| Mira | MIR | Mira na mais forte |
| Macro | MAC | +2 se estiver perdendo |
| Suporte | SUP | +1 no aliado mais fraco |
| Pool de heróis | POL | Compra 1 carta |
| Movimentação | MOV | Move 1 vez de graça |
| Constante | CON | Imune a queimadura |

**Como fica o alvo:** os efeitos que miravam pela Mira (ricochete da Celeste, Lash, Mina) passam a escolher a inimiga ao acaso. O texto da carta já diz "uma inimiga".

**Atributos continuam:** os atributos seguem definindo a Maestria (Profissional/Mestre) e o OVR.

### Entram as palavras-chave de momento

Cada carta mostra um selo dizendo quando a habilidade age:

| Selo | Quando age | Heróis |
| --- | --- | --- |
| **Ao revelar** | Uma vez, ao virar | 32 de hoje, menos Paige e Nurse Harrow |
| **Constante** | Enquanto estiver no local | Mo & Krill, Solomon, Victor, Warden, Paige, Nurse Harrow |
| **Fim do turno** | No fim de cada turno | Graves, Mina, Seven, Violet |
| **Movimento** | Pode se mover | Mirage, Sinclair |
| **Reação** | Quando algo acontece com ela | Apollo (riposta), Silver (lobisomem ao sofrer dano) |

O tipo "Contínuo" muda de nome para "Constante". Cada selo tem uma explicação curta no detalhe da carta, nos três idiomas.

## 7. Baralho montado com versões de herói

- **Afinidades (editor):**
  - Novo campo "Heróis de afinidade" no jogador, com vários heróis marcados.
  - Cada herói marcado gera uma versão da carta com o mesmo jogador, OVR e atributos, mas com a arte, o custo e a habilidade daquele herói.
  - As variantes que já existem (como o SNIPER de Pocket) contam como versões.
  - O campo vai no `extra_json` do jogador, então não precisa de migration.
  - O worker valida que os heróis existem.
- **Herói de assinatura:** a versão do herói principal é a normal. As outras saem com −1 de poder, a menos que o jogador tenha Pool de heróis (POL) 90+. É o atributo POL ganhando sentido no jogo agora que a palavra-chave sai.
- **Tela "Baralho"**, antes de Jogar:
  - escolha de 12 cartas, um jogador uma vez só e na versão que você quiser;
  - o baralho fica salvo no navegador;
  - tem um botão "Aleatório";
  - "Jogar" usa o baralho salvo e, sem ele, monta um aleatório.
- **Baralho da IA:**
  - 12 cartas com média de OVR ±1 da sua e curva de custo parecida;
  - versão sorteada entre as afinidades;
  - pode ter os mesmos jogadores que você, como no FIFA.

## 8. Plano de implementação

Cada etapa vira um commit, todos na branch atual.

1. **Custo e poder das cartas:**
   - custo por herói (1 a 8), perfil poder/habilidade, base, faixa de OVR e valor +1 com OVR 85+;
   - sai o custo por ranking (`costByRank`, `COST_SHARE`);
   - custo, perfil e base de cada herói ficam editáveis no admin;
   - as cartas que o admin já ajustou à mão continuam valendo.
2. **Tetos e habilidades:**
   - teto de 2 × custo para zerar, transformar, destruir e trocar;
   - Mina por 3 turnos, Violet até +4, Lady Geist troca no máximo 5 (+1), Shiv executa até 3 (+1);
   - novo Mestre da Baba;
   - Doorman com no máximo 2 cartas no portal e Mestre +1;
   - Paige e Nurse Harrow passam a Constante.
3. **Palavras-chave:** saem as de atributo e entram os selos de momento na carta e no detalhe.
4. **8 rounds:**
   - almas = número do round;
   - fases early 1–3, mid 4–6, late 7–8, com indicador na tela;
   - a Maestria libera por fase: Profissional a partir do mid, Mestre (a ultimate) no late, sempre até o nível que o atributo permite.
5. **Lojas, chefe e comeback:**
   - lojas nos rounds 2 (tier 1), 4 (tier 2/3) e 7 (tier 3/4), com itens custando 1/2/4/6;
   - Chefe do Meio no round 6;
   - +1 alma no começo do round para quem está perdendo em mais locais;
   - recompensa de +1 alma para quem virar um local que o outro vencia há 2 rounds ou mais.
6. **Itens com a seta:** o item mira uma carta sua e só ela recebe o efeito. A IA escolhe a melhor carta dela. O Superior Cooldown é revisto, porque dobra os efeitos de fim do turno.
7. **Afinidades e versões:** campo no editor, validação no worker e geração das versões.
8. **Baralho:** tela de montar baralho e o baralho da IA por média de OVR.
9. **Calibrar:** rodar a simulação de novo com 8 rounds e ajustar as bases dos heróis.
10. **Verificar:** testes novos no motor (custo, teto, fases, lojas, comeback, itens com alvo, baralho da IA), lint, build e conferência no navegador em desktop e a 375 px.

## Observação lateral

Na simulação com itens ligados, só a IA comprava item, porque o robô do jogador gastava todas as almas antes da loja. A IA ganhava muito mais vezes. Isso bate com a sua impressão de que os itens estão fortes demais.

## 9. Calibração com 8 rounds (resultado)

Simulação de partidas completas com a tabela real: decks aleatórios de 12 entre os 44 heróis, todos com o mesmo OVR, itens desligados, 30 a 40 mil partidas por rodada. O efeito de cada herói é a diferença de vitória entre tê-lo no seu deck e tê-lo no deck da IA. +1 de poder vale cerca de 0,009; o erro de cada herói é de uns ±0,005.

Antes, com OVR 80, os extremos iam de −0,077 (Baba) a +0,048 (Mo & Krill). Depois dos ajustes abaixo, todos os heróis ficam entre −0,027 e +0,027 com OVR 65, 80 e 92.

| Herói | Antes | Depois | Motivo |
| --- | --- | --- | --- |
| Baba | 8 de custo, base 0 | base 5 | −0,077: a Revoada sozinha não paga 8 almas |
| Paradox | base 7 | base 11 | −0,042 |
| Lady Geist | 7 de custo, base 1, rouba até 5 | 5 de custo, base 2, rouba até 6 | −0,034; mais poder não ajuda, porque a troca só rende com poder baixo |
| Graves | base −2 | base 1 | −0,033 |
| Silver | base 4 | base 6 | −0,027 |
| Holliday | base −1 | base 1 | −0,020 |
| Haze, Solomon | base 7 | base 9 | −0,017 |
| Rem, Abrams | | base +1 | −0,016 e −0,012 |
| Mo & Krill | base 1, emerge com +4 | base 0, emerge com +2 | +0,048 |
| Warden | base 3 | base 1 | +0,032 |
| Ivy, Paige | | base −1 | +0,023 e +0,022 |

Com OVR 92 (cartas chegando a Mestre), três heróis passavam muito do resto:

- **Warden e Paige:** o Profissional dava +1 no valor, e com valor 1 por carta isso dobrava o efeito. Agora o Profissional deles dá +1 de poder (`PRO_ON_POWER`).
- **Warden Mestre (Última Resistência):** cada inimiga do local perde 1 no fim da partida, mas o Warden não ganha mais esse poder.
- **Mo & Krill Mestre:** ao emergir, só a inimiga mais forte do local perde 2 (antes, todas perdiam 2).

A Wraith ficou como estava (efeito 0,000 com OVR 80), mantendo a decisão de deixá-la forte como carry de controle.
