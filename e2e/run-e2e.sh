#!/usr/bin/env bash
# End-to-end tests of the eMAR against a DISPOSABLE OpenMRS server (never a production or pilot instance), with
# fictitious data only. Prerequisites (in other terminals):
#   - a backend with the emar module and its Initializer metadata, reachable at E2E_BACKEND (default
#     http://127.0.0.1:8097/openmrs);
#   - `openmrs develop` of this repo on :8080 (see the README, «End-to-end tests»).
# Credentials and fixture data come from e2e/.env (git-ignored); see e2e/env.example.
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env ] && set -a && source .env && set +a
: "${E2E_NURSE_USER:?set the e2e environment (see e2e/env.example)}"
export E2E_OUT="${E2E_OUT:-$(mktemp -d)}"
BACKEND="${E2E_BACKEND:-http://127.0.0.1:8097/openmrs}"
curl -sf -o /dev/null "$BACKEND/ws/rest/v1/session" || { echo "The backend does not answer at $BACKEND"; exit 1; }
npx playwright test --config playwright.config.ts "$@" 2>&1 | tee "$E2E_OUT/output.txt"
echo "Screenshots and output in $E2E_OUT"
