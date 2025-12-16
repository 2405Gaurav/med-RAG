export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client with validation
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Configuration constants
const CONFIG = {
  MAX_MESSAGE_LENGTH: 5000,
  MIN_MESSAGE_LENGTH: 1,
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
  REQUEST_TIMEOUT: 30000,
  MAX_SUB_QUERIES: 10,
  MAX_ENTITIES: 50,
  MAX_DOCUMENTS: 20,
};

export async function POST(request) {
  const startTime = Date.now();
  
  try {
    // Input validation and sanitization
    const body = await parseRequestBody(request);
    const { message, sessionId } = body;

    // Validate message
    const validationError = validateMessage(message);
    if (validationError) {
      return Response.json({ error: validationError }, { status: 400 });
    }

    // Sanitize input
    const sanitizedMessage = sanitizeInput(message);

    // Handle session management with error recovery
    let currentSessionId = sessionId;
    if (!currentSessionId) {
      currentSessionId = await createSessionWithRetry();
      if (!currentSessionId) {
        throw new Error('Failed to create session after multiple attempts');
      }
    } else {
      // Verify session exists
      const sessionValid = await verifySession(currentSessionId);
      if (!sessionValid) {
        return Response.json(
          { error: 'Invalid session ID', code: 'INVALID_SESSION' },
          { status: 404 }
        );
      }
    }

    // Save user message with retry logic
    const userMessageSaved = await saveUserMessage(
      currentSessionId,
      sanitizedMessage
    );
    if (!userMessageSaved) {
      throw new Error('Failed to save user message');
    }

    // Query decomposition with fallback
    const decomposed = await decomposeQueryWithFallback(sanitizedMessage);
    const subQueries = validateAndLimitSubQueries(decomposed.subQueries || []);

    // Parallel retrieval with timeout protection
    const [kgResults, docResults] = await Promise.allSettled([
      withTimeout(
        navigateKnowledgeGraph(subQueries),
        CONFIG.REQUEST_TIMEOUT,
        'KG navigation'
      ),
      withTimeout(
        retrieveDocuments(subQueries),
        CONFIG.REQUEST_TIMEOUT,
        'Document retrieval'
      ),
    ]);

    // Handle retrieval results with fallbacks
    const retrievedEntities = extractResultValue(kgResults, 'results', []);
    const retrievedDocs = extractResultValue(docResults, 'results', []);

    // Validate and limit retrieved data
    const limitedEntities = limitEntities(retrievedEntities);
    const limitedDocs = limitDocuments(retrievedDocs);

    // Check if we have any data to synthesize
    if (limitedEntities.length === 0 && limitedDocs.length === 0) {
      return handleNoDataFound(
        currentSessionId,
        sanitizedMessage,
        subQueries,
        startTime
      );
    }

    // Synthesize answer with error handling
    const synthesizedAnswer = await synthesizeAnswerSafe(
      sanitizedMessage,
      subQueries,
      limitedEntities,
      limitedDocs
    );

    // Verify and enhance answer
    const verifiedAnswer = await verifyAnswerSafe(
      synthesizedAnswer,
      limitedEntities,
      limitedDocs
    );

    // Save assistant response with retry
    const assistantMessageSaved = await saveAssistantMessage(
      currentSessionId,
      verifiedAnswer,
      subQueries,
      limitedEntities,
      limitedDocs
    );

    if (!assistantMessageSaved) {
      console.error('Failed to save assistant message to database');
      // Continue anyway since we have the answer
    }

    const processingTime = Date.now() - startTime;

    return Response.json({
      success: true,
      sessionId: currentSessionId,
      answer: verifiedAnswer.answer,
      citations: verifiedAnswer.citations || [],
      metadata: {
        subQueries: subQueries.map(sq => sq.query),
        entitiesFound: limitedEntities.length,
        documentsFound: limitedDocs.reduce(
          (sum, r) => sum + (r.documents?.length || 0),
          0
        ),
        processingTime,
        dataQuality: assessDataQuality(limitedEntities, limitedDocs),
      },
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return handleError(error);
  }
}

// ============ Input Validation & Sanitization ============

async function parseRequestBody(request) {
  try {
    const body = await request.json();
    return body;
  } catch (error) {
    throw new Error('Invalid JSON in request body');
  }
}

function validateMessage(message) {
  if (!message) {
    return 'Message is required';
  }

  if (typeof message !== 'string') {
    return 'Message must be a string';
  }

  const trimmed = message.trim();

  if (trimmed.length < CONFIG.MIN_MESSAGE_LENGTH) {
    return 'Message is too short';
  }

  if (trimmed.length > CONFIG.MAX_MESSAGE_LENGTH) {
    return `Message exceeds maximum length of ${CONFIG.MAX_MESSAGE_LENGTH} characters`;
  }

  // Check for suspicious patterns
  if (containsSuspiciousPatterns(trimmed)) {
    return 'Message contains invalid content';
  }

  return null;
}

function sanitizeInput(input) {
  return input
    .trim()
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .substring(0, CONFIG.MAX_MESSAGE_LENGTH);
}

function containsSuspiciousPatterns(text) {
  const suspiciousPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /eval\(/i,
  ];

  return suspiciousPatterns.some(pattern => pattern.test(text));
}

// ============ Session Management ============

async function createSessionWithRetry(retries = CONFIG.MAX_RETRIES) {
  for (let i = 0; i < retries; i++) {
    try {
      const { data: newSession, error } = await supabase
        .from('chat_sessions')
        .insert({})
        .select()
        .single();

      if (error) throw error;
      return newSession.id;
    } catch (error) {
      console.error(`Session creation attempt ${i + 1} failed:`, error);
      if (i < retries - 1) {
        await sleep(CONFIG.RETRY_DELAY * (i + 1));
      }
    }
  }
  return null;
}

async function verifySession(sessionId) {
  try {
    const { data, error } = await supabase
      .from('chat_sessions')
      .select('id')
      .eq('id', sessionId)
      .single();

    return !error && data;
  } catch (error) {
    console.error('Session verification error:', error);
    return false;
  }
}

async function saveUserMessage(sessionId, message, retries = CONFIG.MAX_RETRIES) {
  for (let i = 0; i < retries; i++) {
    try {
      const { error } = await supabase.from('chat_messages').insert({
        session_id: sessionId,
        role: 'user',
        content: message,
      });

      if (error) throw error;
      return true;
    } catch (error) {
      console.error(`Save user message attempt ${i + 1} failed:`, error);
      if (i < retries - 1) {
        await sleep(CONFIG.RETRY_DELAY);
      }
    }
  }
  return false;
}

async function saveAssistantMessage(
  sessionId,
  verifiedAnswer,
  subQueries,
  entities,
  docs,
  retries = CONFIG.MAX_RETRIES
) {
  for (let i = 0; i < retries; i++) {
    try {
      const { error } = await supabase.from('chat_messages').insert({
        session_id: sessionId,
        role: 'assistant',
        content: verifiedAnswer.answer,
        sub_queries: subQueries,
        retrieved_entities: entities,
        retrieved_docs: docs,
        citations: verifiedAnswer.citations || [],
      });

      if (error) throw error;
      return true;
    } catch (error) {
      console.error(`Save assistant message attempt ${i + 1} failed:`, error);
      if (i < retries - 1) {
        await sleep(CONFIG.RETRY_DELAY);
      }
    }
  }
  return false;
}

// ============ Agent Orchestration ============

async function decomposeQueryWithFallback(query) {
  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

    const response = await fetch(`${baseUrl}/api/agents/decompose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Decompose failed with status ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Decompose error:', error);
    // Fallback: create a simple general query
    return {
      subQueries: [
        { query, type: 'general', priority: 1 },
        { query: `What is ${query}?`, type: 'definition', priority: 2 },
      ],
    };
  }
}

async function navigateKnowledgeGraph(subQueries) {
  if (!subQueries || subQueries.length === 0) {
    return { results: [] };
  }

  try {
    const baseUrl =
      process.env.NODE_ENV === 'production'
        ? process.env.NEXT_PUBLIC_SITE_URL
        : 'http://localhost:3000';

    const response = await fetch(`${baseUrl}/api/agents/kg-navigate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subQueries }),
    });

    if (!response.ok) {
      throw new Error(`KG navigation failed with status ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('KG navigate error:', error);
    return { results: [] };
  }
}

async function retrieveDocuments(subQueries) {
  if (!subQueries || subQueries.length === 0) {
    return { results: [] };
  }

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

    if (!response.ok) {
      throw new Error(`Document retrieval failed with status ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Retrieve error:', error);
    return { results: [] };
  }
}

