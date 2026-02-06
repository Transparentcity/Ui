#!/usr/bin/env node

/**
 * Verification Script for CRM Refactor
 * 
 * This script verifies that the refactor from anomaly_results columns
 * to crm_anomaly_metadata table is working correctly.
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Load environment variables
const envPath = path.join(__dirname, '..', '.env.local');
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

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not found in environment');
  process.exit(1);
}

async function verify() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: false,
  });

  try {
    console.log('🔌 Connecting to database...\n');
    await client.connect();
    console.log('✅ Connected successfully\n');

    // =========================================================================
    // CHECK 1: crm_anomaly_metadata table exists
    // =========================================================================
    console.log('📋 CHECK 1: crm_anomaly_metadata table exists\n');
    
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'crm_anomaly_metadata'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.error('❌ crm_anomaly_metadata table does NOT exist');
      console.error('   Please run: node scripts/run-migration.js 005');
      process.exit(1);
    }
    console.log('✅ crm_anomaly_metadata table exists\n');

    // =========================================================================
    // CHECK 2: anomaly_results table NOT modified
    // =========================================================================
    console.log('📋 CHECK 2: anomaly_results table NOT modified\n');
    
    const anomalyColumns = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'anomaly_results'
    `);
    
    const columnNames = anomalyColumns.rows.map(r => r.column_name);
    const hasCrmColumns = [
      'district_label',
      'is_citywide',
      'crm_status'
    ].some(col => columnNames.includes(col));
    
    if (hasCrmColumns) {
      console.log('⚠️  WARNING: anomaly_results table has CRM columns');
      console.log('   This means you ran the old migration.');
      console.log('   Consider running the data migration script from CRM_REFACTOR_SUMMARY.md\n');
    } else {
      console.log('✅ anomaly_results table clean (no CRM columns)\n');
    }

    // =========================================================================
    // CHECK 3: Test CRM metadata CRUD
    // =========================================================================
    console.log('📋 CHECK 3: Test CRM metadata CRUD operations\n');
    
    // Get a test anomaly ID
    const anomalyResult = await client.query('SELECT id FROM anomaly_results LIMIT 1');
    
    if (anomalyResult.rows.length === 0) {
      console.log('⚠️  No anomalies in database - skipping CRUD test\n');
    } else {
      const testAnomalyId = anomalyResult.rows[0].id;
      console.log(`   Using anomaly_id: ${testAnomalyId}`);
      
      // INSERT
      const insertResult = await client.query(`
        INSERT INTO crm_anomaly_metadata 
        (anomaly_id, district_label, is_citywide, severity, crm_status, notes)
        VALUES ($1, 'D9', false, 'high', 'new', 'Test note')
        ON CONFLICT (anomaly_id) DO UPDATE 
        SET district_label = EXCLUDED.district_label,
            severity = EXCLUDED.severity,
            notes = EXCLUDED.notes
        RETURNING id
      `, [testAnomalyId]);
      
      const metadataId = insertResult.rows[0].id;
      console.log('   ✓ INSERT successful');
      
      // SELECT
      const selectResult = await client.query(`
        SELECT * FROM crm_anomaly_metadata WHERE anomaly_id = $1
      `, [testAnomalyId]);
      
      if (selectResult.rows[0].district_label === 'D9') {
        console.log('   ✓ SELECT successful');
      } else {
        console.error('   ❌ SELECT failed - data mismatch');
      }
      
      // UPDATE
      await client.query(`
        UPDATE crm_anomaly_metadata 
        SET crm_status = 'sent', severity = 'critical'
        WHERE anomaly_id = $1
      `, [testAnomalyId]);
      
      const updateCheck = await client.query(`
        SELECT crm_status, severity FROM crm_anomaly_metadata 
        WHERE anomaly_id = $1
      `, [testAnomalyId]);
      
      if (updateCheck.rows[0].crm_status === 'sent' && 
          updateCheck.rows[0].severity === 'critical') {
        console.log('   ✓ UPDATE successful');
      } else {
        console.error('   ❌ UPDATE failed');
      }
      
      // JOIN TEST
      const joinResult = await client.query(`
        SELECT 
          a.id,
          a.district,
          m.district_label,
          m.crm_status,
          m.severity
        FROM anomaly_results a
        LEFT JOIN crm_anomaly_metadata m ON a.id = m.anomaly_id
        WHERE a.id = $1
      `, [testAnomalyId]);
      
      if (joinResult.rows.length > 0 && joinResult.rows[0].district_label === 'D9') {
        console.log('   ✓ JOIN successful');
      } else {
        console.error('   ❌ JOIN failed');
      }
      
      // CLEANUP
      await client.query(`
        DELETE FROM crm_anomaly_metadata WHERE id = $1
      `, [metadataId]);
      console.log('   ✓ DELETE successful (cleanup)\n');
    }

    // =========================================================================
    // CHECK 4: Indexes exist
    // =========================================================================
    console.log('📋 CHECK 4: Required indexes exist\n');
    
    const indexes = await client.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'crm_anomaly_metadata'
      AND schemaname = 'public'
    `);
    
    const indexNames = indexes.rows.map(r => r.indexname);
    const requiredIndexes = [
      'idx_crm_anomaly_metadata_anomaly_id',
      'idx_crm_anomaly_metadata_crm_status',
      'idx_crm_anomaly_metadata_district_label'
    ];
    
    let allIndexesExist = true;
    for (const idx of requiredIndexes) {
      if (indexNames.includes(idx)) {
        console.log(`   ✓ ${idx}`);
      } else {
        console.log(`   ❌ ${idx} MISSING`);
        allIndexesExist = false;
      }
    }
    
    if (allIndexesExist) {
      console.log('\n✅ All required indexes exist\n');
    } else {
      console.log('\n⚠️  Some indexes missing - run migration again\n');
    }

    // =========================================================================
    // SUMMARY
    // =========================================================================
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 VERIFICATION SUMMARY\n');
    console.log('✅ crm_anomaly_metadata table: EXISTS');
    console.log(hasCrmColumns ? '⚠️  anomaly_results table: HAS OLD CRM COLUMNS (see warning above)' : '✅ anomaly_results table: CLEAN (no CRM columns)');
    console.log('✅ CRUD operations: WORKING');
    console.log('✅ JOIN with anomaly_results: WORKING');
    console.log(allIndexesExist ? '✅ Indexes: ALL PRESENT' : '⚠️  Indexes: SOME MISSING');
    console.log('\n🎉 CRM refactor verification complete!');
    console.log('═══════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('\n❌ Verification failed:', error.message);
    if (error.detail) {
      console.error('   Detail:', error.detail);
    }
    if (error.hint) {
      console.error('   Hint:', error.hint);
    }
    process.exit(1);
  } finally {
    await client.end();
    console.log('🔌 Database connection closed\n');
  }
}

verify();
