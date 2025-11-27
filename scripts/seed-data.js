const { createClient } = require('@supabase/supabase-js');



const sampleEntities = [
  {
    entity_type: 'disease',
    name: 'Type 2 Diabetes',
    description: 'A chronic metabolic disorder characterized by high blood sugar levels due to insulin resistance and relative insulin deficiency.',
    source: 'MedlinePlus',
  },
  {
    entity_type: 'symptom',
    name: 'Increased thirst',
    description: 'Excessive thirst and fluid intake, often a symptom of diabetes.',
    source: 'Medical Knowledge Base',
  },
  {
    entity_type: 'symptom',
    name: 'Frequent urination',
    description: 'Urinating more often than usual, particularly at night.',
    source: 'Medical Knowledge Base',
  },
  {
    entity_type: 'symptom',
    name: 'Fatigue',
    description: 'Persistent tiredness and lack of energy.',
    source: 'Medical Knowledge Base',
  },
  {
    entity_type: 'treatment',
    name: 'Metformin',
    description: 'A first-line medication for type 2 diabetes that helps control blood sugar levels.',
    source: 'PubMed',
  },
  {
    entity_type: 'treatment',
    name: 'Lifestyle modification',
    description: 'Changes to diet and exercise patterns to manage diabetes.',
    source: 'Clinical Guidelines',
  },
  {
    entity_type: 'disease',
    name: 'Hypertension',
    description: 'High blood pressure, a condition where the force of blood against artery walls is consistently too high.',
    source: 'MedlinePlus',
  },
  {
    entity_type: 'symptom',
    name: 'Headache',
    description: 'Pain in any region of the head, can be a symptom of various conditions.',
    source: 'Medical Knowledge Base',
  },
  {
    entity_type: 'treatment',
    name: 'ACE inhibitors',
    description: 'Medications that help relax blood vessels and lower blood pressure.',
    source: 'PubMed',
  },
  {
    entity_type: 'disease',
    name: 'Asthma',
    description: 'A chronic respiratory condition causing inflammation and narrowing of the airways.',
    source: 'MedlinePlus',
  },
  {
    entity_type: 'symptom',
    name: 'Wheezing',
    description: 'A whistling sound when breathing, often associated with asthma.',
    source: 'Medical Knowledge Base',
  },
  {
    entity_type: 'symptom',
    name: 'Shortness of breath',
    description: 'Difficulty breathing or feeling like you cannot get enough air.',
    source: 'Medical Knowledge Base',
  },
  {
    entity_type: 'treatment',
    name: 'Inhaled corticosteroids',
    description: 'Anti-inflammatory medications delivered directly to the lungs to control asthma.',
    source: 'Clinical Guidelines',
  },
  {
    entity_type: 'disease',
    name: 'Migraine',
    description: 'A neurological condition characterized by intense, debilitating headaches often accompanied by nausea and sensitivity to light.',
    source: 'MedlinePlus',
  },
  {
    entity_type: 'symptom',
    name: 'Nausea',
    description: 'A feeling of sickness with an inclination to vomit.',
    source: 'Medical Knowledge Base',
  },
  {
    entity_type: 'treatment',
    name: 'Triptans',
    description: 'Medications specifically designed to treat migraine headaches.',
    source: 'PubMed',
  },
];

