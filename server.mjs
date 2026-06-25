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
const CAMBA_BASE_URL = 'https://dualrates.com/a/r/szz/camba';
const CAMBA_HOME_URL = `${CAMBA_BASE_URL}/home`;
const cambaTrailUrl = (p6Id) => `${CAMBA_BASE_URL}/trail?p6_id=${p6Id}`;
const BSKY_API = 'https://public.api.bsky.app/xrpc';
const CACHE_TTL = 5 * 60 * 1000;
const STALE_AFTER = 7 * 24 * 60 * 60 * 1000; // a week
const STATUS_ORDER = { caution: 1, closed: 2, open: 0, stale: 3 };

const TRAIL_META = {
	'Bedford - Single Track': {
		id: 'bedford-single',
		links: [
			{ name: 'Cleveland Metroparks', url: METROPARKS_URL },
			{ name: 'TrailForks', url: 'https://www.trailforks.com/region/bedford-reservation/' }
		],
		location: '7599 Dunham Rd #7507, Walton Hills, OH 44146'
	},
	'Ohio & Erie Canal - Flow Trail': {
		id: 'oec-flow',
		links: [
			{ name: 'Cleveland Metroparks', url: METROPARKS_URL },
			{ name: 'TrailForks', url: 'https://www.trailforks.com/region/ohio--erie-canal-reservation/' }
		],
		location: '4524 E 49th St, Cleveland, OH 44125'
	},
	'Ohio & Erie Canal - Primitive Loop & Canal Trail': {
		id: 'oec-primitive',
		links: [
			{ name: 'Cleveland Metroparks', url: METROPARKS_URL },
			{ name: 'TrailForks', url: 'https://www.trailforks.com/region/ohio--erie-canal-reservation/' }
		],
		location: '4524 E 49th St, Cleveland, OH 44125'
	},
	'Ohio & Erie Canal - Pump Track': {
		id: 'oec-pump',
		links: [
			{ name: 'Cleveland Metroparks', url: METROPARKS_URL },
			{ name: 'TrailForks', url: 'https://www.trailforks.com/region/ohio--erie-canal-reservation/' }
		],
		location: '4524 E 49th St, Cleveland, OH 44125'
	},
	'Royalview - Red Loop': {
		id: 'royalview-red',
		links: [
			{ name: 'Cleveland Metroparks', url: METROPARKS_URL },
			{ name: 'TrailForks', url: 'https://www.trailforks.com/trails/royalview-red-trail/' }
		],
		location: 'Royalview Ln, Strongsville, OH 44136'
	},
	'Royalview - Yellow Loop': {
		id: 'royalview-yellow',
		links: [
			{ name: 'Cleveland Metroparks', url: METROPARKS_URL },
			{ name: 'TrailForks', url: 'https://www.trailforks.com/trails/royalview-yellow/' }
		],
		location: 'Royalview Ln, Strongsville, OH 44136'
	},
	'West Creek - Mountain Bike Trails': {
		id: 'west-creek',
		links: [
			{ name: 'Cleveland Metroparks', url: METROPARKS_URL },
			{ name: 'TrailForks', url: 'https://www.trailforks.com/region/hampton-hills-15249/' }
		],
		location: 'Bluebird Point, Parma, OH 44134'
	}
};

const BSKY_ACCOUNTS = [
	{
		handle: 'smpmountainbike.bsky.social',
		id: 'hampton-hills',
		links: [
			{ name: 'Bluesky · @smpmountainbike', url: 'https://bsky.app/profile/smpmountainbike.bsky.social' },
			{ name: 'TrailForks', url: 'https://www.trailforks.com/region/hampton-hills-15249/' }
		],
		location: '2092 Theiss Rd, Akron, OH 44313',
		name: 'Hampton Hills'
	}
];

const CVNP_EAST_RIM = {
	id: 'cvnp-east-rim',
	links: [
		{ name: 'CAMBA Trailmate', url: CVNP_EAST_RIM_URL },
		{ name: 'X · @cvnpmtb', url: 'https://x.com/cvnpmtb' },
		{ name: 'NPS Conditions', url: 'https://www.nps.gov/cuva/planyourvisit/conditions.htm' },
		{ name: 'TrailForks', url: 'https://www.trailforks.com/region/east-rim-trails/' }
	],
	location: '281 Boston Mills Rd, Peninsula, OH 44264',
	name: 'CVNP East Rim'
};

