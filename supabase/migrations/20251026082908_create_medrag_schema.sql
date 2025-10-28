/*
  # MedRAG-Agent Database Schema

  ## Overview
  Creates the database schema for the MedRAG-Agent medical Q&A system with knowledge graph support.

  ## New Tables
  
  ### 1. `knowledge_graph_entities`
    - Stores medical entities (diseases, symptoms, treatments, drugs, etc.)
    - `id` (uuid, primary key)
    - `entity_type` (text) - type of entity (disease, symptom, treatment, drug, anatomy)
    - `name` (text) - entity name
    - `description` (text) - detailed description
    - `source` (text) - data source (PubMed, MedlinePlus, etc.)
    - `metadata` (jsonb) - additional structured data
    - `created_at` (timestamptz)

  ### 2. `knowledge_graph_relationships`
    - Stores relationships between entities
    - `id` (uuid, primary key)
    - `from_entity_id` (uuid, foreign key)
    - `to_entity_id` (uuid, foreign key)
    - `relationship_type` (text) - type of relationship (treats, causes, symptom_of, etc.)
    - `confidence` (numeric) - confidence score
    - `source` (text)
    - `created_at` (timestamptz)

  ### 3. `medical_documents`
    - Stores medical document chunks for RAG retrieval
    - `id` (uuid, primary key)
    - `title` (text)
    - `content` (text)
    - `source` (text)
    - `doc_type` (text) - abstract, article, guide, etc.
    - `embedding` (vector) - will use pgvector extension
    - `metadata` (jsonb)
    - `created_at` (timestamptz)

  ### 4. `chat_sessions`
    - Stores user chat sessions
    - `id` (uuid, primary key)
    - `created_at` (timestamptz)
    - `updated_at` (timestamptz)

  ### 5. `chat_messages`
    - Stores chat messages with agent workflow data
    - `id` (uuid, primary key)
    - `session_id` (uuid, foreign key)
    - `role` (text) - user or assistant
    - `content` (text)
    - `sub_queries` (jsonb) - decomposed sub-queries
    - `retrieved_entities` (jsonb) - KG entities retrieved
    - `retrieved_docs` (jsonb) - documents retrieved
    - `citations` (jsonb) - inline citations
    - `created_at` (timestamptz)

  ## Security
    - Enable RLS on all tables
    - Public read access for knowledge graph and documents (medical knowledge is public)
    - Anyone can create and read their own chat sessions
*/

-- Enable pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Knowledge Graph Entities Table
CREATE TABLE IF NOT EXISTS knowledge_graph_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'manual',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kg_entities_type ON knowledge_graph_entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_kg_entities_name ON knowledge_graph_entities(name);

-- Knowledge Graph Relationships Table
CREATE TABLE IF NOT EXISTS knowledge_graph_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_entity_id uuid NOT NULL REFERENCES knowledge_graph_entities(id) ON DELETE CASCADE,
  to_entity_id uuid NOT NULL REFERENCES knowledge_graph_entities(id) ON DELETE CASCADE,
  relationship_type text NOT NULL,
  confidence numeric DEFAULT 1.0,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kg_rel_from ON knowledge_graph_relationships(from_entity_id);
CREATE INDEX IF NOT EXISTS idx_kg_rel_to ON knowledge_graph_relationships(to_entity_id);
CREATE INDEX IF NOT EXISTS idx_kg_rel_type ON knowledge_graph_relationships(relationship_type);

-- Medical Documents Table
CREATE TABLE IF NOT EXISTS medical_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  doc_type text NOT NULL DEFAULT 'article',
  embedding vector(384),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_med_docs_source ON medical_documents(source);
CREATE INDEX IF NOT EXISTS idx_med_docs_type ON medical_documents(doc_type);

-- Chat Sessions Table
CREATE TABLE IF NOT EXISTS chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Chat Messages Table
CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  sub_queries jsonb DEFAULT '[]'::jsonb,
  retrieved_entities jsonb DEFAULT '[]'::jsonb,
  retrieved_docs jsonb DEFAULT '[]'::jsonb,
  citations jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at);

-- Enable Row Level Security
ALTER TABLE knowledge_graph_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_graph_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Knowledge Graph Entities (public read)
CREATE POLICY "Anyone can read knowledge graph entities"
  ON knowledge_graph_entities FOR SELECT
  TO anon, authenticated
  USING (true);

-- RLS Policies for Knowledge Graph Relationships (public read)
CREATE POLICY "Anyone can read knowledge graph relationships"
  ON knowledge_graph_relationships FOR SELECT
  TO anon, authenticated
  USING (true);

-- RLS Policies for Medical Documents (public read)
CREATE POLICY "Anyone can read medical documents"
  ON medical_documents FOR SELECT
  TO anon, authenticated
  USING (true);

-- RLS Policies for Chat Sessions (anyone can create and read)
CREATE POLICY "Anyone can create chat sessions"
  ON chat_sessions FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can read chat sessions"
  ON chat_sessions FOR SELECT
  TO anon, authenticated
  USING (true);

-- RLS Policies for Chat Messages (anyone can create and read messages in any session)
CREATE POLICY "Anyone can create chat messages"
  ON chat_messages FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can read chat messages"
  ON chat_messages FOR SELECT
  TO anon, authenticated
  USING (true);