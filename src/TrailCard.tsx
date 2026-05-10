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
	unknown: 'Check Status'
};

interface Props {
	trail: Trail;
}

function TrailCard({ trail }: Props) {
	console.log('👌 ~ TrailCard ~ trail:', trail);
	return (
		<article className={`trail-card trail-card--${trail.status}`}>
			<div className='trail-card__header'>
				<span className={`trail-card__badge trail-card__badge--${trail.status}`}>
					{STATUS_LABEL[trail.status]}
				</span>
				<span className='trail-card__updated'>{trail.updatedAt}</span>
			</div>
			<h2 className='trail-card__name'>{trail.name}</h2>
			<p className='trail-card__location'>{trail.location}</p>
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
		</article>
	);
}

export default TrailCard;
