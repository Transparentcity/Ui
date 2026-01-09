# Performance Improvement Recommendations

## Executive Summary

This document outlines comprehensive performance improvements for the TransparentCity webapp, covering frontend (Next.js/React), backend (FastAPI), database, and network optimizations. Based on codebase analysis, these improvements can deliver **50-80% performance gains** across key user interactions.

---

## 🎯 Frontend Optimizations

### 1. **Component Splitting & Code Splitting** (High Impact)

**Problem**: Large monolithic components like `MetricsAdmin.tsx` (1,737 lines) cause:
- Slow initial bundle load
- Unnecessary re-renders
- Poor code maintainability

**Solution**:
```typescript
// Split MetricsAdmin into smaller components
// src/components/MetricsAdmin/
//   ├── MetricsAdmin.tsx (main orchestrator, ~200 lines)
//   ├── MetricsTable.tsx (table rendering)
//   ├── MetricsFilters.tsx (filter controls)
//   ├── MetricDetailModal.tsx (detail view)
//   ├── MetricChartsModal.tsx (charts view)
//   └── MetricEditModal.tsx (create/edit form)

// Use React.lazy for route-based code splitting
const MetricsAdmin = React.lazy(() => import('./components/MetricsAdmin'));
const CityView = React.lazy(() => import('./components/CityView'));
const ChatView = React.lazy(() => import('./components/ChatView'));
```

**Expected Impact**: 
- **40-60% faster** initial page load
- **30-50% smaller** initial bundle size
- Better code maintainability

**Files to Modify**:
- `src/components/MetricsAdmin.tsx` → Split into 6+ smaller components
- `src/components/CityDataAdmin.tsx` (2,112 lines) → Split into modules
- `src/app/page.tsx` → Add route-based code splitting

---

### 2. **React Query for API Caching** (High Impact)

**Problem**: Manual caching in `apiClient.ts` is limited:
- Only caches city data and saved cities
- No automatic request deduplication
- No background refetching
- No cache invalidation strategy

**Solution**:
```bash
npm install @tanstack/react-query
```

```typescript
// src/lib/queryClient.ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 1,
    },
  },
});

// src/lib/hooks/useMetrics.ts
import { useQuery } from '@tanstack/react-query';
import { listAdminMetrics } from '@/lib/apiClient';

export function useMetrics(filters: MetricFilters, token: string) {
  return useQuery({
    queryKey: ['metrics', filters],
    queryFn: () => listAdminMetrics(token, filters),
    enabled: !!token,
    staleTime: 2 * 60 * 1000, // 2 minutes for metrics
  });
}
```

**Expected Impact**:
- **70-90% reduction** in duplicate API calls
- **Instant loading** for cached data
- Automatic background updates
- Better error handling and retry logic

**Files to Modify**:
- `src/lib/apiClient.ts` → Wrap with React Query hooks
- `src/app/layout.tsx` → Add QueryClientProvider
- All components using API calls → Migrate to React Query hooks

---

### 3. **Virtual Scrolling for Large Lists** (Medium Impact)

**Problem**: Large tables render all rows at once:
- `MetricsAdmin.tsx` renders 100+ metrics
- `CityDataTable.tsx` renders potentially hundreds of cities
- `DatasetsList.tsx` renders many datasets
- Causes slow rendering and scroll lag

**Solution**:
```bash
npm install react-window
```

```typescript
// src/components/MetricsTable.tsx
import { FixedSizeList } from 'react-window';

function MetricsTable({ metrics }: { metrics: Metric[] }) {
  const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => (
    <div style={style}>
      <MetricRow metric={metrics[index]} />
    </div>
  );

  return (
    <FixedSizeList
      height={600}
      itemCount={metrics.length}
      itemSize={60}
      width="100%"
    >
      {Row}
    </FixedSizeList>
  );
}
```

**Expected Impact**:
- **80-95% reduction** in DOM nodes
- **Smooth scrolling** even with 1000+ items
- **Faster initial render** (only visible items)

**Files to Modify**:
- `src/components/MetricsAdmin.tsx` → Virtualize metrics table
- `src/components/CityDataTable.tsx` → Virtualize city list
- `src/components/DatasetsList.tsx` → Virtualize datasets table

