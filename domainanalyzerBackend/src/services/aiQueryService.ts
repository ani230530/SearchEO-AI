import OpenAI from 'openai';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set in environment variables');
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Enhanced system prompt that mimics ChatGPT's behavior more closely
const CHATGPT_SYSTEM_PROMPT = `You are ChatGPT, a large language model trained by OpenAI, based on the GPT-4 architecture. 

Key behaviors:
- Always provide comprehensive, well-researched responses
- Use web search capabilities when needed for current information
- Structure responses with clear headings and bullet points when appropriate
- Include specific examples and actionable advice
- Maintain a conversational but informative tone
- When discussing tools, software, or services, provide balanced comparisons
- Always cite sources when making factual claims
- Format responses in markdown for better readability

Current date: ${new Date().toISOString().split('T')[0]}

You have access to web search. Use it proactively for:
- Current events and recent developments
- Specific product comparisons
- Latest pricing information
- Recent reviews or user feedback
- Technical specifications that may have changed
- Market trends and statistics`;

// Helper function to extract JSON from AI response
function extractJSONFromResponse(aiResponse: string): string | null {
  try {
    let cleanResponse = aiResponse.trim();
    
    if (cleanResponse.startsWith('```json')) {
      cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanResponse.startsWith('```')) {
      cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    
    const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleanResponse = jsonMatch[0];
    }
    
    JSON.parse(cleanResponse);
    return cleanResponse;
  } catch {
    return null;
  }
}

