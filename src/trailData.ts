export type Difficulty = 'black' | 'blue' | 'green';
export type TrailStatus = 'caution' | 'closed' | 'open' | 'stale';

export interface TrailLink {
	name: string;
	url: string;
}

export interface Trail {
	condition: string;
	difficulty: Difficulty;
	id: string;
	links: TrailLink[];
	location: string;
	miles: number;
	name: string;
	status: TrailStatus;
	updatedAt: string;
}