---

### 4. **React.memo Optimization** (Medium Impact)

**Problem**: Components re-render unnecessarily when parent state changes

**Solution**:
```typescript
// Already using useMemo/useCallback in some places, but need more
// src/components/MetricsAdmin.tsx

// Memoize expensive components
const MetricRow = React.memo(({ metric }: { metric: Metric }) => {
  // Component implementation
}, (prevProps, nextProps) => {
  // Custom comparison - only re-render if metric data changed
  return prevProps.metric.id === nextProps.metric.id &&
         prevProps.metric.last_execution_at === nextProps.metric.last_execution_at;
});

const FiltersPanel = React.memo(({ filters, onChange }: FiltersProps) => {
  // Filter controls
});
```

**Expected Impact**:
- **50-70% reduction** in unnecessary re-renders
- Smoother UI interactions

**Files to Modify**:
- All table row components
- Filter components
- Modal components

---

### 5. **Image Optimization** (Low-Medium Impact)

**Problem**: No image optimization configured in Next.js

**Solution**:
```typescript
// next.config.ts
const nextConfig: NextConfig = {
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60,
  },
  // ... existing config
};
```

**Expected Impact**:
- **30-50% smaller** image file sizes
- Faster image loading

---

### 6. **Bundle Size Optimization** (Medium Impact)

**Problem**: Large bundle size affects initial load time

**Solution**:
```bash
# Analyze bundle size
npm install --save-dev @next/bundle-analyzer
```

```typescript
// next.config.ts
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

module.exports = withBundleAnalyzer(nextConfig);
```

**Actions**:
1. Tree-shake unused dependencies
2. Use dynamic imports for heavy libraries (Mapbox, Chart libraries)
3. Remove unused Font Awesome icons (use tree-shaking)
4. Consider replacing heavy dependencies with lighter alternatives

**Expected Impact**:
- **20-40% smaller** bundle size
- **Faster initial load**

---

## 🔧 Backend Optimizations

### 7. **Response Compression** (High Impact)

**Problem**: Large JSON responses not compressed

**Solution**:
```python
# src/transparentcity/api/main.py
from fastapi.middleware.gzip import GZipMiddleware

app = FastAPI()
app.add_middleware(GZipMiddleware, minimum_size=1000)  # Compress responses > 1KB
```

**Expected Impact**:
- **60-80% reduction** in response sizes
- **3-4x faster** network transfer

---

### 8. **Redis Caching Layer** (High Impact)

**Problem**: No distributed caching for frequently accessed data

**Solution**:
```python
# src/transparentcity/core/cache.py
import redis
import json
from typing import Optional, Any
from functools import wraps

redis_client = redis.from_url(os.getenv('REDIS_URL', 'redis://localhost:6379'))

def cache_result(ttl: int = 300, key_prefix: str = ""):
    """Decorator to cache function results in Redis."""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Generate cache key
            cache_key = f"{key_prefix}:{func.__name__}:{hash(str(args) + str(kwargs))}"
            
            # Try to get from cache
            cached = redis_client.get(cache_key)
            if cached:
                return json.loads(cached)
            
            # Execute function
            result = await func(*args, **kwargs)
            
            # Cache result
            redis_client.setex(cache_key, ttl, json.dumps(result, default=str))
            
            return result
        return wrapper
    return decorator

# Usage in routes
@router.get("/metrics/")
@cache_result(ttl=300, key_prefix="metrics")
async def list_metrics(...):
    # Expensive database query
    pass
```

**Expected Impact**:
- **80-95% faster** for cached endpoints
- Reduced database load
- Better scalability

**Files to Modify**:
- `src/transparentcity/api/routes/metrics_admin.py` → Add caching
- `src/transparentcity/api/routes/cities.py` → Add caching
- `src/transparentcity/api/routes/chat.py` → Add caching for session lists

---

### 9. **Database Query Optimization** (High Impact)

**Problem**: Some queries may not be optimized

