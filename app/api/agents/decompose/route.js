export async function POST(request) {
  try {
    const { query } = await request.json();

    if (!query || typeof query !== 'string') {
      return Response.json(
        { error: 'Valid query string is required' },
        { status: 400 }
      );
    }

    const subQueries = decomposeQuery(query);

    return Response.json({
      success: true,
      originalQuery: query,
      subQueries: subQueries,
    });
  } catch (error) {
    console.error('Query decomposition error:', error);
    return Response.json(
      { error: 'Failed to decompose query', details: error.message },
      { status: 500 }
    );
  }
}

function decomposeQuery(query) {
  const subQueries = [];
  const lowerQuery = query.toLowerCase();

  const patterns = [
    { keywords: ['what is', 'what are', 'define'], type: 'definition' },
    { keywords: ['symptoms of', 'signs of', 'how do i know'], type: 'symptoms' },
    { keywords: ['causes of', 'why does', 'what causes'], type: 'causes' },
    { keywords: ['treatment for', 'how to treat', 'cure for'], type: 'treatment' },
    { keywords: ['prevent', 'prevention', 'avoid'], type: 'prevention' },
    { keywords: ['diagnosis', 'how to diagnose', 'test for'], type: 'diagnosis' },
    { keywords: ['prognosis', 'outcome', 'recovery'], type: 'prognosis' },
    { keywords: ['risk factors', 'who gets'], type: 'risk_factors' },
  ];

  const detectedTypes = new Set();

  for (const pattern of patterns) {
    for (const keyword of pattern.keywords) {
      if (lowerQuery.includes(keyword)) {
        detectedTypes.add(pattern.type);
        break;
      }
    }
  }

  if (detectedTypes.size === 0) {
    detectedTypes.add('general');
  }

  const conditionMatch = extractMedicalCondition(query);

  if (detectedTypes.has('definition') || detectedTypes.has('general')) {
    subQueries.push({
      query: conditionMatch
        ? `What is ${conditionMatch}?`
        : query,
      type: 'definition',
      priority: 1
    });
  }

  if (detectedTypes.has('symptoms')) {
    subQueries.push({
      query: conditionMatch
        ? `What are the symptoms of ${conditionMatch}?`
        : query,
      type: 'symptoms',
      priority: 2
    });
  }

  if (detectedTypes.has('causes')) {
    subQueries.push({
      query: conditionMatch
        ? `What causes ${conditionMatch}?`
        : query,
      type: 'causes',
      priority: 2
    });
  }

  if (detectedTypes.has('treatment')) {
    subQueries.push({
      query: conditionMatch
        ? `How is ${conditionMatch} treated?`
        : query,
      type: 'treatment',
      priority: 3
    });
  }

  if (detectedTypes.has('prevention')) {
    subQueries.push({
      query: conditionMatch
        ? `How can ${conditionMatch} be prevented?`
        : query,
      type: 'prevention',
      priority: 4
    });
  }

  if (detectedTypes.has('diagnosis')) {
    subQueries.push({
      query: conditionMatch
        ? `How is ${conditionMatch} diagnosed?`
        : query,
      type: 'diagnosis',
      priority: 3
    });
  }

  if (detectedTypes.has('risk_factors')) {
    subQueries.push({
      query: conditionMatch
        ? `What are the risk factors for ${conditionMatch}?`
        : query,
      type: 'risk_factors',
      priority: 2
    });
  }

  if (subQueries.length === 0) {
    subQueries.push({
      query: query,
      type: 'general',
      priority: 1
    });
  }

  return subQueries.sort((a, b) => a.priority - b.priority);
}

function extractMedicalCondition(query) {
  const patterns = [
    /(?:what is|what are|define|about)\s+([a-z\s]+?)(?:\?|$|symptoms|treatment|causes)/i,
    /(?:symptoms of|causes of|treatment for|diagnose|prevent)\s+([a-z\s]+?)(?:\?|$)/i,
    /^([a-z\s]+?)(?:\s+symptoms|\s+treatment|\s+causes)?$/i,
  ];

  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (match && match[1]) {
      const condition = match[1].trim();
      if (condition.length > 2 && condition.length < 50) {
        return condition;
      }
    }
  }

  return null;
}
