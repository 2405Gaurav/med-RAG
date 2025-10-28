/*
  # Add INSERT policies for data seeding

  ## Changes
    - Add INSERT policies for knowledge_graph_entities
    - Add INSERT policies for knowledge_graph_relationships
    - Add INSERT policies for medical_documents
    
  These policies allow anyone to insert data for demonstration and seeding purposes.
*/

-- Allow anyone to insert knowledge graph entities
CREATE POLICY "Anyone can insert knowledge graph entities"
  ON knowledge_graph_entities FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Allow anyone to insert knowledge graph relationships
CREATE POLICY "Anyone can insert knowledge graph relationships"
  ON knowledge_graph_relationships FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Allow anyone to insert medical documents
CREATE POLICY "Anyone can insert medical documents"
  ON medical_documents FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);