/**
 * =============================================================================
 * Transparent City CRM - PostgreSQL Database Client
 * =============================================================================
 * 
 * This module provides a query builder interface for PostgreSQL.
 * 
 * SETUP:
 * 1. Set DATABASE_URL environment variable to your PostgreSQL connection string
 * 2. Run the migration: scripts/005_crm_complete_schema.sql
 * 
 * USAGE:
 *   const db = createClient()
 *   const { data, error } = await db
 *     .from('prospects')
 *     .select('*, prospect_keywords(keyword:keywords(id, name))')
 *     .eq('status', 'active')
 *     .order('name')
 * =============================================================================
 */

import { Pool, PoolClient, QueryResult } from 'pg'

// =============================================================================
// INTERFACES
// =============================================================================

export interface DatabaseClient {
  from: (table: string) => QueryBuilder
}

export interface QueryBuilder {
  select: (columns?: string, options?: { count?: 'exact' | 'planned' | 'estimated' }) => QueryBuilder
  insert: (data: Record<string, unknown> | Record<string, unknown>[]) => QueryBuilder
  update: (data: Record<string, unknown>) => QueryBuilder
  delete: () => QueryBuilder
  eq: (column: string, value: unknown) => QueryBuilder
  neq: (column: string, value: unknown) => QueryBuilder
  gt: (column: string, value: unknown) => QueryBuilder
  gte: (column: string, value: unknown) => QueryBuilder
  lt: (column: string, value: unknown) => QueryBuilder
  lte: (column: string, value: unknown) => QueryBuilder
  in: (column: string, values: unknown[]) => QueryBuilder
  is: (column: string, value: null | boolean) => QueryBuilder
  order: (column: string, options?: { ascending?: boolean }) => QueryBuilder
  limit: (count: number) => QueryBuilder
  single: () => Promise<{ data: any; error: Error | null }>
  then: <T = any>(resolve: (result: { data: T | null; error: Error | null; count?: number }) => void) => Promise<void>
}

// =============================================================================
// CONNECTION POOL
// =============================================================================

let pool: Pool | null = null

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL
    
    if (!connectionString) {
      throw new Error(
        'Database connection string not found. Set DATABASE_URL environment variable.'
      )
    }

    // Keep pool small to avoid exhausting PostgreSQL connection slots when sharing DB with Platform backend.
    const maxConnections = parseInt(process.env.CRM_DB_POOL_MAX ?? '2', 10) || 2
    pool = new Pool({
      connectionString,
      max: Math.min(maxConnections, 5),  // Cap at 5; default 2
      idleTimeoutMillis: 10000,   // Release idle clients after 10s
      connectionTimeoutMillis: 5000,
      ssl: connectionString.includes('sslmode=require') || connectionString.includes('localhost') === false
        ? { rejectUnauthorized: false }
        : undefined
    })
    
    pool.on('error', (err) => {
      console.error('[CRM DB] Unexpected pool error:', err)
    })
  }
  
  return pool
}

// =============================================================================
// QUERY BUILDER IMPLEMENTATION
// =============================================================================

interface JoinConfig {
  fromTable: string
  fromColumn: string
  toTable: string
  toColumn: string
  alias: string
  nestedSelects?: string[]
}

interface QueryState {
  table: string
  operation: 'select' | 'insert' | 'update' | 'delete'
  selectColumns: string
  selectOptions?: { count?: 'exact' | 'planned' | 'estimated' }
  insertData: Record<string, unknown>[] | null
  updateData: Record<string, unknown> | null
  filters: Array<{ column: string; operator: string; value: unknown }>
  orderBy: Array<{ column: string; ascending: boolean }>
  limitCount: number | null
  isSingle: boolean
  joins: JoinConfig[]
}

/**
 * Parse select string to extract joins (supports nested relations)
 * Example: "*, prospect_keywords(keyword:keywords(id, name))"
 */
