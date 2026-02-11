#!/usr/bin/env node

/**
 * CRM Database Migration Runner
 * 
 * Runs the SQL migration against PostgreSQL using the pg package.
 * Usage: node scripts/run-migration.js [migration_number]
 * 
 * Examples:
 *   node scripts/run-migration.js        # Runs 005_crm_complete_schema.sql (default)
 *   node scripts/run-migration.js 006    # Runs 006_add_pending_review_status.sql
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Migration file mapping
const MIGRATIONS = {
  '001': '001_create_crm_tables.sql',
  '002': '002_dynamic_templates.sql',
  '003': '003_seed_keywords.sql',
  '004': '004_add_anomaly_district.sql',
  '005': '005_crm_complete_schema.sql',
  '006': '006_add_pending_review_status.sql',
  '007': '007_campaign_prospects.sql',
  '008': '008_media_contacts.sql',
  '009': '009_unify_prospects.sql',
};

// Load environment variables from .env.local or .env
const envPaths = [
  path.join(__dirname, '..', '.env.local'),
  path.join(__dirname, '..', '.env')
];

for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').trim();
        if (!process.env[key.trim()]) {
          process.env[key.trim()] = value;
        }
      }
    });
  }
}

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not found in environment or .env/.env.local');
  process.exit(1);
}

// Get migration number from command line argument
const migrationArg = process.argv[2] || '005';
const migrationNumber = migrationArg.padStart(3, '0');
const migrationFile = MIGRATIONS[migrationNumber];

if (!migrationFile) {
  console.error(`❌ Unknown migration: ${migrationArg}`);
  console.error('Available migrations:');
  Object.entries(MIGRATIONS).forEach(([num, file]) => {
    console.error(`   ${num}: ${file}`);
  });
  process.exit(1);
}

async function runMigration() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: false, // Adjust if your DB requires SSL
  });

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected successfully\n');

    // Read the migration SQL file
    const migrationPath = path.join(__dirname, migrationFile);
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }

    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
    console.log(`📄 Loaded migration: ${migrationFile}\n`);

    // Execute the migration
    console.log('🚀 Running migration...\n');
    await client.query(migrationSQL);
    console.log('✅ Migration executed successfully!\n');

    // Migration-specific verification
    if (migrationNumber === '005') {
      // Verify tables were created
      console.log('🔍 Verifying tables...\n');
      
      const tablesResult = await client.query(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('crm_anomaly_metadata', 'prospects', 'keywords', 'prospect_keywords', 
                           'anomaly_keywords', 'templates', 'campaigns', 'messages', 'responses', 
                           'followups', 'send_queue', 'campaign_throttle_settings', 'tone_profiles',
                           'template_variations', 'subject_variations')
        ORDER BY table_name;
      `);

      console.log('📊 CRM Tables created/verified:');
      tablesResult.rows.forEach(row => {
        console.log(`   ✓ ${row.table_name}`);
      });

      // Check crm_anomaly_metadata table structure
      console.log('\n📊 CRM Anomaly Metadata table structure:');
      const columnsResult = await client.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'crm_anomaly_metadata'
        ORDER BY ordinal_position;
      `);

      if (columnsResult.rows.length > 0) {
        columnsResult.rows.forEach(row => {
          console.log(`   ✓ ${row.column_name} (${row.data_type})`);
        });
      } else {
        console.log('   ⚠️  Note: crm_anomaly_metadata table not found');
      }

      // Check seed data
      console.log('\n📊 Seed data:');
      const keywordsCount = await client.query('SELECT COUNT(*) FROM keywords');
      console.log(`   ✓ ${keywordsCount.rows[0].count} keywords`);

      const toneProfilesCount = await client.query('SELECT COUNT(*) FROM tone_profiles');
      console.log(`   ✓ ${toneProfilesCount.rows[0].count} tone profiles`);
    } else if (migrationNumber === '008') {
      console.log('🔍 Verifying media contacts tables...\n');
      const tablesResult = await client.query(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('media_contacts', 'media_keywords', 'media_article_links')
        ORDER BY table_name;
      `);
      tablesResult.rows.forEach(row => {
        console.log(`   ✓ ${row.table_name}`);
      });
    } else if (migrationNumber === '009') {
      console.log('🔍 Verifying unified prospects...\n');
      const colCheck = await client.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'prospects' AND column_name IN ('contact_type', 'outlet_platform', 'primary_city')
        ORDER BY column_name;
      `);
      colCheck.rows.forEach(row => console.log(`   ✓ prospects.${row.column_name}`));
      const tblCheck = await client.query(`
        SELECT 1 FROM information_schema.tables WHERE table_name = 'prospect_article_links';
      `);
      if (tblCheck.rows.length > 0) console.log('   ✓ prospect_article_links');
    } else if (migrationNumber === '006') {
      // Verify the constraint was updated
      console.log('🔍 Verifying send_queue status constraint...\n');
      const constraintResult = await client.query(`
        SELECT pg_get_constraintdef(c.oid) as constraint_def
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        WHERE t.relname = 'send_queue' 
        AND c.conname = 'send_queue_status_check';
      `);
      
      if (constraintResult.rows.length > 0) {
        const constraintDef = constraintResult.rows[0].constraint_def;
        if (constraintDef.includes('pending_review')) {
          console.log('✅ send_queue_status_check now includes pending_review');
          console.log(`   Constraint: ${constraintDef}`);
        } else {
          console.log('⚠️  Constraint may not have been updated correctly');
          console.log(`   Constraint: ${constraintDef}`);
        }
      } else {
        console.log('⚠️  send_queue_status_check constraint not found');
      }
    }

    console.log('\n🎉 Migration completed successfully!');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    if (error.detail) {
      console.error('   Detail:', error.detail);
    }
    if (error.hint) {
      console.error('   Hint:', error.hint);
    }
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n🔌 Database connection closed');
  }
}

runMigration();
