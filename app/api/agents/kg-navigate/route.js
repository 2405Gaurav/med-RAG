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
      const entities = await searchKnowledgeGraph(subQuery.query, subQuery.type);
      results.push({
        subQuery: subQuery.query,
        type: subQuery.type,
        entities: entities,
      });
    }

    return Response.json({
      success: true,
      results: results,
    });
  } catch (error) {
    console.error('Knowledge graph navigation error:', error);
    return Response.json(
      { error: 'Failed to navigate knowledge graph', details: error.message },
      { status: 500 }
    );
  }
}

async function searchKnowledgeGraph(query, queryType) {
  try {
    const keywords = extractKeywords(query);
    const entities = [];

    for (const keyword of keywords) {
      const { data: matchedEntities, error } = await supabase
        .from('knowledge_graph_entities')
        .select('*')
        .or(`name.ilike.%${keyword}%,description.ilike.%${keyword}%`)
        .limit(5);

      if (error) {
        console.error('Entity search error:', error);
        continue;
      }

      if (matchedEntities && matchedEntities.length > 0) {
        for (const entity of matchedEntities) {
          const { data: relationships, error: relError } = await supabase
            .from('knowledge_graph_relationships')
            .select(`
              *,
              from_entity:knowledge_graph_entities!knowledge_graph_relationships_from_entity_id_fkey(*),
              to_entity:knowledge_graph_entities!knowledge_graph_relationships_to_entity_id_fkey(*)
            `)
            .or(`from_entity_id.eq.${entity.id},to_entity_id.eq.${entity.id}`)
            .limit(10);

          entities.push({
            entity: entity,
            relationships: relationships || [],
          });
        }
      }
    }

    const uniqueEntities = deduplicateEntities(entities);
    return filterByQueryType(uniqueEntities, queryType);
  } catch (error) {
    console.error('Knowledge graph search error:', error);
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

function deduplicateEntities(entities) {
  const seen = new Set();
  const unique = [];

  for (const item of entities) {
    if (!seen.has(item.entity.id)) {
      seen.add(item.entity.id);
      unique.push(item);
    }
  }

  return unique;
}

function filterByQueryType(entities, queryType) {
  const typeFilters = {
    'symptoms': ['symptom', 'sign'],
    'causes': ['cause', 'risk_factor'],
    'treatment': ['treatment', 'drug', 'therapy'],
    'prevention': ['prevention', 'lifestyle'],
    'diagnosis': ['diagnosis', 'test'],
  };

  if (!queryType || queryType === 'general' || queryType === 'definition') {
    return entities.slice(0, 10);
  }

  const relevantTypes = typeFilters[queryType] || [];

  const filtered = entities.filter(item =>
    relevantTypes.includes(item.entity.entity_type) ||
    item.relationships.some(rel =>
      relevantTypes.some(type => rel.relationship_type.includes(type))
    )
  );

  if (filtered.length > 0) {
    return filtered.slice(0, 10);
  }

  return entities.slice(0, 5);
}
