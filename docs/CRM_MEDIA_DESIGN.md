# CRM Media & Reporters Design

## Overview

Media and city staff are **unified in the prospects table**. Both are prospects with `contact_type`:
- **city_staff** – government officials (district/jurisdiction-focused)
- **media** – reporters (city-focused for geographic targeting)

When a Boston anomaly is detected, media who cover Boston can be automatically targeted via `primary_city`.

## Source Column Mapping

| Source Column    | Database Field           | Notes                             |
|------------------|--------------------------|-----------------------------------|
| Name             | `name`                   | Required                          |
| Outlet/Platform  | `outlet_platform`        | e.g., Boston Globe, NPR           |
| Title            | `title`                  | Job title                         |
| Keywords         | `prospect_keywords`      | Join table to `keywords`          |
| Email            | `email`                  |                                   |
| Phone            | `phone`                  |                                   |
| Primary Beat/Topic | `primary_beat`         | e.g., Housing, Public Safety      |
| Article Link     | `prospect_article_links` | One-to-many URLs                  |
| City             | `primary_city`           | **Key for targeting**             |
| Sub-geographies  | `sub_geographies`        | Districts, neighborhoods          |

## Database Schema (prospects table)

- `contact_type` – `'city_staff'` \| `'media'`
- City staff: `jurisdiction`, `organization`, `department`
- Media: `outlet_platform`, `primary_beat`, `primary_city`, `coverage_cities`, `sub_geographies`

### prospect_article_links

- `prospect_id`, `url`, `title`, `published_at`, `created_at`

## Geographic Targeting Logic

**Officials (prospects)**: Matched by `jurisdiction` (district, e.g., D5, District 11) and `district_label` on anomalies.

**Media**: Matched by:

1. **City** – `primary_city` or `coverage_cities` matches anomaly’s city (e.g., from API `city_name`)
2. **Sub-geographies** – optional; if anomaly has `district_label`, media with matching sub_geographies get higher relevance
3. **Keywords** – `media_keywords` overlap with `anomaly_keywords`

**Example**: Boston anomaly → target media where `primary_city = 'Boston'` OR `'Boston' = ANY(coverage_cities)`.

## Migration

```bash
node scripts/run-migration.js 008
```

## UI

- **Media** link in CRM sidebar (`/media`)
- Table: Name, Outlet/City, Contact Info, Keywords, Articles, Priority, Status
- Add/Edit dialog with all fields including article links (one URL per line)

## Next Steps (Future Work)

1. **Campaign integration** – Add media to campaigns and send_queue (e.g., `media_contact_id` nullable column)
2. **Targeting logic** – Extend send-queue/anomaly matching to include media based on city + keywords
3. **CSV import** – Media import dialog analogous to contacts
4. **City reference** – Optionally link `primary_city` to `cities` table for multi-city platform consistency
