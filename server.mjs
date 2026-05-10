import * as cheerio from 'cheerio';
import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT ?? 3000;
const METROPARKS_URL = 'https://www.clevelandmetroparks.com/parks/visit/activities/mountain-biking/trail-status';
const BSKY_API = 'https://public.api.bsky.app/xrpc';
const CACHE_TTL = 5 * 60 * 1000;
const STATUS_ORDER = { caution: 1, closed: 2, open: 0, unknown: 3 };

const TRAIL_META = {
	'Bedford - Single Track': {
		difficulty: 'black',
		id: 'bedford-single',
		links: [
			{ name: 'Cleveland Metroparks', url: METROPARKS_URL },
			{ name: 'TrailForks', url: 'https://www.trailforks.com/region/bedford-reservation/' }
		],
		location: 'Cleveland Metroparks · Bedford',
		miles: 9.0
	},
	'Ohio & Erie Canal - Flow Trail': {
		difficulty: 'green',
		id: 'oec-flow',
		links: [
			{ name: 'Cleveland Metroparks', url: METROPARKS_URL },
			{ name: 'TrailForks', url: 'https://www.trailforks.com/region/ohio--erie-canal-reservation/' }
		],
		location: 'Cleveland Metroparks · Valley View',
		miles: 1.0
	},
	'Ohio & Erie Canal - Primitive Loop & Canal Trail': {
		difficulty: 'blue',
		id: 'oec-primitive',
		links: [
			{ name: 'Cleveland Metroparks', url: METROPARKS_URL },
			{ name: 'TrailForks', url: 'https://www.trailforks.com/region/ohio--erie-canal-reservation/' }
		],
		location: 'Cleveland Metroparks · Valley View',
		miles: 8.0
	},
	'Ohio & Erie Canal - Pump Track': {
		difficulty: 'green',
		id: 'oec-pump',
		links: [
			{ name: 'Cleveland Metroparks', url: METROPARKS_URL },
			{ name: 'TrailForks', url: 'https://www.trailforks.com/region/ohio--erie-canal-reservation/' }
		],
		location: 'Cleveland Metroparks · Valley View',
		miles: 0.1
	},
	'Royalview - Red Loop': {
		difficulty: 'blue',
		id: 'royalview-red',
		links: [
			{ name: 'Cleveland Metroparks', url: METROPARKS_URL },
			{ name: 'TrailForks', url: 'https://www.trailforks.com/trails/royalview-red-trail/' }
		],
		location: 'Mill Stream Run Reservation',
		miles: 4.0
	},
	'Royalview - Yellow Loop': {
		difficulty: 'black',
		id: 'royalview-yellow',
		links: [
			{ name: 'Cleveland Metroparks', url: METROPARKS_URL },
			{ name: 'TrailForks', url: 'https://www.trailforks.com/trails/royalview-yellow/' }
		],
		location: 'Mill Stream Run Reservation',
		miles: 2.5
	},
	'West Creek - Mountain Bike Trails': {
		difficulty: 'blue',
		id: 'west-creek',
		links: [
			{ name: 'Cleveland Metroparks', url: METROPARKS_URL },
			{ name: 'TrailForks', url: 'https://www.trailforks.com/region/hampton-hills-15249/' }
		],
		location: 'Cleveland Metroparks · Parma',
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
		location: 'Summit Metro Parks · Akron',
		miles: 12.0,
		name: 'Hampton Hills'
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
		location: 'Lake Metroparks · Kirtland',
		miles: 9.0,
		name: 'Chapin Forest',
		status: 'unknown',
		updatedAt: '—'
	},
	{
		condition: 'No live data — check the links below for current conditions.',
		difficulty: 'blue',
		id: 'cvnp-east-rim',
		links: [
			{ name: 'X · @cvnpmtb', url: 'https://x.com/cvnpmtb' },
			{ name: 'NPS Conditions', url: 'https://www.nps.gov/cuva/planyourvisit/conditions.htm' },
			{ name: 'TrailForks', url: 'https://www.trailforks.com/region/east-rim-trails/' }
		],
		location: 'Cuyahoga Valley National Park · Peninsula',
		miles: 8.0,
		name: 'CVNP East Rim',
		status: 'unknown',
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
		location: 'West Branch State Park · Ravenna',
		miles: 12.0,
		name: 'West Branch',
		status: 'unknown',
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
		location: 'Findley State Park · Wellington',
		miles: 5.7,
		name: 'Findley State Park',
		status: 'unknown',
		updatedAt: '—'
	},
	{
		condition: 'No live data — check the links below for current conditions.',
		difficulty: 'black',
		id: 'vulturesknob',
		links: [{ name: 'TrailForks', url: 'https://www.trailforks.com/region/vultures-knob/' }],
		location: 'Wayne County · Wooster',
		miles: 15.0,
		name: "Vulture's Knob",
		status: 'unknown',
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
		location: 'Mohican State Park · Loudonville',
		miles: 25.0,
		name: 'Mohican',
		status: 'unknown',
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
		signal: AbortSignal.timeout(10000),
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
			updatedAt: formatUpdatedAt(rawDate)
		});
	});

	return trails;
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

	const [metroparksResult, bskyResult] = await Promise.allSettled([scrapeMetroparks(), fetchBskyTrails()]);

	const metroparks = metroparksResult.status === 'fulfilled' ? metroparksResult.value : [];
	const bsky = bskyResult.status === 'fulfilled' ? bskyResult.value : [];

	if (metroparks.length === 0 && bsky.length === 0) {
		if (cachedTrails) return cachedTrails;
		throw new Error('All sources failed');
	}

	const trails = [...metroparks, ...bsky, ...STATIC_TRAILS].sort(
		(a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
	);

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
