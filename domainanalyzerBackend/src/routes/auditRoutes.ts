import express, { Request, Response } from "express";
import puppeteer from "puppeteer";
import { prisma } from "../lib/prisma";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth";
import { uploadScreenshot, deleteScreenshot } from "../utils/cloudinary";
import { logExternalUsage } from "../services/externalUsageClient";

const router = express.Router();

function asyncHandler(fn: (req: Request, res: Response, next: any) => Promise<any>) {
  return function (req: Request, res: Response, next: any) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function formatUrl(url: string) {
  if (!/^https?:\/\//i.test(url)) {
    return "https://" + url;
  }
  return url;
}

// GET /api/audit - Get latest audit for user's company domain.
//
// Returns 200 with `audit: null` when the user hasn't set up a company
// domain yet OR when a domain exists but no audit has been run against
// it. These aren't error states — they're the natural pre-audit shape of
// the resource, and the dashboard polls this on every mount. Surfacing
// them as 404s pollutes the browser console with red network errors that
// look like real failures. The only true error path here is a DB / infra
// failure (500).
router.get("/", authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.userId;

  try {
    const companyDomain = await prisma.domain.findFirst({
      where: { userId, isCompanyDomain: true },
    });
    if (!companyDomain) {
      return res.json({ success: true, audit: null, reason: "no_company_domain" });
    }

    const auditResult = await prisma.auditResult.findUnique({
      where: { domainId: companyDomain.id },
    });
    if (!auditResult) {
      return res.json({ success: true, audit: null, reason: "no_audit_yet" });
    }

    return res.json({ success: true, audit: auditResult });
  } catch (error) {
    console.error("Error fetching audit:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch audit",
    });
  }
}));

