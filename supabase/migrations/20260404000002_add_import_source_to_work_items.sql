ALTER TABLE work_items
  ADD COLUMN import_source text CHECK (import_source IN ('manual', 'ai', 'csv'));
