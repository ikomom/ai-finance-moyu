# Move every `#[cfg(test)] mod <name> { ... }` block out of a Rust source file
# into sibling files under `tests/`, and leave `#[cfg(test)] mod <name>;`
# declarations behind.
#
# Brace counting identifies the exact extent of each module, so files with more
# than one test module (e.g. `tests` + `live_tests`) are handled correctly.
# Extraction is verbatim: multi-line string literals must keep their bytes.
param(
    [Parameter(Mandatory = $true)][string]$Path
)

$full = (Resolve-Path $Path).Path
$dir = Split-Path $full -Parent
$lines = [System.IO.File]::ReadAllLines($full)

# Collect (attrLine, modLine, endLine, name) for each test module.
$blocks = @()
for ($i = 0; $i -lt $lines.Count - 1; $i++) {
    if ($lines[$i].Trim() -ne '#[cfg(test)]') { continue }
    if ($lines[$i + 1] -notmatch '^mod ([A-Za-z0-9_]+) \{$') { continue }
    $name = $Matches[1]

    $depth = 0
    $end = -1
    for ($j = $i + 1; $j -lt $lines.Count; $j++) {
        $depth += ([regex]::Matches($lines[$j], '\{')).Count
        $depth -= ([regex]::Matches($lines[$j], '\}')).Count
        if ($depth -eq 0) { $end = $j; break }
    }
    if ($end -lt 0) { throw "unbalanced module '$name' in $Path" }

    $blocks += [pscustomobject]@{ Attr = $i; Mod = $i + 1; End = $end; Name = $name }
    $i = $end
}

if ($blocks.Count -eq 0) { Write-Output "no test modules in $Path"; return }

# Write each module body to its own file first (indices refer to the original).

foreach ($b in $blocks) {
    $body = @()
    for ($k = $b.Mod + 1; $k -lt $b.End; $k++) { $body += $lines[$k] }
    $header = @(
        "//! Tests for ``$([System.IO.Path]::GetFileNameWithoutExtension($Path))`` ($($b.Name)).",
        '//!',
        '//! Kept out of the implementation file so every source file stays inside',
        '//! the 300-line budget mandated by AGENTS.md §11.',
        ''
    )
    $out = Join-Path $dir "$($b.Name).rs"
    [System.IO.File]::WriteAllLines($out, $header + $body)
    Write-Output "wrote $out ($($body.Count) lines)"
}

# Rewrite the source, replacing each block with a declaration.
$result = New-Object System.Collections.Generic.List[string]
$cursor = 0
foreach ($b in $blocks) {
    while ($cursor -lt $b.Attr) { $result.Add($lines[$cursor]); $cursor++ }
    $result.Add('#[cfg(test)]')
    $result.Add("mod $($b.Name);")
    $cursor = $b.End + 1
}
while ($cursor -lt $lines.Count) { $result.Add($lines[$cursor]); $cursor++ }

# A `mod <name>;` inside `tests/` needs an explicit path; use #[path] instead.
$final = @()
foreach ($line in $result) {
    if ($line -match '^mod ([A-Za-z0-9_]+);$' -and ($blocks.Name -contains $Matches[1])) {
        $final += "#[path = `"$($Matches[1]).rs`"]"
    }
    $final += $line
}
[System.IO.File]::WriteAllLines($full, $final)
Write-Output "rewrote $Path -> $($final.Count) lines"