async function analyzeResponseWithAI(response: string, targetDomain: string): Promise<{
  presence: number;
  rank: number;
  context: string;
  mentions: number;
  highlightContext: string;
  detectionMethod: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  competitors: {
    names: string[];
    mentions: Array<{
      name: string;
      domain: string;
      position: number;
      context: string;
      sentiment: 'positive' | 'neutral' | 'negative';
      mentionType: 'url' | 'text' | 'brand';
    }>;
    totalMentions: number;
  };
}> {
  try {
    const cleanTarget = targetDomain.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '');
    const brandName = cleanTarget.split('.')[0];
    
               const analysisPrompt = `
       You are to perform HIGH-PRECISION detection of a TARGET DOMAIN and COMPETITORS within the following RESPONSE text.

       TASK:
       - Detect whether TARGET DOMAIN or Brand Name or Sub Brand Name is present.
       - Determine the first occurrence RANK based on textual order (Rank 1 = first mention in the text; Rank 2 = second, etc.). If absent, rank must be 0.
       - Provide detectionMethod as one of: "url" | "brand" | "text". Priority if multiple match types exist for the same occurrence: url > brand > text.
       - Provide highlightContext: a short exact substring (≤ 280 chars) from the RESPONSE where the target or competitor is clearly mentioned.
       - Count mentions for TARGET DOMAIN (exact and normalized forms) as an integer.
       - Extract COMPETITORS (brands/domains) with their first position, sentiment, and mentionType.

       NORMALIZATION RULES:
       - Normalize all domains to lowercase and strip protocol and leading 'www.' (e.g., https://www.Example.com/path → example.com).
       - TARGET BRAND VARIANTS: Generate reasonable brand variants from TARGET BRAND (split on punctuation/case). Match brand mentions case-insensitively.
       - URL detection: Any URL whose hostname equals or ends with the domain (including subdomains) counts as detectionType "url".
       - TEXT detection: Plain-text occurrences of the normalized domain (e.g., "example.com") count as detectionType "text".
       - BRAND detection: Brand-name mentions (variants of TARGET BRAND) count as detectionType "brand" if not immediately accompanied by another unrelated domain.

       COMPETITOR EXTRACTION:
       - Extract distinct brands/domains other than TARGET DOMAIN.
       - For each competitor, include a best-effort brand name and normalized domain when possible.
       - position is based on first mention order in the RESPONSE, starting at 1.
       - mentionType must be "url" | "text" | "brand" using the same rules as above.

       SENTIMENT RULES (context of mention):
       - positive: recommended, praised, labeled best/top, or endorsed.
       - negative: discouraged, criticized, labeled worst, avoid, not recommended.
       - neutral: listed, compared without judgment, or purely informational.

       OUTPUT STRICTLY as RAW JSON (no markdown, no code fences). The response MUST start with { and end with }.

       REQUIRED JSON SCHEMA:
       {
         "targetDomain": {
           "isPresent": boolean,
           "rank": number,               // 0 if not found; otherwise 1..N based on first textual occurrence
           "context": "positive|neutral|negative|not_found",
           "mentions": number,           // integer count of total mentions (all detection types)
           "highlightContext": string,   // ≤ 280 chars
           "detectionMethod": "url|text|brand|none" // none only if not found
         },
         "competitors": [
           {
             "name": string,             // brand or best-effort readable label
             "domain": string,           // normalized domain if available, else empty string
             "position": number,         // 1..N based on first occurrence
             "context": "positive|neutral|negative",
             "sentiment": "positive|neutral|negative",
             "mentionType": "url|text|brand"
           }
         ]
       }

       VALIDATION CONSTRAINTS:
       - If TARGET DOMAIN is absent, set isPresent=false, rank=0, mentions=0, detectionMethod="none", context="not_found".
       - NEVER hallucinate domains; only extract what appears in RESPONSE.
       - Ensure arrays/fields exist even if empty. Use empty string for unknown competitor domain.
       - Keep strings concise; do not exceed limits.

       RESPONSE:
       "${response}"

       TARGET DOMAIN: ${targetDomain}
       TARGET BRAND: ${brandName}
       `;

               const completion = await openai.chat.completions.create({
             model: 'gpt-4o',
             messages: [
               { 
                 role: 'system', 
                 content: 'You are an expert at precise text analysis for domain and brand detection. You MUST return ONLY raw JSON, strictly conforming to the provided schema. Do not include markdown. Deterministic output: avoid speculation; never invent domains.' 
               },
               { role: 'user', content: analysisPrompt }
             ],
             temperature: 0,
             top_p: 1,
             frequency_penalty: 0,
             presence_penalty: 0,
             max_tokens: 1200
           });

               const aiResponse = completion.choices[0].message?.content || '';
           
           console.log('Raw AI response:', aiResponse.substring(0, 300));
           
           // Use helper function to extract clean JSON
           const cleanResponse = extractJSONFromResponse(aiResponse);
           if (!cleanResponse) {
             throw new Error('Could not extract valid JSON from AI response');
           }
           
           console.log('Cleaned AI response:', cleanResponse.substring(0, 200));
           
           const analysis = JSON.parse(cleanResponse);
    
    console.log('AI Analysis Response:', {
      targetDomain: analysis.targetDomain,
      competitors: analysis.competitors,
      rawResponse: aiResponse.substring(0, 200)
    });
    
    // Transform AI response to our format
    const targetInfo = analysis.targetDomain;
    const competitors = analysis.competitors || [];
    
    const finalCompetitors = {
      names: competitors.map((c: any) => c.name || c.domain).filter(Boolean),
      mentions: competitors.map((c: any) => ({
        name: c.name || c.domain || '',
        domain: c.domain || c.name || '',
        position: c.position || 0,
        context: c.context || '',
        sentiment: c.sentiment || 'neutral',
        mentionType: c.mentionType || 'text'
      })),
      totalMentions: competitors.length
    };
    
    console.log('Final competitor data from AI analysis:', finalCompetitors);
    
    return {
      presence: targetInfo.isPresent ? 1 : 0,
      rank: targetInfo.rank || 0,
      context: targetInfo.context || 'not_found',
      mentions: targetInfo.mentions || 0,
      highlightContext: targetInfo.highlightContext || '',
      detectionMethod: targetInfo.detectionMethod || 'none',
      sentiment: targetInfo.context === 'positive' ? 'positive' : targetInfo.context === 'negative' ? 'negative' : 'neutral',
      competitors: finalCompetitors
    };
  } catch (error) {
    console.error('AI analysis failed, using fallback:', error);
    
    // Simple fallback detection
    const cleanTarget = targetDomain.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '');
    const responseLower = response.toLowerCase();
    
    let presence = 0;
    let rank = 0;
    let mentions = 0;
    let highlightContext = '';
    let detectionMethod = 'none';
    
    if (responseLower.includes(cleanTarget)) {
      presence = 1;
      mentions = 1;
      const index = responseLower.indexOf(cleanTarget);
      rank = Math.ceil((index / response.length) * 10);
      
      const start = Math.max(0, index - 100);
      const end = Math.min(response.length, index + cleanTarget.length + 100);
      highlightContext = response.substring(start, end);
      detectionMethod = 'text';
    }
    
    // Extract competitors from text even in fallback
    console.log('Fallback: analyzing response text for competitors');
    console.log('Response preview:', response.substring(0, 200));
    
    const urlRegex = /https?:\/\/[^\s\n\)\]}"']+/g;
    const urls = response.match(urlRegex) || [];
    const domains = urls.map(u => {
      try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
    }).filter(d => d && d !== cleanTarget);
    
    // Also look for common brand/competitor indicators
    const competitorKeywords = [
      'notion', 'slack', 'trello', 'asana', 'clickup', 'monday', 'airtable', 'figma', 'canva', 'zoom', 'teams',
      'dropbox', 'google', 'microsoft', 'apple', 'amazon', 'salesforce', 'hubspot', 'mailchimp', 'stripe',
      'shopify', 'wix', 'squarespace', 'wordpress', 'webflow', 'bubble', 'zapier', 'ifttt', 'automate'
    ];
    
    const foundBrands = competitorKeywords.filter(brand => 
      response.toLowerCase().includes(brand.toLowerCase()) && brand.toLowerCase() !== cleanTarget
    );
    
    // Combine domains and brands, remove duplicates
    const allCompetitors = [...new Set([...domains, ...foundBrands])];
    const competitorNames = allCompetitors.slice(0, 8);
    
    const competitorMentions = competitorNames.map((name, i) => ({
      name: name,
      domain: name,
      position: i + 1,
      context: 'neutral',
      sentiment: 'neutral' as const,
      mentionType: 'url' as const
    }));
    
    const fallbackCompetitors = {
      names: competitorNames,
      mentions: competitorMentions,
      totalMentions: competitorMentions.length
    };
    
    console.log('Fallback competitor data:', fallbackCompetitors);
    console.log('Found URLs:', urls.slice(0, 5));
    console.log('Found domains:', domains.slice(0, 5));
    console.log('Found brands:', foundBrands.slice(0, 5));
    
    return {
      presence,
      rank,
      context: presence > 0 ? 'neutral' : 'not_found',
      mentions,
      highlightContext,
      detectionMethod,
      sentiment: 'neutral',
      competitors: fallbackCompetitors
    };
  }
}

