import * as cheerio from 'cheerio';
import express from 'express';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import { promisify } from 'util';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);

// TrailForks sits behind Cloudflare, which 403s Node's fetch on TLS fingerprint.
// curl uses a different TLS stack and gets through, so shell out to it.
async function curlText(url) {
	const { stdout } = await execFileAsync(
		'curl',
		['-s', '-L', '--max-time', '10', '-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', url],
		{ maxBuffer: 16 * 1024 * 1024 }
	);
	if (!stdout) throw new Error('curl returned empty body');
	return stdout;
}

const PORT = process.env.PORT ?? 3000;
const METROPARKS_URL = 'https://www.clevelandmetroparks.com/parks/visit/activities/mountain-biking/trail-status';
const CVNP_EAST_RIM_URL = 'https://camba.dualrates.com/a/r/szz/camba/trail?p6_id=103';
const BSKY_API = 'https://public.api.bsky.app/xrpc';
const CACHE_TTL = 5 * 60 * 1000;
const STALE_AFTER = 7 * 24 * 60 * 60 * 1000; // a week
const STATUS_ORDER = { caution: 1, closed: 2, open: 0, stale: 3 };

const TRAIL_META = {
	'Bedford - Single Track': {
		difficulty: 'black',
		id: 'bedford-single',
		links: [
			{ name: 'Cleveland Metroparks', url: METROPARKS_URL },
			{ name: 'TrailForks', url: 'https://www.trailforks.com/region/bedford-reservation/' }
		],
		location: '7599 Dunham Rd #7507, Walton Hills, OH 44146',
		miles: 9.0
	},
	'Ohio & Erie Canal - Flow Trail': {
		difficulty: 'green',
		id: 'oec-flow',
		links: [
			{ name: 'Cleveland Metroparks', url: METROPARKS_URL },
			{ name: 'TrailForks', url: 'https://www.trailforks.com/region/ohio--erie-canal-reservation/' }
		],
		location: '4524 E 49th St, Cleveland, OH 44125',
		miles: 1.0
	},
	'Ohio & Erie Canal - Primitive Loop & Canal Trail': {
		difficulty: 'blue',
		id: 'oec-primitive',
		links: [
			{ name: 'Cleveland Metroparks', url: METROPARKS_URL },
			{ name: 'TrailForks', url: 'https://www.trailforks.com/region/ohio--erie-canal-reservation/' }
		],
		location: '4524 E 49th St, Cleveland, OH 44125',
		miles: 8.0
	},
	'Ohio & Erie Canal - Pump Track': {
		difficulty: 'green',
		id: 'oec-pump',
		links: [
			{ name: 'Cleveland Metroparks', url: METROPARKS_URL },
			{ name: 'TrailForks', url: 'https://www.trailforks.com/region/ohio--erie-canal-reservation/' }
		],
		location: '4524 E 49th St, Cleveland, OH 44125',
		miles: 0.1
	},
	'Royalview - Red Loop': {
		difficulty: 'blue',
		id: 'royalview-red',
		links: [
			{ name: 'Cleveland Metroparks', url: METROPARKS_URL },
			{ name: 'TrailForks', url: 'https://www.trailforks.com/trails/royalview-red-trail/' }
		],
		location: 'Royalview Ln, Strongsville, OH 44136',
		miles: 4.0
	},
	'Royalview - Yellow Loop': {
		difficulty: 'black',
		id: 'royalview-yellow',
		links: [
			{ name: 'Cleveland Metroparks', url: METROPARKS_URL },
			{ name: 'TrailForks', url: 'https://www.trailforks.com/trails/royalview-yellow/' }
		],
		location: 'Royalview Ln, Strongsville, OH 44136',
		miles: 2.5
	},
	'West Creek - Mountain Bike Trails': {
		difficulty: 'blue',
		id: 'west-creek',
		links: [
			{ name: 'Cleveland Metroparks', url: METROPARKS_URL },
			{ name: 'TrailForks', url: 'https://www.trailforks.com/region/hampton-hills-15249/' }
		],
		location: 'Bluebird Point, Parma, OH 44134',
		miles: 5.0
	}
};

const BSKY_ACCOUNTS = [
	{
		difficulty: 'blue',
		handle: 'smpmountainbike.bsky.social',
		id: 'hampton-hills',
		links: [
			{ name: 'Bluesky · @smpmountainbike', url: 'https://bsky.app/profile/smpmountainbike.bsky.social' },
			{ name: 'TrailForks', url: 'https://www.trailforks.com/region/hampton-hills-15249/' }
		],
		location: '2092 Theiss Rd, Akron, OH 44313',
		miles: 12.0,
		name: 'Hampton Hills'
	}
];

