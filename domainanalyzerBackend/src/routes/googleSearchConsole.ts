import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { getAuthUrl, exchangeCodeForTokens } from '../services/googleOAuthService';
import { encryptToken } from '../services/tokenEncryption';
import { listProperties, querySearchAnalytics, SearchAnalyticsQuery, getSearchConsoleClient } from '../services/googleSearchConsoleService';
import crypto from 'crypto';

const router = Router();

function asyncHandler(fn: (req: Request, res: Response, next: any) => Promise<any>) {
  return function (req: Request, res: Response, next: any) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Store state tokens temporarily (in production, use Redis or session store)
export const stateTokens = new Map<string, { userId: number; expiresAt: Date }>();

// Clean up expired state tokens every 10 minutes
setInterval(() => {
  const now = new Date();
  for (const [state, data] of stateTokens.entries()) {
    if (data.expiresAt < now) {
      stateTokens.delete(state);
    }
  }
}, 10 * 60 * 1000);

/**
 * GET /api/gsc/auth/initiate
 * Initiates Google OAuth flow
 */
router.get('/auth/initiate', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.userId;

  // Generate CSRF state token
  const state = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  stateTokens.set(state, { userId, expiresAt });

  // Generate OAuth URL
  try {
    const authUrl = getAuthUrl(state);
  res.json({
    success: true,
      authUrl
    });
  } catch (error: any) {
    console.error('Error generating OAuth URL:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate OAuth URL. Please check your Google OAuth configuration.'
    });
  }
}));

/**
 * OAuth callback handler (exported for use in index.ts at correct path)
 */
export const handleOAuthCallback = asyncHandler(async (req: Request, res: Response) => {
  const { code, state, error } = req.query;

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const redirectPath = '/newdashboard?tab=analytics&subtab=integration';

  if (error) {
    return res.redirect(`${frontendUrl}${redirectPath}&error=access_denied`);
  }

  if (!code || !state) {
    return res.redirect(`${frontendUrl}${redirectPath}&error=invalid_request`);
  }

  // Verify state token
  const stateData = stateTokens.get(state as string);
  if (!stateData || stateData.expiresAt < new Date()) {
    stateTokens.delete(state as string);
    return res.redirect(`${frontendUrl}${redirectPath}&error=invalid_state`);
  }

  const userId = stateData.userId;
  stateTokens.delete(state as string);

  try {
    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code as string);

    // Encrypt refresh token
    const encryptedRefreshToken = encryptToken(tokens.refreshToken);

    // Save or update connection
    await prisma.googleSearchConsoleConnection.upsert({
      where: { userId },
      update: {
        accessToken: tokens.accessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiry: tokens.expiryDate,
        googleEmail: tokens.email,
        googleUserId: tokens.googleUserId,
        isConnected: true,
        lastSyncedAt: new Date()
      },
      create: {
        userId,
        accessToken: tokens.accessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiry: tokens.expiryDate,
        googleEmail: tokens.email,
        googleUserId: tokens.googleUserId,
        isConnected: true,
        lastSyncedAt: new Date()
      }
    });

    res.redirect(`${frontendUrl}${redirectPath}&success=true`);
  } catch (error) {
    console.error('Error in OAuth callback:', error);
    res.redirect(`${frontendUrl}${redirectPath}&error=connection_failed`);
  }
});

/**
 * GET /api/gsc/status
 * Get connection status
 */
router.get('/status', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.userId;

  const connection = await prisma.googleSearchConsoleConnection.findUnique({
    where: { userId }
  });

  if (!connection || !connection.isConnected) {
    return res.json({
      success: true,
      connected: false
    });
  }

  res.json({
    success: true,
    connected: true,
    email: connection.googleEmail,
    selectedProperty: connection.selectedProperty,
    lastSyncedAt: connection.lastSyncedAt
  });
}));

/**
 * GET /api/gsc/properties
 * List user's Search Console properties
 */
router.get('/properties', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.userId;

  try {
    const properties = await listProperties(userId);

    res.json({
      success: true,
      properties: properties.map(p => ({
        siteUrl: p.siteUrl,
        permissionLevel: p.permissionLevel
      }))
    });
  } catch (error) {
    console.error('Error listing properties:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list Search Console properties'
    });
  }
}));

/**
 * POST /api/gsc/select-property
 * User selects which property to use
 */
