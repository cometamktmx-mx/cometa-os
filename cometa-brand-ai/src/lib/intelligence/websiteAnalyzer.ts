type WebsiteLiteResult = {
  available: boolean;
  url?: string;
  confidence: number;
  error?: string;
  seo?: {
    title: string;
    description: string;
    h1: string;
    h2: string[];
  };
  commercialSignals?: {
    phones: string[];
    emails: string[];
    hasWhatsApp: boolean;
    hasForm: boolean;
    hasCart: boolean;
    hasCheckout: boolean;
    ctas: string[];
  };
  extractedData?: {
    title: string;
    metaDescription: string;
    h1: string;
    h2: string[];
    whatsapp: string;
    email: string;
    phone: string;
    form: string;
    cart: string;
    checkout: string;
    ctas: string;
  };
  scrapingStatus?: {
    success: boolean;
    source?: string;
    method?: string;
    confidence?: number;
    error?: string;
  };
  rawTextSample?: string;
};

export async function analyzeWebsiteLite(
  websiteUrl: string
): Promise<WebsiteLiteResult> {
  if (!websiteUrl) {
    return {
      available: false,
      confidence: 0,
      error: "No se proporcionó sitio web.",
      extractedData: emptyExtractedData(),
      scrapingStatus: {
        success: false,
        error: "No se proporcionó sitio web.",
      },
    };
  }

  try {
    const normalizedUrl = normalizeWebsiteUrl(websiteUrl);

    const response = await fetch(normalizedUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; CometaOSWebsiteAnalyzer/1.0; +https://cometaos.com)",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        available: false,
        url: normalizedUrl,
        confidence: 0,
        error: `El sitio respondió con status ${response.status}.`,
        extractedData: emptyExtractedData(),
        scrapingStatus: {
          success: false,
          source: normalizedUrl,
          method: "website-lite-fetch",
          error: `HTTP ${response.status}`,
        },
      };
    }

    const html = await response.text();
    const text = cleanHtmlText(html);

    const title = firstValid([
      extractTag(html, "title"),
      extractMetaProperty(html, "og:title"),
      extractMetaName(html, "twitter:title"),
    ]);

    const description = firstValid([
      extractMetaName(html, "description"),
      extractMetaProperty(html, "og:description"),
      extractMetaName(html, "twitter:description"),
    ]);

    const h1 = extractHeading(html, "h1");
    const h2 = extractAllHeadings(html, "h2");

    const phones = extractPhones(`${html} ${text}`);
    const emails = extractEmails(`${html} ${text}`);

    const hasWhatsApp = /whatsapp|wa\.me|api\.whatsapp\.com|web\.whatsapp\.com/i.test(
      html
    );

    const hasForm = /<form\b|type=["']submit["']|contact-form|formulario|newsletter/i.test(
      html
    );

    const hasCart = /cart|carrito|add-to-cart|agregar al carrito|bolsa/i.test(
      html
    );

    const hasCheckout = /checkout|pago|finalizar compra|comprar ahora/i.test(
      html
    );

    const ctas = extractCTAs(text);

    const confidence = calculateWebsiteConfidence({
      title,
      description,
      h1,
      h2,
      phones,
      emails,
      hasWhatsApp,
      hasForm,
      hasCart,
      hasCheckout,
      ctas,
    });

    const extractedData = {
      title,
      metaDescription: description,
      h1,
      h2,
      whatsapp: hasWhatsApp ? "Detectado" : "No detectado",
      email: emails.length > 0 ? emails.join(", ") : "No detectado",
      phone: phones.length > 0 ? phones.join(", ") : "No detectado",
      form: hasForm ? "Detectado" : "No detectado",
      cart: hasCart ? "Detectado" : "No detectado",
      checkout: hasCheckout ? "Detectado" : "No detectado",
      ctas: ctas.length > 0 ? ctas.join(", ") : "No detectado",
    };

    return {
      available: true,
      url: normalizedUrl,
      confidence,
      seo: {
        title,
        description,
        h1,
        h2,
      },
      commercialSignals: {
        phones,
        emails,
        hasWhatsApp,
        hasForm,
        hasCart,
        hasCheckout,
        ctas,
      },
      extractedData,
      scrapingStatus: {
        success: true,
        source: normalizedUrl,
        method: "website-lite-fetch",
        confidence,
      },
      rawTextSample: text.slice(0, 5000),
    };
  } catch (error) {
    return {
      available: false,
      confidence: 0,
      error: "No se pudo analizar el sitio web con Website Intelligence.",
      extractedData: emptyExtractedData(),
      scrapingStatus: {
        success: false,
        source: websiteUrl,
        method: "website-lite-fetch",
        error:
          error instanceof Error
            ? error.message
            : "Error desconocido al analizar sitio web.",
      },
    };
  }
}

