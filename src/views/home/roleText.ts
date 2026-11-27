// O que cada função faz, em linguagem de quem nunca viu o competitivo. Usado no palco e na seção de funções da Home.
import { strings } from "../../lib/i18n";

export const ROLE_TEXT = strings({
  pt: {
    Carry: "Causa o dano principal e cresce ao longo da partida: é quem decide as lutas no final.",
    OffCarry: "Segundo foco de dano. Pressiona as rotas e abre espaço para o carry crescer.",
    Frontline: "Entra na frente, segura o dano e inicia as lutas para o time.",
    Flex: "Se adapta ao que o time precisa e joga de vários heróis e funções.",
    Suporte: "Protege, cura e prepara as jogadas. O time anda junto por causa dele.",
  },
  en: {
    Carry: "Deals the main damage and scales through the match: the one who decides late fights.",
    OffCarry: "Second damage threat. Pressures the lanes and makes room for the carry to grow.",
    Frontline: "Goes in first, soaks damage and starts fights for the team.",
    Flex: "Adapts to what the team needs and plays many heroes and roles.",
    Suporte: "Protects, heals and sets up plays. The team moves together because of them.",
  },
  es: {
    Carry: "Hace el daño principal y crece durante la partida: decide las peleas del final.",
    OffCarry: "Segunda amenaza de daño. Presiona las líneas y abre espacio para el carry.",
    Frontline: "Entra primero, aguanta el daño e inicia las peleas del equipo.",
    Flex: "Se adapta a lo que el equipo necesita y juega muchos héroes y roles.",
    Suporte: "Protege, cura y prepara las jugadas. El equipo se mueve unido gracias a él.",
  },
});

export const ROLES = ["Carry", "OffCarry", "Flex", "Frontline", "Suporte"] as const;
export type Role = (typeof ROLES)[number];
export const isRole = (p: string): p is Role => (ROLES as readonly string[]).includes(p);
