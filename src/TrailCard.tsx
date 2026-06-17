import { useState } from 'react';

import type { Trail } from './trailData';

const STATUS_LABEL: Record<Trail['status'], string> = {
	caution: 'Caution',
	closed: 'Closed',
	open: 'Open',
	stale: 'Stale'
};

interface Props {
	trail: Trail;
}

function mapsUrl(trail: Trail): string {
	const query = trail.location.replace(/·/g, ',');
	return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

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

// "47 hours ago" — matches the relative style the East Rim source already uses.
function timeAgo(timestamp: number | null): string {
	if (timestamp == null) return '—';
	let duration = (timestamp - Date.now()) / 1000;
	for (const [amount, unit] of DIVISIONS) {
		if (Math.abs(duration) < amount) return RELATIVE.format(Math.round(duration), unit);
		duration /= amount;
	}
	return '—';
}

function TrailCard({ trail }: Props) {
	const [expanded, setExpanded] = useState(false);
	const detailsId = `trail-details-${trail.id}`;
	const displayName = trail.name.replace('Ohio & Erie Canal', 'OECR');

	return (
		<article className={`trail-card trail-card--${trail.status}${expanded ? ' is-expanded' : ''}`}>
			<div className='trail-card__head'>
				<h2 className='trail-card__name'>
					<button
						aria-controls={detailsId}
						aria-expanded={expanded}
						className='trail-card__summary'
						onClick={() => setExpanded((v) => !v)}
						type='button'
					>
						<span className={`trail-card__badge trail-card__badge--${trail.status}`}>
							{STATUS_LABEL[trail.status]}
						</span>
						<span className='trail-card__title'>{displayName}</span>
						<span aria-hidden='true' className='trail-card__chevron'>
							›
						</span>
					</button>
				</h2>
			</div>
			<div className='trail-card__details' id={detailsId}>
				<a
					className='trail-card__location'
					href={mapsUrl(trail)}
					rel='noopener noreferrer'
					target='_blank'
					title={trail.location}
				>
					{trail.location}
				</a>
				<p className='trail-card__condition'>{trail.condition}</p>
				<div className='trail-card__foot'>
					{trail.timestamp != null && (
						<span className='trail-card__updated' title={trail.updatedAt}>
							{timeAgo(trail.timestamp)}
						</span>
					)}
					<div className='trail-card__links'>
						{(trail.links ?? []).map((link) => (
							<a
								className='trail-card__source'
								href={link.url}
								key={link.url}
								rel='noopener noreferrer'
								target='_blank'
							>
								{link.name} ↗
							</a>
						))}
					</div>
				</div>
			</div>
		</article>
	);
}

export default TrailCard;
