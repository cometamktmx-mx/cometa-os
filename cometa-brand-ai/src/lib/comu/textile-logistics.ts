export type TextileProfile = {
  key: string;
  label: string;
  weightG: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  packaging: string;
  classLabel: "Ligero" | "Estándar" | "Voluminoso";
};

const profiles: TextileProfile[] = [
  { key: "PLAYERA", label: "Playera / top / blusa", weightG: 250, lengthCm: 25, widthCm: 20, heightCm: 3, packaging: "Bolsa pequeña", classLabel: "Ligero" },
  { key: "SHORT", label: "Short / biker", weightG: 280, lengthCm: 25, widthCm: 20, heightCm: 4, packaging: "Bolsa pequeña", classLabel: "Ligero" },
  { key: "LEGGING", label: "Legging", weightG: 320, lengthCm: 25, widthCm: 20, heightCm: 4, packaging: "Bolsa pequeña", classLabel: "Ligero" },
  { key: "CAMISA", label: "Camisa", weightG: 350, lengthCm: 28, widthCm: 22, heightCm: 4, packaging: "Bolsa pequeña", classLabel: "Ligero" },
  { key: "FALDA", label: "Falda", weightG: 300, lengthCm: 25, widthCm: 20, heightCm: 4, packaging: "Bolsa pequeña", classLabel: "Ligero" },
  { key: "VESTIDO_CORTO", label: "Vestido corto", weightG: 400, lengthCm: 30, widthCm: 24, heightCm: 5, packaging: "Bolsa mediana", classLabel: "Estándar" },
  { key: "VESTIDO_LARGO", label: "Vestido largo", weightG: 550, lengthCm: 32, widthCm: 25, heightCm: 6, packaging: "Bolsa mediana", classLabel: "Estándar" },
  { key: "PANTALON", label: "Pantalón de vestir", weightG: 550, lengthCm: 30, widthCm: 24, heightCm: 5, packaging: "Bolsa mediana", classLabel: "Estándar" },
  { key: "JEANS", label: "Jeans / mezclilla", weightG: 750, lengthCm: 32, widthCm: 26, heightCm: 6, packaging: "Bolsa mediana", classLabel: "Estándar" },
  { key: "PIJAMA", label: "Pijama / conjunto 2 piezas", weightG: 550, lengthCm: 30, widthCm: 24, heightCm: 6, packaging: "Bolsa mediana", classLabel: "Estándar" },
  { key: "SUDADERA", label: "Sudadera / hoodie", weightG: 850, lengthCm: 35, widthCm: 28, heightCm: 8, packaging: "Bolsa grande", classLabel: "Voluminoso" },
  { key: "CHAMARRA_LIGERA", label: "Chamarra ligera", weightG: 950, lengthCm: 35, widthCm: 28, heightCm: 8, packaging: "Bolsa grande", classLabel: "Voluminoso" },
  { key: "CHAMARRA_ACOLCHADA", label: "Chamarra acolchada", weightG: 1300, lengthCm: 38, widthCm: 30, heightCm: 12, packaging: "Bolsa grande / caja", classLabel: "Voluminoso" },
  { key: "DEFAULT", label: "Perfil textil estándar", weightG: 500, lengthCm: 30, widthCm: 25, heightCm: 6, packaging: "Bolsa mediana", classLabel: "Estándar" },
];

export function resolveTextileProfile(input: { name?: string | null; category?: string | null; profile?: string | null }): TextileProfile {
  const text = `${input.category || ""} ${input.name || ""} ${input.profile || ""}`.toLowerCase();
  const key = text.includes("playera") || text.includes("camiseta") || text.includes("tee") ? "PLAYERA" : text.includes("short") || text.includes("biker") ? "SHORT" : text.includes("legging") || text.includes("malla") ? "LEGGING" : text.includes("camisa") ? "CAMISA" : text.includes("falda") ? "FALDA" : text.includes("vestido") && text.includes("largo") ? "VESTIDO_LARGO" : text.includes("vestido") ? "VESTIDO_CORTO" : text.includes("pantalón") || text.includes("pantalon") ? "PANTALON" : text.includes("jean") || text.includes("mezclilla") ? "JEANS" : text.includes("pijama") || text.includes("conjunto") ? "PIJAMA" : text.includes("sudadera") || text.includes("hoodie") ? "SUDADERA" : text.includes("chamarra") && (text.includes("acolch") || text.includes("puffer")) ? "CHAMARRA_ACOLCHADA" : text.includes("chamarra") ? "CHAMARRA_LIGERA" : "DEFAULT";
  return profiles.find((profile) => profile.key === key) || profiles[profiles.length - 1];
}

export function getTextileProfiles() { return profiles; }