// ============ Answer Synthesis ============

async function synthesizeAnswerSafe(query, subQueries, entities, documents) {
  try {
    return await synthesizeAnswer(query, subQueries, entities, documents);
  } catch (error) {
    console.error('Synthesis error:', error);
    // Fallback synthesis
    return {
      sections: [
        {
          type: 'general',
          content:
            'I encountered an issue processing your query. Please try rephrasing your question or contact support if the issue persists.',
          source: 'System',
        },
      ],
    };
  }
}

async function synthesizeAnswer(originalQuery, subQueries, entities, documents) {
  const sections = [];
  const allEntities = entities.flatMap(e => e.entities || []);
  const allDocuments = documents.flatMap(d => d.documents || []);

  // Edge case: No data available
  if (allEntities.length === 0 && allDocuments.length === 0) {
    sections.push({
      type: 'general',
      content: `I couldn't find specific information about "${originalQuery}" in the medical database. This might be a specialized topic or a very recent development. Please consult a healthcare professional for accurate information.`,
      source: 'System',
    });
    return { sections };
  }

  // Primary entity definition (if available)
  if (allEntities.length > 0) {
    const mainEntity = allEntities[0]?.entity;
    if (mainEntity && mainEntity.name && mainEntity.description) {
      sections.push({
        type: 'definition',
        content: `${mainEntity.name}: ${mainEntity.description}`,
        source: mainEntity.source || 'Knowledge Graph',
      });
    }
  }

  // Process each sub-query
  for (const subQuery of subQueries) {
    const relevantDocs = findRelevantDocuments(allDocuments, subQuery.query);
    const relevantEntities = findRelevantEntities(allEntities, subQuery.query);

    if (relevantDocs.length === 0 && relevantEntities.length === 0) {
      continue; // Skip if no relevant data
    }

    let sectionContent = buildSectionContent(
      relevantEntities,
      relevantDocs,
      subQuery.type
    );

    if (sectionContent.trim().length > 0) {
      sections.push({
        type: subQuery.type,
        content: sectionContent.trim(),
        source:
          relevantDocs[0]?.source ||
          relevantEntities[0]?.entity?.source ||
          'Medical Knowledge Base',
      });
    }
  }

  // Fallback if no sections were created
  if (sections.length === 0) {
    sections.push({
      type: 'general',
      content:
        'Based on available information, I found limited details about your query. For accurate medical guidance, please consult a qualified healthcare professional.',
      source: 'System',
    });
  }

  return { sections };
}

