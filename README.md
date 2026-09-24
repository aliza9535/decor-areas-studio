# Decor Areas Studio

Production Pinterest publishing and organic analytics workspace using Pinterest API v5 with Standard access.

## Current production features
- Pinterest OAuth Authorization Code connection
- encrypted access and continuous refresh-token handling in Secure, HttpOnly, SameSite cookies
- live authorized-account organic analytics
- live Board listing and explicit Board creation
- live Pin library fetched on demand
- user-confirmed production image Pin publishing
- explicit single-Pin deletion
- browser-local drafts and planning queue (no unattended publishing)
- Blog → Pin copy preparation using only user-provided content
- browser-side 2:3 Pin image designer
- separate Pinterest Sandbox connection for testing

## Policy invariants
- no Pinterest scraping
- no competitor research, benchmarking or cross-account aggregation
- no hidden or unreviewed Pinterest actions
- no Pinterest password or session-cookie collection
- no selling Pinterest API data
- no use of Pinterest API-derived data to train/fine-tune/improve AI models
- Pinterest API-derived account data is fetched on demand and is not persisted in a server database by this build

## Next infrastructure milestone
A reliable unattended scheduler, multi-user account system, team collaboration and billing require a durable server datastore plus background jobs. Those features are intentionally not faked with browser-only timers.