// Scraped from TrailForks region "Region Status" (community-reported conditions).
const TRAILFORKS_REGIONS = [
	{
		id: 'austin-badger',
		links: [
			{ name: 'TrailForks', url: 'https://www.trailforks.com/region/austin-badger-park-17345/' },
			{ name: 'Facebook · Wick’s Outlaw Trails', url: 'https://www.facebook.com/WicksOutlawTrails/' },
			{ name: 'Instagram · @wicks_outlaw_trails', url: 'https://www.instagram.com/wicks_outlaw_trails/' }
		],
		location: '5741 River Styx Rd, Medina, OH 44256',
		name: 'Austin Badger Park',
		url: 'https://www.trailforks.com/region/austin-badger-park-17345/'
	}
];

const STATIC_TRAILS = [
	{
		condition: 'No live data — check the links below for current conditions.',
		id: 'chapin-forest',
		links: [
			{ name: 'Lake Metroparks', url: 'https://lakemetroparks.com/parks-trails/chapin-forest-reservation/' },
			{ name: 'TrailForks', url: 'https://www.trailforks.com/region/chapin-forest-reservation-50222/' }
		],
		location: '10381 Hobart Rd, Kirtland, OH 44094',
		name: 'Chapin Forest',
		status: 'stale',
		updatedAt: '—'
	},
	{
		condition: 'No live data — check the links below for current conditions.',
		id: 'west-branch',
		links: [
			{
				name: 'Ohio DNR',
				url: 'https://ohiodnr.gov/go-and-do/plan-a-visit/find-a-property/west-branch-state-park'
			},
			{ name: 'TrailForks', url: 'https://www.trailforks.com/region/west-branch-state-park/' }
		],
		location: '6940 Cable Line Rd, Ravenna, OH 44266',
		name: 'West Branch',
		status: 'stale',
		updatedAt: '—'
	},
	{
		condition: 'No live data — check the links below for current conditions.',
		id: 'findley',
		links: [
			{ name: 'Ohio DNR', url: 'https://ohiodnr.gov/go-and-do/plan-a-visit/find-a-property/findley-state-park' },
			{ name: 'TrailForks', url: 'https://www.trailforks.com/region/findley-state-park/' }
		],
		location: '58 N State St, Wellington, OH 44090',
		name: 'Findley State Park',
		status: 'stale',
		updatedAt: '—'
	},
	{
		condition: 'No live data — check the links below for current conditions.',
		id: 'vulturesknob',
		links: [{ name: 'TrailForks', url: 'https://www.trailforks.com/region/vultures-knob/' }],
		location: '4300 Co Hwy 22, 4300 Mechanicsburg Rd, Wooster, OH 44691',
		name: "Vulture's Knob",
		status: 'stale',
		updatedAt: '—'
	},
	{
		condition: 'No live data — check the links below for current conditions.',
		id: 'mohican',
		links: [
			{ name: 'Ohio DNR', url: 'https://ohiodnr.gov/go-and-do/plan-a-visit/find-a-property/mohican-state-park' },
			{ name: 'TrailForks', url: 'https://www.trailforks.com/region/mohican-state-park/' }
		],
		location: '3116 OH-3, Loudonville, OH 44842',
		name: 'Mohican',
		status: 'stale',
		updatedAt: '—'
	}
];

// The CAMBA Trailmate home page lists every CAMBA-tracked trail in a single
// fetch (community-reported conditions, same platform as CVNP East Rim). We use
// it as a fallback: when a trail's primary source is missing or older than the
// CAMBA post, the CAMBA status wins. It also surfaces trails with no other live
// source (CAMBA_NEW_TRAILS below).

// Maps a CAMBA trail id (the `p6_id` in its URL) to the app trail id it should
// refresh, so a home-page entry updates the trail we already track rather than
// duplicating it.
const CAMBA_TRAIL_IDS = {
	2: 'bedford-single',
	3: 'royalview-red',
	4: 'oec-primitive',
	5: 'west-creek',
	6: 'oec-flow',
	7: 'oec-pump',
	8: 'royalview-yellow',
	103: 'cvnp-east-rim',
	105: 'austin-badger',
	106: 'mohican',
	107: 'vulturesknob',
	108: 'hampton-hills',
	115: 'west-branch'
};

