import { useEffect, useState } from 'react';

import TrailCard from './TrailCard';
import type { Trail } from './trailData';

import './App.css';

type Theme = 'dracula' | 'alucard';

function getInitialTheme(): Theme {
	const saved = localStorage.getItem('theme');
	if (saved === 'dracula' || saved === 'alucard') return saved;
	return window.matchMedia('(prefers-color-scheme: light)').matches ? 'alucard' : 'dracula';
}

function App() {
	const [error, setError] = useState(false);
	const [loading, setLoading] = useState(true);
	const [trails, setTrails] = useState<Trail[]>([]);
	const [theme, setTheme] = useState<Theme>(getInitialTheme);

	useEffect(() => {
		document.documentElement.dataset.theme = theme;
		localStorage.setItem('theme', theme);
	}, [theme]);

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
				<button
					aria-checked={theme === 'dracula'}
					aria-label="Dark theme"
					className="theme-toggle"
					onClick={() => setTheme((t) => (t === 'dracula' ? 'alucard' : 'dracula'))}
					role="switch"
					type="button"
				>
					<span className="theme-toggle__track">
						<span className="theme-toggle__knob">
							{theme === 'dracula' ? (
								<svg aria-hidden="true" className="theme-toggle__icon" fill="currentColor" viewBox="0 0 24 24">
									<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
								</svg>
							) : (
								<svg
									aria-hidden="true"
									className="theme-toggle__icon"
									fill="none"
									stroke="currentColor"
									strokeLinecap="round"
									strokeWidth="2"
									viewBox="0 0 24 24"
								>
									<circle cx="12" cy="12" r="4" />
									<path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
								</svg>
							)}
						</span>
					</span>
				</button>
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