router.post('/select-property', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.userId;
  const { property } = req.body;

  if (!property) {
    return res.status(400).json({
      success: false,
      error: 'Property is required'
    });
  }

  try {
    // Verify property exists for user
    const properties = await listProperties(userId);
    const propertyExists = properties.some(p => p.siteUrl === property);

    if (!propertyExists) {
      return res.status(400).json({
        success: false,
        error: 'Property not found or not accessible'
      });
    }

    // Update selected property
    await prisma.googleSearchConsoleConnection.update({
      where: { userId },
      data: { selectedProperty: property }
    });

    res.json({
      success: true,
      message: 'Property selected successfully'
    });
  } catch (error) {
    console.error('Error selecting property:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to select property'
    });
  }
}));

/**
 * GET /api/gsc/data
 * Fetch search analytics data
 */
router.get('/data', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.userId;

  const connection = await prisma.googleSearchConsoleConnection.findUnique({
    where: { userId }
  });

  if (!connection || !connection.isConnected || !connection.selectedProperty) {
    return res.status(400).json({
      success: false,
      error: 'Google Search Console not connected or no property selected'
    });
  }

  const { startDate, endDate, dimensions, rowLimit, startRow, searchType } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({
      success: false,
      error: 'startDate and endDate are required (YYYY-MM-DD format)'
    });
  }

  try {
    const query: SearchAnalyticsQuery = {
      startDate: startDate as string,
      endDate: endDate as string,
      dimensions: dimensions ? (dimensions as string).split(',') : ['query'],
      rowLimit: rowLimit ? parseInt(rowLimit as string) : 1000,
      startRow: startRow ? parseInt(startRow as string) : 0,
      searchType: searchType as any
    };

    const data = await querySearchAnalytics(userId, connection.selectedProperty, query);

    // Update last synced time
    await prisma.googleSearchConsoleConnection.update({
      where: { userId },
      data: { lastSyncedAt: new Date() }
    });

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error fetching search analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch search analytics data'
    });
  }
}));

/**
 * DELETE /api/gsc/disconnect
 * Disconnect Google Search Console
 */
router.delete('/disconnect', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.userId;

  try {
    await prisma.googleSearchConsoleConnection.delete({
      where: { userId }
    });

    res.json({
      success: true,
      message: 'Google Search Console disconnected successfully'
    });
  } catch (error) {
    console.error('Error disconnecting:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to disconnect Google Search Console'
    });
  }
}));

/**
 * Helper function to get company domain for user
 */
const getCompanyDomainForUser = async (userId: number) => {
  return prisma.domain.findFirst({
    where: {
      userId,
      isCompanyDomain: true,
    },
    select: {
      url: true,
    },
  });
};

/**
 * Helper function to calculate date range
 */
const calculateDateRange = (days?: number, startDate?: string, endDate?: string) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let actualEndDate: Date;
  if (endDate) {
    actualEndDate = new Date(endDate);
  } else {
    actualEndDate = new Date(today);
    actualEndDate.setDate(today.getDate() - 2); // GSC data is delayed by 2 days
  }
  actualEndDate.setHours(0, 0, 0, 0);
  
  // Ensure end date is not more recent than 2 days ago
  const latestPossibleDate = new Date(today);
  latestPossibleDate.setDate(today.getDate() - 2);
  latestPossibleDate.setHours(0, 0, 0, 0);
  
  if (actualEndDate > latestPossibleDate) {
    actualEndDate = latestPossibleDate;
  }
  
  let actualStartDate: Date;
  if (startDate) {
    actualStartDate = new Date(startDate);
  } else {
    const daysToSubtract = days || 28;
    actualStartDate = new Date(actualEndDate);
    actualStartDate.setDate(actualEndDate.getDate() - (daysToSubtract - 1));
  }
  actualStartDate.setHours(0, 0, 0, 0);
  
  return {
    actualStartDate: actualStartDate.toISOString().split('T')[0],
    actualEndDate: actualEndDate.toISOString().split('T')[0],
    requestedStartDate: startDate || actualStartDate.toISOString().split('T')[0],
    requestedEndDate: endDate || actualEndDate.toISOString().split('T')[0],
  };
};

/**
 * Helper function to normalize URL
 */