**Solution**:
```python
# Add database indexes for common queries
# scripts/migrations/add_performance_indexes.sql

-- Metrics queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_metrics_city_active 
ON metrics (city_id, is_active) WHERE is_active = TRUE;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_metrics_category_active 
ON metrics (category, is_active) WHERE is_active = TRUE;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_metrics_search 
ON metrics USING gin(to_tsvector('english', metric_name || ' ' || COALESCE(metric_key, '')));

-- Time series queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_time_series_metric_period 
ON time_series_data (metric_id, period_type, time_period);

-- Map data queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_map_data_metric_date 
ON map_data (metric_id, date_field);
```

**Expected Impact**:
- **5-10x faster** database queries
- Better performance under load

---

### 10. **Pagination Improvements** (Medium Impact)

**Problem**: Some endpoints return too much data at once

**Solution**:
```python
# Ensure all list endpoints use proper pagination
@router.get("/metrics/")
async def list_metrics(
    limit: int = Query(50, ge=1, le=200),  # Reduced from 100
    offset: int = Query(0, ge=0),
    ...
):
    # Use cursor-based pagination for better performance
    # Return total count separately if needed
    pass
```

**Expected Impact**:
- **Faster response times** for list endpoints
- Reduced memory usage

---

### 11. **Connection Pool Tuning** (Already Optimized ✅)

**Current**: Pool size 20, max overflow 40 - Good!

**Monitor**: Track pool utilization and adjust if needed

---

## 🌐 Network Optimizations

### 12. **HTTP/2 Server Push** (Low-Medium Impact)

**Problem**: Sequential resource loading

**Solution**: Configure server to push critical resources

**Expected Impact**:
- **10-20% faster** initial page load

---

### 13. **CDN for Static Assets** (Medium Impact)

**Problem**: Static assets served from application server

**Solution**: 
- Use Vercel's CDN (already using Vercel)
- Or configure CloudFlare/CDN for API static assets

**Expected Impact**:
- **50-70% faster** asset loading globally
- Reduced server load

---

### 14. **API Response Caching Headers** (Medium Impact)

**Problem**: No HTTP caching headers for API responses

**Solution**:
```python
from fastapi import Response

@router.get("/metrics/")
async def list_metrics(response: Response, ...):
    # Add cache headers for public data
    response.headers["Cache-Control"] = "public, max-age=300"  # 5 minutes
    # Or for user-specific data
    response.headers["Cache-Control"] = "private, max-age=60"  # 1 minute
    return data
```

**Expected Impact**:
- **Browser caching** reduces API calls
- Faster subsequent loads

---

## 📊 Database Optimizations

### 15. **Query Analysis & Optimization** (High Impact)

**Problem**: May have slow queries not identified

**Solution**:
```sql
-- Enable query logging
ALTER DATABASE transparentcity SET log_min_duration_statement = 100;  -- Log queries > 100ms

-- Analyze slow queries
SELECT 
    query,
    calls,
    total_exec_time,
    mean_exec_time,
    max_exec_time
FROM pg_stat_statements
WHERE mean_exec_time > 100
ORDER BY mean_exec_time DESC
LIMIT 20;
```

**Actions**:
1. Identify slow queries
2. Add indexes for slow queries
3. Optimize query structure
4. Consider materialized views for complex aggregations

---

### 16. **Database Connection Monitoring** (Medium Impact)

**Solution**:
```python
# Add connection pool monitoring
from sqlalchemy import event
from sqlalchemy.pool import Pool

@event.listens_for(Pool, "connect")
def receive_connect(dbapi_conn, connection_record):
    logger.debug("New database connection established")

@event.listens_for(Pool, "checkout")
def receive_checkout(dbapi_conn, connection_record, connection_proxy):
    logger.debug("Connection checked out from pool")
```

**Expected Impact**:
- Better visibility into connection usage
- Identify connection leaks

---

## 🎨 UI/UX Performance

### 17. **Optimistic UI Updates** (High Impact - UX)

**Problem**: Users wait for API responses before seeing changes

