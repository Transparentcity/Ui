# Monitoring and Error Tracking Setup

## Overview

This guide covers setting up monitoring, error tracking, and performance monitoring for the production deployment.

## Monitoring Options

### Option 1: Vercel Analytics (Built-in)

**Pros**:
- Free with Vercel Pro
- Zero configuration
- Integrated with Vercel dashboard
- Web Vitals tracking

**Setup**:
1. Go to Vercel Dashboard → Project → Settings → Analytics
2. Enable "Web Analytics"
3. Analytics appear in Analytics tab

**Metrics Tracked**:
- Page views
- Unique visitors
- Performance metrics
- Web Vitals (LCP, FID, CLS)

### Option 2: Sentry (Recommended for Error Tracking)

**Pros**:
- Comprehensive error tracking
- Source maps support
- Performance monitoring
- Release tracking
- Free tier available

**Setup**:

1. **Create Sentry Account**
   - Go to https://sentry.io/signup/
   - Create account and project
   - Select "Next.js" as platform

2. **Install Sentry SDK**
   ```bash
   npm install @sentry/nextjs
   ```

3. **Initialize Sentry**
   ```bash
   npx @sentry/wizard@latest -i nextjs
   ```
   
   This creates:
   - `sentry.client.config.ts`
   - `sentry.server.config.ts`
   - `sentry.edge.config.ts`
   - Updates `next.config.ts`

4. **Configure Environment Variables**
   
   In Vercel dashboard, add:
   ```
   SENTRY_DSN=https://your-dsn@sentry.io/project-id
   SENTRY_ORG=your-org
   SENTRY_PROJECT=your-project
   SENTRY_AUTH_TOKEN=your-auth-token
   ```

5. **Verify Setup**
   - Deploy to Vercel
   - Trigger a test error
   - Check Sentry dashboard for error

### Option 3: LogRocket (Session Replay)

**Pros**:
- Session replay
- Error tracking
- Performance monitoring
- User behavior analytics

**Setup**:

1. **Create LogRocket Account**
   - Go to https://logrocket.com/
   - Sign up and create project

2. **Install LogRocket**
   ```bash
   npm install logrocket
   ```

3. **Initialize LogRocket**
   
   Create `lib/logrocket.ts`:
   ```typescript
   import LogRocket from 'logrocket';
   
   if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_LOGROCKET_APP_ID) {
     LogRocket.init(process.env.NEXT_PUBLIC_LOGROCKET_APP_ID);
   }
   
   export default LogRocket;
   ```

4. **Add to App**
   
   In `app/layout.tsx` or `_app.tsx`:
   ```typescript
   import LogRocket from '@/lib/logrocket';
   ```

5. **Configure Environment Variable**
   ```
   NEXT_PUBLIC_LOGROCKET_APP_ID=your-app-id
   ```

### Option 4: Custom Analytics (Google Analytics, Plausible, etc.)

**Google Analytics**:

1. **Create GA4 Property**
   - Go to https://analytics.google.com/
   - Create new property

2. **Install GA4**
   ```bash
   npm install @next/third-parties
   ```

3. **Add to Layout**
   ```typescript
   import { GoogleAnalytics } from '@next/third-parties/google'
   
   export default function RootLayout({ children }) {
     return (
       <html>
         <body>
           {children}
           <GoogleAnalytics gaId="G-XXXXXXXXXX" />
         </body>
       </html>
     )
   }
   ```

**Plausible Analytics** (Privacy-friendly):

1. **Sign up** at https://plausible.io/
2. **Add Script** to `app/layout.tsx`:
   ```typescript
   <script
     defer
     data-domain="app.transparent.city"
     src="https://plausible.io/js/script.js"
   />
   ```

## Recommended Setup

### Minimal Setup (Free)

- **Vercel Analytics**: Built-in, free with Pro plan
- **Sentry Free Tier**: 5,000 events/month

### Production Setup (Recommended)

- **Vercel Analytics**: Web Vitals and basic metrics
- **Sentry**: Error tracking and performance
- **Custom Analytics**: Google Analytics or Plausible

## Implementation Steps

### Step 1: Enable Vercel Analytics

1. Go to Vercel Dashboard → Project → Settings → Analytics
2. Enable "Web Analytics"
3. No code changes needed

### Step 2: Set Up Sentry

1. **Install Dependencies**
   ```bash
   cd transparentcity-ui
   npm install @sentry/nextjs
   ```

2. **Run Sentry Wizard**
   ```bash
   npx @sentry/wizard@latest -i nextjs
   ```

3. **Configure Environment Variables in Vercel**
   - Go to Project Settings → Environment Variables
   - Add Sentry DSN and configuration
   - Apply to Production, Preview, Development

4. **Test Error Tracking**
   - Add test error in development
   - Verify it appears in Sentry dashboard

