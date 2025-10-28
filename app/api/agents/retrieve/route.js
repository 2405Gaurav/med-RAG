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
      const documents = await retrieveDocuments(subQuery.query, subQuery.type);
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

async function retrieveDocuments(query, queryType) {
  try {
    const keywords = extractKeywords(query);
    const documents = [];

    for (const keyword of keywords) {
      const { data: matchedDocs, error } = await supabase
        .from('medical_documents')
        .select('*')
        .or(`title.ilike.%${keyword}%,content.ilike.%${keyword}%`)
        .limit(3);

      if (error) {
        console.error('Document search error:', error);
        continue;
      }

      if (matchedDocs && matchedDocs.length > 0) {
        documents.push(...matchedDocs);
      }
    }

    const uniqueDocs = deduplicateDocuments(documents);
    const rankedDocs = rankDocuments(uniqueDocs, query, queryType);

    return rankedDocs.slice(0, 5).map(doc => ({
      id: doc.id,
      title: doc.title,
      content: doc.content,
      source: doc.source,
      doc_type: doc.doc_type,
      relevance_score: doc.score || 0.5,
      metadata: doc.metadata || {},
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
    'i', 'you', 'we', 'they', 'it', 'this', 'that', 'these', 'those'
  ]);

  const words = query.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));

  return [...new Set(words)];
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

function rankDocuments(documents, query, queryType) {
  const queryLower = query.toLowerCase();
  const keywords = extractKeywords(query);

  return documents.map(doc => {
    let score = 0;

    const titleLower = doc.title.toLowerCase();
    const contentLower = doc.content.toLowerCase();

    for (const keyword of keywords) {
      if (titleLower.includes(keyword)) {
        score += 3;
      }
      if (contentLower.includes(keyword)) {
        score += 1;
      }
    }

    if (titleLower.includes(queryLower)) {
      score += 5;
    }

    const typeBonus = {
      'definition': ['article', 'guide'],
      'symptoms': ['abstract', 'article'],
      'causes': ['abstract', 'research'],
      'treatment': ['guide', 'article', 'clinical'],
      'prevention': ['guide', 'article'],
      'diagnosis': ['clinical', 'guide'],
    };

    if (queryType && typeBonus[queryType]) {
      if (typeBonus[queryType].includes(doc.doc_type)) {
        score += 2;
      }
    }

    return { ...doc, score };
  }).sort((a, b) => b.score - a.score);
}
