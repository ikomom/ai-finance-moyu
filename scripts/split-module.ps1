# Convert a top-level `src/foo.rs` into `src/foo/mod.rs` + `src/foo/tests.rs`.
#
# The current (edited) file becomes `mod.rs` with its trailing
# `#[cfg(test)] #[path = ...] mod tests;` declaration normalised to a plain
# `#[cfg(test)] mod tests;`. The test body is re-read from `git show HEAD:...`
# because a previous bulk extraction consumed it.
param(
    [Parameter(Mandatory = $true)][string]$Path,
    [string]$RepoRoot = '.'
)

$full = (Resolve-Path $Path).Path
$repoRel = $Path -replace '\\', '/'
$dirname = [System.IO.Path]::GetFileNameWithoutExtension($full)
$dir = Join-Path (Split-Path $full -Parent) $dirname
if (Test-Path $dir) { throw "$dir already exists" }
New-Item -ItemType Directory -Path $dir | Out-Null

# --- 1. implementation file -------------------------------------------------
$lines = [System.IO.File]::ReadAllLines($full)
$keep = @()
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i].Trim() -eq '#[cfg(test)]') { break }
    $keep += $lines[$i]
}
# Drop a trailing blank line run.
while ($keep.Count -gt 0 -and $keep[-1].Trim() -eq '') { $keep = $keep[0..($keep.Count - 2)] }
$keep += ''
$keep += '#[cfg(test)]'
$keep += 'mod tests;'
[System.IO.File]::WriteAllLines((Join-Path $dir 'mod.rs'), $keep)

# --- 2. tests from the pristine committed version ---------------------------
$original = & git -C $RepoRoot show "HEAD:$repoRel" 2>$null
if (-not $original) { throw "git show failed for $repoRel" }

$start = -1
for ($i = 0; $i -lt $original.Count; $i++) {
    if ($original[$i].Trim() -eq '#[cfg(test)]' -and $original[$i + 1] -match '^mod tests \{') { $start = $i; break }
}
if ($start -lt 0) { throw "no inline test module in HEAD:$repoRel" }

$depth = 0
$end = -1
for ($j = $start + 1; $j -lt $original.Count; $j++) {
    $depth += ([regex]::Matches($original[$j], '\{')).Count
    $depth -= ([regex]::Matches($original[$j], '\}')).Count
    if ($depth -eq 0) { $end = $j; break }
}

$body = @()
for ($k = $start + 2; $k -lt $end; $k++) { $body += $original[$k] }
$header = @(
    "//! Unit tests for ``$dirname``.",
    '//!',
    '//! Kept in their own file so the implementation stays inside the 300-line',
    '//! budget mandated by AGENTS.md §11.',
    ''
)
[System.IO.File]::WriteAllLines((Join-Path $dir 'tests.rs'), $header + $body)

Remove-Item $full -Force
Write-Output "$dirname : mod.rs=$($keep.Count) lines, tests.rs=$($body.Count) lines"