const sampleDocuments = [
  {
    title: 'Understanding Type 2 Diabetes',
    content: 'Type 2 diabetes is a chronic condition that affects the way your body metabolizes sugar (glucose). With type 2 diabetes, your body either resists the effects of insulin or does not produce enough insulin to maintain normal glucose levels. Common symptoms include increased thirst, frequent urination, fatigue, blurred vision, and slow-healing sores. Treatment typically involves lifestyle changes, monitoring blood sugar, diabetes medications, and sometimes insulin therapy.',
    source: 'MedlinePlus',
    doc_type: 'article',
  },
  {
    title: 'Diabetes Management Through Diet and Exercise',
    content: 'Managing type 2 diabetes requires a comprehensive approach. A healthy diet rich in vegetables, whole grains, and lean proteins combined with regular physical activity can significantly improve blood sugar control. Exercise helps your body use insulin more efficiently. The American Diabetes Association recommends at least 150 minutes of moderate-intensity aerobic activity per week, spread over at least three days.',
    source: 'Clinical Guidelines',
    doc_type: 'guide',
  },
  {
    title: 'Metformin in Type 2 Diabetes Treatment',
    content: 'Metformin is the most commonly prescribed medication for type 2 diabetes. It works by reducing glucose production in the liver and improving insulin sensitivity in muscle tissue. Studies have shown that metformin is effective in lowering HbA1c levels by 1-2%. Common side effects include gastrointestinal symptoms, which usually improve over time.',
    source: 'PubMed Abstract',
    doc_type: 'abstract',
  },
  {
    title: 'Hypertension: The Silent Killer',
    content: 'Hypertension, or high blood pressure, often has no symptoms but can lead to serious health complications including heart disease, stroke, and kidney disease. Blood pressure is measured in millimeters of mercury (mmHg) and is recorded as two numbers: systolic pressure (when the heart beats) over diastolic pressure (when the heart rests). A reading of 130/80 mmHg or higher is considered high blood pressure.',
    source: 'MedlinePlus',
    doc_type: 'article',
  },
  {
    title: 'Treatment Options for Hypertension',
    content: 'Treatment for hypertension typically begins with lifestyle modifications including reducing sodium intake, maintaining a healthy weight, regular exercise, limiting alcohol, and managing stress. When lifestyle changes are not sufficient, medications such as ACE inhibitors, beta-blockers, calcium channel blockers, or diuretics may be prescribed. The goal is to reduce blood pressure to below 130/80 mmHg.',
    source: 'Clinical Guidelines',
    doc_type: 'guide',
  },
  {
    title: 'Asthma: Symptoms and Triggers',
    content: 'Asthma is a chronic inflammatory disease of the airways characterized by recurring episodes of wheezing, breathlessness, chest tightness, and coughing. Common triggers include allergens (pollen, dust mites, pet dander), respiratory infections, exercise, cold air, and air pollution. Symptoms can range from mild to severe and may vary from person to person.',
    source: 'MedlinePlus',
    doc_type: 'article',
  },
  {
    title: 'Asthma Management Guidelines',
    content: 'Effective asthma management involves avoiding triggers, taking medications as prescribed, and monitoring symptoms. Controller medications, such as inhaled corticosteroids, are taken daily to reduce airway inflammation and prevent symptoms. Rescue medications, such as short-acting beta-agonists, provide quick relief during asthma attacks. An asthma action plan helps patients know what to do when symptoms worsen.',
    source: 'Clinical Guidelines',
    doc_type: 'guide',
  },
  {
    title: 'Migraine Headaches: Understanding the Condition',
    content: 'Migraines are intense headaches that can cause severe throbbing pain or a pulsing sensation, usually on one side of the head. They are often accompanied by nausea, vomiting, and extreme sensitivity to light and sound. Migraine attacks can last for hours to days, and the pain can be so severe that it interferes with daily activities. Some people experience warning symptoms known as aura before the headache begins.',
    source: 'MedlinePlus',
    doc_type: 'article',
  },
  {
    title: 'Migraine Treatment Strategies',
    content: 'Migraine treatment aims to relieve symptoms and prevent future attacks. Acute treatment includes pain relievers, triptans, and anti-nausea medications. Preventive medications may be prescribed for people who experience frequent or severe migraines. Lifestyle modifications such as maintaining a regular sleep schedule, managing stress, staying hydrated, and identifying and avoiding triggers can also help reduce migraine frequency.',
    source: 'Clinical Guidelines',
    doc_type: 'guide',
  },
];

