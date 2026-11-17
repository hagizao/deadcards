# Cardslock Game: heróis, atributos e Maestria

Referência das regras combinadas para levar os atributos das cartas da coleção para o Cardslock Game. O código segue este documento; quando um número mudar no balanceamento, atualize aqui também.

**Regra principal:** o herói define o que a carta faz; o jogador define o quão bem ela faz. Duas cartas do mesmo herói têm a mesma habilidade, e a do melhor piloto faz melhor.

## Prioridade

- No turno 1, o **Rei Oculto** (você) tem prioridade.
- No fim de cada turno, quem estiver **ganhando a partida** (mais locais vencidos) fica com a prioridade do turno seguinte. Em caso de empate, a prioridade não muda.
- Quem tem prioridade age primeiro em tudo: revelações, execuções marcadas (Shiv), efeitos de fim de turno e revelação dos itens.

## Atributos

Os 6 atributos da carta da coleção entram no jogo: Mira (MIR), Macro (MAC), Suporte (SUP), Movimentação (MOV), Pool de heróis (POL) e Consistência (CON). O OVR continua definindo o custo pelo ranking do baralho.

### Maestria

Cada herói tem um **atributo principal** (tabela abaixo; o admin pode trocar no editor). O valor do jogador nesse atributo define o nível:

| Nível | Atributo principal | Efeito |
| --- | --- | --- |
| Aprendiz | abaixo de 82 | Habilidade normal |
| Profissional | 82 a 89 | Valor da habilidade +1 (ou +1 de poder, se a habilidade não tem valor) |
| Mestre | 90 ou mais | Igual ao Profissional, mais a **frase de Mestre** do herói |

A frase de Mestre é **uma por herói**, igual para todas as cartas Mestre daquele herói.

> O bônus de valor ficou em +1, não +2: com os valores novos (a maioria entre 1 e 3), +2 dobraria quase todas as habilidades.

### Palavras-chave

Os até 2 maiores atributos do jogador, se forem **90 ou mais**, viram palavras-chave:

| Atributo | Palavra-chave | Efeito |
| --- | --- | --- |
| Mira | Certeiro | Efeitos de alvo aleatório acertam a inimiga mais forte |
| Macro | Lê o mapa | +2 ao revelar num local onde você está perdendo |
| Suporte | Jogador de equipe | Ao revelar, seu aliado mais fraco aqui ganha +1 |
| Movimentação | Ágil | Pode se mover uma vez por partida |
| Pool de heróis | Versátil | Ao revelar, você compra 1 carta |
| Consistência | Constante | Imune a queimadura e veneno |

### Cartas do mesmo herói

- **Duelo de espelho:** quando uma carta revela no mesmo local de uma carta inimiga do mesmo herói, as duas duelam pelo nível de Maestria. Quem vence ganha +2 de poder por nível de diferença; quem perde fica sem habilidade até o fim do turno. Mesmo nível: empate, nada acontece. Um jogador com Pool de heróis 90+ nunca perde a habilidade num duelo.
- **Mentoria:** se você revela uma carta e já tem em jogo um jogador melhor do mesmo herói (atributo principal maior), a nova sobe um nível de Maestria nesta partida (até Mestre) e ganha +1.

## Glossário

- **Dano / debuff:** perder poder por efeito inimigo.
- **Imune:** não sofre efeitos inimigos.
- **Imparável:** não pode ser movida, perder a habilidade nem ser atordoada, e não sofre debuff.
- **Vulnerável:** o próximo dano que a carta sofrer é dobrado.
- **Canalizado:** efeito que dura alguns turnos e acaba se a carta for movida, atordoada, perder a habilidade ou perder poder.
- **Petrificar:** exclusivo da Vyper. A carta perde a habilidade e não pode ser movida.
- **Escolha:** o alvo ou local é escolhido na hora de jogar a carta; se o alvo sair dali antes da revelação, a carta escolhe sozinha.
- **Mover:** cartas com movimento disponível podem ir para outro local durante o seu turno, tocando na carta e depois no destino.

## Heróis

