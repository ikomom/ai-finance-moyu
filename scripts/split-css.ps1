# Split an oversized CSS file into `@import`ed partials at section-comment
# boundaries, so every file stays inside the 300-line budget (AGENTS.md §11).
#
# The original file keeps only its header comment and the import list, which is
# valid CSS (imports must precede rules) and is handled by Vite and by
# `@tailwindcss/vite` like any other import.
param(
    [Parameter(Mandatory = $true)][string]$Path,
    [int]$MaxLines = 280
)

$full = (Resolve-Path $Path).Path
$dir = Split-Path $full -Parent
$base = [System.IO.Path]::GetFileNameWithoutExtension($full)
$lines = [System.IO.File]::ReadAllLines($full)

# Section boundaries: `/* ... */` comments that start at column 0.
$starts = @(0)
for ($i = 1; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match '^/\*') { $starts += $i }
}

$sections = @()
for ($i = 0; $i -lt $starts.Count; $i++) {
    $from = $starts[$i]
    $to = if ($i + 1 -lt $starts.Count) { $starts[$i + 1] - 1 } else { $lines.Count - 1 }
    $sections += , @($from, $to)
}

$parts = @()
$current = @()
$currentLen = 0
foreach ($sec in $sections) {
    $len = $sec[1] - $sec[0] + 1
    if ($currentLen -gt 0 -and ($currentLen + $len) -gt $MaxLines) {
        $parts += , $current
        $current = @()
        $currentLen = 0
    }
    $current += , $sec
    $currentLen += $len
}
if ($current.Count -gt 0) { $parts += , $current }

if ($parts.Count -lt 2) { Write-Output "${base}: nothing to split"; return }

# Header = leading comment block of the original (kept in the entry file).
$header = @()
foreach ($line in $lines) {
    $header += $line
    if ($line -match '\*/') { break }
}

$imports = @()
for ($p = 0; $p -lt $parts.Count; $p++) {
    $n = $p + 1
    $body = @()
    foreach ($sec in $parts[$p]) {
        for ($k = $sec[0]; $k -le $sec[1]; $k++) { $body += $lines[$k] }
    }
    $name = "$base.part$n.css"
    [System.IO.File]::WriteAllLines((Join-Path $dir $name), $body)
    $imports += "@import './$name';"
    Write-Output "  $name : $($body.Count) lines"
}

$entry = $header + @('') + $imports
[System.IO.File]::WriteAllLines($full, $entry)
Write-Output "$base.css -> $($imports.Count) partials, entry $($entry.Count) lines"