function findRelevantDocuments(documents, query) {
  const queryWords = query.toLowerCase().split(' ');
  const significantWords = queryWords.filter(word => word.length > 3);

  return documents.filter(doc => {
    const docContent = (doc.content || '').toLowerCase();
    const docTitle = (doc.title || '').toLowerCase();

    return significantWords.some(
      word => docContent.includes(word) || docTitle.includes(word)
    );
  });
}

function findRelevantEntities(entities, query) {
  const queryWords = query.toLowerCase().split(' ');
  const significantWords = queryWords.filter(word => word.length > 3);

  return entities.filter(item => {
    const entityName = (item.entity?.name || '').toLowerCase();
    const entityDesc = (item.entity?.description || '').toLowerCase();

    return significantWords.some(
      word => entityName.includes(word) || entityDesc.includes(word)
    );
  });
}

function buildSectionContent(entities, documents, queryType) {
  let content = '';

  // Add entity information
  if (entities.length > 0) {
    const descriptions = entities
      .slice(0, 3)
      .map(item => item.entity?.description || '')
      .filter(desc => desc.length > 0);

    content += descriptions.join(' ');
  }

  // Add document excerpts
  if (documents.length > 0) {
    const excerpts = documents
      .slice(0, 2)
      .map(doc => {
        const docContent = doc.content || '';
        return docContent.substring(0, 400);
      })
      .filter(excerpt => excerpt.length > 0);

    if (content.length > 0 && excerpts.length > 0) {
      content += ' ';
    }
    content += excerpts.join(' ');
  }

  return content;
}

async function verifyAnswerSafe(synthesizedAnswer, entities, documents) {
  try {
    return await verifyAnswer(synthesizedAnswer, entities, documents);
  } catch (error) {
    console.error('Verification error:', error);
    // Fallback verification
    return {
      answer:
        'An error occurred while verifying the answer. Please try again or contact support.',
      citations: [],
      verified: false,
    };
  }
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

    const citation = buildCitation(
      citationId,
      section,
      allDocuments,
      allEntities
    );

    citations.push(citation);
    answer += `${section.content} [${citationId}]\n\n`;
  }

  // Add references section
  if (citations.length > 0) {
    answer += '\n**References:**\n';
    for (const citation of citations) {
      answer += `[${citation.id}] ${citation.title} - ${citation.source}\n`;
    }
  }

  // Add disclaimer
  answer +=
    '\n\n*Disclaimer: This information is for educational purposes only. Always consult with a qualified healthcare professional for medical advice, diagnosis, or treatment.*';

  return {
    answer: answer.trim(),
    citations,
    verified: citations.length > 0,
  };
}

