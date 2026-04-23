# Standalone Peer Competitor Analysis

This API generates a competitor analysis for an existing saved domain using only the domain's stored context and location. It auto-discovers exactly 10 same-tier competitors, avoids unrealistic scale mismatches, and stores the result in the existing `CompetitorAnalysis` model.

## Endpoint

```http
POST /api/competitor/:domainId/standalone
Authorization: Bearer <token>
Content-Type: application/json
```

Optional body:

```json
{
  "force": true
}
```

`force` may also be passed as a query parameter:

```http
POST /api/competitor/:domainId/standalone?force=true
```

## Behavior

- Requires `authenticateToken`.
- Returns `404` when the domain does not exist.
- Returns `403` when the authenticated user does not own the domain.
- Requires usable context from `Domain.context`, `Domain.contextJson.summaryContext`, or the latest `CrawlResult.extractedContext`.
- Uses `Domain.location` as the target market; defaults to `Global` if missing.
- Returns the latest cached standalone peer analysis unless `force` is true.
- Persists results to the existing `CompetitorAnalysis` table.

## Same Playing Field Rules

Competitors must be realistic peers a buyer would actually compare. The analysis must return exactly 10 competitors and checks for:

- Same business category and service/product offering.
- Similar target customer segment.
- Relevant geography or target market.
- Active operations or direct customer availability in the target location.
- Explicit evidence that the competitor currently operates in the requested location.
- Similar company scale/tier.
- Comparable brand maturity and market authority.
- Similar estimated annual revenue.
- Similar estimated headcount.
- Similar customer revenue segment.
- Similar average project cost or contract value.

The service explicitly avoids unrealistic scale and market mismatches. For example, a small consultancy should not list McKinsey, Deloitte, BCG, Bain, or Accenture unless the target company itself operates at an enterprise or global consulting tier.

## Response Shape

```json
{
  "id": 123,
  "domainId": 45,
  "competitorListArr": ["Example Peer (examplepeer.com)"],
  "competitors": [
    {
      "name": "Example Peer",
      "domain": "examplepeer.com",
      "type": "direct",
      "marketTier": "regional_firm",
      "operatesInTargetLocation": true,
      "marketPresence": "Actively operates in the selected target market.",
      "locationEvidence": "Specific evidence that this competitor currently serves the requested location.",
      "peerFitReason": "Comparable service offering, buyer segment, location, and scale.",
      "scaleSimilarity": "Both appear to serve regional mid-sized clients with comparable deal sizes.",
      "estimatedRevenue": "$1M-$5M",
      "estimatedHeadcount": "10-50",
      "estimatedCustomerRevenue": "SMBs and regional companies under $50M revenue",
      "estimatedAverageProjectCost": "$10k-$50k",
      "estimatedKeywordCount": 12000,
      "estimatedMonthlyTraffic": 250000,
      "dataSource": "LLM estimate",
      "confidence": "Medium",
      "keyStrengths": ["Strong local positioning"],
      "weaknesses": ["Limited national visibility"],
      "threatLevel": "Medium",
      "recommendations": ["Monitor service-page positioning"]
    }
  ],
  "marketInsights": {
    "targetMarket": "New York",
    "targetTier": "regional_firm",
    "totalPeerCompetitors": 8,
    "marketSummary": "Location-aware peer market summary.",
    "marketLeader": "Example Peer",
    "trends": ["More specialized service pages"],
    "opportunities": ["Local authority content"]
  },
  "strategicRecommendations": [
    {
      "category": "Positioning",
      "priority": "High",
      "action": "Clarify niche expertise against regional peers.",
      "expectedImpact": "Improves buyer recall and comparison fit.",
      "timeline": "30-60 days"
    }
  ],
  "competitiveAnalysis": {
    "analysisType": "standalone_peer",
    "dataSource": {
      "type": "llm_estimate",
      "provider": "OpenAI",
      "model": "gpt-4o",
      "generatedAt": "2026-04-23T12:00:00.000Z",
      "disclaimer": "Competitor, keyword, traffic, revenue, headcount, customer-revenue, and project-cost values are AI-generated estimates based on domain context and location. Validate with SEO, traffic, and company-data tools before business decisions."
    },
    "targetPositioning": "Positioned against realistic same-tier competitors.",
    "samePlayingFieldCriteria": [
      "Same business category and offering",
      "Similar target customer segment",
      "Relevant geography",
      "Comparable company scale/tier",
      "Comparable brand maturity and market authority"
    ],
    "excludedMismatchExamples": [
      "Small consultancies should not be compared with McKinsey, Deloitte, BCG, Bain, or Accenture unless they operate at enterprise/global tier."
    ],
    "domainAdvantages": [],
    "domainWeaknesses": [],
    "competitiveGaps": [],
    "marketOpportunities": [],
    "threatMitigation": []
  },
  "cached": false,
  "tokenUsage": 1234
}
```

## Storage Mapping

- `competitors`: normalized peer competitor list.
- `marketInsights`: location-aware market summary and peer count.
- `strategicRecommendations`: prioritized actions against realistic peers.
- `competitiveAnalysis`: standalone metadata, positioning, gaps, risks, and opportunities.
- `competitorList`: newline-separated competitor names and domains.

## Validation Checklist

- Exactly 10 competitors are returned.
- Each competitor includes `marketTier`, `operatesInTargetLocation`, `marketPresence`, `locationEvidence`, `peerFitReason`, `scaleSimilarity`, `estimatedRevenue`, `estimatedHeadcount`, `estimatedCustomerRevenue`, `estimatedAverageProjectCost`, `estimatedKeywordCount`, `estimatedMonthlyTraffic`, `dataSource`, and `confidence`.
- `competitiveAnalysis.dataSource` identifies the LLM provider/model and includes a user-facing disclaimer.
- Small/local firms do not receive enterprise/global giants as competitors.
- Enterprise/global firms can receive enterprise/global competitors when the tier fit is valid.
- Competitors must be active in the requested location; global brands unavailable in the target market are invalid.
- The API rejects competitors whose `marketPresence` and `locationEvidence` do not explicitly support target-location availability.
- Repeated calls return cached results unless `force` is enabled.