const CVNP_EAST_RIM = {
	difficulty: 'blue',
	id: 'cvnp-east-rim',
	links: [
		{ name: 'CAMBA Trailmate', url: CVNP_EAST_RIM_URL },
		{ name: 'X · @cvnpmtb', url: 'https://x.com/cvnpmtb' },
		{ name: 'NPS Conditions', url: 'https://www.nps.gov/cuva/planyourvisit/conditions.htm' },
		{ name: 'TrailForks', url: 'https://www.trailforks.com/region/east-rim-trails/' }
	],
	location: '281 Boston Mills Rd, Peninsula, OH 44264',
	miles: 8.0,
	name: 'CVNP East Rim'
};

// Scraped from TrailForks region "Region Status" (community-reported conditions).
const TRAILFORKS_REGIONS = [
	{
		difficulty: 'blue',
		id: 'austin-badger',
		links: [
			{ name: 'TrailForks', url: 'https://www.trailforks.com/region/austin-badger-park-17345/' },
			{ name: 'Facebook · Wick’s Outlaw Trails', url: 'https://www.facebook.com/WicksOutlawTrails/' },
			{ name: 'Instagram · @wicks_outlaw_trails', url: 'https://www.instagram.com/wicks_outlaw_trails/' }
		],
		location: '5741 River Styx Rd, Medina, OH 44256',
		miles: 5.3,
		name: 'Austin Badger Park',
		url: 'https://www.trailforks.com/region/austin-badger-park-17345/'
	}
];

const STATIC_TRAILS = [
	{
		condition: 'No live data — check the links below for current conditions.',
		difficulty: 'blue',
		id: 'chapin-forest',
		links: [
			{ name: 'Lake Metroparks', url: 'https://lakemetroparks.com/parks-trails/chapin-forest-reservation/' },
			{ name: 'TrailForks', url: 'https://www.trailforks.com/region/chapin-forest-reservation-50222/' }
		],
		location: '10381 Hobart Rd, Kirtland, OH 44094',
		miles: 9.0,
		name: 'Chapin Forest',
		status: 'stale',
		updatedAt: '—'
	},
	{
		condition: 'No live data — check the links below for current conditions.',
		difficulty: 'blue',
		id: 'west-branch',
		links: [
			{
				name: 'Ohio DNR',
				url: 'https://ohiodnr.gov/go-and-do/plan-a-visit/find-a-property/west-branch-state-park'
			},
			{ name: 'TrailForks', url: 'https://www.trailforks.com/region/west-branch-state-park/' }
		],
		location: '6940 Cable Line Rd, Ravenna, OH 44266',
		miles: 12.0,
		name: 'West Branch',
		status: 'stale',
		updatedAt: '—'
	},
	{
		condition: 'No live data — check the links below for current conditions.',
		difficulty: 'green',
		id: 'findley',
		links: [
			{ name: 'Ohio DNR', url: 'https://ohiodnr.gov/go-and-do/plan-a-visit/find-a-property/findley-state-park' },
			{ name: 'TrailForks', url: 'https://www.trailforks.com/region/findley-state-park/' }
		],
		location: '58 N State St, Wellington, OH 44090',
		miles: 5.7,
		name: 'Findley State Park',
		status: 'stale',
		updatedAt: '—'
	},
	{
		condition: 'No live data — check the links below for current conditions.',
		difficulty: 'black',
		id: 'vulturesknob',
		links: [{ name: 'TrailForks', url: 'https://www.trailforks.com/region/vultures-knob/' }],
		location: '4300 Co Hwy 22, 4300 Mechanicsburg Rd, Wooster, OH 44691',
		miles: 15.0,
		name: "Vulture's Knob",
		status: 'stale',
		updatedAt: '—'
	},
	{
		condition: 'No live data — check the links below for current conditions.',
		difficulty: 'blue',
		id: 'mohican',
		links: [
			{ name: 'Ohio DNR', url: 'https://ohiodnr.gov/go-and-do/plan-a-visit/find-a-property/mohican-state-park' },
			{ name: 'TrailForks', url: 'https://www.trailforks.com/region/mohican-state-park/' }
		],
		location: '3116 OH-3, Loudonville, OH 44842',
		miles: 25.0,
		name: 'Mohican',
		status: 'stale',
		updatedAt: '—'
	}
];

function formatUpdatedAt(raw) {
	const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d+:\d+) (AM|PM)/);
	if (!match) return raw;
	const [, month, day, , time, period] = match;
	const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	return `${months[+month - 1]} ${+day}, ${time} ${period}`;
}

