# Base Passport v2

A visually distinct Base identity project, designed to feel like a real passport instead of another wallet analytics dashboard.

## What makes v2 different from Base Journey
- Passport-book UI with multiple pages
- Identity classification: Visitor → Explorer → Resident → Base Native
- Exploration Index based on age, activity months, contacts, streaks and transactions
- Milestone "visa stamps"
- 12-month travel log
- Frequent onchain contacts / border stamps
- Basename lookup
- Background gas calculation
- Share on X + PNG export

## Backend
Uses your existing Cloudflare Worker:
https://base-journey-api.amirtrider1381.workers.dev

Expected endpoints:
- /wallet?address=0x...
- /gas?address=0x...

## Local test
Serve on:
http://localhost:8080

Do not open the site as http://[::]:8080 because your current Worker CORS allowlist does not include that origin.

## Free GitHub Pages deployment
Create a public repository named:
base-passport

Upload:
- index.html
- styles.css
- app.js
- README.md

Then Settings → Pages → Deploy from branch → main / root.

Built by @amirshonnm..
