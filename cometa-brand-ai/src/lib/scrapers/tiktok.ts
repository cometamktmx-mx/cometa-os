import puppeteer from "puppeteer";

export async function scrapeTikTokProfile(tiktokUrl: string) {
  if (!tiktokUrl) return null;

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();

    await page.setViewport({
      width: 1366,
      height: 1200,
    });

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    const normalizedUrl = normalizeTikTokUrl(tiktokUrl);

    await page.goto(normalizedUrl, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    await new Promise((resolve) => setTimeout(resolve, 12000));

    try {
      await page.waitForSelector("img", {
        timeout: 10000,
      });
    } catch {
      console.log("TikTok cargó el perfil, pero no terminó de cargar miniaturas.");
    }

    await page.keyboard.press("Escape");

    await new Promise((resolve) => setTimeout(resolve, 1500));

    await page.evaluate(() => {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      dialogs.forEach((dialog) => dialog.remove());

      const allElements = Array.from(document.querySelectorAll("*"));

      allElements.forEach((el) => {
        const text = el.textContent?.toLowerCase() || "";
        const style = window.getComputedStyle(el);

        const isBlockingElement =
          style.position === "fixed" ||
          style.position === "sticky" ||
          el.getAttribute("role") === "dialog";

        const containsLoginText =
          text.includes("log in") ||
          text.includes("sign up") ||
          text.includes("iniciar sesión") ||
          text.includes("registrarte") ||
          text.includes("phone") ||
          text.includes("email") ||
          text.includes("password");

        if (isBlockingElement && containsLoginText) {
          el.remove();
        }
      });

      document.body.style.overflow = "auto";
    });

    await new Promise((resolve) => setTimeout(resolve, 3000));

    await page.evaluate(() => {
      window.scrollTo(0, 600);
    });

    await new Promise((resolve) => setTimeout(resolve, 3000));

    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });

    await new Promise((resolve) => setTimeout(resolve, 1500));

    const extractedText = await page.evaluate(() => {
      return document.body.innerText;
    });

    const screenshotName = `tiktok-${Date.now()}.png`;
    const screenshotPath = `public/screenshots/${screenshotName}`;

    await page.screenshot({
      path: screenshotPath,
      fullPage: true,
    });

    const profileSignals = {
      username: extractUsername(extractedText, normalizedUrl),
      followers: extractFollowers(extractedText),
      following: extractFollowing(extractedText),
      likes: extractLikes(extractedText),
      bio: extractBio(extractedText),
      extractedAt: new Date().toISOString(),
    };

    const contentSignals = {
      hasVideos: detectVideos(extractedText),
      hasPinnedVideos: detectPinnedVideos(extractedText),
      hasHighViews: detectHighViews(extractedText),
      contentType: detectContentType(extractedText),
      viralPotential: detectViralPotential(extractedText),
    };

    const scrapingStatus = {
      success: true,
      source: normalizedUrl,
      screenshotUrl: `/screenshots/${screenshotName}`,
      extractedTextLength: extractedText.length,
    };

    return {
      url: normalizedUrl,
      extractedText,
      screenshotUrl: `/screenshots/${screenshotName}`,
      profileSignals,
      contentSignals,
      scrapingStatus,
    };
  } catch (error) {
    console.log("Error scraping TikTok:", error);

    return {
      url: tiktokUrl,
      extractedText: "",
      screenshotUrl: "",
      profileSignals: null,
      contentSignals: null,
      scrapingStatus: {
        success: false,
        source: tiktokUrl,
        error: "No se pudo analizar TikTok.",
      },
    };
  } finally {
    await browser.close();
  }
}

function normalizeTikTokUrl(url: string) {
  const clean = url.trim();

  if (!clean) return "";

  if (clean.startsWith("http")) {
    return clean;
  }

  const username = clean.replace("@", "");

  return `https://www.tiktok.com/@${username}`;
}

