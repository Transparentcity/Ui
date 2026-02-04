# CRM Refactor Summary - Anomaly Metadata Separation

## Overview

Refactored the CRM to keep `anomaly_results` table untouched (owned by TransparentCity Platform) and store all CRM-specific metadata in a separate `crm_anomaly_metadata` table.

## Architectural Decision

**Before:** CRM columns were added directly to `anomaly_results` table
- `district_label` (TEXT)
- `is_citywide` (BOOLEAN)  
- `severity` (TEXT)
- `crm_status` (TEXT)

**After:** CRM data lives in separate `crm_anomaly_metadata` table
- `anomaly_results` remains read-only from Platform API
- CRM metadata joined via `anomaly_id` foreign key
- Clean separation of concerns

## Files Changed

### 1. Database Migration ✅
**File:** `scripts/005_crm_complete_schema.sql`

**Changes:**
- Removed `ALTER TABLE anomaly_results` statements
- Added new `crm_anomaly_metadata` table with columns:
  - `id` (UUID, primary key)
  - `anomaly_id` (INTEGER, unique, references anomaly_results.id)
  - `district_label` (TEXT)
  - `is_citywide` (BOOLEAN)
  - `severity` (TEXT)
  - `crm_status` (TEXT)
  - `notes` (TEXT)
  - `created_at`, `updated_at` (TIMESTAMPTZ)
- Added indexes on all key columns
- Added update trigger for `updated_at`

### 2. TypeScript Types ✅
**File:** `src/lib/types.ts`

**Changes:**
- Added `CrmAnomalyMetadata` interface
- Updated `Anomaly` interface:
  - Added `crm_metadata?: CrmAnomalyMetadata` field
  - Kept convenience accessors (`district_label`, `is_citywide`, `severity`, `crm_status`) for backward compatibility
  - Updated documentation to reflect new architecture

### 3. Anomaly Mapper ✅
**File:** `src/lib/anomalyMapper.ts`

**Changes:**
- Updated `mapApiAnomalyToCrm()` to create `crm_metadata` object structure
- Maintains convenience accessors on the anomaly object
- Added note that CRM metadata is created but not persisted until needed

### 4. CRM Metadata Actions (NEW) ✅
**File:** `src/app/actions/crm-anomaly-metadata.ts`

**New file with functions:**
- `getOrCreateCrmMetadata()` - Ensures metadata exists for an anomaly
- `updateCrmStatus()` - Update CRM workflow status
- `updateCrmSeverity()` - Update severity level
- `updateCrmDistrictLabel()` - Update district and citywide flag
- `updateCrmNotes()` - Update internal CRM notes
- `bulkUpdateCrmStatus()` - Bulk status updates
- `deleteCrmMetadata()` - Remove CRM metadata

### 5. Enrichment Helper (NEW) ✅
**File:** `src/lib/enrichAnomaliesWithCrmMetadata.ts`

**New utility:**
- `enrichAnomaliesWithCrmMetadata()` - Fetch and merge persisted CRM metadata
- `enrichAnomalyWithCrmMetadata()` - Single anomaly version
- Handles missing metadata gracefully
- Optimized with batch queries and Map lookup

### 6. Migration Runner ✅
**File:** `scripts/run-migration.js`

**Changes:**
- Updated verification to check `crm_anomaly_metadata` table
- Removed checks for columns on `anomaly_results`
- Added `crm_anomaly_metadata` to table list verification

### 7. Test Migration Script ✅
**File:** `scripts/test-migration.js`

**Changes:**
- Updated TEST 1: Added `crm_anomaly_metadata` to expected tables
- Updated TEST 2: Now tests `crm_anomaly_metadata` schema instead of `anomaly_results` columns
- Added verification that `anomaly_results` was NOT modified
- Updated TEST 5: Changed indexes to check `crm_anomaly_metadata` indexes
- Updated TEST 8: Comprehensive tests for CRM metadata CRUD operations and joins

## Migration Path

### For Fresh Installations
1. Run migration: `node scripts/run-migration.js 005`
2. Migration creates `crm_anomaly_metadata` table
3. No modification to `anomaly_results`

### For Existing Installations (with old migration)
If you already ran the old migration that modified `anomaly_results`, you have two options:

**Option A: Clean slate (recommended if no production data)**
1. Drop and recreate the database
2. Run new migration: `node scripts/run-migration.js 005`

**Option B: Migration script (if you have production data)**
Create and run this migration:

