#!/usr/bin/env python3
"""Validate the explicit store migrations against the VPS, always rolling back.

Uses the existing SSH identity, deploy lock and Docker database. No credentials,
user records, demo fixtures, outbound notifications or persistent schema changes.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = [
    "20261003130000_account_deletion.sql",
    "20261003131000_terms_acceptance.sql",
    "20261003132000_chat_moderation.sql",
    "20261003133000_assistant_ai_consent.sql",
    "20261007120000_strict_assistant_consent.sql",
    "20261007121000_apple_auth_tokens.sql",
    "20261007122000_account_deletion_recovery.sql",
    "20261007123000_content_reports_and_provenance.sql",
    "20261007124000_legal_versions.sql",
]
FINGERPRINT = """
SELECT 'SCHEMA=' || md5(string_agg(item, E'\n' ORDER BY item)) FROM (
  SELECT 'function:' || p.oid::regprocedure::text || ':' || pg_get_functiondef(p.oid) AS item
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname IN ('public','private') AND p.prokind='f'
  UNION ALL SELECT 'column:' || table_schema || '.' || table_name || '.' || column_name || ':' ||
    data_type || ':' || is_nullable || ':' || coalesce(column_default,'')
    FROM information_schema.columns WHERE table_schema IN ('public','storage','private')
  UNION ALL SELECT 'policy:' || schemaname || '.' || tablename || '.' || policyname || ':' ||
    permissive || ':' || roles::text || ':' || cmd || ':' || coalesce(qual,'') || ':' || coalesce(with_check,'')
    FROM pg_policies WHERE schemaname IN ('public','storage','private')
  UNION ALL SELECT 'constraint:' || c.conrelid::regclass::text || '.' || c.conname || ':' || pg_get_constraintdef(c.oid)
    FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
    WHERE n.nspname IN ('public','storage','private')
) definitions;
"""
CHECKS = """
DO $check$
BEGIN
  IF EXISTS (SELECT FROM public.account_deletion_blocking_references()) THEN
    RAISE EXCEPTION 'Account deletion has unhandled references';
  END IF;
  IF pg_get_functiondef('public.transfer_team_ownership(uuid,uuid)'::regprocedure) NOT LIKE '%app.transfer_team_ownership%' THEN
    RAISE EXCEPTION 'Production owner guard changed';
  END IF;
  IF has_table_privilege('authenticated','public.apple_auth_tokens','SELECT')
     OR has_table_privilege('anon','public.apple_auth_tokens','SELECT') THEN
    RAISE EXCEPTION 'Apple token table is exposed';
  END IF;
  IF has_function_privilege('authenticated','public.account_deletion_recover_team(uuid,uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Recovery RPC is exposed';
  END IF;
END $check$;
\\echo STORE_MIGRATIONS_VALIDATED
"""
FULL_CHECKS = """
DO $check$
BEGIN
  IF public.legal_current_versions()::jsonb <> '{"terms":"2026-10-07","privacy":"2026-10-07"}'::jsonb THEN
    RAISE EXCEPTION 'Legal versions differ';
  END IF;
  IF EXISTS (SELECT FROM public.assistant_groups WHERE active AND
    public.assistant_team_consent_state(team_id) NOT IN ('granted','blocked')) THEN
    RAISE EXCEPTION 'An active group would bypass consent';
  END IF;
END $check$;
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="louvor-vps", help="Existing SSH alias")
    parser.add_argument("--output", type=Path, required=True, help="Local QA evidence directory")
    parser.add_argument("--scope", choices=["all", "account-deletion", "moderation"], default="all")
    args = parser.parse_args()
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*", args.host):
        parser.error("Use an SSH host alias, without command options")
    args.output.mkdir(parents=True, exist_ok=True)
    names = {"all": MIGRATIONS, "account-deletion": [
        "20261003130000_account_deletion.sql", "20261007122000_account_deletion_recovery.sql"],
        "moderation": ["20261003132000_chat_moderation.sql", "20261007123000_content_reports_and_provenance.sql"]}[args.scope]
    sources = [(name, (ROOT / "supabase/migrations" / name).read_text()) for name in names]
    sql = FINGERPRINT + "\nBEGIN; SET LOCAL statement_timeout='20s'; SET LOCAL lock_timeout='3s';\n"
    sql += (ROOT / "supabase/setup/account-deletion-preflight.sql").read_text()
    for repeat in range(2):
        for name, source in sources:
            sql += f"\n\\echo PASS_{repeat + 1}:{name}\n{source}\n"
        sql += CHECKS
        if args.scope == "all":
            sql += FULL_CHECKS
    sql += "\nROLLBACK;\n" + FINGERPRINT
    # Closing stdin/connection also rolls back on error, timeout or interruption.
    command = ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", args.host,
               "flock -n /var/lock/maislouvor-deploy.lock docker exec -i supabase-db "
               "psql -X -U postgres -d postgres -qAt -v ON_ERROR_STOP=1"]
    try:
        result = subprocess.run(command, input=sql, text=True, capture_output=True, timeout=90)
    except subprocess.TimeoutExpired:
        print("Preflight timed out; connection closed without COMMIT.", file=sys.stderr)
        return 1
    (args.output / "database-preflight.log").write_text(result.stdout + result.stderr)
    fingerprints = re.findall(r"^SCHEMA=([a-f0-9]{32})$", result.stdout, re.M)
    passed = result.returncode == 0 and len(fingerprints) == 2 and fingerprints[0] == fingerprints[1]
    passed = passed and result.stdout.count("STORE_MIGRATIONS_VALIDATED") == 2
    report = {"passed": passed, "scope": args.scope, "persistent_changes": False, "idempotency_passes": 2,
              "schema_unchanged": len(fingerprints) == 2 and fingerprints[0] == fingerprints[1],
              "migrations": [{"name": name, "sha256": hashlib.sha256(source.encode()).hexdigest()}
                             for name, source in sources]}
    (args.output / "database-preflight.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({k: v for k, v in report.items() if k != "migrations"}, indent=2))
    if not passed:
        print(result.stderr[-5000:], file=sys.stderr)
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
