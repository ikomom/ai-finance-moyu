#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import readline from 'readline';

// ANSI color helpers
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  magenta: '\x1b[35m'
};

const log = {
  info: (msg) => console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✔${colors.reset} ${colors.bold}${msg}${colors.reset}`),
  warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✖${colors.reset} ${colors.bold}${msg}${colors.reset}`),
  step: (title) => console.log(`\n${colors.bold}${colors.magenta}==>${colors.reset} ${colors.bold}${title}${colors.reset}`),
};

function run(cmd, options = {}) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: options.silent ? 'pipe' : 'inherit', ...options });
  } catch (err) {
    if (options.ignoreError) return null;
    throw err;
  }
}

function runOutput(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const skipTests = args.includes('--skip-tests');
const autoConfirm = args.includes('--yes') || args.includes('-y');
const versionArg = args.find((a) => !a.startsWith('--') && !a.startsWith('-'));

function ask(question, defaultValue = '') {
  if (autoConfirm) {
    const promptText = defaultValue ? `${question} (${defaultValue}): ` : `${question}: `;
    console.log(`${promptText}${defaultValue} [auto]`);
    return Promise.resolve(defaultValue);
  }
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise((resolve) => {
    const promptText = defaultValue ? `${question} (${defaultValue}): ` : `${question}: `;
    rl.question(promptText, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue);
    });
  });
}

