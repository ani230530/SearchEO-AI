import OpenAI from 'openai';

export interface PhraseAnalysisResult {
  phrase: string;
  primaryKeyword: string;
  relevanceScore: number;
  intent: string;
  searchVolume: number;
  competition: string;
  trend: string;
  wordCount: number;
  searchPattern: string;
  userIntent: string;
  contentType: string;
  analysis: string;
  tokenUsage: number;
}

const PHRASE_ANALYSIS_PROMPT = `
You are an expert SEO analyst and search behavior specialist. Analyze the search phrase "{phrase}" for the domain {domain}.

Domain Context: {domainContext}
Location: Global

Please provide a comprehensive analysis with the following data:

1. **Primary Keyword**: Extract the main keyword from this phrase
2. **Search Intent**: Informational, Commercial, Transactional, or Navigational
3. **Relevance Score**: Score from 0-100 based on how relevant this phrase is to the domain
4. **Search Volume**: Estimate monthly search volume (realistic numbers)
5. **Competition Level**: Low, Medium, or High
6. **Trend**: Rising, Stable, or Declining
7. **Word Count**: Number of words in the phrase
8. **Search Pattern**: Type of search pattern (question, comparison, local, etc.)
9. **User Intent**: What the user is trying to accomplish
10. **Content Type**: What type of content would best answer this search

Consider the following factors:
- Phrase length and specificity
- User search behavior patterns
- Commercial intent and monetization potential
- Location-specific factors if applicable
- Domain relevance and content alignment
- Search engine optimization potential

Return ONLY a JSON object with this exact structure:
{
  "phrase": "exact phrase as provided",
  "primaryKeyword": "main keyword extracted",
  "relevanceScore": 85,
  "intent": "Informational",
  "searchVolume": 1200,
  "competition": "Medium",
  "trend": "Stable",
  "wordCount": 8,
  "searchPattern": "question",
  "userIntent": "User wants to learn about the topic",
  "contentType": "how-to guide",
  "analysis": "Brief analysis of phrase potential and strategy"
}
`;

// Initialize OpenAI once at module level
let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not set');
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

export async function analyzePhraseWithAI(
  phrase: string,
  domainUrl: string,
  domainContext: string = ''
): Promise<PhraseAnalysisResult> {
  try {
    const openai = getOpenAIClient();

    const prompt = PHRASE_ANALYSIS_PROMPT
      .replace('{phrase}', phrase)
      .replace('{domain}', domainUrl)
      .replace('{domainContext}', domainContext || 'No specific context provided');

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 1000
    });

    const response = completion.choices[0]?.message?.content;
    if (!response) {
      throw new Error('No response from AI analysis');
    }

    // Clean markdown formatting
    let cleanResponse = response.trim();
    if (cleanResponse.startsWith('```json')) {
      cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanResponse.startsWith('```')) {
      cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const parsedResult = JSON.parse(cleanResponse);

    // Validate and normalize fields
    return {
      phrase: parsedResult.phrase || phrase,
      primaryKeyword: parsedResult.primaryKeyword || phrase.split(' ')[0],
      relevanceScore: parsedResult.relevanceScore || 75,
      intent: parsedResult.intent || 'Informational',
      searchVolume: parsedResult.searchVolume || 500,
      competition: parsedResult.competition || 'Medium',
      trend: parsedResult.trend || 'Stable',
      wordCount: parsedResult.wordCount || phrase.trim().split(/\s+/).length,
      searchPattern: parsedResult.searchPattern || 'general',
      userIntent: parsedResult.userIntent || 'User is searching for information',
      contentType: parsedResult.contentType || 'general content',
      analysis: parsedResult.analysis || 'AI analysis completed successfully',
      tokenUsage: completion.usage?.total_tokens || 0
    };
  } catch (error) {
    console.error('AI phrase analysis failed:', error);
    // Fallback to basic analysis
    return {
      phrase,
      primaryKeyword: phrase.split(' ')[0],
      relevanceScore: 75,
      intent: 'Informational',
      searchVolume: 500,
      competition: 'Medium',
      trend: 'Stable',
      wordCount: phrase.trim().split(/\s+/).length,
      searchPattern: 'general',
      userIntent: 'User is searching for information',
      contentType: 'general content',
      analysis: 'Basic analysis (AI analysis failed)',
      tokenUsage: 0
    };
  }
}
