# React Query Implementation Summary

## ✅ What Was Implemented

### 1. **Package Installation**
- Installed `@tanstack/react-query` (v5)
- Installed `@tanstack/react-query-devtools` for development debugging

### 2. **QueryClient Setup**
- Created `src/lib/queryClient.ts` with optimized default configuration:
  - `staleTime`: 5 minutes (data considered fresh)
  - `gcTime`: 10 minutes (cache retention)
  - `refetchOnWindowFocus`: false (prevents unnecessary refetches)
  - `refetchOnReconnect`: true (refetch on network reconnect)
  - `retry`: 1 (retry failed requests once)

### 3. **Provider Integration**
- Updated `src/app/providers.tsx` to include `QueryClientProvider`
- Added React Query DevTools (only in development mode)
- Wrapped the app with QueryClientProvider inside AuthProvider

### 4. **Custom Hooks Created**

#### **Metrics Hooks** (`src/lib/hooks/useMetrics.ts`)
- `useMetrics(options)` - Fetch filtered list of metrics
- `useMetric(metricId)` - Fetch single metric
- `useMetricsSummary()` - Fetch metrics summary/stats
- `useMetricCategories()` - Fetch metric categories
- `useMetricTypes()` - Fetch metric types
- `useMetricCities()` - Fetch cities for metrics
- `useMetricTimeSeries(metricId)` - Fetch time series data
- `useMetricTimeSeriesDetail(metricId, chartId)` - Fetch chart detail
- `useMetricCityStructure(metricId)` - Fetch city structure
- `useCreateMetric()` - Create new metric (mutation)
- `useUpdateMetric()` - Update metric (mutation)
- `useDeleteMetric()` - Delete metric (mutation)
- `useExecuteMetric()` - Execute metric (mutation)
- `useValidateMetricFreshness()` - Validate freshness (mutation)

#### **Cities Hooks** (`src/lib/hooks/useCities.ts`)
- `useCity(cityId)` - Fetch single city
- `useCities(options)` - Fetch list of cities
- `useSavedCities()` - Fetch saved cities
- `useCityStructure(cityId)` - Fetch city structure
- `useCityLeaders(cityId)` - Fetch city leaders
- `useCityShapefiles(cityId)` - Fetch shapefiles
- `useCityShapeLayers(cityId, includeGeometry)` - Fetch shape layers

### 5. **Component Migration**
- **MetricsAdmin.tsx** fully migrated to use React Query hooks
  - Removed manual state management for API data
  - Removed manual loading/error states
  - Replaced API calls with React Query hooks
  - Updated mutations to use React Query mutation hooks
  - Automatic cache invalidation on mutations

## 🎯 Benefits

### **Performance Improvements**
1. **Automatic Caching**: API responses are cached automatically
   - Metrics list: 2 minutes cache
   - City data: 5 minutes cache
   - Categories/Types: 10 minutes cache

2. **Request Deduplication**: Multiple components requesting the same data will share a single request

3. **Background Refetching**: Data stays fresh automatically

4. **Optimistic Updates**: Mutations can update UI immediately

### **Developer Experience**
1. **Less Boilerplate**: No need to manage loading/error states manually
2. **Type Safety**: Full TypeScript support
3. **DevTools**: Visual debugging of queries and cache
4. **Automatic Refetching**: Smart refetching on window focus, reconnect, etc.

## 📖 Usage Examples

### **Basic Query Hook**
```typescript
import { useMetrics } from "@/lib/hooks/useMetrics";

function MyComponent() {
  const { data, isLoading, error } = useMetrics({
    category: "Public Safety",
    is_active: true,
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return <div>{data?.length} metrics found</div>;
}
```

### **Mutation Hook**
```typescript
import { useDeleteMetric } from "@/lib/hooks/useMetrics";

function DeleteButton({ metricId }: { metricId: number }) {
  const deleteMutation = useDeleteMetric();

  const handleDelete = () => {
    if (confirm("Delete this metric?")) {
      deleteMutation.mutate(metricId, {
        onSuccess: () => {
          alert("Metric deleted!");
        },
        onError: (error) => {
          alert(`Error: ${error.message}`);
        },
      });
    }
  };

  return (
    <button onClick={handleDelete} disabled={deleteMutation.isPending}>
      {deleteMutation.isPending ? "Deleting..." : "Delete"}
    </button>
  );
}
```

### **Conditional Queries**
```typescript
import { useMetric } from "@/lib/hooks/useMetrics";

function MetricDetail({ metricId }: { metricId: number | null }) {
  // Query only runs when metricId is not null
  const { data: metric, isLoading } = useMetric(metricId);

  if (!metricId) return <div>Select a metric</div>;
  if (isLoading) return <div>Loading...</div>;

  return <div>{metric?.metric_name}</div>;
}
```

## 🔄 Cache Invalidation

React Query automatically invalidates related queries when mutations succeed:

- **Create Metric**: Invalidates metrics list and summary
- **Update Metric**: Invalidates the specific metric and list
- **Delete Metric**: Invalidates metrics list and summary
- **Execute Metric**: Invalidates the metric and its time series

## 🛠️ DevTools

In development mode, you can access React Query DevTools:
- Press `Ctrl+Shift+J` (or `Cmd+Shift+J` on Mac) to open
- Or look for the React Query icon in the bottom-right corner
- View all queries, their status, cache, and refetch manually

## 📝 Next Steps

### **Recommended Migrations**
1. **CityView.tsx** - Migrate to use `useCity`, `useCityStructure` hooks
2. **CityMapView.tsx** - Migrate to use city-related hooks
3. **DatasetsList.tsx** - Create hooks for dataset queries
4. **ChatView.tsx** - Create hooks for chat/session queries

### **Additional Optimizations**
1. **Prefetching**: Use `queryClient.prefetchQuery()` for hover prefetching
2. **Optimistic Updates**: Add optimistic updates for better UX
3. **Infinite Queries**: Use `useInfiniteQuery` for paginated lists
4. **Parallel Queries**: Use `useQueries` for multiple independent queries

## 🐛 Troubleshooting

### **Query Not Refetching**
- Check `staleTime` - queries won't refetch if data is still fresh
- Use `refetch()` manually: `query.refetch()`
- Invalidate query: `queryClient.invalidateQueries({ queryKey: ['metrics'] })`

### **Cache Not Updating**
- Mutations should automatically invalidate related queries
- Check mutation `onSuccess` callbacks
- Manually invalidate: `queryClient.invalidateQueries({ queryKey: ['metrics'] })`

### **TypeScript Errors**
- Ensure all API response types are exported from `apiClient.ts`
- Check hook return types match expected data structure

## 📚 Resources

- [React Query Documentation](https://tanstack.com/query/latest)
- [React Query DevTools](https://tanstack.com/query/latest/docs/react/devtools)
- [Query Keys Best Practices](https://tkdodo.eu/blog/effective-react-query-keys)





