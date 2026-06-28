// One-command updater for anyone self-hosting the trail page from a Git clone.
// It checks GitHub for a newer version and, if there is one, pulls it, reinstalls
// dependencies, and rebuilds the site. Either way it ends by starting the page,
// so it's safe to run anytime: "stop the page, run `yarn update`, you're current".
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = process.env.PORT ?? 3000;
const run = (cmd) => execSync(cmd, { cwd: root, stdio: 'inherit' });
const capture = (cmd) =>
	execSync(cmd, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })
		.toString()
		.trim();

function fail(message) {
	console.error(`\n❌ ${message}\n`);
	process.exit(1);
}

// Is something already listening on the page's port? Probe both IPv4 and IPv6
// loopback, since the server may bind either; "running" if either accepts.
function canConnect(host, port) {
	return new Promise((resolve) => {
		const socket = net.connect({ host, port });
		const done = (result) => {
			socket.destroy();
			resolve(result);
		};
		socket.setTimeout(1000);
		socket.once('connect', () => done(true));
		socket.once('timeout', () => done(false));
		socket.once('error', () => done(false));
	});
}

async function isAlreadyRunning(port) {
	const [v4, v6] = await Promise.all([canConnect('127.0.0.1', port), canConnect('::1', port)]);
	return v4 || v6;
}

// 1. Make sure we can talk to Git and that this is a real clone (ZIP downloads
//    have no Git history, so they can't check GitHub for updates).
let branch;
try {
	branch = capture('git rev-parse --abbrev-ref HEAD');
} catch {
	fail(
		"Couldn't check for updates with Git.\n" +
			"   Either Git isn't installed, or this folder is a ZIP download rather than\n" +
			'   a "git clone". Install Git (https://git-scm.com/downloads) and get the\n' +
			'   project with "git clone" (see the README). Then run "yarn update" again.'
	);
}

// 2. Ask GitHub what the latest version is.
console.log('🔎 Checking GitHub for updates...');
try {
	run('git fetch --quiet');
} catch {
	fail("Couldn't reach GitHub. Check your internet connection and try again.");
}

let local, remote;
try {
	local = capture('git rev-parse HEAD');
	remote = capture(`git rev-parse origin/${branch}`);
} catch {
	fail(`This branch (${branch}) isn't linked to a GitHub branch, so there's nothing to compare against.`);
}

const distExists = existsSync(path.join(root, 'dist'));

if (local === remote) {
	// 3a. Already current; only build if the page was never built.
	console.log("✅ You're already on the latest version.");
	if (!distExists) {
		console.log('🛠️  Building the page...');
		run('yarn build');
	}
} else {
	// 3b. New version available; pull, reinstall, rebuild.
	console.log('⬆️  A new version is available, updating...');
	try {
		run('git pull --ff-only');
	} catch {
		fail(
			"The update couldn't be applied automatically.\n" +
				'   This usually means this copy has local edits. Undo them (or re-clone\n' +
				'   the project) and run "yarn update" again.'
		);
	}
	console.log('📦 Installing any new pieces...');
	run('yarn install');
	console.log('🛠️  Building the new version...');
	run('yarn build');
	console.log('🎉 Updated to the latest version!');
}

// 4. Start the page - unless it's already running somewhere else. Starting a
//    second copy would just collide on the port, so detect that and explain how
//    to load the new version instead.
if (await isAlreadyRunning(PORT)) {
	console.log(
		`\nℹ️  The page is already running on port ${PORT} (another window, PM2, or a service).\n` +
			'   Your copy is now up to date. Restart that one to load the new version:\n' +
			'     - In its terminal window: press Ctrl+C, then run "yarn update" again.\n' +
			'     - If you set up PM2: run "pm2 restart mtb-trails".\n'
	);
	process.exit(0);
}

console.log(`\n🚀 Starting the page -> http://localhost:${PORT}   (press Ctrl+C to stop)\n`);
run('node server.mjs');
