[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-z0-9]{20}$')]
    [string]$ProjectRef,

    [switch]$Apply,

    [string]$ConfirmProjectRef
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$migrationsPath = Join-Path $repoRoot 'supabase\migrations'
$expectedMigrations = 1..7 | ForEach-Object { '{0:D3}' -f $_ }
$migrations = @(Get-ChildItem -Path $migrationsPath -Filter '*.sql' -File | Sort-Object Name)

if ($migrations.Count -ne $expectedMigrations.Count) {
    throw "Expected exactly seven SQL migrations in $migrationsPath."
}

for ($index = 0; $index -lt $expectedMigrations.Count; $index++) {
    $expectedPrefix = $expectedMigrations[$index] + '_'
    if (-not $migrations[$index].Name.StartsWith($expectedPrefix, [System.StringComparison]::Ordinal)) {
        throw "Migration order check failed. Expected $expectedPrefix at position $($index + 1), found $($migrations[$index].Name)."
    }
}

Write-Host 'Local migration inventory check passed: 001 through 007 are present in order.'
Write-Host 'This script does not run SQL unless -Apply is supplied.'

if (-not $Apply) {
    exit 0
}

if ([string]::IsNullOrWhiteSpace($ConfirmProjectRef) -or $ConfirmProjectRef -cne $ProjectRef) {
    throw 'Applying requires -ConfirmProjectRef with the exact intended Supabase project reference.'
}

Write-Host "Reviewing migration history for the explicitly supplied project reference: $ProjectRef"
& npx supabase@latest migration list --project-ref $ProjectRef
if ($LASTEXITCODE -ne 0) {
    throw 'Supabase migration-history inspection failed. No migration apply was attempted.'
}

Write-Host 'Requesting the Supabase CLI dry run. Review its output before continuing.'
& npx supabase@latest db push --dry-run --project-ref $ProjectRef
if ($LASTEXITCODE -ne 0) {
    throw 'Supabase CLI dry run failed. No migration apply was attempted.'
}

$finalConfirmation = Read-Host "Type the exact project reference to apply migrations to [$ProjectRef]"
if ($finalConfirmation -cne $ProjectRef) {
    throw 'Final project confirmation did not match. No migration apply was attempted.'
}

Write-Host 'Applying only migrations pending according to Supabase migration history.'
& npx supabase@latest db push --project-ref $ProjectRef
if ($LASTEXITCODE -ne 0) {
    throw 'Supabase migration apply failed. Inspect the CLI output and migration history before retrying.'
}

Write-Host 'Supabase CLI reported that the pending migrations were applied.'
Write-Host 'Application-level verification is still required; this script does not claim the database is initialized.'