// Best-effort parse of a source's update time into epoch ms (null if unknown),
// used only to decide staleness — the display string stays whatever the source gave.
function parseMetroparksDate(raw) {
	const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d+):(\d+) (AM|PM)/);
	if (!m) return null;
	const [, month, day, year, hour, minute, period] = m;
	const h = (+hour % 12) + (period === 'PM' ? 12 : 0);
	return new Date(+year, +month - 1, +day, h, +minute).getTime();
}

function parseRelativeOrDate(text) {
	const rel = text.match(/(\d+)\s*(minute|hour|day|week)s?\s+ago/i);
	if (rel) {
		const unit = { minute: 60e3, hour: 3600e3, day: 86400e3, week: 604800e3 }[rel[2].toLowerCase()];
		return Date.now() - +rel[1] * unit;
	}
	const t = Date.parse(text);
	return Number.isNaN(t) ? null : t;
}

function inferStatus(text) {
	const lower = text.toLowerCase();
	if (lower.includes('closed') || lower.includes('close')) return 'closed';
	if (lower.includes('open')) return 'open';
	return 'caution';
}

function formatBskyDate(iso) {
	const d = new Date(iso);
	return (
		d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }) +
		', ' +
		d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
	);
}

let cachedTrails = null;
let cacheExpiry = 0;

async function scrapeMetroparks() {
	const res = await fetch(METROPARKS_URL, {
		headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CLE-MTB-Status/1.0)' },
		signal: AbortSignal.timeout(10000)
	});
	if (!res.ok) throw new Error(`Metroparks HTTP ${res.status}`);

	const $ = cheerio.load(await res.text());
	const trails = [];

	$('.loc-status-table tbody tr').each((_, row) => {
		const $row = $(row);
		const name = $row.find('.loc-status-table-loc').text().trim();
		if (!name) return;

		const statusBox = $row.find('.loc-status-table-status-box');
		const status = statusBox.hasClass('loc-status-open') ? 'open' : 'closed';
		const notes = $row.find('.loc-status-table-wrap').text().trim();
		const rawDate = $row.find('td').eq(3).text().trim();
		const meta = TRAIL_META[name] ?? {
			difficulty: 'blue',
			id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
			links: [{ name: 'Cleveland Metroparks', url: METROPARKS_URL }],
			location: 'Cleveland Metroparks',
			miles: 0
		};

		trails.push({
			condition: notes || (status === 'open' ? 'No issues reported' : 'No additional notes'),
			difficulty: meta.difficulty,
			id: meta.id,
			links: meta.links,
			location: meta.location,
			miles: meta.miles,
			name,
			status,
			timestamp: parseMetroparksDate(rawDate),
			updatedAt: formatUpdatedAt(rawDate)
		});
	});

	return trails;
}

async function scrapeCvnpEastRim() {
	const res = await fetch(CVNP_EAST_RIM_URL, {
		headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CLE-MTB-Status/1.0)' },
		signal: AbortSignal.timeout(10000)
	});
	if (!res.ok) throw new Error(`CAMBA HTTP ${res.status}`);

	const $ = cheerio.load(await res.text());

	let statusText = '';
	let statusClass = '';
	let condition = '';
	$('.t-AVPList-label').each((_, label) => {
		const value = $(label).next('.t-AVPList-value');
		switch ($(label).text().trim()) {
			case 'Trail Status':
				statusText = value.text().trim();
				statusClass = value.find('span').attr('class') ?? '';
				break;
			case 'Latest Post':
				condition = value.text().trim();
				break;
		}
	});

	if (!statusText) throw new Error('CAMBA: trail status not found');

	let status;
	if (statusClass.includes('u-success')) status = 'open';
	else if (statusClass.includes('u-danger')) status = 'closed';
	else if (statusClass.includes('u-warning')) status = 'caution';
	else status = inferStatus(statusText);

	// statusText reads e.g. "Open as of 47 hours ago" — keep the relative time as-is.
	const ago = statusText.match(/as of (.+)$/i);

	return {
		condition: condition || 'No additional notes',
		difficulty: CVNP_EAST_RIM.difficulty,
		id: CVNP_EAST_RIM.id,
		links: CVNP_EAST_RIM.links,
		location: CVNP_EAST_RIM.location,
		miles: CVNP_EAST_RIM.miles,
		name: CVNP_EAST_RIM.name,
		status,
		timestamp: ago ? parseRelativeOrDate(ago[1].trim()) : null,
		updatedAt: ago ? ago[1].trim() : '—'
	};
}

function trailforksStatus(iconClass) {
	if (/\bsgreen\b/.test(iconClass)) return 'open';
	if (/\bsred\b/.test(iconClass)) return 'closed';
	if (/\bs(yellow|orange|blue)\b/.test(iconClass)) return 'caution';
	return 'stale';
}

