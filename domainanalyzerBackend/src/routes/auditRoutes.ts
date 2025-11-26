import express, { Request, Response } from "express";
import puppeteer from "puppeteer";

const router = express.Router();

function formatUrl(url: string) {
  if (!/^https?:\/\//i.test(url)) {
    return "https://" + url;
  }
  return url;
}

router.post("/", async (req: Request, res: Response) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "Invalid url" });
    }

    const formatted = formatUrl(url.trim());
    try {
      new URL(formatted);
    } catch {
      return res.status(400).json({ error: "Invalid URL format" });
    }

    const apiKey = process.env.PAGESPEED_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Server missing API key" });
    }

    // -----------------------------
    // 1️⃣ Run PageSpeed Insights
    // -----------------------------
    const endpoint = `https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(
      formatted
    )}&category=PERFORMANCE&category=SEO&category=BEST_PRACTICES&category=ACCESSIBILITY&strategy=DESKTOP&key=${apiKey}`;

    const response = await fetch(endpoint);
    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({
        error: "Pagespeed API error",
        details: text,
      });
    }

    const data = await response.json();
    const lighthouse = data.lighthouseResult;

    // -----------------------------
    // 2️⃣ Capture viewport screenshot
    // -----------------------------
    const browser = await puppeteer.launch({ args: ["--no-sandbox"] });
    const page = await browser.newPage();

    // Set viewport to typical desktop resolution
    await page.setViewport({ width: 1280, height: 800 });

    // Navigate to page and wait until network is idle
    await page.goto(formatted, { waitUntil: "networkidle2", timeout: 30000 });

    // Capture **viewport only** screenshot
    const screenshotBuffer = await page.screenshot({
      type: "jpeg",
      quality: 90,
      fullPage: false, // IMPORTANT: only visible screen
    });

    await browser.close();

    const screenshotBase64 = `data:image/jpeg;base64,${screenshotBuffer.toString(
      "base64"
    )}`;

    // -----------------------------
    // 3️⃣ Prepare normalized response
    // -----------------------------
    const normalized = {
      performance: lighthouse?.categories?.performance?.score ?? 0,
      seo: lighthouse?.categories?.seo?.score ?? 0,
      accessibility: lighthouse?.categories?.accessibility?.score ?? 0,
      bestPractices: lighthouse?.categories?.["best-practices"]?.score ?? 0,
      pwa: lighthouse?.categories?.pwa?.score ?? 0,

      audits: {
        fcp: lighthouse?.audits?.["first-contentful-paint"]?.displayValue,
        lcp: lighthouse?.audits?.["largest-contentful-paint"]?.displayValue,
        cls: lighthouse?.audits?.["cumulative-layout-shift"]?.displayValue,
        tbt: lighthouse?.audits?.["total-blocking-time"]?.displayValue,
        speedIndex: lighthouse?.audits?.["speed-index"]?.displayValue,
      },

      screenshot: screenshotBase64,
    };

    return res.json({ url: formatted, normalized });
  } catch (err) {
    console.error("Uncaught Server Error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