async function seedDatabase() {
  console.log('Starting database seed...');

  try {
    console.log('Inserting entities...');
    const { data: entities, error: entitiesError } = await supabase
      .from('knowledge_graph_entities')
      .insert(sampleEntities)
      .select();

    if (entitiesError) {
      console.error('Error inserting entities:', entitiesError);
      return;
    }

    console.log(`Inserted ${entities.length} entities`);

    const entityMap = {};
    entities.forEach(entity => {
      entityMap[entity.name] = entity.id;
    });

    const relationships = [
      {
        from_entity_id: entityMap['Type 2 Diabetes'],
        to_entity_id: entityMap['Increased thirst'],
        relationship_type: 'has_symptom',
        confidence: 0.95,
        source: 'Clinical Evidence',
      },
      {
        from_entity_id: entityMap['Type 2 Diabetes'],
        to_entity_id: entityMap['Frequent urination'],
        relationship_type: 'has_symptom',
        confidence: 0.95,
        source: 'Clinical Evidence',
      },
      {
        from_entity_id: entityMap['Type 2 Diabetes'],
        to_entity_id: entityMap['Fatigue'],
        relationship_type: 'has_symptom',
        confidence: 0.85,
        source: 'Clinical Evidence',
      },
      {
        from_entity_id: entityMap['Metformin'],
        to_entity_id: entityMap['Type 2 Diabetes'],
        relationship_type: 'treats',
        confidence: 0.98,
        source: 'Clinical Guidelines',
      },
      {
        from_entity_id: entityMap['Lifestyle modification'],
        to_entity_id: entityMap['Type 2 Diabetes'],
        relationship_type: 'treats',
        confidence: 0.9,
        source: 'Clinical Guidelines',
      },
      {
        from_entity_id: entityMap['Hypertension'],
        to_entity_id: entityMap['Headache'],
        relationship_type: 'has_symptom',
        confidence: 0.7,
        source: 'Clinical Evidence',
      },
      {
        from_entity_id: entityMap['ACE inhibitors'],
        to_entity_id: entityMap['Hypertension'],
        relationship_type: 'treats',
        confidence: 0.95,
        source: 'Clinical Guidelines',
      },
      {
        from_entity_id: entityMap['Asthma'],
        to_entity_id: entityMap['Wheezing'],
        relationship_type: 'has_symptom',
        confidence: 0.9,
        source: 'Clinical Evidence',
      },
      {
        from_entity_id: entityMap['Asthma'],
        to_entity_id: entityMap['Shortness of breath'],
        relationship_type: 'has_symptom',
        confidence: 0.9,
        source: 'Clinical Evidence',
      },
      {
        from_entity_id: entityMap['Inhaled corticosteroids'],
        to_entity_id: entityMap['Asthma'],
        relationship_type: 'treats',
        confidence: 0.95,
        source: 'Clinical Guidelines',
      },
      {
        from_entity_id: entityMap['Migraine'],
        to_entity_id: entityMap['Headache'],
        relationship_type: 'has_symptom',
        confidence: 0.98,
        source: 'Clinical Evidence',
      },
      {
        from_entity_id: entityMap['Migraine'],
        to_entity_id: entityMap['Nausea'],
        relationship_type: 'has_symptom',
        confidence: 0.85,
        source: 'Clinical Evidence',
      },
      {
        from_entity_id: entityMap['Triptans'],
        to_entity_id: entityMap['Migraine'],
        relationship_type: 'treats',
        confidence: 0.92,
        source: 'Clinical Guidelines',
      },
    ];

    console.log('Inserting relationships...');
    const { data: insertedRelationships, error: relationshipsError } = await supabase
      .from('knowledge_graph_relationships')
      .insert(relationships)
      .select();

    if (relationshipsError) {
      console.error('Error inserting relationships:', relationshipsError);
      return;
    }

    console.log(`Inserted ${insertedRelationships.length} relationships`);

    console.log('Inserting documents...');
    const { data: documents, error: documentsError } = await supabase
      .from('medical_documents')
      .insert(sampleDocuments)
      .select();

    if (documentsError) {
      console.error('Error inserting documents:', documentsError);
      return;
    }

    console.log(`Inserted ${documents.length} documents`);

    console.log('Database seeding completed successfully!');
    console.log('Summary:');
    console.log(`- Entities: ${entities.length}`);
    console.log(`- Relationships: ${insertedRelationships.length}`);
    console.log(`- Documents: ${documents.length}`);
  } catch (error) {
    console.error('Seeding error:', error);
  }
}

seedDatabase();