// Enhanced query function that better mimics ChatGPT web browsing
async function queryWithGpt4o(phrase: string, modelType: 'GPT-4o' | 'GPT-4o Pro' | 'GPT-4o Advanced' = 'GPT-4o', domain?: string, location?: string): Promise<{ response: string, cost: number, sources?: string[], enhancedData?: any }> {
  try {
    const hasLocation = Boolean(location?.trim());
    const locationGuidance = hasLocation ? `

Location context:
- The user is in or targeting: ${location!.trim()}
- For ambiguous queries, assume the user wants an answer relevant to this location.
- For local-intent requests such as businesses, services, pricing, regulations, events, availability, time, or "near me" style queries, prioritize this location in the answer.
- If the query is clearly global, conceptual, or not location-sensitive, answer normally without forcing the location.
- When location affects the answer, mention location-specific details naturally and put the local answer first.` : '';

    // Enhanced prompt that encourages web-search-like behavior
    const enhancedPrompt = `${phrase}

${locationGuidance}

Please provide a comprehensive response that includes:
1. Current, up-to-date information
2. Multiple perspectives or options when relevant
3. Specific examples and use cases
4. Comparison with alternatives when appropriate
5. Actionable recommendations
6. Source attributions where possible

Format your response with clear structure using markdown headings and bullet points where helpful.`;

    // Try multiple approaches for the most ChatGPT-like experience
    let responseText = '';
    let sources: string[] = [];
    let enhancedData: any = {};

    // First attempt: Use the newer chat completions with enhanced features
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { 
            role: 'system', 
            content: CHATGPT_SYSTEM_PROMPT
          },
          { 
            role: 'user', 
            content: enhancedPrompt 
          }
        ],
        max_tokens: 2000,
        temperature: 0.1, // Slightly more deterministic
        top_p: 0.95,
        frequency_penalty: 0.1,
        presence_penalty: 0.1,
        // Add function calling for web search simulation
        tools: [
          {
            type: "function",
            function: {
              name: "web_search",
              description: "Search the web for current information",
              parameters: {
                type: "object",
                properties: {
                  query: {
                    type: "string",
                    description: "The search query"
                  }
                },
                required: ["query"]
              }
            }
          }
        ],
        tool_choice: "auto"
      });

      responseText = completion.choices[0].message?.content || '';
      
      // Check if the model wanted to use web search
      const toolCalls = completion.choices[0].message?.tool_calls;
      if (toolCalls && toolCalls.length > 0) {
        const firstToolCall = toolCalls[0];
        // Type guard: check if it's a function tool call (not a custom tool call)
        if (firstToolCall.type === 'function' && 'function' in firstToolCall) {
          // Simulate web search results by enhancing the response
          const searchQuery = JSON.parse(firstToolCall.function.arguments).query;
          
          // Make a follow-up call with simulated search results
          const followUpCompletion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
              { role: 'system', content: CHATGPT_SYSTEM_PROMPT },
              { role: 'user', content: enhancedPrompt },
              completion.choices[0].message,
              {
                role: 'tool',
                tool_call_id: firstToolCall.id,
                content: `Search results for "${searchQuery}": Based on current web information, here are relevant findings that should be incorporated into your response. Please provide comprehensive, current information.`
              }
            ],
            max_tokens: 2000,
            temperature: 0.1
          });
          
          responseText = followUpCompletion.choices[0].message?.content || responseText;
          enhancedData.searchPerformed = true;
          enhancedData.searchQuery = searchQuery;
        }
      }

      // Extract URLs from response for sources
      const urlRegex = /https?:\/\/[^\s)\]\"'>]+/g;
      const found = responseText.match(urlRegex) || [];
      sources = Array.from(new Set(found)).slice(0, 8);

      // Cost calculation
      const inputTokens = Math.ceil((enhancedPrompt.length + CHATGPT_SYSTEM_PROMPT.length) / 4);
      const outputTokens = Math.ceil(responseText.length / 4);
      const cost = (inputTokens * 0.000005 + outputTokens * 0.000015);

      console.log('Enhanced ChatGPT-like response generated successfully');
      
      return { 
        response: responseText, 
        cost,
        sources,
        enhancedData
      };

    } catch (error) {
      console.warn('Enhanced completion failed, using standard approach:', error);
      
      // Fallback to standard chat completions
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: CHATGPT_SYSTEM_PROMPT },
          { role: 'user', content: enhancedPrompt }
        ],
        max_tokens: 2000,
        temperature: 0.1,
        top_p: 0.95,
        frequency_penalty: 0.1,
        presence_penalty: 0.1
      });

      responseText = completion.choices[0].message?.content || `No response from ${modelType}.`;
      
      // Extract URLs for sources
      const urlRegex = /https?:\/\/[^\s)\]\"'>]+/g;
      const found = responseText.match(urlRegex) || [];
      sources = Array.from(new Set(found)).slice(0, 8);
      
      // Cost calculation for fallback
      const inputTokens = Math.ceil((enhancedPrompt.length + CHATGPT_SYSTEM_PROMPT.length) / 4);
      const outputTokens = Math.ceil(responseText.length / 4);
      const cost = (inputTokens * 0.000005 + outputTokens * 0.000015);
      
      return { 
        response: responseText, 
        cost,
        sources,
        enhancedData: { fallback: true }
      };
    }

  } catch (error) {
    console.error('Enhanced AI query failed:', error);
    
    // Ultimate fallback - simple response
    const fallbackResponse = `I apologize, but I'm experiencing technical difficulties. Here's a basic response to your query: "${phrase}". Please try again later for a more comprehensive answer.`;
    
    return { 
      response: fallbackResponse, 
      cost: 0.001, // Minimal cost for fallback
      sources: [],
      enhancedData: { confidence: 0.1, error: 'fallback_used' }
    };
  }
}

