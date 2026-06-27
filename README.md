# MTB-openings

Live trail status page for mountain bike trails around Cleveland, Ohio. Shows open/closed/caution status sourced from Cleveland Metroparks, Bluesky, CAMBA, and TrailForks, with static links for trails that don't publish live data.

## What it does

- Scrapes live status from [Cleveland Metroparks](https://www.clevelandmetroparks.com/parks/visit/activities/mountain-biking/trail-status)
- Pulls latest post from Bluesky accounts that post trail conditions (e.g. Summit Metro Parks)
- Scrapes CVNP East Rim conditions from CAMBA Trailmate
- Pulls community-reported conditions for every CAMBA-tracked trail from the [CAMBA Trailmate home page](https://dualrates.com/a/r/szz/camba/home) in one fetch, used as a fallback to refresh a trail when its primary source is missing/stale or older than the CAMBA post, and to surface trails that have no other live source
- Pulls community-reported conditions from TrailForks regions
- Shows static link cards for trails without live data sources
- Marks status stale after a week with no update
- Caches all data for 5 minutes
- Light/dark theme toggle

## Run it yourself and view it from your phone (beginner guide)

Never used a "console" or "terminal"? No problem. Follow these steps exactly. You'll run the page on one computer that stays on (call it the **host**: a desktop, an old laptop, whatever), and then view it from your phone using a free app called **Tailscale**.

> **What's a terminal?** It's a window where you type commands instead of clicking buttons.
> - **Windows:** click the Start menu, type `PowerShell`, and click "Windows PowerShell".
> - **Mac:** press `Cmd + Space`, type `Terminal`, and press Enter.
>
> When a step says "type this," you can copy the line, paste it into that window (right-click to paste on Windows), and press **Enter**. Do them one at a time and wait for each to finish.

### Part 1: Set up the host computer

1. **Install Node.js.** Go to [nodejs.org](https://nodejs.org/), download the big green "LTS" button, and run the installer. Click Next/Agree the whole way through; the defaults are fine. This is the engine that runs the page.

2. **Turn on Yarn.** Open a terminal (see the box above) and type this, then press Enter:
   ```bash
   corepack enable
   ```
   If it says nothing happened, that's normal; it worked. **If instead it says something like `corepack: command not found` or `not recognized`,** type this first, then run `corepack enable` again:
   ```bash
   npm install -g corepack
   ```
   (On Mac, if that gives a "permission denied" error, put `sudo ` in front: `sudo npm install -g corepack`, and enter your password.)

3. **Download this project.** Go to [the project page on GitHub](https://github.com/Joe-Eager/MTB-openings), click the green **Code** button, then **Download ZIP**. Unzip it somewhere easy like your Desktop. You'll get a folder named `MTB-openings`.

4. **Point the terminal at that folder.** Type `cd ` (with a space after it), then **drag the `MTB-openings` folder onto the terminal window**, which pastes the location for you. Press Enter. Example of what it looks like:
   ```bash
   cd Desktop/MTB-openings
   ```

5. **Install and start it.** Type these two lines, one at a time, pressing Enter after each. The first one downloads the pieces it needs (takes a minute). The second builds and starts the page.
   ```bash
   yarn install
   yarn deploy:local
   ```
   When it finishes you'll see a line mentioning `http://localhost:3000`. **Leave this window open**; closing it turns the page off. To check it works, open a web browser on this same computer and go to `http://localhost:3000`.

### Part 2: Install Tailscale (this is what lets your phone connect)

Tailscale is a free app that privately links your devices so your phone can reach the host from anywhere, without any complicated network setup.

6. **On the host computer:** go to [tailscale.com/download](https://tailscale.com/download), install it, and sign in (Google or any account works, and the free plan is plenty). After signing in, it gives this computer a name (something like `mtb-host`). Write that name down.

7. **On your phone:** install the **Tailscale** app from the App Store / Play Store and sign in with **the exact same account** you used in step 6. That's what links the two.

### Part 3: Open the page on your phone

8. On your phone's web browser, type this in the address bar (replace `mtb-host` with the name from step 6):
   ```
   http://mtb-host:3000
   ```
   The trail page should load. It'll work from anywhere as long as the host computer is on and connected to the internet.

> **If the name doesn't work:** on the host, type `tailscale ip -4` in the terminal. It prints an address like `100.84.12.5`. On your phone, use that instead, e.g. `http://100.84.12.5:3000`.

### Keeping it on after you close the window or restart

The simple version above stops when you close the terminal or restart the computer. To make it start back up automatically, the easiest tool is **PM2**. Type these (one at a time) in the project folder:
```bash
npm install -g pm2
pm2 start server.mjs --name mtb-trails
pm2 save
pm2 startup
```
PM2 will print one extra line for you to copy, paste, and run; that's what makes it survive restarts. After that you can close the terminal and the page keeps running.

(On a Raspberry Pi or other Linux server, a systemd service does the same job; see [Deploying to a server](#deploying-to-a-server) below.)

## For developers

### Prerequisites

- [Node.js](https://nodejs.org/) v20+
- [Yarn](https://yarnpkg.com/)

### Running locally

```bash
yarn install
yarn dev
```

This starts both the Express scraper server (port 3000) and the Vite dev server (port 5173) together. Open `http://localhost:5173`.

### Deploying to a server

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

### Adding trails

All sources live in `server.mjs`:

- **Cleveland Metroparks trails**: add an entry to `TRAIL_META`, keyed by the trail name exactly as it appears on the Metroparks status page
- **Bluesky accounts**: add an entry to `BSKY_ACCOUNTS`
- **TrailForks regions** (community-reported conditions): add an entry to `TRAILFORKS_REGIONS`
- **CVNP East Rim**: configured via the `CVNP_EAST_RIM` entry
- **CAMBA Trailmate**: the home page lists every CAMBA-tracked trail. To let it refresh a trail you already track, map the trail's CAMBA `p6_id` (from its `trail?p6_id=…` URL) to your app trail id in `CAMBA_TRAIL_IDS`. To surface a CAMBA-only trail as its own card, add an entry (name, location, links) to `CAMBA_NEW_TRAILS` keyed by `p6_id`
- **Static link cards** (trails with no live data): add an entry to `STATIC_TRAILS`

## License

MIT