| Herói | Atributo | Habilidade padrão | Frase de Mestre |
| --- | --- | --- | --- |
| Abrams | Consistência | Empurra a inimiga mais forte daqui para outro local; sem espaço, ela bate na parede e perde 3. | Se ela bater na parede, o Abrams ganha +2. |
| Apollo | Consistência | O primeiro efeito inimigo que tiraria poder dele é anulado, e quem causou perde 2. | Anula os dois primeiros efeitos. |
| Baba | Macro | Transforma a inimiga mais cara daqui num Pombo de 1 de poder, sem habilidade. | Se ela custava 5 ou mais, você ganha +1 alma no próximo turno. |
| Bebop | Mira | A próxima carta que o inimigo revelar é puxada para cá. | Ela perde 2 ao chegar e não pode sair daqui. |
| Billy | Consistência | Acorrenta a inimiga mais forte daqui: perde 2 e não pode ser movida. | Ela também perde a habilidade. |
| Calico | Movimentação | No fim do próximo turno, ulta: as inimigas daqui perdem 1 e a Calico fica imune. | Depois da ulti, ela pode se mover uma vez (até o fim do turno seguinte). |
| Celeste | Mira | A inimiga mais forte daqui perde 2; a luz ricocheteia e tira 1 de outra inimiga em qualquer local. | Um ricochete a mais. |
| Deadman Danny | Mira | As inimigas daqui queimam −1 até o fim do próximo turno. | A inimiga mais forte daqui também perde 2. |
| Drifter | Mira | Se houver só uma inimiga aqui, ela perde 3 e o Drifter ganha +3. | Também funciona com 2 inimigas (ataca a mais fraca). |
| Dynamo | Suporte | Puxa a inimiga mais fraca de cada outro local para cá; elas perdem 1. | Suas cartas aqui ganham +1 por inimiga puxada. |
| Graves | Macro | No fim de cada turno, um Carniçal de 1 de poder nasce aqui para você e para o inimigo. | O Carniçal do inimigo tem 0 de poder. |
| Grey Talon | Mira | **Escolha** uma inimiga em qualquer local: ela perde 2; se zerar, o Grey Talon ganha +2 permanente. | O bônus é +4. |
| Haze | Mira | **Escolha** uma inimiga daqui para dormir: ela fica vulnerável até o fim do próximo turno. | No fim do próximo turno, a dança tira 3 das outras inimigas daqui (canalizada). |
| Holliday | Mira | **Escolha** uma inimiga daqui e um local: ela e a Holliday vão para lá. | A inimiga perde 3. |
| Infernus | Consistência | A inimiga mais forte daqui queima −2 por 2 turnos. | Ela também perde a habilidade e não pode ser movida até o fim do próximo turno. |
| Ivy | Suporte | Liga-se ao seu aliado mais forte em outro local: os dois ganham +2. | Os dois ficam imunes até o fim do próximo turno. |
| Kelvin | Suporte | Você e seus aliados aqui não sofrem dano até o fim do próximo turno. | Inimigas daqui com Mira como atributo principal perdem 2. |
| Lady Geist | Consistência | Troca o poder dela com o da inimiga mais forte daqui (se for maior). | Depois da troca, a inimiga fica com 1 de poder. |
| Lash | Movimentação | Arremessa até 2 inimigas daqui para outro local; elas perdem 1. | **Você escolhe** o local. |
| McGinnis | Macro | Monta uma Torreta de 2 de poder em outro local seu. | A Torreta tem 4 de poder. |
| Mina | Mira | No fim de cada turno, drena 1 de uma inimiga daqui. | Depois de revelar, pode se mover uma vez até o fim do próximo turno. |
| Mirage | Movimentação | Uma vez por partida, pode viajar para um local à sua escolha e ganha +2. | Pode viajar duas vezes. |
| Mo & Krill | Consistência | Entoca: não soma poder até o fim da partida, quando emerge com +4. Não pode ser alvo. | Ao emergir, cada inimiga daqui perde 2. |
| Nurse Harrow | Suporte | Tira 2 da inimiga mais forte daqui e dá ao seu aliado mais fraco aqui. | O inimigo não pode jogar cartas aqui no próximo turno. |
| Paige | Suporte | Seus aliados neste local ganham +2. | Inimigas daqui não podem sair por conta própria. |
| Paradox | Macro | Troca de lugar com a inimiga mais forte de outro local. | A inimiga trocada perde 2. |
| Pocket | Movimentação | As inimigas daqui perdem 2. | E perdem 1 no fim de cada turno. |
| Rat King | Macro | Põe 1 Rato (custo 1, poder 1) na sua mão; ele ganha +1 por turno na mão (até +3). | O Rato custa 0. |
| Rem | Suporte | As inimigas daqui adormecem: −2 até o fim do próximo turno. | Enquanto elas dormem, suas cartas aqui têm +1. |
| Seven | Consistência | Tempestade canalizada: no fim deste turno e do próximo, as inimigas daqui perdem 1. | Imparável: a tempestade não é interrompida. |
| Shiv | Mira | Destrói a inimiga mais fraca daqui com 2 ou menos de poder. Se não houver, até o fim do próximo turno você pode **marcar** uma inimiga daqui: ela é executada na sua vez de revelar, se tiver 2 ou menos. | Se destruir, usa de novo (uma vez). |
| Silver | Consistência | Se sofrer dano, no fim do próximo turno vira lobisomem: +6 permanente. | Ao virar lobisomem, destrói a inimiga mais fraca daqui. |
| Sinclair | Macro | Uma vez por partida, pode se mover deixando uma ilusão no local de origem (metade do poder, sem habilidade). | A ilusão tem o poder inteiro. |
| Solomon | Macro | Se o seu lado deste local estiver cheio, ganha +5. | Funciona com 1 carta a menos. |
| The Doorman | Macro | **Escolha** outro local: no próximo turno, suas cartas aqui e lá podem viajar entre os dois. | Elas ganham +2 ao viajar. |
| Venator | Macro | Arma uma armadilha aqui: a próxima inimiga revelada neste local perde 3. | Arma uma segunda armadilha num local aleatório. |
| Victor | Consistência | Aura contínua: todas as cartas daqui, dos dois lados, têm −2. | Só as inimigas. |
| Vindicta | Mira | **Escolha** uma inimiga em qualquer local: ela perde 3; se não zerar, a Vindicta cai do céu e perde 3. | Ela não cai do céu. |
| Violet | Macro | No fim de cada turno, ganha +1 permanente por local que você está vencendo. | Locais empatados contam como vencidos. |
| Viscous | Suporte | Seu aliado mais fraco aqui (ou o Viscous) fica imune e ganha +2. | Protege também um segundo aliado daqui. |
| Vyper | Mira | Petrifica a próxima inimiga revelada aqui. | Ela também perde 2. |
| Warden | Consistência | Ganha +1 por inimiga aqui. | Última Resistência: no fim da partida, cada inimiga daqui perde 1 e o Warden ganha esse poder. |
| Wraith | Movimentação | Ergue a inimiga mais forte daqui: o poder dela conta como 0 até o fim do próximo turno, ou até um Suporte inimigo ser revelado aqui. | Se você estiver perdendo aqui no fim do próximo turno, a Wraith vai para outro local aleatório. |
| Yamato | Consistência | Se você estiver perdendo aqui, ganha +4 e fica imune. | Se ainda estiver perdendo no fim do próximo turno, pode ir para outro local com inimigas. |