// Enhanced AI scoring with proper domain presence handling
async function scoreResponseWithAI(phrase: string, response: string, model: string, domain?: string, location?: string): Promise<{ 
  presence: number; 
  relevance: number; 
  accuracy: number; 
  sentiment: number; 
  overall: number; 
  domainRank?: number; 
  foundDomains?: string[];
  sources: string[];
  competitorUrls: string[];
  competitorMatchScore: number;
  comprehensiveness: number;
  context: string;
  mentions: number;
  highlightContext: string;
  detectionMethod: string;
  domainSentiment: 'positive' | 'neutral' | 'negative';
  aiConfidence: number;
  rankingFactors: {
    position: number;
    prominence: number;
    contextQuality: number;
    mentionType: number;
  };
  competitors: {
    names: string[];
    mentions: Array<{
      name: string;
      domain: string;
      position: number;
      context: string;
      sentiment: 'positive' | 'neutral' | 'negative';
      mentionType: 'url' | 'text' | 'brand';
    }>;
    totalMentions: number;
  };
}> {
  // Use the simplified AI analysis
  const domainAnalysis = await analyzeResponseWithAI(response, domain || '');
  
  console.log('Domain analysis result:', {
    presence: domainAnalysis.presence,
    rank: domainAnalysis.rank,
    competitors: domainAnalysis.competitors
  });
  
  // CRITICAL: If domain is not present, return all zeros
  if (domainAnalysis.presence === 0) {
    console.log('Domain not found - returning zero scores');
    return {
      presence: 0,
      relevance: 0,
      accuracy: 0,
      sentiment: 0,
      overall: 0,
      domainRank: 0,
      foundDomains: [],
      sources: ['AI Analysis'],
      competitorUrls: [],
      competitorMatchScore: 0,
      comprehensiveness: 0,
      context: 'not_found',
      mentions: 0,
      highlightContext: '',
      detectionMethod: 'none',
      domainSentiment: 'neutral',
      aiConfidence: 0,
      rankingFactors: {
        position: 0,
        prominence: 0,
        contextQuality: 0,
        mentionType: 0
      },
      competitors: domainAnalysis.competitors
    };
  }
  
  // Domain is present - calculate quality-based scores
  console.log('Domain found - calculating quality scores');
  
  // Response quality analysis
  const responseLength = response.length;
  const comprehensiveness = responseLength > 1000 ? 5 : responseLength > 800 ? 4 : responseLength > 600 ? 3 : responseLength > 400 ? 2 : 1;
  
  // Enhanced relevance scoring based on phrase-domain alignment
  const phraseWords = phrase.toLowerCase().split(/\s+/).filter(word => word.length > 3);
  const responseWords = response.toLowerCase().split(/\s+/);
  const matchedWords = phraseWords.filter(word => responseWords.includes(word));
  const baseRelevance = Math.min(5, Math.max(1, (matchedWords.length / phraseWords.length) * 5));
  
  // Boost relevance if domain context is positive
  const relevanceBoost = domainAnalysis.sentiment === 'positive' ? 1 : domainAnalysis.sentiment === 'negative' ? -1 : 0;
  const relevance = Math.min(5, Math.max(1, baseRelevance + relevanceBoost));
  
  // Enhanced accuracy scoring based on domain detection method
  let accuracy = 3; // Base accuracy
  if (domainAnalysis.detectionMethod === 'url') {
    accuracy = 5; // URL mentions are most accurate
  } else if (domainAnalysis.detectionMethod === 'brand') {
    accuracy = 4; // Brand mentions are good
  } else if (domainAnalysis.detectionMethod === 'text') {
    accuracy = 3; // Text mentions are basic
  }
  
  // Enhanced sentiment scoring
  let sentiment = 3; // Neutral base
  if (domainAnalysis.sentiment === 'positive') {
    sentiment = 5; // High positive sentiment
  } else if (domainAnalysis.sentiment === 'negative') {
    sentiment = 1; // Low negative sentiment
  }
  
  // Enhanced overall scoring based on rank, sentiment, and context quality
  let overall = 0;
  if (domainAnalysis.rank > 0) {
    // Base score from rank (1-10 scale, converted to 1-5)
    const rankScore = Math.min(5, Math.max(1, domainAnalysis.rank));
    
    // Sentiment multiplier
    const sentimentMultiplier = domainAnalysis.sentiment === 'positive' ? 1.2 : 
                               domainAnalysis.sentiment === 'negative' ? 0.6 : 1.0;
    
    // Context quality bonus
    const contextBonus = domainAnalysis.context === 'positive' ? 0.5 : 
                        domainAnalysis.context === 'negative' ? -0.5 : 0;
    
    // Detection method bonus
    const detectionBonus = domainAnalysis.detectionMethod === 'url' ? 0.3 :
                          domainAnalysis.detectionMethod === 'brand' ? 0.2 : 0;
    
    overall = Math.min(5, Math.max(1, (rankScore * sentimentMultiplier) + contextBonus + detectionBonus));
  }
  
  // Extract competitor URLs from competitor mentions
  const competitorUrls = domainAnalysis.competitors.mentions.map(m => `https://${m.domain}`);
  
  // Enhanced competitor match score
  const competitorMatchScore = domainAnalysis.competitors.totalMentions * 10;
  
  // Enhanced ranking factors
  const rankingFactors = {
    position: domainAnalysis.rank * 10,
    prominence: domainAnalysis.mentions * 20,
    contextQuality: domainAnalysis.sentiment === 'positive' ? 80 : domainAnalysis.sentiment === 'negative' ? 20 : 50,
    mentionType: domainAnalysis.detectionMethod === 'url' ? 100 : domainAnalysis.detectionMethod === 'brand' ? 80 : 60
  };
  
  const finalScores = {
    presence: domainAnalysis.presence,
    relevance,
    accuracy,
    sentiment,
    overall,
    domainRank: domainAnalysis.rank || undefined,
    foundDomains: [domain || ''],
    sources: ['AI Analysis'],
    competitorUrls,
    competitorMatchScore,
    comprehensiveness,
    context: domainAnalysis.context,
    mentions: domainAnalysis.mentions,
    highlightContext: domainAnalysis.highlightContext,
    detectionMethod: domainAnalysis.detectionMethod,
    domainSentiment: domainAnalysis.sentiment,
    aiConfidence: 100, // AI confidence is high for this approach
    rankingFactors,
    competitors: domainAnalysis.competitors
  };
  
  console.log('Final scores being returned:', {
    presence: finalScores.presence,
    overall: finalScores.overall,
    sentiment: finalScores.sentiment,
    accuracy: finalScores.accuracy,
    competitors: finalScores.competitors
  });
  
  return finalScores;
}

