require('dotenv').config();
const { query } = require('../lib/db');

async function setup() {
  console.log('Setting up database...');

  await query(`
    CREATE TABLE IF NOT EXISTS call_logs (
      id SERIAL PRIMARY KEY,
      call_id TEXT UNIQUE NOT NULL,
      caller_number TEXT,
      called_number TEXT,
      call_start_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      call_end_time TIMESTAMP WITH TIME ZONE,
      call_duration_seconds INTEGER,
      call_status VARCHAR(50),
      uv_call_id TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  console.log('✓ call_logs');

  await query(`
    ALTER TABLE call_logs
      ALTER COLUMN call_id TYPE TEXT,
      ALTER COLUMN caller_number TYPE TEXT,
      ALTER COLUMN called_number TYPE TEXT
  `);
  await query(`ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS uv_call_id TEXT`);

  await query(`
    CREATE TABLE IF NOT EXISTS transcripts (
      id SERIAL PRIMARY KEY,
      call_id TEXT,
      speaker VARCHAR(20),
      message TEXT,
      timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  console.log('✓ transcripts');

  await query(`
    CREATE TABLE IF NOT EXISTS detected_intents (
      id SERIAL PRIMARY KEY,
      call_id TEXT,
      intent VARCHAR(100),
      confidence DECIMAL(5,4),
      entities JSONB,
      timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  console.log('✓ detected_intents');

  await query(`
    CREATE TABLE IF NOT EXISTS tool_calls (
      id SERIAL PRIMARY KEY,
      call_id TEXT,
      tool_name VARCHAR(100),
      input_params JSONB,
      output_result JSONB,
      execution_time_ms INTEGER,
      success BOOLEAN,
      timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  console.log('✓ tool_calls');

  await query(`
    CREATE TABLE IF NOT EXISTS call_summaries (
      id SERIAL PRIMARY KEY,
      call_id TEXT UNIQUE,
      summary TEXT,
      primary_intent VARCHAR(100),
      resolution_status VARCHAR(50),
      follow_up_required BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  console.log('✓ call_summaries');

  await query(`
    CREATE TABLE IF NOT EXISTS incidents (
      id SERIAL PRIMARY KEY,
      call_id TEXT,
      what TEXT,
      when_it_happened TEXT,
      where_it_happened TEXT,
      injured TEXT,
      witnesses TEXT,
      consent_manager BOOLEAN DEFAULT FALSE,
      severity VARCHAR(20),
      incident_type VARCHAR(50),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  console.log('✓ incidents');

  await query(`
    ALTER TABLE incidents
      ALTER COLUMN call_id TYPE TEXT
  `);
  await query(`ALTER TABLE incidents ADD COLUMN IF NOT EXISTS incident_type VARCHAR(50)`);

  await query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      incident_id INTEGER,
      call_id TEXT,
      recipient_type VARCHAR(50),
      phone_number TEXT,
      message TEXT,
      sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  console.log('✓ notifications');

  await query(`
    CREATE TABLE IF NOT EXISTS escalations (
      id SERIAL PRIMARY KEY,
      incident_id INTEGER,
      call_id TEXT,
      severity VARCHAR(20),
      escalated_to TEXT,
      reason TEXT,
      acknowledged BOOLEAN DEFAULT FALSE,
      acknowledged_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  console.log('✓ escalations');

  await query(`
    CREATE TABLE IF NOT EXISTS follow_ups (
      id SERIAL PRIMARY KEY,
      incident_id INTEGER,
      call_id TEXT,
      incident_type VARCHAR(50),
      severity VARCHAR(20),
      assigned_to TEXT,
      status VARCHAR(50) DEFAULT 'open',
      due_by TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  console.log('✓ follow_ups');

  await query(`CREATE INDEX IF NOT EXISTS idx_call_logs_status_created_at ON call_logs (call_status, created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_call_logs_uv_call_id ON call_logs (uv_call_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_incidents_call_id_created_at ON incidents (call_id, created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_notifications_incident_id ON notifications (incident_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_escalations_incident_id ON escalations (incident_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_follow_ups_status_due_by ON follow_ups (status, due_by)`);
  console.log('✓ indexes');

  console.log('\nDatabase setup complete.');
  process.exit(0);
}

setup().catch(err => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