const normalizeUrl = (url: string): string => {
  return url
    .toLowerCase()
    .replace(/^https?:\/\//, '') // remove protocol
    .replace(/^www\./, '')       // remove www.
    .replace(/\/$/, '');         // remove trailing slash
};

/**
 * Helper function to extract domain from URL
 */
const extractDomain = (url: string): string => {
  try {
    // Handle sc-domain: prefix for domain properties
    if (url.startsWith('sc-domain:')) {
      return url.replace('sc-domain:', '').toLowerCase();
    }
    
    // Handle regular URLs
    let normalizedUrl = url.toLowerCase().trim();
    if (!normalizedUrl.startsWith('http')) {
      normalizedUrl = `https://${normalizedUrl}`;
    }
    
    const urlObj = new URL(normalizedUrl);
    return urlObj.hostname.replace(/^www\./, '');
  } catch (e) {
    // If URL parsing fails, try simple normalization
    return normalizeUrl(url);
  }
};

/**
 * Helper function to match company domain with GSC properties
 */
const findMatchingProperty = (companyDomain: string, properties: Array<{ siteUrl: string }>): string | null => {
  const companyDomainNormalized = extractDomain(companyDomain);
  
  for (const property of properties) {
    const propertyDomain = extractDomain(property.siteUrl);
    
    // Check different matching patterns
    const exactMatch = propertyDomain === companyDomainNormalized;
    const subdomainMatch = companyDomainNormalized.endsWith(`.${propertyDomain}`);
    const domainContains = propertyDomain.includes(companyDomainNormalized) || 
                          companyDomainNormalized.includes(propertyDomain);
    
    if (exactMatch || subdomainMatch || domainContains) {
      return property.siteUrl;
    }
  }
  
  return null;
};

/**
 * GET /api/gsc/pages/:pageUrl/queries
 * Fetch queries for a specific page
 * NOTE: This route must come before /pages to avoid route conflict
 */
router.get('/pages/:pageUrl/queries', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.userId;
  const pageUrl = decodeURIComponent(req.params.pageUrl);

  // Check GSC connection
  const connection = await prisma.googleSearchConsoleConnection.findUnique({
    where: { userId }
  });

  if (!connection || !connection.isConnected || !connection.selectedProperty) {
    return res.status(400).json({
      success: false,
      error: 'Google Search Console not connected or no property selected'
    });
  }

  // Verify the selected property exists in user's GSC account
  try {
    const propertiesList = await listProperties(userId);
    const propertyExists = propertiesList.some(p => p.siteUrl === connection.selectedProperty);
    
    if (!propertyExists) {
      return res.status(400).json({
        success: false,
        error: 'Selected property is not accessible in your Google Search Console account'
      });
    }
  } catch (error) {
    console.error('Error verifying property:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to verify property access'
    });
  }

  const { startDate, endDate, days, includeDateBreakdown } = req.query;
  const daysNum = days ? parseInt(days as string, 10) : 28;
  const shouldIncludeDateBreakdown = includeDateBreakdown === 'true';
  
  const dateRange = calculateDateRange(
    daysNum,
    startDate as string | undefined,
    endDate as string | undefined
  );

  try {
    // Get Search Console client and make API call with page filter
    const searchconsole = await getSearchConsoleClient(userId);
    
    const response = await searchconsole.searchanalytics.query({
      siteUrl: connection.selectedProperty,
      requestBody: {
        startDate: dateRange.actualStartDate,
        endDate: dateRange.actualEndDate,
        dimensions: ['query', 'date'],
        dimensionFilterGroups: [{
          filters: [{
            dimension: 'page',
            operator: 'equals',
            expression: pageUrl
          }]
        }],
        rowLimit: 500
      }
    });

    const queryRows = response.data.rows || [];
    
    // Build date breakdown if requested
    const dateBreakdown: { [query: string]: { [date: string]: { clicks: number; impressions: number; position: number; ctr: number } } } = {};
    
    // Aggregate by query (sum clicks/impressions, average position/CTR)
    const aggregatedQueries = queryRows.reduce((acc: any, curr: any) => {
      const query = curr.keys[0];
      const date = curr.keys[1];
      
      // Build date breakdown
      if (shouldIncludeDateBreakdown) {
        if (!dateBreakdown[query]) {
          dateBreakdown[query] = {};
        }
        dateBreakdown[query][date] = {
          clicks: curr.clicks || 0,
          impressions: curr.impressions || 0,
          position: curr.position || 0,
          ctr: curr.ctr || 0
        };
      }
      
      // Aggregate totals
      const existing = acc.find((item: any) => item.query === query);
      
      if (existing) {
        existing.clicks += curr.clicks || 0;
        existing.impressions += curr.impressions || 0;
        existing.ctr = existing.clicks / existing.impressions;
        existing.position = (existing.position + (curr.position || 0)) / 2;
      } else {
        acc.push({
          query: query,
          clicks: curr.clicks || 0,
          impressions: curr.impressions || 0,
          position: curr.position || 0,
          ctr: curr.ctr || 0
        });
      }
      
      return acc;
    }, []);

    // Update last synced time
    await prisma.googleSearchConsoleConnection.update({
      where: { userId },
      data: { lastSyncedAt: new Date() }
    });

    const responseData: any = {
      success: true,
      queries: aggregatedQueries,
      pageUrl: pageUrl,
      dateRange: {
        startDate: dateRange.actualStartDate,
        endDate: dateRange.actualEndDate,
        requestedStartDate: dateRange.requestedStartDate,
        requestedEndDate: dateRange.requestedEndDate,
        filterType: startDate && endDate ? 'custom' : `${daysNum}-day`,
        daysRequested: daysNum,
        totalResults: aggregatedQueries.length
      }
    };

    if (shouldIncludeDateBreakdown) {
      responseData.dateBreakdown = dateBreakdown;
    }

    res.json(responseData);
  } catch (error) {
    console.error('Error fetching page queries:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch page queries'
    });
  }
}));