**Solution**:
```typescript
// Already implemented in some places, expand to all mutations
const deleteMetric = async (metricId: number) => {
  // Optimistically remove from UI
  setMetrics(prev => prev.filter(m => m.id !== metricId));
  
  try {
    await deleteAdminMetric(metricId, token);
    // Success - UI already updated
  } catch (err) {
    // Rollback on error
    await loadMetrics(true);
    alert('Failed to delete metric');
  }
};
```

**Expected Impact**:
- **Perceived 90% faster** user interactions
- Better user experience

---

### 18. **Loading States & Skeleton Screens** (Medium Impact - UX)

**Problem**: Blank screens during loading

**Solution**: Add skeleton loaders for better perceived performance

**Expected Impact**:
- Better perceived performance
- Reduced user confusion

---

## 📈 Monitoring & Measurement

### 19. **Performance Monitoring** (High Priority)

**Solution**:
```typescript
// Add Web Vitals tracking
// src/lib/analytics.ts
import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'web-vitals';

function sendToAnalytics(metric: any) {
  // Send to your analytics service
  console.log(metric);
}

getCLS(sendToAnalytics);
getFID(sendToAnalytics);
getFCP(sendToAnalytics);
getLCP(sendToAnalytics);
getTTFB(sendToAnalytics);
```

**Metrics to Track**:
- Time to First Byte (TTFB)
- First Contentful Paint (FCP)
- Largest Contentful Paint (LCP)
- Cumulative Layout Shift (CLS)
- First Input Delay (FID)

---

## 🚀 Implementation Priority

### Phase 1: Quick Wins (1-2 weeks)
1. ✅ Response compression (Backend)
2. ✅ React Query integration (Frontend)
3. ✅ Component splitting for MetricsAdmin (Frontend)
4. ✅ Virtual scrolling for large tables (Frontend)
5. ✅ Database indexes (Backend)

**Expected Impact**: 50-70% performance improvement

### Phase 2: Medium Effort (2-4 weeks)
6. Redis caching layer (Backend)
7. API response caching headers (Backend)
8. Bundle size optimization (Frontend)
9. Query optimization analysis (Backend)
10. Optimistic UI updates (Frontend)

**Expected Impact**: Additional 20-30% improvement

### Phase 3: Long-term (1-2 months)
11. CDN configuration
12. Advanced monitoring
13. Database read replicas (if needed)
14. Service worker for offline support

**Expected Impact**: Additional 10-20% improvement + scalability

---

## 📝 Testing Recommendations

### Before/After Metrics

1. **Initial Load Time**
   - Before: Measure current time
   - Target: < 2 seconds

2. **Time to Interactive**
   - Before: Measure current time
   - Target: < 3 seconds

3. **API Response Times**
   - Before: Measure p50, p95, p99
   - Target: p95 < 200ms

4. **Bundle Size**
   - Before: Measure current size
   - Target: < 500KB initial bundle

5. **Database Query Times**
   - Before: Log slow queries
   - Target: All queries < 100ms

---

## 🔍 Tools for Analysis

1. **Frontend**:
   - Chrome DevTools Performance tab
   - React DevTools Profiler
   - Lighthouse
   - Bundle Analyzer

2. **Backend**:
   - FastAPI middleware for request timing
   - PostgreSQL `pg_stat_statements`
   - Redis monitoring
   - APM tools (Sentry, DataDog)

3. **Network**:
   - Chrome DevTools Network tab
   - WebPageTest
   - GTmetrix

---

## 📚 Additional Resources

- [Next.js Performance](https://nextjs.org/docs/advanced-features/measuring-performance)
- [React Query Best Practices](https://tanstack.com/query/latest/docs/react/guides/important-defaults)
- [FastAPI Performance](https://fastapi.tiangolo.com/advanced/performance/)
- [PostgreSQL Performance Tuning](https://www.postgresql.org/docs/current/performance-tips.html)

---

## ✅ Summary

By implementing these optimizations, you can expect:

- **50-80% faster** initial page loads
- **70-90% reduction** in API calls (via caching)
- **5-10x faster** database queries (via indexes)
- **60-80% smaller** network payloads (via compression)
- **Smoother UI** interactions (via virtualization and memoization)
- **Better scalability** (via Redis caching and connection pooling)

**Total Estimated Impact**: 3-5x overall performance improvement