async function main() {
  console.log(`\n${colors.bold}${colors.cyan}╔══════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}║   AI Finance Moyu - Release Workflow Tool    ║${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}╚══════════════════════════════════════════════╝${colors.reset}\n`);

  if (isDryRun) {
    log.warn('Running in --dry-run mode. No files will be modified and no Git commits/tags will be made.');
  }

  // 1. Pre-flight Git status check
  log.step('1. Pre-flight Checks (Git & Branch)');
  const gitStatus = runOutput('git status --porcelain');
  if (gitStatus && !isDryRun) {
    log.error('Working directory is not clean. Please commit or stash your changes before releasing.');
    console.log(gitStatus);
    process.exit(1);
  }

  const currentBranch = runOutput('git branch --show-current');
  if (currentBranch !== 'main' && !isDryRun) {
    log.warn(`Currently on branch '${currentBranch}' instead of 'main'.`);
    const proceed = await ask('Do you really want to release from a non-main branch? (y/N)', 'N');
    if (proceed.toLowerCase() !== 'y') {
      log.info('Release aborted.');
      process.exit(0);
    }
  }
  log.success('Git status is clean and ready.');

  // 2. Pre-flight tests & builds
  log.step('2. Pre-flight Quality Verification');
  if (skipTests) {
    log.warn('Skipping local tests due to --skip-tests flag.');
  } else {
    log.info('Building frontend and type-checking (npm run build)...');
    run('npm run build');

    log.info('Running Rust backend unit tests (cargo test --lib)...');
    run('cargo test --manifest-path src-tauri/Cargo.toml --lib');
    log.success('Frontend build and backend tests passed with 0 errors.');
  }

  // 3. Determine versions
  log.step('3. Target Version Selection');
  const pkgPath = path.resolve('package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const currentVersion = pkg.version;
  log.info(`Current version: ${colors.bold}v${currentVersion}${colors.reset}`);

  const semverRegex = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;
  const match = currentVersion.match(semverRegex);
  if (!match) {
    log.error(`Current version '${currentVersion}' does not follow SemVer format.`);
    process.exit(1);
  }

  const major = parseInt(match[1], 10);
  const minor = parseInt(match[2], 10);
  const patch = parseInt(match[3], 10);

  const nextPatch = `${major}.${minor}.${patch + 1}`;
  const nextMinor = `${major}.${minor + 1}.0`;
  const nextMajor = `${major + 1}.0.0`;

  let targetVersion = '';
  if (versionArg) {
    if (versionArg === 'patch') targetVersion = nextPatch;
    else if (versionArg === 'minor') targetVersion = nextMinor;
    else if (versionArg === 'major') targetVersion = nextMajor;
    else if (semverRegex.test(versionArg.replace(/^v/, ''))) {
      targetVersion = versionArg.replace(/^v/, '');
    } else {
      log.error(`Invalid version argument: '${versionArg}'.`);
      process.exit(1);
    }
  } else {
    console.log(`\nSelect release type:`);
    console.log(`  1) ${colors.green}patch${colors.reset} : ${colors.bold}${nextPatch}${colors.reset}  (Bug fixes & small improvements)`);
    console.log(`  2) ${colors.yellow}minor${colors.reset} : ${colors.bold}${nextMinor}${colors.reset}  (New features & enhancements)`);
    console.log(`  3) ${colors.red}major${colors.reset} : ${colors.bold}${nextMajor}${colors.reset}  (Breaking changes)`);
    console.log(`  4) custom: manually specify version\n`);

    const choice = await ask('Choose an option [1-4]', '1');
    if (choice === '1') targetVersion = nextPatch;
    else if (choice === '2') targetVersion = nextMinor;
    else if (choice === '3') targetVersion = nextMajor;
    else if (choice === '4') {
      const custom = await ask('Enter custom version (e.g. 0.2.0)');
      const cleanCustom = custom.replace(/^v/, '').trim();
      if (!semverRegex.test(cleanCustom)) {
        log.error(`Invalid custom SemVer version: '${custom}'.`);
        process.exit(1);
      }
      targetVersion = cleanCustom;
    } else {
      log.error('Invalid choice.');
      process.exit(1);
    }
  }

  log.success(`Target release version: ${colors.bold}v${targetVersion}${colors.reset}`);

  // 4. Generate Changelog Draft
  log.step('4. Generating Changelog Draft');
  const changelogPath = path.resolve('CHANGELOG.md');
  let hasExistingSection = false;
  let changelogSection = '';

  if (fs.existsSync(changelogPath)) {
    const existing = fs.readFileSync(changelogPath, 'utf8');
    if (existing.includes(`## [${targetVersion}]`)) {
      hasExistingSection = true;
      log.info(`Found pre-defined changelog section for v${targetVersion} in CHANGELOG.md.`);
    }
  }

  if (!hasExistingSection) {
    const latestTag = runOutput('git tag --list --sort=-v:refname').split('\n')[0]?.trim();
    const gitLogRange = latestTag ? `${latestTag}..HEAD` : 'HEAD';
    log.info(`Reading commits from range: ${colors.dim}${gitLogRange}${colors.reset}`);

    const rawCommits = runOutput(`git log ${gitLogRange} --oneline`).split('\n').filter(Boolean);
    const commits = rawCommits.filter((line) => !line.includes('chore(release):'));

    const feats = [];
    const fixes = [];
    const perfs = [];
    const others = [];

    for (const line of commits) {
      const text = line.replace(/^[a-f0-9]+\s+/, '');
      if (/^feat(\(.*?\))?:/i.test(text)) {
        feats.push(text.replace(/^feat(\(.*?\))?:\s*/i, ''));
      } else if (/^fix(\(.*?\))?:/i.test(text)) {
        fixes.push(text.replace(/^fix(\(.*?\))?:\s*/i, ''));
      } else if (/^perf(\(.*?\))?:/i.test(text)) {
        perfs.push(text.replace(/^perf(\(.*?\))?:\s*/i, ''));
      } else {
        others.push(text);
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    changelogSection = `## [${targetVersion}] - ${today}\n\n`;

    if (feats.length > 0) {
      changelogSection += `### 🚀 新增功能\n`;
      feats.forEach((f) => {
        changelogSection += `- ${f}\n`;
      });
      changelogSection += `\n`;
    }

    if (fixes.length > 0 || perfs.length > 0) {
      changelogSection += `### 🛠️ 优化与修复\n`;
      fixes.forEach((f) => {
        changelogSection += `- ${f}\n`;
      });
      perfs.forEach((p) => {
        changelogSection += `- 性能优化: ${p}\n`;
      });
      changelogSection += `\n`;
    }

    if (feats.length === 0 && fixes.length === 0 && perfs.length === 0 && others.length > 0) {
      changelogSection += `### 📦 变更记录\n`;
      others.forEach((o) => {
        changelogSection += `- ${o}\n`;
      });
      changelogSection += `\n`;
    }

    console.log(`\n${colors.cyan}--- Changelog Draft Preview ---${colors.reset}`);
    console.log(changelogSection.trim());
    console.log(`${colors.cyan}--------------------------------${colors.reset}\n`);

    const confirmChangelog = await ask('Use this changelog entry? (Y/n)', 'Y');
    if (confirmChangelog.toLowerCase() !== 'n') {
      log.warn('Release aborted. You can modify CHANGELOG.md manually and re-run.');
      process.exit(0);
    }
  }

  // 5. Update Version in Files & CHANGELOG.md
  log.step('5. Updating Version Across Project Files');
  const filesToCommit = [];

  // package.json
  if (!isDryRun) {
    pkg.version = targetVersion;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  }
  log.info(`Updated package.json -> ${targetVersion}`);
  filesToCommit.push('package.json');

  // package-lock.json (if exists)
  const pkgLockPath = path.resolve('package-lock.json');
  if (fs.existsSync(pkgLockPath)) {
    if (!isDryRun) {
      const pkgLock = JSON.parse(fs.readFileSync(pkgLockPath, 'utf8'));
      pkgLock.version = targetVersion;
      if (pkgLock.packages && pkgLock.packages['']) {
        pkgLock.packages[''].version = targetVersion;
      }
      fs.writeFileSync(pkgLockPath, JSON.stringify(pkgLock, null, 2) + '\n');
    }
    log.info(`Updated package-lock.json -> ${targetVersion}`);
    filesToCommit.push('package-lock.json');
  }

  // src-tauri/Cargo.toml
  const cargoPath = path.resolve('src-tauri/Cargo.toml');
  if (fs.existsSync(cargoPath)) {
    if (!isDryRun) {
      let cargoContent = fs.readFileSync(cargoPath, 'utf8');
      cargoContent = cargoContent.replace(
        /(\[package\][\s\S]*?version\s*=\s*")[^"]+(")/,
        `$1${targetVersion}$2`
      );
      fs.writeFileSync(cargoPath, cargoContent);
    }
    log.info(`Updated src-tauri/Cargo.toml -> ${targetVersion}`);
    filesToCommit.push('src-tauri/Cargo.toml');
  }

  // src-tauri/Cargo.lock
  const cargoLockPath = path.resolve('src-tauri/Cargo.lock');
  if (fs.existsSync(cargoLockPath)) {
    if (!isDryRun) {
      try {
        run('cargo check --manifest-path src-tauri/Cargo.toml', { silent: true, ignoreError: true });
      } catch {}
    }
    log.info(`Updated src-tauri/Cargo.lock -> ${targetVersion}`);
    filesToCommit.push('src-tauri/Cargo.lock');
  }

  // src-tauri/tauri.conf.json
  const tauriConfPath = path.resolve('src-tauri/tauri.conf.json');
  if (fs.existsSync(tauriConfPath)) {
    if (!isDryRun) {
      const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
      tauriConf.version = targetVersion;
      fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n');
    }
    log.info(`Updated src-tauri/tauri.conf.json -> ${targetVersion}`);
    filesToCommit.push('src-tauri/tauri.conf.json');
  }

  // CHANGELOG.md
  if (fs.existsSync(changelogPath)) {
    if (!isDryRun && !hasExistingSection && changelogSection) {
      let existingChangelog = fs.readFileSync(changelogPath, 'utf8');
      const firstSectionIndex = existingChangelog.indexOf('## [');
      if (firstSectionIndex !== -1) {
        existingChangelog =
          existingChangelog.slice(0, firstSectionIndex) +
          changelogSection +
          '---\n\n' +
          existingChangelog.slice(firstSectionIndex);
      } else {
        existingChangelog += '\n\n' + changelogSection;
      }
      fs.writeFileSync(changelogPath, existingChangelog);
      filesToCommit.push('CHANGELOG.md');
      log.info(`Updated CHANGELOG.md`);
    } else {
      log.info(`Verified CHANGELOG.md`);
    }
  }

  log.success('All version references and CHANGELOG updated successfully.');

  if (isDryRun) {
    log.info(`[Dry-Run] Would stage: ${filesToCommit.join(', ')}`);
    log.info(`[Dry-Run] Would commit: chore(release): v${targetVersion}`);
    log.info(`[Dry-Run] Would tag: v${targetVersion}`);
    log.info(`[Dry-Run] Would push: git push origin main --tags`);
    log.success('Dry run completed successfully!');
    return;
  }

  // 6. Git Add, Commit & Tag
  log.step('6. Git Commit and Tagging');
  run(`git add ${filesToCommit.join(' ')}`);
  run(`git commit -m "chore(release): v${targetVersion}"`);
  run(`git tag -a v${targetVersion} -m "Release v${targetVersion}"`);
  log.success(`Locally committed and tagged as v${targetVersion}!`);

  const commitHash = runOutput('git rev-parse --short HEAD');

  // 7. Final Push Confirmation
  log.step('7. Push to Remote & Trigger GitHub Release');
  console.log(`\n${colors.bold}${colors.green}╔════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bold}${colors.green}║               Ready to Publish Release                 ║${colors.reset}`);
  console.log(`${colors.bold}${colors.green}╠════════════════════════════════════════════════════════╣${colors.reset}`);
  console.log(`║  ${colors.bold}Target Version :${colors.reset} v${targetVersion.padEnd(35)}║`);
  console.log(`║  ${colors.bold}Commit Hash    :${colors.reset} ${commitHash.padEnd(36)}║`);
  console.log(`║  ${colors.bold}Git Tag        :${colors.reset} v${targetVersion.padEnd(35)}║`);
  console.log(`${colors.bold}${colors.green}╚════════════════════════════════════════════════════════╝${colors.reset}\n`);

  const confirmPush = await ask('Push commit and tag to origin now? (Y/n)', 'Y');
  if (confirmPush.toLowerCase() !== 'y') {
    log.warn('Push skipped. The commit and tag remain on your local repository.');
    log.info(`When ready, you can push manually by running:`);
    console.log(`  ${colors.bold}git push origin main --tags${colors.reset}\n`);
    return;
  }

  log.info('Pushing main branch and tags to origin...');
  run('git push origin main --tags');
  log.success('Pushed successfully!');

  console.log(`\n${colors.bold}${colors.cyan}🎉 Release v${targetVersion} pipeline has been triggered!${colors.reset}`);
  console.log(`Track progress at: ${colors.bold}https://github.com/ikomom/ai-finance-moyu/actions${colors.reset}\n`);
}

main().catch((err) => {
  log.error(`Release failed: ${err.message || err}`);
  process.exit(1);
});