// POST /api/audit - Run audit and store results
router.post("/", authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.userId;

  try {
    const { url } = req.body;
    if (!url || typeof url !== "string") {
      return res.status(400).json({ 
        success: false,
        error: "Invalid url" 
      });
    }

    const formatted = formatUrl(url.trim());
    try {
      new URL(formatted);
    } catch {
      return res.status(400).json({ 
        success: false,
        error: "Invalid URL format" 
      });
    }

    // Find company domain for user
    const companyDomain = await prisma.domain.findFirst({
      where: {
        userId,
        isCompanyDomain: true,
      },
    });

    if (!companyDomain) {
      return res.status(400).json({
        success: false,
        error: "Company domain not found. Please set up your company domain first.",
      });
    }

    const apiKey = process.env.PAGESPEED_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ 
        success: false,
        error: "Server missing API key" 
      });
    }

    // -----------------------------
    // 1️⃣ Run PageSpeed Insights
    // -----------------------------
    const endpoint = `https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(
      formatted
    )}&category=PERFORMANCE&category=SEO&category=BEST_PRACTICES&category=ACCESSIBILITY&strategy=DESKTOP&key=${apiKey}`;

    const pageSpeedStartedAt = Date.now();
    let response: globalThis.Response;
    try {
      response = await fetch(endpoint);
    } catch (error: any) {
      await logExternalUsage({
        provider: "pagespeed",
        feature: "domain_audit",
        operation: "pagespeed_insights",
        context: { userId, domainId: companyDomain.id, domainHost: companyDomain.host },
        status: "failed",
        costSource: "none",
        latencyMs: Date.now() - pageSpeedStartedAt,
        errorCode: error?.code ?? null,
        errorMessage: error?.message ?? null,
        metadata: { url: formatted, strategy: "DESKTOP" },
      });
      throw error;
    }
    if (!response.ok) {
      const text = await response.text();
      await logExternalUsage({
        provider: "pagespeed",
        feature: "domain_audit",
        operation: "pagespeed_insights",
        context: { userId, domainId: companyDomain.id, domainHost: companyDomain.host },
        status: "failed",
        costSource: "none",
        latencyMs: Date.now() - pageSpeedStartedAt,
        httpStatus: response.status,
        errorCode: "pagespeed_api_error",
        errorMessage: response.statusText,
        metadata: { url: formatted, strategy: "DESKTOP" },
      });
      return res.status(response.status).json({
        success: false,
        error: "Pagespeed API error",
        details: text,
      });
    }
    await logExternalUsage({
      provider: "pagespeed",
      feature: "domain_audit",
      operation: "pagespeed_insights",
      context: { userId, domainId: companyDomain.id, domainHost: companyDomain.host },
      costSource: "none",
      latencyMs: Date.now() - pageSpeedStartedAt,
      httpStatus: response.status,
      metadata: { url: formatted, strategy: "DESKTOP" },
    });

    const data = await response.json();
    const lighthouse = data.lighthouseResult;

    // -----------------------------
    // 2️⃣ Capture viewport screenshot and upload to Cloudinary
    // -----------------------------
    let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
    let screenshotUrl: string | null = null;
    let screenshotBuffer: Buffer | null = null;

    try {
      browser = await puppeteer.launch({ 
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
        headless: true,
      });
      const page = await browser.newPage();

      // Set viewport to typical desktop resolution
      await page.setViewport({ width: 1280, height: 800 });

      // Navigate to page and wait until network is idle
      await page.goto(formatted, { waitUntil: "networkidle2", timeout: 30000 });

      // Capture **viewport only** screenshot
      const screenshot = await page.screenshot({
        type: "jpeg",
        quality: 90,
        fullPage: false, // IMPORTANT: only visible screen
      });

      // Convert to Buffer
      screenshotBuffer = Buffer.isBuffer(screenshot) 
        ? screenshot 
        : Buffer.from(screenshot as unknown as ArrayLike<number>);

      // Upload to Cloudinary
      try {
        screenshotUrl = await uploadScreenshot(screenshotBuffer);
      } catch (uploadError) {
        console.error("Cloudinary upload error:", uploadError);
        // Continue without screenshot if upload fails
        screenshotUrl = null;
      }
    } catch (screenshotError) {
      console.error("Screenshot capture error:", screenshotError);
      // Continue without screenshot if it fails
      screenshotUrl = null;
    } finally {
      // Always close browser, even if screenshot failed
      if (browser) {
        try {
          await browser.close();
        } catch (closeError) {
          console.error("Error closing browser:", closeError);
        }
      }
    }

    // -----------------------------
    // 3️⃣ Prepare audit data and store in database
    // -----------------------------
    const performance = lighthouse?.categories?.performance?.score ?? 0;
    const seo = lighthouse?.categories?.seo?.score ?? 0;
    const accessibility = lighthouse?.categories?.accessibility?.score ?? 0;
    const bestPractices = lighthouse?.categories?.["best-practices"]?.score ?? 0;
    const pwa = lighthouse?.categories?.pwa?.score ?? 0;

    const audits = {
      fcp: lighthouse?.audits?.["first-contentful-paint"]?.displayValue || null,
      lcp: lighthouse?.audits?.["largest-contentful-paint"]?.displayValue || null,
      cls: lighthouse?.audits?.["cumulative-layout-shift"]?.displayValue || null,
      tbt: lighthouse?.audits?.["total-blocking-time"]?.displayValue || null,
      speedIndex: lighthouse?.audits?.["speed-index"]?.displayValue || null,
    };

    // Check if old audit exists to delete old screenshot
    const existingAudit = await prisma.auditResult.findUnique({
      where: { domainId: companyDomain.id },
    });

    // Delete old screenshot from Cloudinary if it exists and we have a new one
    if (existingAudit?.screenshotUrl && screenshotUrl) {
      try {
        await deleteScreenshot(existingAudit.screenshotUrl);
      } catch (deleteError) {
        console.error("Error deleting old screenshot:", deleteError);
        // Continue even if deletion fails
      }
    }

    // Upsert audit result (create or update)
    const auditResult = await prisma.auditResult.upsert({
      where: {
        domainId: companyDomain.id,
      },
      create: {
        domainId: companyDomain.id,
        performance,
        seo,
        accessibility,
        bestPractices,
        pwa,
        audits: audits as any,
        screenshotUrl,
      },
      update: {
        performance,
        seo,
        accessibility,
        bestPractices,
        pwa,
        audits: audits as any,
        screenshotUrl,
      },
    });

    // Prepare normalized response for frontend compatibility
    const normalized = {
      performance,
      seo,
      accessibility,
      bestPractices,
      pwa,
      audits,
      screenshot: screenshotUrl || null,
    };

    return res.json({ 
      success: true,
      url: formatted, 
      normalized,
      audit: auditResult,
    });
  } catch (err) {
    console.error("Uncaught Server Error:", err);
    const errorMessage = err instanceof Error ? err.message : "Internal server error";
    return res.status(500).json({ 
      success: false,
      error: "Internal server error",
      details: errorMessage 
    });
  }
}));

export default router;
