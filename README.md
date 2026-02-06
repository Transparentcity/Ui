# TransparentCity UI

The Next.js frontend for the TransparentCity platform.

## Repository

This project is part of the TransparentCity platform:
- **Repository**: [transparentcity/ui](https://github.com/transparentcity/ui)

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3001](http://localhost:3001) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load Geist, a modern font family.

## Environment Variables

Create a `.env.local` file with:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8001  # For local development
NEXT_PUBLIC_SITE_URL=http://localhost:3001
```

For production, set `NEXT_PUBLIC_API_BASE_URL=https://api.transparent.city`.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

## Deployment

This app is designed to be deployed using Docker or Cloud Run with the `output: "standalone"` Next.js configuration.

Check out the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
