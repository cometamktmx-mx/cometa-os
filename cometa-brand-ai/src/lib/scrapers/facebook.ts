import puppeteer from "puppeteer";

export async function scrapeFacebookPage(facebookUrl: string) {
  if (!facebookUrl) return null;

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

    await page.goto(facebookUrl, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    await new Promise((resolve) => setTimeout(resolve, 5000));

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
          text.includes("iniciar sesión") ||
          text.includes("contraseña") ||
          text.includes("correo electrónico") ||
          text.includes("correo o teléfono") ||
          text.includes("log in") ||
          text.includes("password") ||
          text.includes("sign up") ||
          text.includes("crear cuenta");

        if (isBlockingElement && containsLoginText) {
          el.remove();
        }
      });

      document.body.style.overflow = "auto";
    });

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const extractedText = await page.evaluate(() => {
      return document.body.innerText;
    });

    const screenshotName = `facebook-${Date.now()}.png`;
    const screenshotPath = `public/screenshots/${screenshotName}`;

    await page.screenshot({
      path: screenshotPath,
      fullPage: true,
    });

    const profileSignals = {
      phone: extractPhone(extractedText),
website: extractWebsite(extractedText),
        pageName: extractPageName(extractedText),
      followers: extractFollowers(extractedText),
      likes: extractLikes(extractedText),
      location: extractLocation(extractedText),
      category: extractCategory(extractedText),
      extractedAt: new Date().toISOString(),
    };

    const contentSignals = {
      hasPosts: detectPosts(extractedText),
      hasReviews: detectReviews(extractedText),
      hasMessenger: detectMessenger(extractedText),
      hasWhatsApp: detectWhatsApp(extractedText),
      hasWebsite: detectWebsite(extractedText),
    };

    const scrapingStatus = {
      success: true,
      source: facebookUrl,
      screenshotUrl: `/screenshots/${screenshotName}`,
      extractedTextLength: extractedText.length,
    };

    return {
      url: facebookUrl,
      extractedText,
      screenshotUrl: `/screenshots/${screenshotName}`,
      profileSignals,
      contentSignals,
      scrapingStatus,
    };
  } catch (error) {
    console.log("Error scraping Facebook:", error);

    return {
      url: facebookUrl,
      extractedText: "",
      screenshotUrl: "",
      profileSignals: null,
      contentSignals: null,
      scrapingStatus: {
        success: false,
        source: facebookUrl,
        error: "No se pudo analizar Facebook.",
      },
    };
  } finally {
    await browser.close();
  }
}

function extractPhone(text: string) {
  const match = text.match(
    /(\+?\d[\d\s\-]{8,20})/
  );

  return match ? match[1] : "No detectado";
}

function extractWebsite(text: string) {
  const match = text.match(
    /(https?:\/\/[^\s]+|www\.[^\s]+|\w+\.(com|mx|net))/i
  );

  return match ? match[0] : "No detectado";
}

function extractPageName(text: string) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const filtered = lines.filter(
    (line) =>
      !line.toLowerCase().includes("facebook") &&
      !line.toLowerCase().includes("iniciar sesión") &&
      !line.toLowerCase().includes("contraseña") &&
      !line.toLowerCase().includes("correo")
  );

  return filtered[0] || lines[0] || "No detectado";
}

function extractFollowers(text: string) {
  const patterns = [
    /([\d.,]+\s?(?:mil|k|m)?)\s*seguidores/i,
    /([\d.,]+\s?(?:mil|k|m)?)\s*followers/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match) {
      return match[1];
    }
  }

  return "No detectado";
}

function extractLikes(text: string) {
  const match = text.match(/([\d.,]+\s?[KkMm]?)\s*(likes|me gusta)/i);
  return match ? match[1] : "No detectado";
}

function extractLocation(text: string) {
  const lines = text.split("\n").map((line) => line.trim());

  const locationLine = lines.find(
    (line) =>
      line.toLowerCase().includes("méxico") ||
      line.toLowerCase().includes("mexico") ||
      line.toLowerCase().includes("gto") ||
      line.toLowerCase().includes("guanajuato") ||
      line.toLowerCase().includes("culiacán") ||
      line.toLowerCase().includes("culiacan")
  );

  return locationLine || "No detectado";
}

function extractCategory(text: string) {
  const lines = text.split("\n").map((line) => line.trim());

  const categoryLine = lines.find(
    (line) =>
      line.toLowerCase().includes("ropa") ||
      line.toLowerCase().includes("marca") ||
      line.toLowerCase().includes("tienda") ||
      line.toLowerCase().includes("servicio") ||
      line.toLowerCase().includes("restaurante") ||
      line.toLowerCase().includes("salud") ||
      line.toLowerCase().includes("belleza")
  );

  return categoryLine || "No detectado";
}

function detectPosts(text: string) {
  return /publicaciones|posts|photos|videos|reels/i.test(text)
    ? "Detectado"
    : "No detectado";
}

function detectReviews(text: string) {
  return /reseñas|reviews|opiniones|recommendations/i.test(text)
    ? "Detectado"
    : "No detectado";
}

function detectMessenger(text: string) {
  return /mensaje|messenger|send message|enviar mensaje/i.test(text)
    ? "Detectado"
    : "No detectado";
}

function detectWhatsApp(text: string) {
  return /whatsapp|wa.me|\+52|\+1/i.test(text)
    ? "Detectado"
    : "No detectado";
}

function detectWebsite(text: string) {
  return /www\.|https?:\/\/|\.com|\.mx/i.test(text)
    ? "Detectado"
    : "No detectado";
}