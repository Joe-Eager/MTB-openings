import { useState } from 'react';

import type { Trail } from './trailData';

const DIFFICULTY_LABEL: Record<Trail['difficulty'], string> = {
	black: 'Advanced',
	blue: 'Intermediate',
	green: 'Easy'
};

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
	const query = `${trail.name}, ${trail.location.replace(/·/g, ',')}`;
	return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function TrailCard({ trail }: Props) {
	const [expanded, setExpanded] = useState(false);
	const detailsId = `trail-details-${trail.id}`;

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
						<span className='trail-card__title'>{trail.name}</span>
						<span aria-hidden='true' className='trail-card__chevron'>
							›
						</span>
					</button>
				</h2>
				<span className='trail-card__updated'>{trail.updatedAt}</span>
			</div>
			<div className='trail-card__details' id={detailsId}>
				<a
					className='trail-card__location'
					href={mapsUrl(trail)}
					rel='noopener noreferrer'
					target='_blank'
				>
					{trail.location}
				</a>
				<p className='trail-card__condition'>{trail.condition}</p>
				<div className='trail-card__meta'>
					<span className={`trail-card__diff trail-card__diff--${trail.difficulty}`}>
						{DIFFICULTY_LABEL[trail.difficulty]}
					</span>
					{trail.miles > 0 && <span className='trail-card__miles'>{trail.miles} mi</span>}
				</div>
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
		</article>
	);
}

export default TrailCard;