function extractUsername(text: string, url: string) {
  const urlMatch = url.match(/@([^/?]+)/);

  if (urlMatch) {
    return `@${urlMatch[1]}`;
  }

  const textMatch = text.match(/@[\w.-]+/);

  return textMatch ? textMatch[0] : "No detectado";
}

function extractFollowers(text: string) {
  const patterns = [
    /([\d.,]+\s?(?:K|M|mil|millones)?)\s*Followers/i,
    /([\d.,]+\s?(?:K|M|mil|millones)?)\s*Seguidores/i,
    /Followers\s*([\d.,]+\s?(?:K|M|mil|millones)?)/i,
    /Seguidores\s*([\d.,]+\s?(?:K|M|mil|millones)?)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }

  return "No detectado";
}

function extractFollowing(text: string) {
  const patterns = [
    /([\d.,]+\s?(?:K|M|mil|millones)?)\s*Following/i,
    /([\d.,]+\s?(?:K|M|mil|millones)?)\s*Siguiendo/i,
    /Following\s*([\d.,]+\s?(?:K|M|mil|millones)?)/i,
    /Siguiendo\s*([\d.,]+\s?(?:K|M|mil|millones)?)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }

  return "No detectado";
}

function extractLikes(text: string) {
  const patterns = [
    /([\d.,]+\s?(?:K|M|mil|millones)?)\s*Likes/i,
    /([\d.,]+\s?(?:K|M|mil|millones)?)\s*Me gusta/i,
    /Likes\s*([\d.,]+\s?(?:K|M|mil|millones)?)/i,
    /Me gusta\s*([\d.,]+\s?(?:K|M|mil|millones)?)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }

  return "No detectado";
}

function extractBio(text: string) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const filtered = lines.filter((line) => {
    const lower = line.toLowerCase();

    return (
      !lower.includes("following") &&
      !lower.includes("followers") &&
      !lower.includes("likes") &&
      !lower.includes("siguiendo") &&
      !lower.includes("seguidores") &&
      !lower.includes("me gusta") &&
      !lower.includes("tiktok") &&
      !lower.includes("log in") &&
      !lower.includes("sign up") &&
      !lower.includes("iniciar sesión")
    );
  });

  return filtered.slice(0, 3).join(" ") || "No detectado";
}

function detectVideos(text: string) {
  return /videos|video|publicaciones|posts/i.test(text)
    ? "Detectado"
    : "No detectado";
}

function detectPinnedVideos(text: string) {
  return /pinned|fijado|anclado/i.test(text)
    ? "Detectado"
    : "No detectado";
}

function detectHighViews(text: string) {
  return /K|M|mil|millones|views|vistas|visualizaciones/i.test(text)
    ? "Detectado"
    : "No detectado";
}

function detectContentType(text: string) {
  const lower = text.toLowerCase();

  if (
    lower.includes("shop") ||
    lower.includes("comprar") ||
    lower.includes("producto")
  ) {
    return "Contenido comercial o de producto";
  }

  if (
    lower.includes("tips") ||
    lower.includes("tutorial") ||
    lower.includes("cómo")
  ) {
    return "Contenido educativo";
  }

  if (
    lower.includes("trend") ||
    lower.includes("viral") ||
    lower.includes("challenge")
  ) {
    return "Contenido de tendencia";
  }

  if (
    lower.includes("behind") ||
    lower.includes("proceso") ||
    lower.includes("día")
  ) {
    return "Contenido lifestyle o detrás de cámaras";
  }

  return "No detectado con precisión";
}

function detectViralPotential(text: string) {
  const lower = text.toLowerCase();

  if (
    lower.includes("m") ||
    lower.includes("millones") ||
    lower.includes("viral")
  ) {
    return "Alto";
  }

  if (
    lower.includes("k") ||
    lower.includes("mil") ||
    lower.includes("views") ||
    lower.includes("vistas")
  ) {
    return "Medio";
  }

  return "No detectado";
}