import axios from 'axios';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AIContentScore {
  /** Overall classification: HUMAN_ONLY, MIXED, AI_ONLY */
  classification: 'HUMAN_ONLY' | 'MIXED' | 'AI_ONLY';
  /** Probability that the text is entirely AI-generated (0-1) */
  aiProbability: number;
  /** Probability that the text is entirely human-written (0-1) */
  humanProbability: number;
  /** Confidence in the classification */
  confidence: 'high' | 'medium' | 'low';
  /** Burstiness score (higher = more human-like sentence variety) */
  burstiness: number;
  /** Perplexity estimate (higher = more human-like vocabulary variety) */
  perplexityEstimate: number;
  /** Per-sentence analysis (only from GPTZero) */
  sentences?: Array<{
    sentence: string;
    isAI: boolean;
    probability: number;
  }>;
  /** Which detection method was used */
  method: 'gptzero' | 'heuristic';
}

// ── GPTZero API integration ──────────────────────────────────────────────────

const GPTZERO_API_KEY = process.env.GPTZERO_API_KEY;

async function detectWithGPTZero(text: string): Promise<AIContentScore> {
  if (!GPTZERO_API_KEY) {
    throw new Error('GPTZERO_API_KEY not set');
  }

  const response = await axios.post(
    'https://api.gptzero.me/v2/predict/text',
    {
      document: text,
      version: '2025-01-01',
    },
    {
      headers: {
        'x-api-key': GPTZERO_API_KEY,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    }
  );

  const doc = response.data?.documents?.[0];
  if (!doc) throw new Error('No document analysis returned from GPTZero');

  const aiProb = doc.completely_generated_prob ?? doc.class_probabilities?.ai ?? 0;
  const humanProb = doc.class_probabilities?.human ?? 1 - aiProb;
  const classification = doc.predicted_class || (
    aiProb > 0.7 ? 'AI_ONLY' : aiProb > 0.3 ? 'MIXED' : 'HUMAN_ONLY'
  );

  // Extract per-sentence analysis
  const sentences = (doc.sentences || []).map((s: any) => ({
    sentence: s.sentence || '',
    isAI: s.generated_prob > 0.5,
    probability: s.generated_prob || 0,
  }));

  return {
    classification: classification.toUpperCase().replace(' ', '_') as AIContentScore['classification'],
    aiProbability: Math.round(aiProb * 100) / 100,
    humanProbability: Math.round(humanProb * 100) / 100,
    confidence: doc.confidence_category || (aiProb > 0.8 || aiProb < 0.2 ? 'high' : aiProb > 0.6 || aiProb < 0.4 ? 'medium' : 'low'),
    burstiness: doc.burstiness ?? 0,
    perplexityEstimate: doc.overall_burstiness ?? 0,
    sentences,
    method: 'gptzero',
  };
}

// ── Heuristic fallback (free, no API needed) ─────────────────────────────────

function detectWithHeuristics(text: string): AIContentScore {
  if (!text || text.length < 100) {
    return {
      classification: 'HUMAN_ONLY',
      aiProbability: 0,
      humanProbability: 1,
      confidence: 'low',
      burstiness: 0,
      perplexityEstimate: 0,
      method: 'heuristic',
    };
  }

  // 1. Burstiness: standard deviation of sentence lengths / mean
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const wordCounts = sentences.map(s => s.trim().split(/\s+/).length);
  const mean = wordCounts.reduce((a, b) => a + b, 0) / Math.max(wordCounts.length, 1);
  const variance = wordCounts.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(wordCounts.length, 1);
  const burstiness = mean > 0 ? Math.sqrt(variance) / mean : 0;

  // 2. Vocabulary richness (type-token ratio) as perplexity proxy
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const uniqueRatio = words.length > 0 ? new Set(words).size / words.length : 0;

  // 3. Repetitive phrase detection (AI tends to repeat patterns)
  const trigrams = new Map<string, number>();
  for (let i = 0; i < words.length - 2; i++) {
    const trigram = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
    trigrams.set(trigram, (trigrams.get(trigram) || 0) + 1);
  }
  const repeatedTrigrams = Array.from(trigrams.values()).filter(count => count > 2).length;
  const trigramRepetitionRate = trigrams.size > 0 ? repeatedTrigrams / trigrams.size : 0;

  // 4. Sentence starter diversity
  const starters = sentences.map(s => s.trim().split(/\s+/)[0]?.toLowerCase()).filter(Boolean);
  const uniqueStarters = new Set(starters).size;
  const starterDiversity = starters.length > 0 ? uniqueStarters / starters.length : 1;

  // 5. Scoring: combine signals
  // AI text: low burstiness (<0.4), high uniqueRatio (>0.5 but very uniform), high trigram repetition, low starter diversity
  let aiScore = 0;
  if (burstiness < 0.3) aiScore += 0.25;
  else if (burstiness < 0.5) aiScore += 0.10;
  if (trigramRepetitionRate > 0.05) aiScore += 0.20;
  else if (trigramRepetitionRate > 0.02) aiScore += 0.10;
  if (starterDiversity < 0.4) aiScore += 0.20;
  else if (starterDiversity < 0.6) aiScore += 0.10;
  // Very uniform sentence lengths = AI
  const cvSentenceLength = mean > 0 ? Math.sqrt(variance) / mean : 0;
  if (cvSentenceLength < 0.3) aiScore += 0.15;

  const aiProbability = Math.min(1, Math.max(0, aiScore));
  const classification = aiProbability > 0.5 ? 'AI_ONLY' : aiProbability > 0.25 ? 'MIXED' : 'HUMAN_ONLY';

  return {
    classification,
    aiProbability: Math.round(aiProbability * 100) / 100,
    humanProbability: Math.round((1 - aiProbability) * 100) / 100,
    confidence: 'low', // Heuristic is always low confidence
    burstiness: Math.round(burstiness * 100) / 100,
    perplexityEstimate: Math.round(uniqueRatio * 100),
    method: 'heuristic',
  };
}

// ── Exported service ─────────────────────────────────────────────────────────

export const aiContentDetectionService = {
  /**
   * Detect whether text is AI-generated.
   * Uses GPTZero API if key is available, otherwise falls back to heuristic analysis.
   */
  detect: async (text: string): Promise<AIContentScore> => {
    // Trim to reasonable length (GPTZero has limits, and very long text is slow)
    const trimmedText = text.slice(0, 25000);

    if (GPTZERO_API_KEY) {
      try {
        return await detectWithGPTZero(trimmedText);
      } catch (error) {
        console.warn('[AIContentDetection] GPTZero failed, using heuristic fallback:', error);
        return detectWithHeuristics(trimmedText);
      }
    }

    return detectWithHeuristics(trimmedText);
  },

  /**
   * Analyze multiple pages from a website for AI content.
   * Returns per-page scores and an aggregate.
   */
  analyzeWebsite: async (pages: Array<{ url: string; text: string }>): Promise<{
    pages: Array<{ url: string; score: AIContentScore }>;
    aggregate: {
      avgAiProbability: number;
      classification: AIContentScore['classification'];
      pagesAnalyzed: number;
      aiPageCount: number;
      humanPageCount: number;
      mixedPageCount: number;
    };
  }> => {
    const results: Array<{ url: string; score: AIContentScore }> = [];

    for (const page of pages.slice(0, 10)) { // Max 10 pages
      if (page.text.length < 200) continue; // Skip thin content

      const score = await aiContentDetectionService.detect(page.text);
      results.push({ url: page.url, score });

      // Small delay between GPTZero calls to respect rate limits
      if (GPTZERO_API_KEY && pages.indexOf(page) < pages.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Aggregate
    const aiProbs = results.map(r => r.score.aiProbability);
    const avgAiProbability = aiProbs.length > 0
      ? Math.round((aiProbs.reduce((a, b) => a + b, 0) / aiProbs.length) * 100) / 100
      : 0;

    const aiPageCount = results.filter(r => r.score.classification === 'AI_ONLY').length;
    const humanPageCount = results.filter(r => r.score.classification === 'HUMAN_ONLY').length;
    const mixedPageCount = results.filter(r => r.score.classification === 'MIXED').length;

    const classification = avgAiProbability > 0.5 ? 'AI_ONLY' : avgAiProbability > 0.25 ? 'MIXED' : 'HUMAN_ONLY';

    return {
      pages: results,
      aggregate: {
        avgAiProbability,
        classification,
        pagesAnalyzed: results.length,
        aiPageCount,
        humanPageCount,
        mixedPageCount,
      },
    };
  },
};
