# Decor Areas Studio — Pinterest API application copy

## Trial application description
Decor Areas Studio is an independent content marketing, creative and analytics application for creators and businesses. Users connect their own Pinterest accounts using Pinterest OAuth. The application allows authorized users to view their own account information and organic analytics, prepare content, select a Board, and explicitly publish Pins they choose. Decor Areas Studio uses the official Pinterest API and does not collect Pinterest passwords or session cookies and does not scrape Pinterest.

## Standard upgrade description
Decor Areas Studio is a content marketing, creative and analytics application for creators and businesses. Users connect their own Pinterest accounts through the official OAuth Authorization Code flow. Authorized users can review organic analytics and explicitly create and publish content to Boards they control. The application does not collect Pinterest credentials, does not use session-cookie authentication, does not scrape Pinterest, and does not provide unauthorized competitor research or benchmarking.

## Demo video sequence
1. Open the live Decor Areas Studio HTTPS URL.
2. Open API Demo.
3. Click Start OAuth demo.
4. Show the complete Pinterest consent screen.
5. Approve access and return to Decor Areas Studio.
6. Open Analytics and show live authorized organic metrics.
7. Open Create and connect Pinterest Sandbox.
8. Select a Board, add one image, title and description.
9. Explicitly confirm publishing.
10. Show the returned Pinterest Pin ID.

## Do not include in the application
- competitor research
- benchmarking
- scraping
- public-account intelligence
- "maximum data" or "unlimited data"
- claims of Pinterest partnership
- scheduler until it is actually built and needed

## Required environment variables on Vercel
PINTEREST_APP_ID
PINTEREST_APP_SECRET

APP_ORIGIN is optional. If set, use the canonical live origin, for example:
https://decor-areas-studio.vercel.app

## OAuth redirect
<APP_ORIGIN>/api/auth/pinterest/callback
