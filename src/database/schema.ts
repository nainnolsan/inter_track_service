const COMMON_TIMESTAMPS = `
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
`;

export const schemaStatements: string[] = [
  `CREATE EXTENSION IF NOT EXISTS \"pgcrypto\";`,
  `
  CREATE OR REPLACE FUNCTION set_updated_at()
  RETURNS TRIGGER AS $$
  BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
  END;
  $$ language 'plpgsql';
  `,
  `
  CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    website TEXT,
    industry TEXT,
    location TEXT,
    notes TEXT,
    ${COMMON_TIMESTAMPS},
    UNIQUE(user_id, name)
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
    role_title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'applied' CHECK (status IN ('saved', 'applied', 'screening', 'interview', 'technical', 'offer', 'rejected', 'withdrawn', 'hired')),
    source TEXT,
    location TEXT,
    salary_range TEXT,
    applied_at DATE,
    notes TEXT,
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    ${COMMON_TIMESTAMPS}
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    application_id UUID REFERENCES applications(id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    role TEXT,
    linkedin_url TEXT,
    notes TEXT,
    ${COMMON_TIMESTAMPS}
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS pipeline_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    from_status TEXT,
    to_status TEXT NOT NULL CHECK (to_status IN ('saved', 'applied', 'screening', 'interview', 'technical', 'offer', 'rejected', 'withdrawn', 'hired')),
    event_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    subject TEXT NOT NULL,
    body_preview TEXT,
    provider_message_id TEXT,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS automation_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    trigger_type TEXT NOT NULL,
    condition_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    action_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    ${COMMON_TIMESTAMPS}
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS automation_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    rule_id UUID REFERENCES automation_rules(id) ON DELETE SET NULL,
    application_id UUID REFERENCES applications(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'success', 'failed', 'skipped')),
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    error_message TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS user_stage_layouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    stage_id TEXT NOT NULL,
    label TEXT NOT NULL,
    position INTEGER NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    is_custom BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, stage_id)
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS job_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    job_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('liked', 'dismissed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, job_id)
  );
  `,
  `CREATE INDEX IF NOT EXISTS idx_applications_user_id ON applications(user_id);`,
  `CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);`,
  `CREATE INDEX IF NOT EXISTS idx_applications_company_id ON applications(company_id);`,
  `CREATE INDEX IF NOT EXISTS idx_pipeline_events_application_id ON pipeline_events(application_id);`,
  `CREATE INDEX IF NOT EXISTS idx_pipeline_events_event_date ON pipeline_events(event_date DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_contacts_application_id ON contacts(application_id);`,
  `CREATE INDEX IF NOT EXISTS idx_contacts_company_id ON contacts(company_id);`,
  `CREATE INDEX IF NOT EXISTS idx_emails_application_id ON emails(application_id);`,
  `CREATE INDEX IF NOT EXISTS idx_emails_contact_id ON emails(contact_id);`,
  `CREATE INDEX IF NOT EXISTS idx_emails_received_at ON emails(received_at DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_automation_runs_rule_id ON automation_runs(rule_id);`,
  `CREATE INDEX IF NOT EXISTS idx_automation_runs_application_id ON automation_runs(application_id);`,
  `CREATE INDEX IF NOT EXISTS idx_automation_runs_status ON automation_runs(status);`
  ,`CREATE INDEX IF NOT EXISTS idx_user_stage_layouts_user_id_position ON user_stage_layouts(user_id, position);`
];

export const triggerStatements: string[] = [
  `
  DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'companies_set_updated_at') THEN
      CREATE TRIGGER companies_set_updated_at
      BEFORE UPDATE ON companies
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    END IF;
  END $$;
  `,
  `
  DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'applications_set_updated_at') THEN
      CREATE TRIGGER applications_set_updated_at
      BEFORE UPDATE ON applications
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    END IF;
  END $$;
  `,
  `
  DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'contacts_set_updated_at') THEN
      CREATE TRIGGER contacts_set_updated_at
      BEFORE UPDATE ON contacts
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    END IF;
  END $$;
  `,
  `
  DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'automation_rules_set_updated_at') THEN
      CREATE TRIGGER automation_rules_set_updated_at
      BEFORE UPDATE ON automation_rules
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    END IF;
  END $$;
  `,
  `
  DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'user_stage_layouts_set_updated_at') THEN
      CREATE TRIGGER user_stage_layouts_set_updated_at
      BEFORE UPDATE ON user_stage_layouts
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    END IF;
  END $$;
  `,
  `
  DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'job_interactions_set_updated_at') THEN
      CREATE TRIGGER job_interactions_set_updated_at
      BEFORE UPDATE ON job_interactions
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    END IF;
  END $$;
  `
];
