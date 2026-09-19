# Decor Areas Studio — Pinterest Standard access application

## Product scope for this application
Decor Areas Studio is an independent content publishing and analytics tool for creators and businesses. Users connect only their own authorized Pinterest accounts through Pinterest OAuth.

Current demonstrated features:
- OAuth Authorization Code connection using minimum scopes needed for each environment
- authorized account information
- authorized organic analytics
- Board selection
- user-selected image/title/description/alt text
- explicit user-confirmed Pin publishing in Pinterest Sandbox during Trial

Not part of this Standard application:
- competitor research or benchmarking
- public-account intelligence
- scraping or automated extraction
- automatic Pinterest actions without item-level user selection
- ads, catalogs or ecommerce
- AI training using Pinterest API data
- claims of Pinterest partnership
- scheduling until a real scheduler is built

## Exact Standard upgrade description
Decor Areas Studio is an independent content publishing and analytics application for creators and businesses. Users connect their own Pinterest accounts through Pinterest's OAuth Authorization Code flow. Authorized users can view organic analytics for their own account, select a Board, prepare content, and explicitly confirm each Pin they choose to publish. The application uses the Pinterest API, does not collect Pinterest passwords or Pinterest session cookies, does not scrape Pinterest, and does not provide competitor research, benchmarking or cross-account data aggregation. Pinterest API-derived account and analytics data is fetched on demand for the authorized user.

## Application selections
Developer purpose:
- Consumer experience (business, merchant, customers, or users at scale)

Use cases:
- Pin creation & scheduling
- Reporting
- Pinner App

Audience:
- Pinners
- Creators
- Businesses

Reads Pins and/or Boards Data:
- Yes, mine

## Canonical URLs
Website:
https://studio.decorareas.com

Privacy:
https://studio.decorareas.com/privacy/

Terms:
https://studio.decorareas.com/terms/

Data deletion:
https://studio.decorareas.com/data-deletion/

Security:
https://studio.decorareas.com/security/

OAuth redirect URI:
https://studio.decorareas.com/api/auth/pinterest/callback

## Final demo video sequence
Target length: about 2–3 minutes.

1. Start on https://studio.decorareas.com and briefly show the independent Decor Areas Studio branding.
2. Open API Demo and show the green HTTPS and privacy checks.
3. Click Start OAuth demo.
4. Show the complete Pinterest-hosted consent screen clearly, including the app name and permissions.
5. Approve access and show the redirect back to Decor Areas Studio.
6. Open Analytics and show live organic metrics for the authorized account.
7. Open Create and show Pinterest Sandbox is connected.
8. Select the Decor Areas Studio Test board.
9. Add one image, title, description and optional alt text/destination URL.
10. Click Publish this Sandbox Pin and show the explicit confirmation prompt before approving it.
11. Show the successful Pinterest Pin ID returned by the API.
12. If convenient, open the authenticated Pinterest profile and show the Sandbox Pin created for the same account.
13. End on API Demo with all five checks green.

Do not show:
- Vercel environment variable values
- Pinterest app secret
- access or refresh tokens
- browser developer tools containing credentials
- old PinScope branding
- unrelated future features

## Reviewer-facing principles
- Official Pinterest OAuth only
- Production OAuth requests only user_accounts:read, boards:read, pins:read and pins:write; boards:write is requested only for Sandbox test-board setup
- Minimum scopes needed for the demonstrated features
- Authorized account data only
- API data fetched on demand
- No Pinterest passwords or Pinterest session cookies
- No scraping
- No competitor research or benchmarking
- No cross-account aggregation
- No Pinterest API data used for AI training
- Explicit user selection for every publishing action
- Trial writes demonstrated only in Pinterest Sandbox
- Independent branding; no claim of Pinterest partnership