### Step 3: Set Up Performance Monitoring

**Sentry Performance**:
- Automatically tracks API calls
- Monitors page load times
- Tracks transaction performance

**Vercel Speed Insights**:
1. Go to Project Settings → Speed Insights
2. Enable Speed Insights
3. View metrics in Analytics tab

## Monitoring Checklist

After setup, verify:

- [ ] Vercel Analytics enabled and tracking
- [ ] Sentry error tracking configured
- [ ] Error notifications set up (email/Slack)
- [ ] Performance monitoring active
- [ ] Source maps uploaded (for Sentry)
- [ ] Release tracking configured
- [ ] Alerts configured for critical errors

## Alert Configuration

### Sentry Alerts

1. **Go to Sentry Dashboard → Alerts**
2. **Create Alert Rules**:
   - Error rate threshold
   - New issue alerts
   - Performance degradation

3. **Configure Notifications**:
   - Email notifications
   - Slack integration
   - PagerDuty (if needed)

### Vercel Alerts

1. **Go to Vercel Dashboard → Settings → Notifications**
2. **Configure**:
   - Deployment notifications
   - Error notifications
   - Performance alerts

## Monitoring Best Practices

### Error Tracking

1. **Capture All Errors**
   - JavaScript errors
   - API errors
   - Unhandled promise rejections

2. **Add Context**
   - User information
   - Request details
   - Environment information

3. **Filter Noise**
   - Ignore known errors
   - Set up error grouping
   - Configure error sampling

### Performance Monitoring

1. **Track Key Metrics**:
   - Page load time
   - API response times
   - WebSocket connection time
   - Time to first byte (TTFB)

2. **Set Performance Budgets**:
   - Target page load < 2s
   - API calls < 1s
   - WebSocket connect < 500ms

3. **Monitor Trends**:
   - Track performance over time
   - Identify regressions
   - Monitor user experience

### User Monitoring

1. **Track User Flows**:
   - Authentication flow
   - Key user actions
   - Error-prone paths

2. **Monitor User Experience**:
   - Session duration
   - Bounce rate
   - Conversion funnels

## Dashboard Setup

### Vercel Dashboard

- **Deployments**: Monitor deployment status
- **Analytics**: View traffic and performance
- **Logs**: Check function logs
- **Speed Insights**: Performance metrics

### Sentry Dashboard

- **Issues**: Error tracking and resolution
- **Performance**: Transaction monitoring
- **Releases**: Track deployments
- **Alerts**: Configure notifications

## Logging Strategy

### Frontend Logging

```typescript
// Use console for development
if (process.env.NODE_ENV === 'development') {
  console.log('Debug info');
}

// Use Sentry for production
import * as Sentry from '@sentry/nextjs';

Sentry.captureException(error, {
  tags: { component: 'CityView' },
  extra: { cityId, userId }
});
```

### Backend Logging

Backend already has logging configured. Ensure:
- Logs are accessible
- Error logs are monitored
- Performance logs are tracked

## Cost Estimates

### Free Tier

- **Vercel Analytics**: Free with Pro plan
- **Sentry**: 5,000 events/month free
- **Total**: $0 (if within free tiers)

### Paid Tier

- **Vercel Pro**: $20/month (includes analytics)
- **Sentry Team**: $26/month (50K events)
- **LogRocket**: $99/month (1,000 sessions)
- **Total**: ~$46-145/month depending on usage

## Maintenance

### Regular Tasks

1. **Weekly**:
   - Review error reports
   - Check performance metrics
   - Review user feedback

2. **Monthly**:
   - Analyze trends
   - Optimize based on data
   - Update monitoring configuration

3. **Quarterly**:
   - Review monitoring costs
   - Evaluate new tools
   - Update alert thresholds

## Troubleshooting

### Sentry Not Capturing Errors

**Solutions**:
1. Verify DSN is correct
2. Check environment variables are set
3. Verify Sentry SDK is initialized
4. Check browser console for Sentry errors

### Performance Metrics Missing

**Solutions**:
1. Verify Speed Insights is enabled
2. Check Vercel Analytics is active
3. Ensure sufficient traffic for metrics
4. Check configuration in Vercel dashboard

## Next Steps

After setting up monitoring:

1. [ ] Configure alert thresholds
2. [ ] Set up notification channels
3. [ ] Create monitoring dashboard
4. [ ] Document monitoring procedures
5. [ ] Train team on monitoring tools
6. [ ] Set up regular review process

## Resources

- **Vercel Analytics**: https://vercel.com/docs/analytics
- **Sentry Next.js**: https://docs.sentry.io/platforms/javascript/guides/nextjs/
- **LogRocket**: https://docs.logrocket.com/docs/nextjs
- **Google Analytics**: https://developers.google.com/analytics