function normalizeWebsiteUrl(url: string) {
  const cleanUrl = url.trim();
  return cleanUrl.startsWith("http") ? cleanUrl : `https://${cleanUrl}`;
}

function emptyExtractedData() {
  return {
    title: "No detectado",
    metaDescription: "No detectado",
    h1: "No detectado",
    h2: [],
    whatsapp: "No detectado",
    email: "No detectado",
    phone: "No detectado",
    form: "No detectado",
    cart: "No detectado",
    checkout: "No detectado",
    ctas: "No detectado",
  };
}

function firstValid(values: string[]) {
  return values.find((value) => value && value !== "No detectado") || "No detectado";
}

function extractTag(html: string, tag: string) {
  const regex = new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, "is");
  const match = html.match(regex);
  return match ? cleanText(stripHtml(match[1])) : "No detectado";
}

function extractMetaName(html: string, name: string) {
  const regexA = new RegExp(
    `<meta[^>]+name=["']${escapeRegex(name)}["'][^>]+content=["']([^"']*)["'][^>]*>`,
    "i"
  );

  const regexB = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${escapeRegex(name)}["'][^>]*>`,
    "i"
  );

  const match = html.match(regexA) || html.match(regexB);
  return match ? cleanText(decodeHtml(match[1])) : "No detectado";
}

function extractMetaProperty(html: string, property: string) {
  const regexA = new RegExp(
    `<meta[^>]+property=["']${escapeRegex(property)}["'][^>]+content=["']([^"']*)["'][^>]*>`,
    "i"
  );

  const regexB = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${escapeRegex(property)}["'][^>]*>`,
    "i"
  );

  const match = html.match(regexA) || html.match(regexB);
  return match ? cleanText(decodeHtml(match[1])) : "No detectado";
}

function extractHeading(html: string, tag: string) {
  const regex = new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, "is");
  const match = html.match(regex);
  return match ? cleanText(stripHtml(match[1])) : "No detectado";
}

function extractAllHeadings(html: string, tag: string) {
  const regex = new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, "gis");

  return [...html.matchAll(regex)]
    .map((match) => cleanText(stripHtml(match[1])))
    .filter(Boolean)
    .slice(0, 10);
}

function extractPhones(text: string) {
  const matches = text.match(/(\+?\d[\d\s().-]{8,20})/g) || [];

  return [...new Set(matches.map(cleanText))]
    .filter((phone) => phone.replace(/\D/g, "").length >= 8)
    .slice(0, 5);
}

function extractEmails(text: string) {
  const matches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return [...new Set(matches)].slice(0, 5);
}

function extractCTAs(text: string) {
  const normalizedText = text.toLowerCase();

  const possibleCtas = [
    "contáctanos",
    "contactar",
    "cotizar",
    "cotiza",
    "agenda",
    "agendar",
    "comprar",
    "comprar ahora",
    "llamar",
    "whatsapp",
    "solicitar",
    "reservar",
    "conocer más",
    "ver más",
    "ver colección",
    "añadir al carrito",
    "agregar al carrito",
    "iniciar sesión",
    "suscribirse",
  ];

  return possibleCtas.filter((cta) => normalizedText.includes(cta));
}

function calculateWebsiteConfidence(data: {
  title: string;
  description: string;
  h1: string;
  h2: string[];
  phones: string[];
  emails: string[];
  hasWhatsApp: boolean;
  hasForm: boolean;
  hasCart: boolean;
  hasCheckout: boolean;
  ctas: string[];
}) {
  let score = 0;

  if (data.title && data.title !== "No detectado") score += 15;
  if (data.description && data.description !== "No detectado") score += 15;
  if (data.h1 && data.h1 !== "No detectado") score += 15;
  if (data.h2.length > 0) score += 10;
  if (data.phones.length > 0) score += 10;
  if (data.emails.length > 0) score += 10;
  if (data.hasWhatsApp) score += 10;
  if (data.hasForm) score += 5;
  if (data.hasCart) score += 5;
  if (data.hasCheckout) score += 5;
  if (data.ctas.length > 0) score += 10;

  return Math.min(score, 100);
}

function cleanHtmlText(html: string) {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, " ");
}

function cleanText(text: string) {
  return decodeHtml(text).replace(/\s+/g, " ").trim();
}

function decodeHtml(text: string) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}