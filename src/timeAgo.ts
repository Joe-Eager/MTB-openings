import { useSyncExternalStore } from 'react';

const RELATIVE = new Intl.RelativeTimeFormat('en', { numeric: 'always' });
const DIVISIONS: [number, Intl.RelativeTimeFormatUnit][] = [
	[60, 'second'],
	[60, 'minute'],
	[24, 'hour'],
	[7, 'day'],
	[4.34524, 'week'],
	[12, 'month'],
	[Number.POSITIVE_INFINITY, 'year']
];

// "47 hours ago", matching the relative style the East Rim source already uses.
export function timeAgo(timestamp: number | null): string {
	if (timestamp == null) return '-';
	let duration = (timestamp - Date.now()) / 1000;
	for (const [amount, unit] of DIVISIONS) {
		if (Math.abs(duration) < amount) return RELATIVE.format(Math.round(duration), unit);
		duration /= amount;
	}
	return '-';
}

// A single shared 30s ticker so every relative timestamp on the page advances
// together (and we don't spin up one interval per card).
const TICK_MS = 30_000;
const listeners = new Set<() => void>();
let tick = 0;
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(onChange: () => void): () => void {
	listeners.add(onChange);
	if (timer === undefined) {
		timer = setInterval(() => {
			tick++;
			listeners.forEach((l) => l());
		}, TICK_MS);
	}
	return () => {
		listeners.delete(onChange);
		if (listeners.size === 0) {
			clearInterval(timer);
			timer = undefined;
		}
	};
}

const getTick = () => tick;

// Live version of timeAgo: re-renders the caller on each shared tick so the
// displayed "x minutes ago" stays current without a manual refresh.
export function useTimeAgo(timestamp: number | null): string {
	useSyncExternalStore(subscribe, getTick, getTick);
	return timeAgo(timestamp);
}