// Trails that only appear on the CAMBA home page (no other live source). Status,
// condition, and timestamp come from CAMBA at runtime; the metadata below is the
// rest of the card. Locations are Maps-searchable but should be verified.
const CAMBA_NEW_TRAILS = {
	109: {
		id: 'camp-tuscazoar',
		links: [{ name: 'CAMBA Trailmate', url: cambaTrailUrl(109) }],
		location: 'Camp Tuscazoar, Zoar, OH',
		name: 'Camp Tuscazoar'
	},
	110: {
		id: 'thorn-ftp',
		links: [{ name: 'CAMBA Trailmate', url: cambaTrailUrl(110) }],
		location: 'Thorn (FTP) Trail, Ohio',
		name: 'Thorn (FTP)'
	},
	111: {
		id: 'rays-indoor',
		links: [{ name: 'CAMBA Trailmate', url: cambaTrailUrl(111) }],
		location: "Ray's MTB, 9801 Walford Ave, Cleveland, OH 44102",
		name: "Ray's Indoor Mountain Bike Park"
	},
	112: {
		id: 'lake-milton',
		links: [{ name: 'CAMBA Trailmate', url: cambaTrailUrl(112) }],
		location: 'Lake Milton State Park, Lake Milton, OH',
		name: 'Lake Milton'
	},
	113: {
		id: 'huffman',
		links: [{ name: 'CAMBA Trailmate', url: cambaTrailUrl(113) }],
		location: 'Huffman MetroPark, Dayton, OH',
		name: 'Huffman'
	},
	114: {
		id: 'reagan-park',
		links: [{ name: 'CAMBA Trailmate', url: cambaTrailUrl(114) }],
		location: 'Reagan Park, Medina, OH',
		name: 'Reagan Park'
	},
	116: {
		id: 'quail-hollow',
		links: [{ name: 'CAMBA Trailmate', url: cambaTrailUrl(116) }],
		location: 'Quail Hollow State Park, Hartville, OH',
		name: 'Quail Hollow'
	},
	117: {
		id: 'big-creek',
		links: [{ name: 'CAMBA Trailmate', url: cambaTrailUrl(117) }],
		location: 'Big Creek Park, Chardon, OH',
		name: 'Big Creek'
	}
};

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
	const rel = text.match(/(\d+)\s*(minute|hour|day|week|month|year)s?\s+ago/i);
	if (rel) {
		const unit = { minute: 60e3, hour: 3600e3, day: 86400e3, week: 604800e3, month: 2592e6, year: 31536e6 }[
			rel[2].toLowerCase()
		];
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
			id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
			links: [{ name: 'Cleveland Metroparks', url: METROPARKS_URL }],
			location: 'Cleveland Metroparks'
		};

		trails.push({
			condition: notes || (status === 'open' ? 'No issues reported' : 'No additional notes'),
			id: meta.id,
			links: meta.links,
			location: meta.location,
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
		id: CVNP_EAST_RIM.id,
		links: CVNP_EAST_RIM.links,
		location: CVNP_EAST_RIM.location,
		name: CVNP_EAST_RIM.name,
		status,
		timestamp: ago ? parseRelativeOrDate(ago[1].trim()) : null,
		updatedAt: ago ? ago[1].trim() : '—'
	};
}

function cambaHomeStatus(className, text) {
	if (className.includes('t-Alert--success')) return 'open';
	if (className.includes('t-Alert--danger')) return 'closed';
	if (className.includes('t-Alert--warning')) return 'caution';
	return inferStatus(text); // e.g. the "info" alert for a seasonal park
}

