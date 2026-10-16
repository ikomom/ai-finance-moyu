import fs from 'fs';
import path from 'path';

// Target version can be passed as argument (e.g. "0.1.1" or "v0.1.1"),
// or read from package.json
const argVersion = process.argv[2];
let targetVersion = argVersion ? argVersion.replace(/^v/, '').trim() : null;

const changelogPath = path.resolve('CHANGELOG.md');
if (!fs.existsSync(changelogPath)) {
  console.error('CHANGELOG.md not found');
  process.exit(1);
}

if (!targetVersion) {
  const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
  targetVersion = pkg.version;
}

const changelog = fs.readFileSync(changelogPath, 'utf8');

// Match section header for target version: ## [0.1.1] or ## v0.1.1 or ## 0.1.1 until next ## or end of file
const escapedVersion = targetVersion.replace(/\./g, '\\.');
const versionRegex = new RegExp(`##\\s+\\[?v?${escapedVersion}\\]?([^\n]*)\n([\\s\\S]*?)(?=(?:\\n##\\s+|$))`);
const match = changelog.match(versionRegex);

let body = '';
if (match && match[2]) {
  body = match[2].trim().replace(/\n+---+\s*$/, '').trim();
}

if (!body) {
  body = `Release v${targetVersion}\n\nSee assets below to download and install this version.`;
}

console.log(`--- Extracted Release Notes for v${targetVersion} ---`);
console.log(body);
console.log('----------------------------------------------------');

if (process.env.GITHUB_OUTPUT) {
  const delimiter = `CHANGELOG_EOF_${Date.now()}`;
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    `body<<${delimiter}\n${body}\n${delimiter}\n`
  );
  console.log('Successfully written to GITHUB_OUTPUT.');
}
