# Google Analytics Setup Guide

This guide explains how to set up Google Analytics 4 (GA4) for Transparent.city to track signup funnels, user growth, traffic sources, and SEO effectiveness.

## Prerequisites

1. A Google Analytics 4 property (create one at https://analytics.google.com/)
2. Your GA4 Measurement ID (format: `G-XXXXXXXXXX`)

## Setup Steps

### 1. Get Your Google Analytics Measurement ID

1. Go to [Google Analytics](https://analytics.google.com/)
2. Select your property (or create a new one)
3. Go to **Admin** → **Data Streams**
4. Click on your web stream
5. Copy the **Measurement ID** (starts with `G-`)

### 2. Configure Environment Variable

Add the following to your `.env.local` file (or your deployment environment variables):

```bash
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

Replace `G-XXXXXXXXXX` with your actual Measurement ID.

### 3. Verify Setup

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Open your browser's developer console
3. Navigate to your site
4. Check the Network tab for requests to `google-analytics.com` or `googletagmanager.com`
5. In Google Analytics, go to **Reports** → **Realtime** to see live traffic

## What's Being Tracked

### Signup Funnel Events

- **`signup_start`**: User clicks signup button
- **`signup_click`**: User initiates Auth0 signup flow
- **`signup_complete`**: User successfully completes signup
- **`login`**: Existing user logs in
- **`onboarding_complete`**: User completes welcome/onboarding flow

### User Growth Events

- **`first_visit`**: First-time visitor to the site
- **`user_activation`**: User completes key activation action (signup, onboarding, etc.)
- **`city_saved`**: User saves their first (or any) city
- **`dashboard_view`**: User views the dashboard

### Content Engagement

- **`city_view`**: User views a city page
- **`metric_view`**: User views a metric detail page
- **`research_click`**: User clicks on a research/article
- **`chat_start`**: User starts a chat session
- **`chat_message`**: User sends a chat message

### SEO & Traffic Sources

- **`search_referral`**: User arrives from search engine with query
- **`external_referral`**: User arrives from external website
- **Page views**: Automatically tracked for all routes (including query parameters)

### Error Tracking

- **`error`**: Application errors (with location and stack trace)

## Creating Custom Reports in Google Analytics

### Signup Funnel Report

1. Go to **Explore** → **Funnel exploration**
2. Create a funnel with these steps:
   - Step 1: `signup_start`
   - Step 2: `signup_click`
   - Step 3: `signup_complete`
   - Step 4: `onboarding_complete`

### User Growth Report

1. Go to **Explore** → **Free form**
2. Add dimensions: `Event name`, `Date`
3. Add metrics: `Event count`, `Users`
4. Filter by events: `first_visit`, `user_activation`, `city_saved`

### Traffic Sources Report

1. Go to **Reports** → **Acquisition** → **Traffic acquisition**
2. View by `Session source/medium`
3. Filter by `Event name` = `search_referral` or `external_referral`

### SEO Effectiveness Report

1. Go to **Reports** → **Acquisition** → **User acquisition**
2. Add secondary dimension: `Event parameter: search_query`
3. Filter by `Event name` = `search_referral`

## Privacy Considerations

- Google Analytics respects user privacy settings (Do Not Track, etc.)
- No personally identifiable information (PII) is sent to GA
- User IDs are anonymized when possible
- Consider adding a cookie consent banner for GDPR compliance

## Troubleshooting

### Analytics Not Working

1. **Check environment variable**: Ensure `NEXT_PUBLIC_GA_MEASUREMENT_ID` is set correctly
2. **Check browser console**: Look for errors related to `gtag` or `dataLayer`
3. **Verify script loading**: Check Network tab for `gtag/js` requests
4. **Test in incognito**: Some browser extensions block analytics

### Events Not Appearing

1. **Wait 24-48 hours**: Some reports have a delay
2. **Check Realtime reports**: These show data immediately
3. **Verify event names**: Use GA Debugger extension to see events being sent
4. **Check filters**: Ensure no filters are excluding your data

### Development vs Production

- Analytics only works when `NEXT_PUBLIC_GA_MEASUREMENT_ID` is set
- In development, you can use a test GA property
- Consider using different GA properties for staging and production

## Advanced Configuration

### Custom Dimensions

You can add custom dimensions in Google Analytics to track:
- User type (resident, public-servant)
- City slug
- Metric key
- District ID

### Enhanced Ecommerce (Future)

For tracking conversions and revenue:
- Use `trackConversion()` function
- Set up enhanced ecommerce in GA4
- Track subscription events

## Support

For issues or questions:
1. Check Google Analytics documentation: https://developers.google.com/analytics
2. Review the analytics code in `src/lib/analytics.ts`
3. Check browser console for errors