// Scrape the CAMBA Trailmate home page, which lists every CAMBA-tracked trail as
// a single alert block: name + p6_id, latest post, relative time, status color.
// Returns one entry per trail keyed by p6_id; callers map it onto our trails.
async function scrapeCambaHome() {
	const res = await fetch(CAMBA_HOME_URL, {
		headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CLE-MTB-Status/1.0)' },
		signal: AbortSignal.timeout(10000)
	});
	if (!res.ok) throw new Error(`CAMBA home HTTP ${res.status}`);

	const $ = cheerio.load(await res.text());
	const entries = [];

	$('#TrailMate_alerts .t-Alert').each((_, el) => {
		const $el = $(el);
		const link = $el.find('.t-Alert-title a');
		const p6Id = Number(link.attr('href')?.match(/p6_id=(\d+)/)?.[1]);
		if (!p6Id) return;

		const condition = $el.find('.t-Alert-body').text().trim().replace(/\s+/g, ' ');
		const when = $el.find('.t-Alert-buttons').text().trim().replace(/\s+/g, ' ');

		entries.push({
			condition,
			name: link.text().trim(),
			p6Id,
			status: cambaHomeStatus($el.attr('class') ?? '', `${link.text()} ${condition}`),
			timestamp: when ? parseRelativeOrDate(when) : null,
			updatedAt: when || '—'
		});
	});

	if (entries.length === 0) throw new Error('CAMBA home: no trail alerts found');
	return entries;
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
				const asOf = container
					.find('.clickable')
					.first()
					.text()
					.trim()
					.replace(/^as of\s*/i, '');

				return {
					condition: icon.attr('title')?.trim() || 'See TrailForks for current conditions',
					id: region.id,
					links: region.links,
					location: region.location,
					name: region.name,
					status: trailforksStatus(icon.attr('class') ?? ''),
					timestamp: asOf ? parseRelativeOrDate(asOf) : null,
					updatedAt: asOf || '—'
				};
			} catch {
				return {
					condition: 'No live data — check the links below for current conditions.',
					id: region.id,
					links: region.links,
					location: region.location,
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
				id: account.id,
				links,
				location: account.location,
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

	const [metroparksResult, bskyResult, cvnpResult, trailforksResult, cambaHomeResult] = await Promise.allSettled([
		scrapeMetroparks(),
		fetchBskyTrails(),
		scrapeCvnpEastRim(),
		fetchTrailforksRegions(),
		scrapeCambaHome()
	]);

	const metroparks = metroparksResult.status === 'fulfilled' ? metroparksResult.value : [];
	const bsky = bskyResult.status === 'fulfilled' ? bskyResult.value : [];
	const trailforks = trailforksResult.status === 'fulfilled' ? trailforksResult.value : [];
	const cambaHome = cambaHomeResult.status === 'fulfilled' ? cambaHomeResult.value : [];
	const cvnp =
		cvnpResult.status === 'fulfilled'
			? cvnpResult.value
			: {
					...CVNP_EAST_RIM,
					condition: 'No live data — check the links below for current conditions.',
					status: 'stale',
					updatedAt: '—'
				};

	if (metroparks.length === 0 && bsky.length === 0 && cambaHome.length === 0) {
		if (cachedTrails) return cachedTrails;
		throw new Error('All sources failed');
	}

	// Index CAMBA home entries: matched ones refresh a trail we already track,
	// unmatched-but-known ones become new cards.
	const cambaById = new Map();
	const cambaNew = [];
	for (const entry of cambaHome) {
		const existingId = CAMBA_TRAIL_IDS[entry.p6Id];
		if (existingId) {
			cambaById.set(existingId, entry);
		} else if (CAMBA_NEW_TRAILS[entry.p6Id]) {
			const meta = CAMBA_NEW_TRAILS[entry.p6Id];
			cambaNew.push({
				condition: entry.condition || 'See CAMBA Trailmate for current conditions.',
				id: meta.id,
				links: meta.links,
				location: meta.location,
				name: meta.name,
				status: entry.status,
				timestamp: entry.timestamp,
				updatedAt: entry.updatedAt
			});
		}
	}

	// Fallback: let CAMBA refresh a tracked trail when our primary source is
	// missing/stale or the CAMBA post is newer.
	const refreshWithCamba = (trail) => {
		const entry = cambaById.get(trail.id);
		if (!entry) return trail;
		const fresher =
			trail.timestamp == null ||
			trail.status === 'stale' ||
			(entry.timestamp != null && entry.timestamp > trail.timestamp);
		if (!fresher) return trail;
		return {
			...trail,
			condition: entry.condition || trail.condition,
			status: entry.status,
			timestamp: entry.timestamp,
			updatedAt: entry.updatedAt
		};
	};

	const now = Date.now();
	// Keep `status` as the last-known condition; flag staleness separately so the
	// UI can show the last status greyed out rather than losing it. Order: fresh
	// trails by status, then stale trails that still have a last-known status,
	// then pure-stale trails with no state at all at the very bottom.
	const rank = (trail) => {
		if (!trail.stale) return STATUS_ORDER[trail.status];
		return trail.status === 'stale' ? STATUS_ORDER.stale + 1 : STATUS_ORDER.stale;
	};
	const trails = [...metroparks, ...bsky, cvnp, ...trailforks, ...STATIC_TRAILS]
		.map(refreshWithCamba)
		.concat(cambaNew)
		.map((trail) => {
			const timestamp = trail.timestamp ?? null;
			const stale = trail.status === 'stale' || (timestamp != null && now - timestamp > STALE_AFTER);
			return { ...trail, stale, timestamp };
		})
		.sort((a, b) => rank(a) - rank(b));

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
