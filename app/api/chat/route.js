export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function POST(request) {
  try {
    const { message, sessionId } = await request.json();

    if (!message || typeof message !== 'string') {
      return Response.json({ error: 'Valid message is required' }, { status: 400 });
    }

    let currentSessionId = sessionId;

    if (!currentSessionId) {
      const { data: newSession, error: sessionError } = await supabase
        .from('chat_sessions')
        .insert({})
        .select()
        .single();

      if (sessionError) throw new Error('Failed to create session: ' + sessionError.message);
      currentSessionId = newSession.id;
    }

    const { error: userMsgError } = await supabase
      .from('chat_messages')
      .insert({
        session_id: currentSessionId,
        role: 'user',
        content: message,
      });

    if (userMsgError) throw new Error('Failed to save user message: ' + userMsgError.message);

    const decomposed = await decomposeQuery(message);
    const subQueries = decomposed.subQueries || [];

    const kgResults = await navigateKnowledgeGraph(subQueries);
    const retrievedEntities = kgResults.results || [];

    const docResults = await retrieveDocuments(subQueries);
    const retrievedDocs = docResults.results || [];

    const synthesizedAnswer = await synthesizeAnswer(
      message,
      subQueries,
      retrievedEntities,
      retrievedDocs
    );

    const verifiedAnswer = await verifyAnswer(
      synthesizedAnswer,
      retrievedEntities,
      retrievedDocs
    );

    const { error: assistantMsgError } = await supabase
      .from('chat_messages')
      .insert({
        session_id: currentSessionId,
        role: 'assistant',
        content: verifiedAnswer.answer,
        sub_queries: subQueries,
        retrieved_entities: retrievedEntities,
        retrieved_docs: retrievedDocs,
        citations: verifiedAnswer.citations,
      });

    if (assistantMsgError)
      throw new Error('Failed to save assistant message: ' + assistantMsgError.message);

    return Response.json({
      success: true,
      sessionId: currentSessionId,
      answer: verifiedAnswer.answer,
      citations: verifiedAnswer.citations,
      metadata: {
        subQueries,
        entitiesFound: retrievedEntities.length,
        documentsFound: retrievedDocs.reduce(
          (sum, r) => sum + (r.documents?.length || 0),
          0
        ),
      },
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return Response.json(
      { error: 'Failed to process chat message', details: error.message },
      { status: 500 }
    );
  }
}

async function decomposeQuery(query) {
  try {
    // Use your local Next.js API instead of Supabase URL
    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

    const response = await fetch(`${baseUrl}/api/agents/decompose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) throw new Error('Decomposition failed');
    return await response.json();
  } catch (error) {
    console.error('Decompose error:', error);
    return { subQueries: [{ query, type: 'general', priority: 1 }] };
  }
}


async function navigateKnowledgeGraph(subQueries) {
  try {
    const baseUrl =
      process.env.NODE_ENV === 'production'
        ? process.env.NEXT_PUBLIC_SITE_URL // e.g., https://yourapp.vercel.app
        : 'http://localhost:3000';

    const response = await fetch(`${baseUrl}/api/agents/kg-navigate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subQueries }),
    });

    if (!response.ok) throw new Error('KG navigation failed');
    return await response.json();
  } catch (error) {
    console.error('KG navigate error:', error);
    return { results: [] };
  }
}

