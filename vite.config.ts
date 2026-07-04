import { execSync } from 'node:child_process';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Build number = total git commits, computed fresh on every build. Version is
// `3.<build>`. Falls back to 3.0 if git isn't available (e.g. a source export).
const MAJOR = 3;
let build = 0;
try {
	build = parseInt(execSync('git rev-list --count HEAD', { encoding: 'utf8' }).trim(), 10) || 0;
} catch {
	// no git / no commits
}
const version = `${MAJOR}.${build}`;

export default defineConfig({
	define: {
		__APP_VERSION__: JSON.stringify(version)
	},
	plugins: [react()],
	server: {
		proxy: {
			'/api': 'http://localhost:3000'
		}
	}
});