/**
 * GET /api/gsc/pages
 * Fetch all pages data for the company domain
 * Route added to fetch GSC pages for company domain
 */
router.get('/pages', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.userId;

  // Check GSC connection
  const connection = await prisma.googleSearchConsoleConnection.findUnique({
    where: { userId }
  });

  if (!connection || !connection.isConnected || !connection.selectedProperty) {
    return res.status(400).json({
      success: false,
      error: 'Google Search Console not connected or no property selected'
    });
  }

  // Get company domain
  const companyDomain = await getCompanyDomainForUser(userId);
  if (!companyDomain) {
    return res.status(400).json({
      success: false,
      error: 'Company domain not found'
    });
  }

  // Get user's GSC properties to verify company domain is accessible
  let properties: Array<{ siteUrl: string }>;
  try {
    const propertiesList = await listProperties(userId);
    properties = propertiesList
      .filter(p => p.siteUrl) // Filter out null/undefined siteUrls
      .map(p => ({ siteUrl: p.siteUrl! })); // Use non-null assertion after filter
  } catch (error) {
    console.error('Error fetching GSC properties:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch GSC properties'
    });
  }

  // Find matching property for company domain
  const matchedProperty = findMatchingProperty(companyDomain.url, properties);
  
  if (!matchedProperty) {
    return res.status(400).json({
      success: false,
      error: `Company domain "${companyDomain.url}" is not found in your Google Search Console account. Please verify that you have access to this domain in Google Search Console.`
    });
  }

  // Use matched property (or selected property if it matches)
  const propertyToUse = matchedProperty || connection.selectedProperty;

  const { startDate, endDate, days } = req.query;
  const daysNum = days ? parseInt(days as string, 10) : 28;
  
  const dateRange = calculateDateRange(
    daysNum,
    startDate as string | undefined,
    endDate as string | undefined
  );

  try {
    // Query Search Console with 'page' dimension
    const query: SearchAnalyticsQuery = {
      startDate: dateRange.actualStartDate,
      endDate: dateRange.actualEndDate,
      dimensions: ['page'],
      rowLimit: 1000
    };

    const data = await querySearchAnalytics(userId, propertyToUse, query);
    const rows = data.rows || [];

    // All pages from the matched property belong to the company domain
    // No need to filter further since we've already verified the property matches
    const pagesData = rows.map((row: any) => ({
      page: row.keys[0],
      clicks: row.clicks || 0,
      impressions: row.impressions || 0,
      position: row.position || 0,
      ctr: row.ctr || 0
    }));

    // Update last synced time
    await prisma.googleSearchConsoleConnection.update({
      where: { userId },
      data: { lastSyncedAt: new Date() }
    });

    res.json({
      success: true,
      pages: pagesData,
      dateRange: {
        startDate: dateRange.actualStartDate,
        endDate: dateRange.actualEndDate,
        requestedStartDate: dateRange.requestedStartDate,
        requestedEndDate: dateRange.requestedEndDate,
        filterType: startDate && endDate ? 'custom' : `${daysNum}-day`,
        daysRequested: daysNum,
        totalResults: pagesData.length
      }
    });
  } catch (error) {
    console.error('Error fetching GSC pages:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pages data'
    });
  }
}));

export default router;
