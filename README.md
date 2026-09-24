# Decor Areas Studio

Production Pinterest content-publishing SaaS using Pinterest API v5 Standard access.

## Implemented
- Pinterest OAuth Authorization Code flow
- production Pin creation and authorized organic analytics
- creator/business accounts with secure server-side sessions
- persistent scheduler queue with a hard 30-minute minimum gap between scheduled Pins
- explicit per-Pin approval before anything can enter the scheduler
- background publishing worker with Pinterest token refresh
- blog/article URL import using public Open Graph metadata
- Stripe subscription checkout hooks for Starter / Pro / Agency plans
- visual analytics dashboard, scheduler timeline, content workflow and integration status
- Sandbox remains available for isolated testing

## Required production environment variables
Existing Pinterest variables:
- PINTEREST_APP_ID
- PINTEREST_APP_SECRET
- APP_ORIGIN

New SaaS variables:
- DATABASE_URL
- CRON_SECRET
- TOKEN_ENCRYPTION_KEY (recommended; otherwise PINTEREST_APP_SECRET is used)
- STRIPE_SECRET_KEY
- STRIPE_PRICE_STARTER
- STRIPE_PRICE_PRO
- STRIPE_PRICE_AGENCY

The app remains usable for immediate Pinterest publishing without the SaaS variables. Account sign-up, paid plans, durable scheduling, and background publishing activate once their corresponding services are configured.

## Pinterest policy guardrails
Scheduled publishing requires the end user to review and approve each individual Pin. The product does not scrape Pinterest, automate engagement, provide unauthorized competitor research/benchmarking, combine unrelated users' Pinterest data, or train AI models on Pinterest API data.
