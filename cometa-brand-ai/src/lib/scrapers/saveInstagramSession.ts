import { chromium } from "playwright";

async function saveInstagramSession() {
  const browser = await chromium.launch({
    headless: false,
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://www.instagram.com/accounts/login/", {
    waitUntil: "domcontentloaded",
  });

  console.log("Inicia sesión manualmente en Instagram.");
  console.log("Cuando hayas iniciado sesión, regresa a la terminal y presiona ENTER.");

  process.stdin.resume();
  process.stdin.on("data", async () => {
    await context.storageState({
      path: "instagram-session.json",
    });

    console.log("Sesión guardada en instagram-session.json");
    await browser.close();
    process.exit();
  });
}

saveInstagramSession();