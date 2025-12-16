export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function POST(request) {
  try {
    const { subQueries } = await request.json();

    if (!subQueries || !Array.isArray(subQueries)) {
      return Response.json(
        { error: 'Valid subQueries array is required' },
        { status: 400 }
      );
    }

    const results = [];

    for (const subQuery of subQueries) {
      const documents = await retrieveDocuments(subQuery.query, subQuery.type, subQuery.priority);
      results.push({
        subQuery: subQuery.query,
        type: subQuery.type,
        documents: documents,
      });
    }

    return Response.json({
      success: true,
      results: results,
    });
  } catch (error) {
    console.error('Document retrieval error:', error);
    return Response.json(
      { error: 'Failed to retrieve documents', details: error.message },
      { status: 500 }
    );
  }
}

async function retrieveDocuments(query, queryType, priority = 1) {
  try {
    const keywords = extractKeywords(query);
    const medicalTerms = extractMedicalTerms(query);
    const allTerms = [...new Set([...keywords, ...medicalTerms])];
    
    if (allTerms.length === 0) {
      return [];
    }

    const documents = [];

    // Multi-stage retrieval for better coverage
    // Stage 1: Exact phrase matching in title
    const exactPhrase = query.replace(/[?!.,]/g, '').trim();
    if (exactPhrase.length > 0) {
      const { data: exactMatches, error: exactError } = await supabase
        .from('medical_documents')
        .select('*')
        .ilike('title', `%${exactPhrase}%`)
        .limit(2);

      if (!exactError && exactMatches) {
        documents.push(...exactMatches.map(doc => ({ ...doc, matchType: 'exact' })));
      }
    }

    // Stage 2: Keyword-based search
    for (const term of allTerms.slice(0, 5)) { // Limit to top 5 terms
      const { data: matchedDocs, error } = await supabase
        .from('medical_documents')
        .select('*')
        .or(`title.ilike.%${term}%,content.ilike.%${term}%`)
        .limit(3);

      if (error) {
        console.error('Document search error:', error);
        continue;
      }

      if (matchedDocs && matchedDocs.length > 0) {
        documents.push(...matchedDocs.map(doc => ({ 
          ...doc, 
          matchType: 'keyword',
          matchedTerm: term 
        })));
      }
    }

    // Stage 3: Document type specific search
    const preferredTypes = getPreferredDocTypes(queryType);
    if (preferredTypes.length > 0) {
      const { data: typeDocs, error: typeError } = await supabase
        .from('medical_documents')
        .select('*')
        .in('doc_type', preferredTypes)
        .or(allTerms.slice(0, 3).map(t => `content.ilike.%${t}%`).join(','))
        .limit(2);

      if (!typeError && typeDocs) {
        documents.push(...typeDocs.map(doc => ({ ...doc, matchType: 'type' })));
      }
    }

    const uniqueDocs = deduplicateDocuments(documents);
    const rankedDocs = rankDocuments(uniqueDocs, query, queryType, allTerms, priority);

    // Return top 5 with enhanced metadata
    return rankedDocs.slice(0, 5).map(doc => ({
      id: doc.id,
      title: doc.title,
      content: doc.content,
      source: doc.source,
      doc_type: doc.doc_type,
      relevance_score: normalizeScore(doc.score),
      match_type: doc.matchType || 'keyword',
      matched_terms: doc.matchedTerms || [],
      metadata: {
        content_length: doc.content.length,
        created_at: doc.created_at,
        ...doc.metadata
      },
    }));
  } catch (error) {
    console.error('Document retrieval error:', error);
    return [];
  }
}

function extractKeywords(query) {
  const stopWords = new Set([
    'what', 'is', 'are', 'the', 'a', 'an', 'how', 'do', 'does', 'can', 'could',
    'should', 'would', 'will', 'be', 'been', 'being', 'have', 'has', 'had',
    'of', 'for', 'to', 'in', 'on', 'at', 'by', 'with', 'from', 'about',
    'i', 'you', 'we', 'they', 'it', 'this', 'that', 'these', 'those',
    'my', 'your', 'his', 'her', 'their', 'our'
  ]);

  const words = query.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));

  return [...new Set(words)];
}