function buildCitation(citationId, section, documents, entities) {
  // Try to find matching document
  const relevantDoc = documents.find(doc =>
    section.content.includes((doc.content || '').substring(0, 50))
  );

  // Try to find matching entity
  const relevantEntity = entities.find(item =>
    section.content.includes(item.entity?.name || '')
  );

  return {
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
}

// ============ Utility Functions ============

function validateAndLimitSubQueries(subQueries) {
  if (!Array.isArray(subQueries)) {
    return [{ query: 'general inquiry', type: 'general', priority: 1 }];
  }

  return subQueries
    .filter(sq => sq && typeof sq.query === 'string' && sq.query.trim())
    .slice(0, CONFIG.MAX_SUB_QUERIES);
}

function limitEntities(entities) {
  if (!Array.isArray(entities)) return [];
  return entities.slice(0, CONFIG.MAX_ENTITIES);
}

function limitDocuments(documents) {
  if (!Array.isArray(documents)) return [];
  return documents.slice(0, CONFIG.MAX_DOCUMENTS);
}

function extractResultValue(promiseResult, key, defaultValue) {
  if (promiseResult.status === 'fulfilled' && promiseResult.value) {
    return promiseResult.value[key] || defaultValue;
  }
  return defaultValue;
}

function assessDataQuality(entities, documents) {
  const entityCount = entities.length;
  const docCount = documents.reduce(
    (sum, r) => sum + (r.documents?.length || 0),
    0
  );

  if (entityCount === 0 && docCount === 0) return 'none';
  if (entityCount < 3 && docCount < 2) return 'low';
  if (entityCount < 10 && docCount < 5) return 'medium';
  return 'high';
}

async function withTimeout(promise, ms, operationName) {
  const timeout = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error(`${operationName} timeout after ${ms}ms`)),
      ms
    )
  );

  return Promise.race([promise, timeout]);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function handleNoDataFound(sessionId, message, subQueries, startTime) {
  const fallbackAnswer = {
    answer: `I couldn't find specific information about "${message}" in the medical knowledge base. This could be because:

1. The topic is highly specialized or emerging
2. Different terminology might be used in medical literature
3. The information may not be available in the current database

**Recommendations:**
- Try rephrasing your question with different medical terms
- Consult a healthcare professional for personalized advice
- Check authoritative medical sources like PubMed or MedlinePlus

*Disclaimer: This information is for educational purposes only. Always consult with a qualified healthcare professional for medical advice, diagnosis, or treatment.*`,
    citations: [],
    verified: false,
  };

  await saveAssistantMessage(sessionId, fallbackAnswer, subQueries, [], []);

  return Response.json({
    success: true,
    sessionId,
    answer: fallbackAnswer.answer,
    citations: [],
    metadata: {
      subQueries: subQueries.map(sq => sq.query),
      entitiesFound: 0,
      documentsFound: 0,
      processingTime: Date.now() - startTime,
      dataQuality: 'none',
    },
  });
}

function handleError(error) {
  const errorMessage = error.message || 'Unknown error occurred';
  const errorType = classifyError(error);

  const statusCode = getStatusCode(errorType);

  console.error(`Error [${errorType}]:`, errorMessage);

  return Response.json(
    {
      error: 'Failed to process chat message',
      code: errorType,
      details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      message: getUserFriendlyMessage(errorType),
    },
    { status: statusCode }
  );
}

function classifyError(error) {
  const message = error.message?.toLowerCase() || '';

  if (message.includes('timeout')) return 'TIMEOUT';
  if (message.includes('network')) return 'NETWORK';
  if (message.includes('session')) return 'SESSION';
  if (message.includes('database')) return 'DATABASE';
  if (message.includes('invalid')) return 'VALIDATION';

  return 'INTERNAL';
}

function getStatusCode(errorType) {
  const statusMap = {
    TIMEOUT: 504,
    NETWORK: 503,
    SESSION: 404,
    DATABASE: 503,
    VALIDATION: 400,
    INTERNAL: 500,
  };

  return statusMap[errorType] || 500;
}

function getUserFriendlyMessage(errorType) {
  const messages = {
    TIMEOUT:
      'The request took too long to process. Please try again with a simpler query.',
    NETWORK:
      'Unable to connect to the service. Please check your connection and try again.',
    SESSION: 'Your session has expired or is invalid. Please start a new conversation.',
    DATABASE:
      'Database service is temporarily unavailable. Please try again in a moment.',
    VALIDATION: 'Invalid input provided. Please check your message and try again.',
    INTERNAL:
      'An unexpected error occurred. Please try again or contact support if the issue persists.',
  };

  return messages[errorType] || messages.INTERNAL;
}

// ============ GET Handler for Message History ============

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return Response.json(
        { error: 'Session ID is required' },
        { status: 400 }
      );
    }

    // Verify session exists
    const sessionValid = await verifySession(sessionId);
    if (!sessionValid) {
      return Response.json(
        { error: 'Session not found', code: 'INVALID_SESSION' },
        { status: 404 }
      );
    }

    const { data: messages, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error('Failed to fetch messages: ' + error.message);
    }

    return Response.json({
      success: true,
      sessionId,
      messages: messages || [],
      count: messages?.length || 0,
    });
  } catch (error) {
    console.error('Get messages error:', error);
    return handleError(error);
  }
}