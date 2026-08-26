import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getBuildVersion() {
  const pkgVersion = (() => {
    try {
      const pkg = JSON.parse(readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));
      return pkg.version || '0.0.0';
    } catch {
      return '0.0.0';
    }
  })();

  // Vercel exposes the deploy commit SHA; fall back to git locally, then to nothing.
  const sha =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    (() => {
      try {
        // stderr silenced: a fresh clone with no commits would print a git fatal.
        return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
      } catch {
        return '';
      }
    })();

  const shortSha = sha ? sha.slice(0, 7) : 'dev';
  const buildDate = new Date().toISOString().slice(0, 16).replace('T', ' ');
  return `v${pkgVersion} · ${shortSha} · ${buildDate}`;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_APP_VERSION: getBuildVersion(),
  },
};

export default nextConfig;