function parseSelectString(selectStr: string, mainTable: string): { columns: string[]; joins: JoinConfig[] } {
  const joins: JoinConfig[] = []
  const columns: string[] = []
  
  // Split by comma but respect parentheses
  let depth = 0
  let current = ''
  const parts: string[] = []
  
  for (const char of selectStr) {
    if (char === '(') depth++
    else if (char === ')') depth--
    
    if (char === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  if (current.trim()) parts.push(current.trim())
  
  for (const part of parts) {
    // Check if this is a join: tablename(columns) or alias:tablename(columns)
    const joinMatch = part.match(/^(\w+)(?::(\w+))?\s*\((.*)\)$/)
    
    if (joinMatch) {
      const [, joinTableOrAlias, actualTable, innerSelect] = joinMatch
      const joinTable = actualTable || joinTableOrAlias
      const alias = joinTableOrAlias
      
      // Determine foreign key relationship
      // Convention: join_table has main_table_id column pointing to main_table.id
      // Or: main_table has join_table_id column
      let fromColumn: string
      let toColumn: string
      
      if (joinTable.includes('_keywords') || joinTable.includes('_')) {
        // Join table pattern: prospect_keywords -> prospect_id
        fromColumn = `${mainTable.slice(0, -1)}_id` // prospects -> prospect_id
        toColumn = 'id'
      } else {
        // Direct reference: keywords -> id
        fromColumn = 'id'
        toColumn = `${joinTable}_id`
      }
      
      // Parse nested selects (e.g., keyword:keywords(id, name))
      const nestedJoins = parseSelectString(innerSelect, joinTable)
      
      joins.push({
        fromTable: mainTable,
        fromColumn,
        toTable: joinTable,
        toColumn,
        alias,
        nestedSelects: innerSelect.split(',').map(s => s.trim())
      })
      
      // Add nested joins
      joins.push(...nestedJoins.joins)
    } else {
      columns.push(part.trim())
    }
  }
  
  return { columns, joins }
}

function createQueryBuilder(tableName: string, dbPool: Pool): QueryBuilder {
  const state: QueryState = {
    table: tableName,
    operation: 'select',
    selectColumns: '*',
    insertData: null,
    updateData: null,
    filters: [],
    orderBy: [],
    limitCount: null,
    isSingle: false,
    joins: []
  }

  const builder: QueryBuilder = {
    select(columns = '*', options) {
      // Don't overwrite operation if we're in insert/update/delete mode
      // This supports the .insert().select() pattern (return columns after insert)
      if (state.operation !== 'insert' && state.operation !== 'update' && state.operation !== 'delete') {
        state.operation = 'select'
        // Parse for joins (only for actual SELECT operations)
        const parsed = parseSelectString(columns, tableName)
        state.joins = parsed.joins
      }
      
      // Store the columns to return (used for RETURNING clause in insert/update)
      state.selectColumns = columns
      state.selectOptions = options
      
      return builder
    },

    insert(data) {
      state.operation = 'insert'
      state.insertData = Array.isArray(data) ? data : [data]
      return builder
    },

    update(data) {
      state.operation = 'update'
      state.updateData = data
      return builder
    },

    delete() {
      state.operation = 'delete'
      return builder
    },

    eq(column, value) {
      state.filters.push({ column, operator: '=', value })
      return builder
    },

    neq(column, value) {
      state.filters.push({ column, operator: '!=', value })
      return builder
    },

    gt(column, value) {
      state.filters.push({ column, operator: '>', value })
      return builder
    },

    gte(column, value) {
      state.filters.push({ column, operator: '>=', value })
      return builder
    },

    lt(column, value) {
      state.filters.push({ column, operator: '<', value })
      return builder
    },

    lte(column, value) {
      state.filters.push({ column, operator: '<=', value })
      return builder
    },

    in(column, values) {
      state.filters.push({ column, operator: 'IN', value: values })
      return builder
    },

    is(column, value) {
      if (value === null) {
        state.filters.push({ column, operator: 'IS NULL', value: null })
      } else {
        state.filters.push({ column, operator: '=', value })
      }
      return builder
    },

    order(column, options) {
      state.orderBy.push({ column, ascending: options?.ascending ?? true })
      return builder
    },

    limit(count) {
      state.limitCount = count
      return builder
    },

    async single() {
      state.isSingle = true
      state.limitCount = 1
      
      return new Promise((resolve) => {
        builder.then((result: { data: unknown; error: Error | null }) => {
          const items = result.data as unknown[]
          resolve({ 
            data: items?.[0] ?? null, 
            error: result.error 
          })
        })
      })
    },

    async then<T>(resolve: (result: { data: T | null; error: Error | null; count?: number }) => void) {
      let client: PoolClient | null = null
      
      try {
        client = await dbPool.connect()
        
        switch (state.operation) {
          case 'insert': {
            if (!state.insertData || state.insertData.length === 0) {
              resolve({ data: [] as T, error: null })
              return
            }
            
            const rows = state.insertData
            const columns = Object.keys(rows[0])
            const values: unknown[] = []
            const valuePlaceholders: string[] = []
            
            rows.forEach((row, rowIndex) => {
              const rowPlaceholders: string[] = []
              columns.forEach((col, colIndex) => {
                values.push(row[col])
                rowPlaceholders.push(`$${rowIndex * columns.length + colIndex + 1}`)
              })
              valuePlaceholders.push(`(${rowPlaceholders.join(', ')})`)
            })
            
            // Use selectColumns for RETURNING clause if specified, otherwise return all
            const returningCols = state.selectColumns && state.selectColumns !== '*' 
              ? state.selectColumns 
              : '*'
            
            const sql = `
              INSERT INTO ${state.table} (${columns.join(', ')})
              VALUES ${valuePlaceholders.join(', ')}
              RETURNING ${returningCols}
            `
            
            console.log('[CRM DB] Insert SQL:', sql.trim().replace(/\s+/g, ' '))
            
            const result = await client.query(sql, values)
            resolve({ data: result.rows as T, error: null })
            break
          }
          
          case 'update': {
            if (!state.updateData) {
              resolve({ data: null, error: null })
              return
            }
            
            const setClauses: string[] = []
            const values: unknown[] = []
            let paramIndex = 1
            
            // Add updated_at if not provided (skip for tables that don't have it)
            const tablesWithoutUpdatedAt = ['send_queue', 'campaign_prospects']
            const updateWithTimestamp = tablesWithoutUpdatedAt.includes(state.table)
              ? state.updateData
              : {
                  ...state.updateData,
                  updated_at: state.updateData.updated_at || new Date().toISOString()
                }
            
            for (const [key, value] of Object.entries(updateWithTimestamp)) {
              setClauses.push(`${key} = $${paramIndex}`)
              values.push(value)
              paramIndex++
            }
            
            const { whereClause, whereValues } = buildWhereClause(state.filters, paramIndex)
            values.push(...whereValues)
            
            const sql = `
              UPDATE ${state.table}
              SET ${setClauses.join(', ')}
              ${whereClause}
              RETURNING *
            `
            
            const result = await client.query(sql, values)
            resolve({ data: result.rows as T, error: null })
            break
          }
          
          case 'delete': {
            const { whereClause, whereValues } = buildWhereClause(state.filters, 1)
            
            const sql = `
              DELETE FROM ${state.table}
              ${whereClause}
              RETURNING *
            `
            
            const result = await client.query(sql, whereValues)
            resolve({ data: result.rows as T, error: null })
            break
          }
          
          case 'select':
          default: {
            // Build main query
            const { whereClause, whereValues } = buildWhereClause(state.filters, 1)
            
            let orderClause = ''
            if (state.orderBy.length > 0) {
              const orderParts = state.orderBy.map(o => 
                `${o.column} ${o.ascending ? 'ASC' : 'DESC'}`
              )
              orderClause = `ORDER BY ${orderParts.join(', ')}`
            }
            
            let limitClause = ''
            if (state.limitCount !== null) {
              limitClause = `LIMIT ${state.limitCount}`
            }
            
            // Get column list (excluding join syntax)
            let selectCols = '*'
            if (state.selectColumns !== '*') {
              const { columns } = parseSelectString(state.selectColumns, state.table)
              if (columns.length > 0 && columns[0] !== '*') {
                selectCols = columns.join(', ')
              }
            }
            
            const sql = `
              SELECT ${selectCols}
              FROM ${state.table}
              ${whereClause}
              ${orderClause}
              ${limitClause}
            `.trim()
            
            const result = await client.query(sql, whereValues)
            let rows = result.rows
            
            // Handle joins by fetching related data
            if (state.joins.length > 0) {
              rows = await fetchJoinedData(client, rows, state.joins, state.table)
            }
            
            // Handle count option
            let count: number | undefined
            if (state.selectOptions?.count === 'exact') {
              const countSql = `SELECT COUNT(*) as count FROM ${state.table} ${whereClause}`
              const countResult = await client.query(countSql, whereValues)
              count = parseInt(countResult.rows[0]?.count || '0', 10)
            }
            
            resolve({ data: rows as T, error: null, count })
            break
          }
        }
      } catch (error) {
        console.error(`[CRM DB] Query error on ${state.table}:`, error)
        resolve({ data: null, error: error as Error })
      } finally {
        if (client) {
          client.release()
        }
      }
    }
  }

  return builder
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function buildWhereClause(
  filters: Array<{ column: string; operator: string; value: unknown }>,
  startIndex: number
): { whereClause: string; whereValues: unknown[] } {
  if (filters.length === 0) {
    return { whereClause: '', whereValues: [] }
  }
  
  const conditions: string[] = []
  const values: unknown[] = []
  let paramIndex = startIndex
  
  for (const filter of filters) {
    if (filter.operator === 'IS NULL') {
      conditions.push(`${filter.column} IS NULL`)
    } else if (filter.operator === 'IN') {
      const inValues = filter.value as unknown[]
      if (inValues.length === 0) {
        conditions.push('FALSE') // Empty IN clause
      } else {
        const placeholders = inValues.map((_, i) => `$${paramIndex + i}`).join(', ')
        conditions.push(`${filter.column} IN (${placeholders})`)
        values.push(...inValues)
        paramIndex += inValues.length
      }
    } else {
      conditions.push(`${filter.column} ${filter.operator} $${paramIndex}`)
      values.push(filter.value)
      paramIndex++
    }
  }
  
  return {
    whereClause: `WHERE ${conditions.join(' AND ')}`,
    whereValues: values
  }
}

/**
 * Fetch joined/related data for rows
 * Handles patterns like: prospect_keywords(keyword:keywords(id, name))
 */
async function fetchJoinedData(
  client: PoolClient,
  rows: Record<string, unknown>[],
  joins: JoinConfig[],
  mainTable: string
): Promise<Record<string, unknown>[]> {
  if (rows.length === 0) return rows
  
  const rowIds = rows.map(r => r.id).filter(Boolean)
  if (rowIds.length === 0) return rows
  
  // Group joins by their direct relationship to main table
  for (const join of joins) {
    // Skip nested joins (handled recursively)
    if (join.fromTable !== mainTable) continue
    
    try {
      // Determine the foreign key column name
      const singularMainTable = mainTable.endsWith('s') ? mainTable.slice(0, -1) : mainTable
      const fkColumn = `${singularMainTable}_id`
      
      // Check if this is a join table (has _id suffix for main table)
      const isJoinTable = join.toTable.includes('_')
      
      if (isJoinTable) {
        // Join table pattern: prospect_keywords -> keywords
        // First get join table rows
        const placeholders = rowIds.map((_, i) => `$${i + 1}`).join(', ')
        const joinSql = `SELECT * FROM ${join.toTable} WHERE ${fkColumn} IN (${placeholders})`
        const joinResult = await client.query(joinSql, rowIds)
        
        // Check for nested joins (e.g., keyword:keywords)
        const nestedJoin = joins.find(j => j.fromTable === join.toTable)
        
        if (nestedJoin && joinResult.rows.length > 0) {
          // Get the related table data
          const relatedIds = joinResult.rows.map(r => r[nestedJoin.fromColumn]).filter(Boolean)
          
          if (relatedIds.length > 0) {
            const relatedPlaceholders = relatedIds.map((_, i) => `$${i + 1}`).join(', ')
            const relatedSql = `SELECT * FROM ${nestedJoin.toTable} WHERE id IN (${relatedPlaceholders})`
            const relatedResult = await client.query(relatedSql, relatedIds)
            
            // Create lookup map
            const relatedMap = new Map(relatedResult.rows.map(r => [r.id, r]))
            
            // Attach related data to join rows
            for (const joinRow of joinResult.rows) {
              const relatedId = joinRow[nestedJoin.fromColumn]
              if (relatedId && relatedMap.has(relatedId)) {
                (joinRow as Record<string, unknown>)[nestedJoin.alias] = relatedMap.get(relatedId)
              }
            }
          }
        }
        
        // Group join rows by main table id
        const joinMap = new Map<string, Record<string, unknown>[]>()
        for (const joinRow of joinResult.rows) {
          const mainId = joinRow[fkColumn] as string
          if (!joinMap.has(mainId)) {
            joinMap.set(mainId, [])
          }
          joinMap.get(mainId)!.push(joinRow)
        }
        
        // Attach to main rows
        for (const row of rows) {
          const rowId = row.id as string
          (row as Record<string, unknown>)[join.alias] = joinMap.get(rowId) || []
        }
      } else {
        // Direct reference pattern: templates -> template_id on campaigns
        // Fetch the referenced records
        const refColumn = `${join.toTable.endsWith('s') ? join.toTable.slice(0, -1) : join.toTable}_id`
        const refIds = rows.map(r => r[refColumn]).filter(Boolean)
        
        if (refIds.length > 0) {
          const uniqueRefIds = [...new Set(refIds)]
          const placeholders = uniqueRefIds.map((_, i) => `$${i + 1}`).join(', ')
          const refSql = `SELECT * FROM ${join.toTable} WHERE id IN (${placeholders})`
          const refResult = await client.query(refSql, uniqueRefIds)
          
          const refMap = new Map(refResult.rows.map(r => [r.id, r]))
          
          for (const row of rows) {
            const refId = row[refColumn] as string
            if (refId && refMap.has(refId)) {
              (row as Record<string, unknown>)[join.alias] = refMap.get(refId)
            }
          }
        }
      }
    } catch (error) {
      console.error(`[CRM DB] Error fetching joined data for ${join.toTable}:`, error)
      // Continue without joined data rather than failing completely
    }
  }
  
  return rows
}

// =============================================================================
// EXPORTS
// =============================================================================

/**
 * Create a CRM database client
 */
export function createClient(): DatabaseClient {
  const dbPool = getPool()
  
  return {
    from: (table: string) => createQueryBuilder(table, dbPool)
  }
}

/**
 * Async version for server-side usage
 */
export async function createServerClient(): Promise<DatabaseClient> {
  return createClient()
}

/**
 * Close the connection pool (call on app shutdown)
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
  }
}

/**
 * Execute raw SQL (for migrations or complex queries)
 */
export async function executeRawQuery<T = unknown>(
  sql: string, 
  params: unknown[] = []
): Promise<{ data: T[] | null; error: Error | null }> {
  let client: PoolClient | null = null
  
  try {
    client = await getPool().connect()
    const result = await client.query(sql, params)
    return { data: result.rows as T[], error: null }
  } catch (error) {
    console.error('[CRM DB] Raw query error:', error)
    return { data: null, error: error as Error }
  } finally {
    if (client) {
      client.release()
    }
  }
}
