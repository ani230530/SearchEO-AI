import { google } from 'googleapis';
import { createOAuth2Client, refreshAccessToken, isTokenExpired } from './googleOAuthService';
import { prisma } from '../lib/prisma';


/**
 * Gets authenticated Search Console client for a user
 * Automatically refreshes token if needed
 */
export async function getSearchConsoleClient(userId: number) {
  const connection = await prisma.googleSearchConsoleConnection.findUnique({
    where: { userId }
  });

  if (!connection || !connection.isConnected) {
    throw new Error('Google Search Console not connected');
  }

  const oauth2Client = createOAuth2Client();

  // Check if token needs refresh
  let accessToken = connection.accessToken;
  let expiryDate = connection.tokenExpiry;

  if (isTokenExpired(expiryDate)) {
    const refreshed = await refreshAccessToken(connection.refreshToken);
    accessToken = refreshed.accessToken;
    expiryDate = refreshed.expiryDate;

    // Update in database
    await prisma.googleSearchConsoleConnection.update({
      where: { userId },
      data: {
        accessToken: refreshed.accessToken,
        tokenExpiry: refreshed.expiryDate
      }
    });
  }

  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.searchconsole({ version: 'v1', auth: oauth2Client });
}

/**
 * Lists all Search Console properties for a user
 */
export async function listProperties(userId: number) {
  try {
    const searchConsole = await getSearchConsoleClient(userId);
    const response = await searchConsole.sites.list();

    return response.data.siteEntry || [];
  } catch (error) {
    console.error('Error listing Search Console properties:', error);
    throw new Error('Failed to list Search Console properties');
  }
}

/**
 * Queries search analytics data
 */
export interface SearchAnalyticsQuery {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  dimensions?: string[]; // e.g., ['query', 'page', 'country', 'device']
  rowLimit?: number;
  startRow?: number;
  searchType?: 'web' | 'image' | 'video' | 'news' | 'discover' | 'googleNews';
}

export async function querySearchAnalytics(
  userId: number,
  property: string,
  query: SearchAnalyticsQuery
) {
  try {
    const searchConsole = await getSearchConsoleClient(userId);

    const requestBody: any = {
      startDate: query.startDate,
      endDate: query.endDate,
      dimensions: query.dimensions || ['query'],
      rowLimit: query.rowLimit || 1000,
      startRow: query.startRow || 0
    };

    if (query.searchType) {
      requestBody.searchType = query.searchType;
    }

    const response = await searchConsole.searchanalytics.query({
      siteUrl: property,
      requestBody
    });

    return response.data;
  } catch (error) {
    console.error('Error querying search analytics:', error);
    throw new Error('Failed to query search analytics data');
  }
}

/**
 * Verifies if a property is verified in Search Console
 */
export async function verifyProperty(userId: number, property: string): Promise<boolean> {
  try {
    const properties = await listProperties(userId);
    return properties.some(p => p.siteUrl === property);
  } catch (error) {
    console.error('Error verifying property:', error);
    return false;
  }
}
