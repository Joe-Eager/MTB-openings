import { useEffect, useState } from 'react';

import TrailCard from './TrailCard';
import type { Trail } from './trailData';

import './App.css';

function App() {
	const [error, setError] = useState(false);
	const [loading, setLoading] = useState(true);
	const [trails, setTrails] = useState<Trail[]>([]);

	useEffect(() => {
		fetch('/api/trails')
			.then((res) => {
				if (!res.ok) throw new Error();
				return res.json() as Promise<Trail[]>;
			})
			.then(setTrails)
			.catch(() => setError(true))
			.finally(() => setLoading(false));
	}, []);

	const cautionCount = trails.filter((t) => t.status === 'caution').length;
	const closedCount = trails.filter((t) => t.status === 'closed').length;
	const openCount = trails.filter((t) => t.status === 'open').length;

	return (
		<>
			<header className="site-header">
				<h1>CLE MTB Trails</h1>
				<p className="site-header__subtitle">Trail conditions · Cleveland Metroparks</p>
				{!loading && !error && (
					<div className="site-header__summary">
						<span className="summary-chip summary-chip--open">{openCount} open</span>
						{cautionCount > 0 && (
							<span className="summary-chip summary-chip--caution">{cautionCount} caution</span>
						)}
						<span className="summary-chip summary-chip--closed">{closedCount} closed</span>
					</div>
				)}
			</header>
			<main className="trail-grid">
				{loading && <p className="status-msg">Loading trail conditions…</p>}
				{error && (
					<p className="status-msg status-msg--error">
						Could not load trail conditions. Check the server is running.
					</p>
				)}
				{!loading && !error && trails.map((trail) => <TrailCard key={trail.id} trail={trail} />)}
			</main>
			<footer className="site-footer">
				<p>Data from Cleveland Metroparks · Cached for 5 minutes · Built {new Date(__BUILD_TIME__).toLocaleString('en-US', { day: 'numeric', hour: 'numeric', minute: '2-digit', month: 'short' })}</p>
			</footer>
		</>
	);
}

export default App;