async function fetchTrailforksRegions() {
	return Promise.all(
		TRAILFORKS_REGIONS.map(async (region) => {
			try {
				const $ = cheerio.load(await curlText(region.url));
				const container = $('.grey')
					.filter((_, el) => $(el).text().trim() === 'Region Status')
					.first()
					.parent();
				const icon = container.find('.sicon_small').first();
				if (!icon.length) throw new Error('TrailForks: region status not found');

				// Trailing span reads e.g. "as of Jul 12, 2024".
				const asOf = container.find('.clickable').first().text().trim().replace(/^as of\s*/i, '');

				return {
					condition: icon.attr('title')?.trim() || 'See TrailForks for current conditions',
					difficulty: region.difficulty,
					id: region.id,
					links: region.links,
					location: region.location,
					miles: region.miles,
					name: region.name,
					status: trailforksStatus(icon.attr('class') ?? ''),
					timestamp: asOf ? parseRelativeOrDate(asOf) : null,
					updatedAt: asOf || '—'
				};
			} catch {
				return {
					condition: 'No live data — check the links below for current conditions.',
					difficulty: region.difficulty,
					id: region.id,
					links: region.links,
					location: region.location,
					miles: region.miles,
					name: region.name,
					status: 'stale',
					updatedAt: '—'
				};
			}
		})
	);
}

async function fetchBskyTrails() {
	const results = await Promise.allSettled(
		BSKY_ACCOUNTS.map(async (account) => {
			const url = `${BSKY_API}/app.bsky.feed.getAuthorFeed?actor=${account.handle}&limit=10&filter=posts_no_replies`;
			const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
			if (!res.ok) throw new Error(`Bluesky HTTP ${res.status}`);

			const data = await res.json();
			const post = data.feed?.[0]?.post;
			if (!post) throw new Error('No posts found');

			const text = post.record?.text ?? '';
			const rkey = post.uri.split('/').pop();
			const postUrl = `https://bsky.app/profile/${account.handle}/post/${rkey}`;

			const links = [{ name: account.links[0].name, url: postUrl }, ...account.links.slice(1)];

			return {
				condition: text,
				difficulty: account.difficulty,
				id: account.id,
				links,
				location: account.location,
				miles: account.miles,
				name: account.name,
				status: inferStatus(text),
				timestamp: Date.parse(post.indexedAt),
				updatedAt: formatBskyDate(post.indexedAt)
			};
		})
	);

	return results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
}

async function getAllTrails() {
	if (cachedTrails && Date.now() < cacheExpiry) {
		return cachedTrails;
	}

	const [metroparksResult, bskyResult, cvnpResult, trailforksResult] = await Promise.allSettled([
		scrapeMetroparks(),
		fetchBskyTrails(),
		scrapeCvnpEastRim(),
		fetchTrailforksRegions()
	]);

	const metroparks = metroparksResult.status === 'fulfilled' ? metroparksResult.value : [];
	const bsky = bskyResult.status === 'fulfilled' ? bskyResult.value : [];
	const trailforks = trailforksResult.status === 'fulfilled' ? trailforksResult.value : [];
	const cvnp =
		cvnpResult.status === 'fulfilled'
			? cvnpResult.value
			: {
					...CVNP_EAST_RIM,
					condition: 'No live data — check the links below for current conditions.',
					status: 'stale',
					updatedAt: '—'
				};

	if (metroparks.length === 0 && bsky.length === 0) {
		if (cachedTrails) return cachedTrails;
		throw new Error('All sources failed');
	}

	const now = Date.now();
	const trails = [...metroparks, ...bsky, cvnp, ...trailforks, ...STATIC_TRAILS]
		.map((trail) => {
			const timestamp = trail.timestamp ?? null;
			const stale = trail.status === 'stale' || (timestamp != null && now - timestamp > STALE_AFTER);
			return { ...trail, status: stale ? 'stale' : trail.status, timestamp };
		})
		.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);

	cachedTrails = trails;
	cacheExpiry = Date.now() + CACHE_TTL;
	return trails;
}

const app = express();

app.get('/api/trails', async (_req, res) => {
	try {
		const trails = await getAllTrails();
		res.json(trails);
	} catch (err) {
		console.error('Fetch failed:', err.message);
		res.status(503).json({ error: 'Could not fetch trail conditions' });
	}
});

app.use(express.static(path.join(__dirname, 'dist')));

app.use((_req, res) => {
	res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
	console.log(`CLE MTB → http://localhost:${PORT}`);
});
