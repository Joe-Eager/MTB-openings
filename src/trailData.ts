export type TrailStatus = 'caution' | 'closed' | 'open' | 'stale';

export interface TrailLink {
	name: string;
	url: string;
}

export interface Trail {
	condition: string;
	id: string;
	links: TrailLink[];
	location: string;
	name: string;
	stale: boolean;
	status: TrailStatus;
	timestamp: number | null;
	updatedAt: string;
}
