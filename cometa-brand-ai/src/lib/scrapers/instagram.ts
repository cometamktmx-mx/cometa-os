import { chromium } from "playwright";
import fs from "fs";
import path from "path";

function cleanInstagramText(text: string) {
  return text
    .replace(/\n{3,}/g, "\n\n")
    .replace(/Suggested for you/gi, "")
    .replace(/Follow/gi, "")
    .replace(/Message/gi, "")
    .replace(/Verified/gi, "")
    .trim();
}

function normalizeInstagramUrl(url: string) {
  const cleanUrl = url.trim();

  if (!cleanUrl.startsWith("http")) {
    return `https://www.instagram.com/${cleanUrl.replace("@", "")}`;
  }

  return cleanUrl;
}

function extractNumberBeforeKeyword(text: string, keyword: string) {
  const regex = new RegExp(
    `([\\d.,]+\\s?[KMBkmb]?)\\s+${keyword}`,
    "i"
  );

  const match = text.match(regex);

  return match?.[1]?.trim() || "No detectado";
}

function extractProfileSignals(text: string) {
  const cleanText = cleanInstagramText(text);

  const lines = cleanText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const followers = extractNumberBeforeKeyword(cleanText, "followers");
  const following = extractNumberBeforeKeyword(cleanText, "following");
  const posts = extractNumberBeforeKeyword(cleanText, "posts");

  const followersLine = lines.find((line) =>
    line.toLowerCase().includes("followers")
  );

  const followingLine = lines.find((line) =>
    line.toLowerCase().includes("following")
  );

  const postsLine = lines.find((line) =>
    line.toLowerCase().includes("posts")
  );

  const possibleBio = lines.slice(0, 25).join("\n");

  const hasEngagementSignals =
    cleanText.toLowerCase().includes("likes") ||
    cleanText.toLowerCase().includes("comments") ||
    cleanText.toLowerCase().includes("views");

  const likelyBlocked =
    cleanText.toLowerCase().includes("log in") ||
    cleanText.toLowerCase().includes("sign up") ||
    cleanText.toLowerCase().includes("continue watching");

  return {
    possibleBio,
    followers,
    following,
    posts,
    followersLine: followersLine || "No detectado",
    followingLine: followingLine || "No detectado",
    postsLine: postsLine || "No detectado",
    hasEngagementSignals,
    likelyBlocked,
    totalVisibleLines: lines.length,
  };
}

function estimateEngagementFromSignals(profileSignals: any) {
  if (!profileSignals) {
    return {
      estimatedEngagement: "No detectado",
      engagementReason: "No se detectaron señales suficientes del perfil.",
    };
  }

  if (profileSignals.likelyBlocked) {
    return {
      estimatedEngagement: "No estimable",
      engagementReason:
        "Instagram mostró señales de bloqueo o pantalla de login, por lo que no se puede estimar engagement.",
    };
  }

  if (!profileSignals.hasEngagementSignals) {
    return {
      estimatedEngagement: "Bajo a medio percibido",
      engagementReason:
        "No se detectaron señales visibles suficientes de likes, comentarios o views; se evaluará principalmente por percepción visual del feed.",
    };
  }

  return {
    estimatedEngagement: "Estimación visual disponible",
    engagementReason:
      "Se detectaron señales visibles relacionadas con interacción; el análisis final debe validar si la actividad parece proporcional al tamaño de la cuenta.",
  };
}

export async function scrapeInstagramProfile(instagramUrl: string) {
  if (!instagramUrl) {
    return null;
  }

  const normalizedUrl = normalizeInstagramUrl(instagramUrl);

  const browser = await chromium.launch({
    headless: true,
  });

  const context = await browser.newContext({
    storageState: "instagram-session.json",
    viewport: {
      width: 1440,
      height: 2600,
    },
  });

  const page = await context.newPage();

  try {
    await page.goto(normalizedUrl, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });

    await page.waitForTimeout(9000);

    await page.mouse.wheel(0, 1000);
    await page.waitForTimeout(2500);

    await page.mouse.wheel(0, -1000);
    await page.waitForTimeout(1500);

    const bodyText = await page.locator("body").innerText().catch(() => "");
    const cleanText = cleanInstagramText(bodyText);
    const profileSignals = extractProfileSignals(cleanText);
    const engagementSignals = estimateEngagementFromSignals(profileSignals);

    const screenshotsDir = path.join(process.cwd(), "public", "screenshots");

    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }

    const filename = `instagram-${Date.now()}.png`;
    const screenshotPath = path.join(screenshotsDir, filename);

    await page.screenshot({
      path: screenshotPath,
      fullPage: true,
    });

    await browser.close();

    return {
      url: normalizedUrl,
      extractedText: cleanText.slice(0, 14000),
      screenshotUrl: `/screenshots/${filename}`,
      profileSignals,
      engagementSignals,
      scrapingStatus: {
        success: true,
        usedLoggedSession: true,
        hasVisibleText: cleanText.length > 100,
        hasScreenshot: true,
        likelyBlocked: profileSignals.likelyBlocked,
      },
    };
  } catch (error) {
    await browser.close();

    return {
      url: normalizedUrl,
      extractedText: "",
      screenshotUrl: "",
      profileSignals: null,
      engagementSignals: {
        estimatedEngagement: "No detectado",
        engagementReason: "No se pudo analizar el perfil.",
      },
      scrapingStatus: {
        success: false,
        usedLoggedSession: true,
        hasVisibleText: false,
        hasScreenshot: false,
        likelyBlocked: true,
      },
      error: "No se pudo analizar el perfil con sesión iniciada.",
    };
  }
}