```sql
-- Create crm_anomaly_metadata table
CREATE TABLE IF NOT EXISTS crm_anomaly_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    anomaly_id INTEGER NOT NULL UNIQUE,
    district_label TEXT,
    is_citywide BOOLEAN DEFAULT false,
    severity TEXT DEFAULT 'medium',
    crm_status TEXT DEFAULT 'new',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Migrate existing CRM data from anomaly_results to crm_anomaly_metadata
INSERT INTO crm_anomaly_metadata (anomaly_id, district_label, is_citywide, severity, crm_status)
SELECT id, district_label, is_citywide, severity, crm_status
FROM anomaly_results
WHERE district_label IS NOT NULL 
   OR is_citywide IS NOT NULL 
   OR severity IS NOT NULL 
   OR crm_status IS NOT NULL
ON CONFLICT (anomaly_id) DO NOTHING;

-- Remove CRM columns from anomaly_results (optional - can leave for now)
-- ALTER TABLE anomaly_results DROP COLUMN IF EXISTS district_label;
-- ALTER TABLE anomaly_results DROP COLUMN IF EXISTS is_citywide;
-- ALTER TABLE anomaly_results DROP COLUMN IF EXISTS severity;
-- ALTER TABLE anomaly_results DROP COLUMN IF EXISTS crm_status;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_crm_anomaly_metadata_anomaly_id ON crm_anomaly_metadata(anomaly_id);
CREATE INDEX IF NOT EXISTS idx_crm_anomaly_metadata_district_label ON crm_anomaly_metadata(district_label);
CREATE INDEX IF NOT EXISTS idx_crm_anomaly_metadata_is_citywide ON crm_anomaly_metadata(is_citywide);
CREATE INDEX IF NOT EXISTS idx_crm_anomaly_metadata_crm_status ON crm_anomaly_metadata(crm_status);
CREATE INDEX IF NOT EXISTS idx_crm_anomaly_metadata_severity ON crm_anomaly_metadata(severity);
```

## Code Usage

### Fetching Anomalies with CRM Metadata

```typescript
import { useAnomalies } from "@/lib/hooks/useAnomalies"
import { mapApiAnomaliesToCrm } from "@/lib/anomalyMapper"
import { enrichAnomaliesWithCrmMetadata } from "@/lib/enrichAnomaliesWithCrmMetadata"

// Fetch from Platform API
const { data } = useAnomalies({ is_anomaly: true, limit: 200 })
const anomalies = mapApiAnomaliesToCrm(data?.results ?? [])

// Enrich with persisted CRM metadata (server-side only)
const enrichedAnomalies = await enrichAnomaliesWithCrmMetadata(anomalies)

// Access CRM data via convenience accessors
console.log(enrichedAnomalies[0].crm_status) // 'new' | 'sent' | 'acknowledged' | 'resolved'
console.log(enrichedAnomalies[0].district_label) // 'D5'
console.log(enrichedAnomalies[0].severity) // 'high'

// Or access via crm_metadata object
console.log(enrichedAnomalies[0].crm_metadata?.notes) // Internal CRM notes
```

### Updating CRM Metadata

```typescript
import { updateCrmStatus, updateCrmSeverity } from "@/app/actions/crm-anomaly-metadata"

// Update status
await updateCrmStatus(anomalyId, 'sent')

// Update severity
await updateCrmSeverity(anomalyId, 'critical')

// Bulk update
await bulkUpdateCrmStatus([id1, id2, id3], 'acknowledged')
```

## Backward Compatibility

✅ **Maintained:** All existing components continue to work because:
1. Convenience accessors (`district_label`, `is_citywide`, `severity`, `crm_status`) still exist on `Anomaly` type
2. Anomaly mapper still populates these fields
3. Components use these accessors, not direct column access

✅ **No changes needed in:**
- `src/components/anomalies-manager.tsx` - Uses convenience accessors
- `src/components/anomaly-dialog.tsx` - Uses convenience accessors
- `src/app/actions/send-queue.ts` - Reads CRM fields, doesn't write them
- `src/app/actions/ai-emails.ts` - CRM status updates via Platform API

## Testing

Run tests:
```bash
# Test migration
node scripts/test-migration.js

# Run specific tests
npm test -- crm
```

Verify:
1. ✅ `crm_anomaly_metadata` table exists
2. ✅ All indexes created
3. ✅ `anomaly_results` table NOT modified
4. ✅ Can CRUD CRM metadata
5. ✅ Can JOIN with anomaly_results
6. ✅ Triggers update `updated_at`

## Benefits

1. **Clean Architecture**: Platform data separate from CRM data
2. **No Platform Conflicts**: `anomaly_results` remains read-only
3. **Flexible**: Can add CRM fields without touching Platform tables
4. **Performant**: Indexed joins, only fetch CRM data when needed
5. **Maintainable**: Clear ownership boundaries

## Next Steps

1. ✅ Run migration
2. ✅ Test with existing anomaly data
3. [ ] Update any server components to use `enrichAnomaliesWithCrmMetadata()` if they need persisted CRM data
4. [ ] Consider adding CRM metadata enrichment to API routes that serve anomalies
5. [ ] Add UI for updating CRM notes field

## Questions?

Contact: Simon Goldman
Date: 2026-02-04