export const aiQueryService = {
  query: async (phrase: string, model: 'GPT-4o' | 'Claude 3' | 'Gemini 1.5', domain?: string, location?: string): Promise<{ response: string, cost: number, sources?: string[], enhancedData?: any }> => {
    console.log(`AI Query Service: Processing query with GPT-4o`);
    return await queryWithGpt4o(phrase, 'GPT-4o', domain, location);
  },
  
  scoreResponse: async (phrase: string, response: string, model: string, domain?: string, location?: string): Promise<{ 
    presence: number; 
    relevance: number; 
    accuracy: number; 
    sentiment: number; 
    overall: number; 
    domainRank?: number; 
    foundDomains?: string[];
    sources: string[];
    competitorUrls: string[];
    competitorMatchScore: number;
    comprehensiveness: number;
    context: string;
    mentions: number;
    highlightContext: string;
    detectionMethod: string;
    domainSentiment: 'positive' | 'neutral' | 'negative';
    aiConfidence: number;
    rankingFactors: {
      position: number;
      prominence: number;
      contextQuality: number;
      mentionType: number;
    };
    competitors: {
      names: string[];
      mentions: Array<{
        name: string;
        domain: string;
        position: number;
        context: string;
        sentiment: 'positive' | 'neutral' | 'negative';
        mentionType: 'url' | 'text' | 'brand';
      }>;
      totalMentions: number;
    };
  }> => {
    return await scoreResponseWithAI(phrase, response, model, domain, location);
  },
  
  // Test function to demonstrate domain detection
  testDomainDetection: async (response: string, domain: string) => {
    const result = await analyzeResponseWithAI(response, domain);
    console.log('Domain Detection Test:', {
      domain,
      response: response.substring(0, 100) + '...',
      result
    });
    return result;
  }
};

// Export the scoreResponseWithAI and analyzeResponseWithAI functions directly
export { scoreResponseWithAI, analyzeResponseWithAI }; 
