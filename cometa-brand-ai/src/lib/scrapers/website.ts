import puppeteer from "puppeteer";

export async function scrapeWebsite(url: string) {
  if (!url) return null;

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();

    await page.setViewport({
      width: 1440,
      height: 1200,
    });

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    await new Promise((resolve) => setTimeout(resolve, 3000));

    const extractedData = await page.evaluate(() => {
      const title = document.title || "";

      const metaDescription =
        document
          .querySelector('meta[name="description"]')
          ?.getAttribute("content") || "";

      const h1 = document.querySelector("h1")?.textContent?.trim() || "";

      const h2s = Array.from(document.querySelectorAll("h2"))
        .slice(0, 10)
        .map((h) => h.textContent?.trim())
        .filter(Boolean);

      const bodyText = document.body.innerText || "";

      const links = Array.from(document.querySelectorAll("a"))
        .slice(0, 50)
        .map((a) => ({
          text: a.textContent?.trim() || "",
          href: a.getAttribute("href") || "",
        }))
        .filter((link) => link.text || link.href);

      const buttons = Array.from(
        document.querySelectorAll("button, a")
      )
        .map((el) => el.textContent?.trim() || "")
        .filter(Boolean)
        .slice(0, 30);

      const hasWhatsApp =
        bodyText.toLowerCase().includes("whatsapp") ||
        links.some((link) => link.href.includes("wa.me") || link.href.includes("whatsapp"));

      const hasEmail =
        bodyText.includes("@") ||
        links.some((link) => link.href.startsWith("mailto:"));

      const hasPhone =
        /(\+?\d[\d\s\-().]{8,20})/.test(bodyText);

      const hasForm =
        document.querySelectorAll("form, input, textarea").length > 0;

      const hasCart =
        bodyText.toLowerCase().includes("carrito") ||
        bodyText.toLowerCase().includes("cart") ||
        links.some((link) => link.href.toLowerCase().includes("cart"));

      const hasCheckout =
        bodyText.toLowerCase().includes("checkout") ||
        bodyText.toLowerCase().includes("pago") ||
        bodyText.toLowerCase().includes("comprar ahora");

      const ctaWords = [
        "comprar",
        "cotizar",
        "agenda",
        "reservar",
        "contacto",
        "whatsapp",
        "llamar",
        "más información",
        "ver más",
        "shop",
        "buy",
        "book",
        "contact",
      ];

      const detectedCtas = buttons.filter((button) =>
        ctaWords.some((word) => button.toLowerCase().includes(word))
      );

      return {
        title,
        metaDescription,
        h1,
        h2s,
        bodyText,
        links,
        buttons,
        detectedCtas,
        signals: {
          hasWhatsApp,
          hasEmail,
          hasPhone,
          hasForm,
          hasCart,
          hasCheckout,
        },
      };
    });

    const screenshotName = `website-${Date.now()}.png`;

    await page.screenshot({
      path: `public/screenshots/${screenshotName}`,
      fullPage: true,
    });

    return {
      url,
      screenshotUrl: `/screenshots/${screenshotName}`,
      extractedData,
      scrapingStatus: {
        success: true,
        source: url,
        screenshotUrl: `/screenshots/${screenshotName}`,
        bodyTextLength: extractedData.bodyText?.length || 0,
      },
    };
  } catch (error) {
    console.log("Error scraping website:", error);

    return {
      url,
      screenshotUrl: "",
      extractedData: null,
      scrapingStatus: {
        success: false,
        source: url,
        error: "No se pudo analizar el sitio web.",
      },
    };
  } finally {
    await browser.close();
  }
}