async function retrieveDocuments(subQueries) {
  try {
    const baseUrl =
      process.env.NODE_ENV === 'production'
        ? process.env.NEXT_PUBLIC_SITE_URL
        : 'http://localhost:3000';

    const response = await fetch(`${baseUrl}/api/agents/retrieve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subQueries }),
    });

    if (!response.ok) throw new Error('Document retrieval failed');
    return await response.json();
  } catch (error) {
    console.error('Retrieve error:', error);
    return { results: [] };
  }
}


async function 

synthesizeAnswer(originalQuery, subQueries, entities, documents) {
  const sections = [];
  const allEntities = entities.flatMap(e => e.entities || []);
  const allDocuments = documents.flatMap(d => d.documents || []);

  if (allEntities.length > 0) {
    const mainEntity = allEntities[0]?.entity;
    if (mainEntity) {
      sections.push({
        type: 'definition',
        content: `${mainEntity.name}: ${mainEntity.description}`,
        source: mainEntity.source,
      });
    }
  }

  for (const subQuery of subQueries) {
    const relevantDocs = allDocuments.filter(doc => {
      const docContent = doc.content.toLowerCase();
      const queryWords = subQuery.query.toLowerCase().split(' ');
      return queryWords.some(word => word.length > 3 && docContent.includes(word));
    });

    const relevantEntities = allEntities.filter(item => {
      const entityName = item.entity?.name?.toLowerCase() || '';
      const queryWords = subQuery.query.toLowerCase().split(' ');
      return queryWords.some(word => word.length > 3 && entityName.includes(word));
    });

    if (relevantDocs.length > 0 || relevantEntities.length > 0) {
      let sectionContent = '';

      if (relevantEntities.length > 0) {
        sectionContent += relevantEntities
          .slice(0, 3)
          .map(item => item.entity?.description || '')
          .filter(desc => desc.length > 0)
          .join(' ');
      }

      if (relevantDocs.length > 0) {
        sectionContent +=
          ' ' +
          relevantDocs
            .slice(0, 2)
            .map(doc => doc.content.substring(0, 300))
            .join(' ');
      }

      if (sectionContent.trim().length > 0) {
        sections.push({
          type: subQuery.type,
          content: sectionContent.trim(),
          source:
            relevantDocs[0]?.source ||
            relevantEntities[0]?.entity?.source ||
            'Knowledge Base',
        });
      }
    }
  }

  if (sections.length === 0) {
    sections.push({
      type: 'general',
      content:
        'Based on available medical knowledge, I found limited information about your query. Please consult a healthcare professional for accurate medical advice.',
      source: 'System',
    });
  }

  return { sections };
}

async function verifyAnswer(synthesizedAnswer, entities, documents) {
  const sections = synthesizedAnswer.sections || [];
  const citations = [];
  let answer = '';

  const allDocuments = documents.flatMap(d => d.documents || []);
  const allEntities = entities.flatMap(e => e.entities || []);

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const citationId = i + 1;

    const relevantDoc = allDocuments.find(doc =>
      section.content.includes(doc.content.substring(0, 50))
    );

    const relevantEntity = allEntities.find(item =>
      section.content.includes(item.entity?.name || '')
    );

    const citation = {
      id: citationId,
      source:
        relevantDoc?.source ||
        relevantEntity?.entity?.source ||
        section.source ||
        'Medical Knowledge Base',
      title:
        relevantDoc?.title ||
        relevantEntity?.entity?.name ||
        'Medical Reference',
      type: relevantDoc ? 'document' : 'knowledge_graph',
    };

    citations.push(citation);
    answer += `${section.content} [${citationId}]\n\n`;
  }

  answer += '\n**References:**\n';
  for (const citation of citations) {
    answer += `[${citation.id}] ${citation.title} - ${citation.source}\n`;
  }

  answer +=
    '\n*Disclaimer: This information is for educational purposes only. Always consult with a qualified healthcare professional for medical advice, diagnosis, or treatment.*';

  return { answer: answer.trim(), citations, verified: true };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId)
      return Response.json({ error: 'Session ID is required' }, { status: 400 });

    const { data: messages, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) throw new Error('Failed to fetch messages: ' + error.message);

    return Response.json({ success: true, messages: messages || [] });
  } catch (error) {
    console.error('Get messages error:', error);
    return Response.json(
      { error: 'Failed to fetch messages', details: error.message },
      { status: 500 }
    );
  }
}
