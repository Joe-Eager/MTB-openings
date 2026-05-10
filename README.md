# MTB-openings

Live trail status page for mountain bike trails around Cleveland, Ohio. Shows open/closed/caution status sourced from Cleveland Metroparks and Bluesky, with static links for trails that don't publish live data.

## What it does

- Scrapes live status from [Cleveland Metroparks](https://www.clevelandmetroparks.com/parks/visit/activities/mountain-biking/trail-status)
- Pulls latest post from Bluesky accounts that post trail conditions (e.g. Summit Metro Parks)
- Shows static link cards for trails without live data sources
- Caches all data for 5 minutes
- Dark mode support

## Prerequisites

- [Node.js](https://nodejs.org/) v20+
- [Yarn](https://yarnpkg.com/)

## Running locally

```bash
yarn install
yarn dev
```

This starts both the Express scraper server (port 3000) and the Vite dev server (port 5173) together. Open `http://localhost:5173`.

## Deploying to a server

Build and serve with the included Express server:

```bash
yarn build
node server.mjs
```

The server serves the built frontend and the `/api/trails` endpoint on port 3000. Set the `PORT` environment variable to change it.

For a persistent deployment (e.g. a Raspberry Pi), use the included systemd service approach:

1. Copy files to the server (excluding `node_modules`, `src`, `.git`)
2. Run `yarn install` on the server
3. Create a systemd service that runs `node server.mjs`

## Adding trails

- **Cleveland Metroparks trails**: add an entry to `TRAIL_META` in `server.mjs` matching the trail name exactly as it appears on the Metroparks status page
- **Bluesky accounts**: add an entry to `BSKY_ACCOUNTS` in `server.mjs`
- **Static link cards**: add an entry to `STATIC_TRAILS` in `server.mjs`

## License

MIT
