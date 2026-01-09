# Chart Migration from TransparentSF to TransparentCity

## Overview

This document describes the migration of time series and anomaly charts from server-side HTML rendering (TransparentSF) to client-side React components (TransparentCity).

## Changes Made

### 1. New React Components

#### TimeSeriesChart Component
- **Location**: `src/components/TimeSeriesChart.tsx`
- **Features**:
  - Period selector (Day, Week, Month, Year, Year-to-Date)
  - Client-side data aggregation from daily data points
  - Interactive Plotly.js charts
  - Responsive design with theme support
  - Default view: Year-to-Date (YTD)

#### AnomalyChart Component
- **Location**: `src/components/AnomalyChart.tsx`
- **Features**:
  - Displays recent vs historical data comparison
  - Normal range shading (±2 standard deviations)
  - Anomaly statistics display
  - Interactive Plotly.js charts
  - Responsive design with theme support

### 2. Integration Updates

#### MetricsAdmin Component
- **Updated**: `src/components/MetricsAdmin.tsx`
- **Changes**:
  - Replaced simple SVG sparkline with full `TimeSeriesChart` component
  - Chart displays after user selects a time series from the modal
  - Default period view: YTD

### 3. Dependencies Added

Added to `package.json`:
- `plotly.js@^2.35.2` - Core Plotly library
- `react-plotly.js@^2.6.0` - React wrapper for Plotly
- `@types/plotly.js@^2.12.29` - TypeScript definitions

## Data Flow

### Time Series Chart
1. User selects a time series from the modal in MetricsAdmin
2. `useMetricTimeSeriesDetail` hook fetches data from `/api/admin/metrics/{metric_id}/time-series/{chart_id}`
3. API returns daily data points with `time_period` and `numeric_value`
4. `TimeSeriesChart` component aggregates data client-side based on selected period
5. Chart renders with Plotly.js

### Anomaly Chart
1. Anomaly data includes `chart_data` with:
   - `dates`: Array of date strings
   - `values`: Array of numeric values
   - `periods`: Array indicating "recent" or "comparison"
2. `AnomalyChart` component processes data into separate traces
3. Chart displays with normal range shading and statistics

## Key Differences from TransparentSF

### TransparentSF Approach
- Server-side HTML templates (`time_series_chart.html`, `anomaly_chart.html`)
- Charts served as iframes embedded in React app
- Four separate chart configurations (YTD, Weekly, Monthly, Yearly)
- Period type determined at chart generation time

### TransparentCity Approach
- Client-side React components
- Data sent as JSON from API
- Single chart component with period selector
- Flexible aggregation from daily data points
- Default YTD view with ability to switch periods dynamically

## Usage Examples

### TimeSeriesChart
```tsx
import TimeSeriesChart from "@/components/TimeSeriesChart";

<TimeSeriesChart
  data={chartDetail.data}
  metadata={chartDetail.metadata}
  height={400}
  defaultPeriod="ytd"
/>
```

### AnomalyChart
```tsx
import AnomalyChart from "@/components/AnomalyChart";

<AnomalyChart
  chartData={anomaly.chart_data}
  anomaly={anomaly}
  metadata={anomaly.metadata}
  height={400}
/>
```

## Period Aggregation Logic

The `TimeSeriesChart` component aggregates daily data points as follows:

- **Day**: No aggregation, shows all daily points
- **Week**: Groups by ISO week (YYYY-WXX format)
- **Month**: Groups by month (YYYY-MM format)
- **Year**: Groups by year (YYYY format)
- **YTD**: Filters to current year, then shows daily points

Aggregation uses average values (can be configured to use sum for certain metric types).

## Styling

Both components use CSS modules and support:
- Light/dark theme via CSS variables
- Brand colors (primary: #ad35fa)
- Responsive design
- Consistent typography (IBM Plex Sans, Inter)

## Next Steps

1. **Anomaly Chart Integration**: Add AnomalyChart to appropriate views where anomalies are displayed
2. **Performance Optimization**: Consider memoization for large datasets
3. **Accessibility**: Add ARIA labels and keyboard navigation
4. **Export Functionality**: Add chart export (PNG, SVG, PDF) if needed
5. **Mobile Optimization**: Test and optimize for mobile devices

## Testing

To test the charts:
1. Navigate to Metrics Admin
2. Select a metric with time series data
3. Click "View" on a time series
4. Chart should display with YTD view by default
5. Use period selector to switch between Day, Week, Month, Year, YTD

## Notes

- Charts use dynamic imports to avoid SSR issues with Plotly
- Data aggregation happens client-side for flexibility
- Default period is YTD as requested
- Chart styling matches TransparentCity brand guidelines





