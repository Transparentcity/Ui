#!/usr/bin/env node

/**
 * CRM Database Migration Test
 * 
 * Verifies the migration worked correctly and didn't break existing functionality.
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local
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

const DATABASE_URL = process.env.CRM_DATABASE_URL;

let passed = 0;
let failed = 0;
const errors = [];

function test(name, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}${detail ? ': ' + detail : ''}`);
    failed++;
    errors.push({ name, detail });
  }
}

async function runTests() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: false,
  });

  try {
    console.log('🔌 Connecting to database...\n');
    await client.connect();

    // =========================================================================
    // TEST 1: All CRM tables exist
    // =========================================================================
    console.log('📋 TEST 1: CRM Tables Existence\n');
    
    const expectedTables = [
      'prospects', 'keywords', 'prospect_keywords', 'anomaly_keywords',
      'templates', 'template_variations', 'subject_variations',
      'campaigns', 'messages', 'responses', 'followups',
      'send_queue', 'campaign_throttle_settings', 'tone_profiles'
    ];

    const tablesResult = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    const existingTables = tablesResult.rows.map(r => r.table_name);

    for (const table of expectedTables) {
      test(`Table '${table}' exists`, existingTables.includes(table));
    }

    // =========================================================================
    // TEST 2: anomaly_results CRM columns added
    // =========================================================================
    console.log('\n📋 TEST 2: anomaly_results CRM Columns\n');

    const anomalyColumnsResult = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns 
      WHERE table_name = 'anomaly_results'
      ORDER BY ordinal_position
    `);
    const anomalyColumns = anomalyColumnsResult.rows;

    // List all columns for reference
    console.log('     ℹ️  anomaly_results columns:');
    anomalyColumns.forEach(col => {
      console.log(`        - ${col.column_name} (${col.data_type})`);
    });
    console.log('');

    // Check that core columns still exist (id, district, created_at are common)
    const coreColumn = anomalyColumns.find(c => c.column_name === 'id');
    test('Core column "id" exists', !!coreColumn);

    // Check new CRM columns
    const crmColumns = [
      { name: 'district_label', type: 'text' },
      { name: 'is_citywide', type: 'boolean' },
      { name: 'severity', type: 'text' },
      { name: 'crm_status', type: 'text' }
    ];
    for (const col of crmColumns) {
      const found = anomalyColumns.find(c => c.column_name === col.name);
      test(`CRM column '${col.name}' exists with type '${col.type}'`, 
           found && found.data_type === col.type,
           found ? `got type: ${found.data_type}` : 'column not found');
    }

    // =========================================================================
    // TEST 3: Table schemas are correct
    // =========================================================================
    console.log('\n📋 TEST 3: Key Table Schemas\n');

    // Prospects table
    const prospectsSchema = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'prospects'
      ORDER BY ordinal_position
    `);
    const prospectCols = prospectsSchema.rows.map(r => r.column_name);
    test('prospects has id column', prospectCols.includes('id'));
    test('prospects has name column', prospectCols.includes('name'));
    test('prospects has email column', prospectCols.includes('email'));
    test('prospects has jurisdiction column', prospectCols.includes('jurisdiction'));
    test('prospects has priority column', prospectCols.includes('priority'));
    test('prospects has status column', prospectCols.includes('status'));

    // Keywords table
    const keywordsSchema = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'keywords'
    `);
    const keywordCols = keywordsSchema.rows.map(r => r.column_name);
    test('keywords has id column', keywordCols.includes('id'));
    test('keywords has name column', keywordCols.includes('name'));
    test('keywords has category column', keywordCols.includes('category'));

    // Templates table
    const templatesSchema = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'templates'
    `);
    const templateCols = templatesSchema.rows.map(r => r.column_name);
    test('templates has id column', templateCols.includes('id'));
    test('templates has name column', templateCols.includes('name'));
    test('templates has subject column', templateCols.includes('subject'));
    test('templates has body column', templateCols.includes('body'));
    test('templates has channel column', templateCols.includes('channel'));

    // =========================================================================
    // TEST 4: Foreign key constraints
    // =========================================================================
    console.log('\n📋 TEST 4: Foreign Key Constraints\n');

    const fkResult = await client.query(`
      SELECT
        tc.table_name, 
        kcu.column_name, 
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name 
      FROM information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name IN ('prospect_keywords', 'anomaly_keywords', 'messages', 
                            'responses', 'followups', 'send_queue', 'template_variations',
                            'subject_variations', 'campaign_throttle_settings')
    `);

    const fks = fkResult.rows;
    test('prospect_keywords -> prospects FK exists', 
         fks.some(fk => fk.table_name === 'prospect_keywords' && fk.foreign_table_name === 'prospects'));
    test('prospect_keywords -> keywords FK exists', 
         fks.some(fk => fk.table_name === 'prospect_keywords' && fk.foreign_table_name === 'keywords'));
    test('messages -> prospects FK exists', 
         fks.some(fk => fk.table_name === 'messages' && fk.foreign_table_name === 'prospects'));
    test('messages -> campaigns FK exists', 
         fks.some(fk => fk.table_name === 'messages' && fk.foreign_table_name === 'campaigns'));
    test('responses -> prospects FK exists', 
         fks.some(fk => fk.table_name === 'responses' && fk.foreign_table_name === 'prospects'));
    test('followups -> prospects FK exists', 
         fks.some(fk => fk.table_name === 'followups' && fk.foreign_table_name === 'prospects'));
    test('send_queue -> campaigns FK exists', 
         fks.some(fk => fk.table_name === 'send_queue' && fk.foreign_table_name === 'campaigns'));
    test('template_variations -> templates FK exists', 
         fks.some(fk => fk.table_name === 'template_variations' && fk.foreign_table_name === 'templates'));

    // =========================================================================
    // TEST 5: Indexes exist
    // =========================================================================
    console.log('\n📋 TEST 5: Indexes\n');

    const indexResult = await client.query(`
      SELECT indexname, tablename 
      FROM pg_indexes 
      WHERE schemaname = 'public'
      AND indexname LIKE 'idx_%'
    `);
    const indexes = indexResult.rows.map(r => r.indexname);

    test('idx_prospects_status exists', indexes.includes('idx_prospects_status'));
    test('idx_prospects_jurisdiction exists', indexes.includes('idx_prospects_jurisdiction'));
    test('idx_messages_status exists', indexes.includes('idx_messages_status'));
    test('idx_send_queue_status exists', indexes.includes('idx_send_queue_status'));
    test('idx_anomaly_results_crm_status exists', indexes.includes('idx_anomaly_results_crm_status'));

    // =========================================================================
    // TEST 6: Seed data
    // =========================================================================
    console.log('\n📋 TEST 6: Seed Data\n');

    const keywordsData = await client.query('SELECT name, category FROM keywords ORDER BY name');
    test('Keywords seed data exists', keywordsData.rows.length >= 10, 
         `found ${keywordsData.rows.length} keywords`);
    
    const expectedKeywords = ['311', 'budget', 'education', 'environment', 'health', 
                              'homelessness', 'housing', 'permits', 'public_safety', 'transportation'];
    for (const kw of expectedKeywords) {
      test(`Keyword '${kw}' exists`, keywordsData.rows.some(r => r.name === kw));
    }

    const toneProfiles = await client.query('SELECT name FROM tone_profiles');
    test('Tone profile seed data exists', toneProfiles.rows.length >= 1);
    test('Professional Default tone profile exists', 
         toneProfiles.rows.some(r => r.name === 'Professional Default'));

    // =========================================================================
    // TEST 7: CRUD operations on new tables
    // =========================================================================
    console.log('\n📋 TEST 7: CRUD Operations\n');

    // Insert a test prospect
    const insertProspect = await client.query(`
      INSERT INTO prospects (name, email, jurisdiction, title)
      VALUES ('Test Contact', 'test@example.com', 'D5', 'Test Title')
      RETURNING id, name
    `);
    test('Can INSERT into prospects', insertProspect.rows.length === 1);
    const testProspectId = insertProspect.rows[0]?.id;

    // Read it back
    const readProspect = await client.query(
      'SELECT * FROM prospects WHERE id = $1', [testProspectId]
    );
    test('Can SELECT from prospects', readProspect.rows.length === 1);
    test('Prospect data is correct', readProspect.rows[0]?.name === 'Test Contact');

    // Update it
    const updateProspect = await client.query(`
      UPDATE prospects SET title = 'Updated Title' WHERE id = $1 RETURNING title
    `, [testProspectId]);
    test('Can UPDATE prospects', updateProspect.rows[0]?.title === 'Updated Title');

    // Insert a test template
    const insertTemplate = await client.query(`
      INSERT INTO templates (name, subject, body)
      VALUES ('Test Template', 'Test Subject', 'Test Body')
      RETURNING id
    `);
    test('Can INSERT into templates', insertTemplate.rows.length === 1);
    const testTemplateId = insertTemplate.rows[0]?.id;

    // Insert a test campaign
    const insertCampaign = await client.query(`
      INSERT INTO campaigns (name, template_id, status)
      VALUES ('Test Campaign', $1, 'draft')
      RETURNING id
    `, [testTemplateId]);
    test('Can INSERT into campaigns with FK', insertCampaign.rows.length === 1);
    const testCampaignId = insertCampaign.rows[0]?.id;

    // Insert into prospect_keywords (join table)
    const keywordId = keywordsData.rows[0]?.id || (await client.query('SELECT id FROM keywords LIMIT 1')).rows[0]?.id;
    if (keywordId) {
      const insertPK = await client.query(`
        INSERT INTO prospect_keywords (prospect_id, keyword_id)
        VALUES ($1, $2)
        RETURNING id
      `, [testProspectId, keywordId]);
      test('Can INSERT into prospect_keywords', insertPK.rows.length === 1);
    }

    // Clean up test data
    await client.query('DELETE FROM prospect_keywords WHERE prospect_id = $1', [testProspectId]);
    await client.query('DELETE FROM campaigns WHERE id = $1', [testCampaignId]);
    await client.query('DELETE FROM templates WHERE id = $1', [testTemplateId]);
    await client.query('DELETE FROM prospects WHERE id = $1', [testProspectId]);
    test('Can DELETE test data (cleanup)', true);

    // =========================================================================
    // TEST 8: Existing anomaly_results functionality
    // =========================================================================
    console.log('\n📋 TEST 8: Existing anomaly_results Functionality\n');

    // Check if anomaly_results has data
    const anomalyCount = await client.query('SELECT COUNT(*) as count FROM anomaly_results');
    const count = parseInt(anomalyCount.rows[0].count);
    test('anomaly_results table is accessible', true);
    console.log(`     ℹ️  Found ${count} existing anomaly records`);

    if (count > 0) {
      // Query only columns we know exist (from the schema check above)
      const anomalyQuery = await client.query(`
        SELECT id, district, district_label, is_citywide, severity, crm_status
        FROM anomaly_results 
        LIMIT 5
      `);
      test('Can SELECT with CRM columns from anomaly_results', anomalyQuery.rows.length > 0);
      
      // Show sample data
      if (anomalyQuery.rows.length > 0) {
        const sample = anomalyQuery.rows[0];
        console.log(`     ℹ️  Sample anomaly: id=${sample.id}, district=${sample.district}, district_label=${sample.district_label}, is_citywide=${sample.is_citywide}`);
      }

      // Test update of CRM columns
      const firstAnomaly = anomalyQuery.rows[0];
      if (firstAnomaly) {
        const originalStatus = firstAnomaly.crm_status;
        const updateAnomaly = await client.query(`
          UPDATE anomaly_results 
          SET crm_status = 'new', severity = 'medium'
          WHERE id = $1
          RETURNING crm_status, severity
        `, [firstAnomaly.id]);
        test('Can UPDATE CRM columns on anomaly_results', 
             updateAnomaly.rows[0]?.crm_status === 'new');
        
        // Restore original if it was different
        if (originalStatus && originalStatus !== 'new') {
          await client.query(`
            UPDATE anomaly_results SET crm_status = $1 WHERE id = $2
          `, [originalStatus, firstAnomaly.id]);
        }
      }

      // Test that district_label was populated from district
      const labelCheck = await client.query(`
        SELECT COUNT(*) as total,
               COUNT(district_label) as with_label,
               COUNT(CASE WHEN is_citywide = true THEN 1 END) as citywide
        FROM anomaly_results
        WHERE district IS NOT NULL
      `);
      const labelStats = labelCheck.rows[0];
      console.log(`     ℹ️  District label population: ${labelStats.with_label}/${labelStats.total} records have labels`);
      console.log(`     ℹ️  Citywide anomalies: ${labelStats.citywide}`);
      test('district_label migration ran', parseInt(labelStats.with_label) > 0 || parseInt(labelStats.total) === 0);
    } else {
      console.log('     ⚠️  No existing anomaly data - CRM columns added but no data to migrate');
      test('CRM columns added to empty anomaly_results', true);
    }

    // =========================================================================
    // TEST 9: Check constraints
    // =========================================================================
    console.log('\n📋 TEST 9: Check Constraints\n');

    // Test priority constraint on prospects (should be 1-5)
    try {
      await client.query(`
        INSERT INTO prospects (name, priority) VALUES ('Bad Priority', 10)
      `);
      test('Priority constraint (1-5) enforced', false, 'allowed priority=10');
      await client.query(`DELETE FROM prospects WHERE name = 'Bad Priority'`);
    } catch (e) {
      test('Priority constraint (1-5) enforced', e.message.includes('check') || e.message.includes('violates'));
    }

    // Test status constraint on prospects
    try {
      await client.query(`
        INSERT INTO prospects (name, status) VALUES ('Bad Status', 'invalid')
      `);
      test('Status constraint enforced', false, 'allowed invalid status');
      await client.query(`DELETE FROM prospects WHERE name = 'Bad Status'`);
    } catch (e) {
      test('Status constraint enforced', e.message.includes('check') || e.message.includes('violates'));
    }

    // =========================================================================
    // TEST 10: Triggers
    // =========================================================================
    console.log('\n📋 TEST 10: Triggers (updated_at)\n');

    // Insert and update a prospect, check updated_at changes
    const triggerTest = await client.query(`
      INSERT INTO prospects (name) VALUES ('Trigger Test') RETURNING id, created_at, updated_at
    `);
    const triggerId = triggerTest.rows[0].id;
    const originalUpdatedAt = triggerTest.rows[0].updated_at;

    // Small delay then update
    await new Promise(r => setTimeout(r, 100));
    await client.query(`UPDATE prospects SET name = 'Trigger Test Updated' WHERE id = $1`, [triggerId]);
    
    const afterUpdate = await client.query(`SELECT updated_at FROM prospects WHERE id = $1`, [triggerId]);
    const newUpdatedAt = afterUpdate.rows[0].updated_at;
    
    test('updated_at trigger works', 
         new Date(newUpdatedAt) > new Date(originalUpdatedAt),
         `original: ${originalUpdatedAt}, new: ${newUpdatedAt}`);

    // Cleanup
    await client.query(`DELETE FROM prospects WHERE id = $1`, [triggerId]);

    // =========================================================================
    // SUMMARY
    // =========================================================================
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`\n  ✅ Passed: ${passed}`);
    console.log(`  ❌ Failed: ${failed}`);
    console.log(`  📈 Total:  ${passed + failed}`);

    if (failed > 0) {
      console.log('\n❌ FAILED TESTS:');
      errors.forEach(e => {
        console.log(`   • ${e.name}${e.detail ? ': ' + e.detail : ''}`);
      });
      console.log('\n⚠️  Some tests failed - please review the errors above.');
      process.exit(1);
    } else {
      console.log('\n🎉 All tests passed! Migration is working correctly.');
    }

  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n🔌 Database connection closed');
  }
}

runTests();
