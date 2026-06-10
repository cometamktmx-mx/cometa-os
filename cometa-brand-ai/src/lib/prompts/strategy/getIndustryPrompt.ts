import { cafeteriaPrompt } from "./cafeteria";

export function getIndustryPrompt(industry: string = "") {
  const normalized = industry.toLowerCase().trim();

  // CAFETERÍAS

  if (
    normalized.includes("cafeteria") ||
    normalized.includes("cafetería") ||
    normalized.includes("coffee") ||
    normalized.includes("cafe")
  ) {
    return cafeteriaPrompt;
  }

  // RESTAURANTES

  if (
    normalized.includes("restaurante") ||
    normalized.includes("restaurant") ||
    normalized.includes("comida") ||
    normalized.includes("food")
  ) {
    return `
    Eres especialista en restaurantes.
    Prioriza platillos, bebidas, antojos, ticket promedio,
    consumo familiar, delivery, experiencia gastronómica,
    ocasiones de consumo y recompra.
    `;
  }

  // BARES

  if (
    normalized.includes("bar") ||
    normalized.includes("cantina") ||
    normalized.includes("cerveza") ||
    normalized.includes("cocteles")
  ) {
    return `
    Eres especialista en bares.
    Prioriza experiencia nocturna, grupos,
    reservaciones, consumo social, eventos,
    bebidas, ambiente y fidelización.
    `;
  }

  // HOTELES

  if (
    normalized.includes("hotel") ||
    normalized.includes("hospedaje") ||
    normalized.includes("boutique")
  ) {
    return `
    Eres especialista en hoteles.
    Prioriza reservas, experiencias,
    amenidades, descanso, turismo,
    eventos y reputación.
    `;
  }

  // MODA

  if (
    normalized.includes("ropa") ||
    normalized.includes("moda") ||
    normalized.includes("boutique") ||
    normalized.includes("fashion") ||
    normalized.includes("textil")
  ) {
    return `
    Eres especialista en moda.
    Prioriza ocasiones de uso,
    confianza, tallas, outfits,
    lifestyle, mayoreo y venta.
    `;
  }

  // MÉDICOS

  if (
    normalized.includes("doctor") ||
    normalized.includes("medico") ||
    normalized.includes("médico") ||
    normalized.includes("dentista") ||
    normalized.includes("ginecologo") ||
    normalized.includes("ginecólogo")
  ) {
    return `
    Eres especialista en servicios médicos.
    Prioriza confianza, prevención,
    tratamientos, objeciones,
    autoridad y generación de citas.
    `;
  }

  // ABOGADOS

  if (
    normalized.includes("abogado") ||
    normalized.includes("legal") ||
    normalized.includes("juridico") ||
    normalized.includes("jurídico")
  ) {
    return `
    Eres especialista en servicios legales.
    Prioriza confianza, prevención,
    objeciones, urgencia,
    autoridad y consultas.
    `;
  }

  // ARQUITECTURA

  if (
    normalized.includes("arquitect") ||
    normalized.includes("construccion") ||
    normalized.includes("construcción")
  ) {
    return `
    Eres especialista en arquitectura.
    Prioriza proyectos,
    renders, obra real,
    confianza, inversión
    y diferenciación.
    `;
  }

  // ECOMMERCE

  if (
    normalized.includes("shopify") ||
    normalized.includes("ecommerce") ||
    normalized.includes("e-commerce") ||
    normalized.includes("tienda online")
  ) {
    return `
    Eres especialista en ecommerce.
    Prioriza conversión,
    ticket promedio,
    recompra,
    retención y ROAS.
    `;
  }

  // FALLBACK

  return `
  Eres especialista en negocios locales.
  Analiza oferta, posicionamiento,
  confianza, conversión y crecimiento.
  `;
}

