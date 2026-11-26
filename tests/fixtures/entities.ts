/**
 * Made-up entities for tests and the component gallery. None of this is game data: names, numbers and relations
 * are invented to exercise every link state, hover card and reverse reference.
 */
import type { Entity } from "../../src/lib/entities/types.ts";
import { pixelIcon } from "./pixel-icon.ts";

const blade = pixelIcon(
  [
    "..........ww",
    ".........wsw",
    "........wsw.",
    ".......wsw..",
    "......wsw...",
    ".k...wsw....",
    "..k.wsw.....",
    "...kbw......",
    "...bk.......",
    "..b..k......",
    ".b..........",
    "b...........",
  ],
  { w: "#e8eefc", s: "#9fb0d8", k: "#c7a23a", b: "#6b4a2b" },
);
const potion = pixelIcon(
  [
    "....cc....",
    "....ww....",
    "....ww....",
    "...wrrw...",
    "..wrrrrw..",
    ".wrrhrrrw.",
    ".wrrrrrrw.",
    ".wrrrrrrw.",
    "..wrrrrw..",
    "...wwww...",
  ],
  { c: "#8a5a2b", w: "#cfe3ff", r: "#e0484f", h: "#ffb3b8" },
);
const ore = pixelIcon(
  [
    "...gggg...",
    "..gssggg..",
    ".gsyysggg.",
    ".gsyyggsg.",
    "ggggggsyg.",
    "gsyggggyg.",
    "gssggsggg.",
    ".ggggggg..",
  ],
  { g: "#5b6477", s: "#8e98ad", y: "#7fd2ff" },
);
const slime = pixelIcon(
  [
    "....gggg....",
    "..gglllggg..",
    ".gllggggggg.",
    "gglgwwggwwgg",
    "ggggwkggwkgg",
    "gggggggggggg",
    "ggggg..ggggg",
    ".gggggggggg.",
  ],
  { g: "#4fbf2f", l: "#9be86d", w: "#ffffff", k: "#0b0f1c" },
);

export const FIXTURE_ENTITIES: Entity[] = [
  {
    ref: "item:example-blade",
    name: { pt: "Lâmina de Exemplo", en: "Example Blade" },
    slug: { pt: "lamina-de-exemplo", en: "example-blade" },
    icon: blade,
    summary: { pt: "Uma arma inventada para mostrar como os itens aparecem na wiki.", en: "A made-up weapon that shows how items look on the wiki." },
    facts: [
      { label: { pt: "Dano", en: "Damage" }, value: "12" },
      { label: { pt: "Peso", en: "Weight" }, value: "4,5 oz" },
    ],
    relations: [{ type: "madeFrom", to: "item:sample-ore", amount: [3, 3] }],
  },
  {
    ref: "item:sample-potion",
    name: { pt: "Poção de Amostra", en: "Sample Potion" },
    slug: { pt: "pocao-de-amostra", en: "sample-potion" },
    icon: potion,
    summary: { pt: "Um consumível de exemplo.", en: "A sample consumable." },
    facts: [{ label: { pt: "Cura", en: "Heals" }, value: "40" }],
  },
  {
    ref: "item:sample-ore",
    name: { pt: "Minério de Amostra", en: "Sample Ore" },
    slug: { pt: "minerio-de-amostra", en: "sample-ore" },
    icon: ore,
    summary: { pt: "Um material de exemplo, usado em receitas de exemplo.", en: "A sample material, used in sample recipes." },
  },
  {
    ref: "monster:test-slime",
    name: { pt: "Gosma de Teste", en: "Test Slime" },
    slug: { pt: "gosma-de-teste", en: "test-slime" },
    icon: slime,
    summary: { pt: "Um monstro inventado para testes.", en: "A monster made up for tests." },
    facts: [
      { label: { pt: "Vida", en: "Health" }, value: "300" },
      { label: { pt: "Exp", en: "Exp" }, value: "120" },
    ],
    relations: [
      { type: "drops", to: "item:sample-ore", tier: "comum", amount: [1, 3] },
      { type: "drops", to: "item:example-blade", tier: "muito-raro", amount: [1, 1] },
      { type: "drops", to: "item:sample-potion", tier: "incomum", amount: [1, 1] },
    ],
  },
  {
    ref: "monster:practice-golem",
    name: { pt: "Golem de Treino", en: "Practice Golem" },
    slug: { pt: "golem-de-treino", en: "practice-golem" },
    summary: { pt: "Outro monstro inventado, sem ícone, para mostrar o espaço reservado.", en: "Another made-up monster, without an icon, to show the placeholder." },
    facts: [{ label: { pt: "Vida", en: "Health" }, value: "1.200" }],
    relations: [{ type: "drops", to: "item:sample-ore", tier: "sempre", amount: [2, 5] }],
  },
  {
    ref: "npc:sample-merchant",
    name: { pt: "Mercador de Exemplo", en: "Sample Merchant" },
    slug: { pt: "mercador-de-exemplo", en: "sample-merchant" },
    summary: { pt: "Um vendedor inventado.", en: "A made-up vendor." },
    relations: [
      { type: "sells", to: "item:sample-potion", price: 25 },
      { type: "buys", to: "item:sample-ore", price: 8 },
    ],
  },
  {
    ref: "place:sample-valley",
    name: { pt: "Vale de Exemplo", en: "Sample Valley" },
    slug: { pt: "vale-de-exemplo", en: "sample-valley" },
    summary: { pt: "Um lugar inventado.", en: "A made-up place." },
  },
];