function extractMedicalTerms(query) {
  // Common medical terms that should be prioritized
  const medicalPatterns = [
    /diabetes|diabetic/gi,
    /hypertension|blood pressure/gi,
    /asthma|respiratory/gi,
    /migraine|headache/gi,
    /symptom|symptoms/gi,
    /treatment|therapy|medication/gi,
    /diagnosis|diagnostic/gi,
    /prevention|preventive/gi,
    /disease|condition|disorder/gi,
    /infection|inflammatory/gi,
    /chronic|acute/gi,
  ];

  const terms = [];
  for (const pattern of medicalPatterns) {
    const matches = query.match(pattern);
    if (matches) {
      terms.push(...matches.map(m => m.toLowerCase()));
    }
  }

  return [...new Set(terms)];
}

function getPreferredDocTypes(queryType) {
  const typeMapping = {
    'definition': ['article', 'guide'],
    'symptoms': ['article', 'abstract'],
    'causes': ['abstract', 'article'],
    'treatment': ['guide', 'abstract'],
    'prevention': ['guide', 'article'],
    'diagnosis': ['guide', 'abstract'],
    'prognosis': ['abstract', 'article'],
    'risk_factors': ['abstract', 'article'],
    'general': ['article', 'guide']
  };

  return typeMapping[queryType] || typeMapping['general'];
}

function deduplicateDocuments(documents) {
  const seen = new Set();
  const unique = [];

  for (const doc of documents) {
    if (!seen.has(doc.id)) {
      seen.add(doc.id);
      unique.push(doc);
    }
  }

  return unique;
}

function rankDocuments(documents, query, queryType, keywords, priority) {
  const queryLower = query.toLowerCase();

  return documents.map(doc => {
    let score = 0;
    const matchedTerms = [];

    const titleLower = doc.title.toLowerCase();
    const contentLower = doc.content.toLowerCase();

    // 1. Match type bonus
    if (doc.matchType === 'exact') {
      score += 25;
    } else if (doc.matchType === 'type') {
      score += 10;
    }

    // 2. Title matching (heavily weighted)
    if (titleLower.includes(queryLower)) {
      score += 20;
      matchedTerms.push('full_query');
    }

    for (const keyword of keywords) {
      if (titleLower.includes(keyword)) {
        score += 15;
        matchedTerms.push(keyword);
      }
    }

    // 3. Content matching with frequency consideration
    for (const keyword of keywords) {
      const regex = new RegExp(keyword, 'gi');
      const contentMatches = (contentLower.match(regex) || []).length;
      
      if (contentMatches > 0) {
        // Logarithmic scaling to avoid over-weighting repeated terms
        score += Math.min(Math.log2(contentMatches + 1) * 5, 15);
        
        if (!matchedTerms.includes(keyword)) {
          matchedTerms.push(keyword);
        }
      }
    }

    // 4. Document type alignment with query type
    const preferredTypes = getPreferredDocTypes(queryType);
    if (preferredTypes.includes(doc.doc_type)) {
      score += 12;
    }

    // 5. Source authority bonus
    const authoritativeSources = [
      'medlineplus', 'pubmed', 'clinical guidelines', 
      'mayo clinic', 'nih', 'cdc', 'who'
    ];
    
    const sourceLower = doc.source.toLowerCase();
    if (authoritativeSources.some(source => sourceLower.includes(source))) {
      score += 10;
    }

    // 6. Content quality indicators
    // Comprehensive content (not too short, not too long)
    if (doc.content.length > 200 && doc.content.length < 2000) {
      score += 8;
    } else if (doc.content.length >= 2000) {
      score += 5;
    }

    // 7. Query priority consideration
    if (priority === 1) {
      score *= 1.1; // Boost primary queries slightly
    }

    // 8. Diversity bonus - prefer different doc types
    if (doc.doc_type === 'abstract') {
      score += 3; // Research abstracts are valuable
    }

    // 9. Penalize if very few matches
    if (matchedTerms.length === 0) {
      score *= 0.5;
    }

    return { 
      ...doc, 
      score: Math.round(score * 100) / 100,
      matchedTerms: [...new Set(matchedTerms)]
    };
  }).sort((a, b) => b.score - a.score);
}

function normalizeScore(score) {
  // Normalize score to 0-1 range for consistency
  // Max realistic score is around 100
  return Math.min(Math.max(score / 100, 0), 1);
}