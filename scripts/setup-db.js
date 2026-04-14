require('dotenv').config();
const { query } = require('../lib/db');

async function setup() {
  console.log('Setting up database...');

  await query(`
    CREATE TABLE IF NOT EXISTS call_logs (
      id                    SERIAL PRIMARY KEY,
      call_id               TEXT UNIQUE NOT NULL,
      caller_number         TEXT,
      called_number         TEXT,
      call_start_time       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      call_end_time         TIMESTAMP WITH TIME ZONE,
      call_duration_seconds INTEGER,
      call_status           VARCHAR(50),
      uv_call_id            TEXT,
      created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  console.log('✓ call_logs');

  await query(`
    CREATE TABLE IF NOT EXISTS incidents (
      id                  SERIAL PRIMARY KEY,
      call_id             TEXT,
      what                TEXT,
      when_it_happened    TEXT,
      where_it_happened   TEXT,
      injured             TEXT,
      witnesses           TEXT,
      consent_manager     BOOLEAN DEFAULT FALSE,
      severity            VARCHAR(20),
      incident_type       VARCHAR(50),
      -- notifications
      hr_notified_at      TIMESTAMP WITH TIME ZONE,
      manager_notified_at TIMESTAMP WITH TIME ZONE,
      -- escalation
      escalated           BOOLEAN DEFAULT FALSE,
      escalated_to        TEXT,
      escalation_reason   TEXT,
      -- follow-up
      assigned_to         TEXT,
      followup_status     VARCHAR(50) DEFAULT 'open',
      due_by              TIMESTAMP WITH TIME ZONE,
      created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  console.log('✓ incidents');

  await query(`
    CREATE TABLE IF NOT EXISTS transcripts (
      id        SERIAL PRIMARY KEY,
      call_id   TEXT,
      speaker   VARCHAR(20),
      message   TEXT,
      timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  console.log('✓ transcripts');

  await query(`
    CREATE TABLE IF NOT EXISTS detected_intents (
      id         SERIAL PRIMARY KEY,
      call_id    TEXT,
      intent     VARCHAR(100),
      confidence DECIMAL(5,4),
      entities   JSONB,
      timestamp  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  console.log('✓ detected_intents');

  await query(`
    CREATE TABLE IF NOT EXISTS tool_calls (
      id               SERIAL PRIMARY KEY,
      call_id          TEXT,
      tool_name        VARCHAR(100),
      input_params     JSONB,
      output_result    JSONB,
      execution_time_ms INTEGER,
      success          BOOLEAN,
      timestamp        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  console.log('✓ tool_calls');

  await query(`
    CREATE TABLE IF NOT EXISTS call_summaries (
      id                SERIAL PRIMARY KEY,
      call_id           TEXT UNIQUE,
      summary           TEXT,
      primary_intent    VARCHAR(100),
      resolution_status VARCHAR(50),
      follow_up_required BOOLEAN DEFAULT FALSE,
      created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  console.log('✓ call_summaries');

  await query(`CREATE INDEX IF NOT EXISTS idx_call_logs_status_created_at ON call_logs (call_status, created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_call_logs_uv_call_id ON call_logs (uv_call_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_incidents_call_id_created_at ON incidents (call_id, created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_incidents_followup_status ON incidents (followup_status, due_by)`);
  console.log('✓ indexes');

  console.log('\nDatabase setup complete.');
  process.exit(0);
}

setup().catch(err => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
