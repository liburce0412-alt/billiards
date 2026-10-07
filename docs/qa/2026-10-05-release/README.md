# Production release verification — 2026-10-05

Origin: `https://play.campus3ai.xyz`

Release coordinator reported deployment `2a353ef1-040c-434c-8dbb-bc71adbf6521`, application `261005.18`, and table tennis asset version `b09035069dae8d57` before these checks. This verifier independently fetched the deployed bytes; it did not deploy or mutate production data.

**165 checks passed.** Coverage:

- `/`, `/play`, `/table-tennis`, `/account`: HTTP 200, HTML content type, exact local HTML SHA256.
- Anonymous `/api/me`: HTTP 401, JSON response, `Cache-Control: no-store` observed.
- Both active model manifests: exact local SHA256 and `no-cache`.
- All 96 refined billiards GLBs and all 4 active versioned table tennis GLBs: every file downloaded and matched by SHA256 and byte length. Model payload total: **73,344,744 bytes**. No sampling.
- All 34 deployed root JavaScript files and 24 CSS files: exact local SHA256 and `no-cache`.
- The first three game routes use `no-cache`. `/account` uses `public, max-age=0, must-revalidate`, which also requires validation before reuse.

The initial report used a stricter literal `no-cache` expectation for `/account`, so it reported 164/165 despite all content hashes matching. That unaltered observation is preserved in `production-verification-strict-cache.json`. The final report corrects the account expectation to allow its equivalent revalidation policy and includes a fresh request for `/account`; the other 164 HTTP observations are retained with their original verification timestamp.

Files:

- `expected-release.json`: local expected URLs, lengths, hashes, and cache policy.
- `production-verification.json`: final results and headers, 165 passed / 0 failed.
- `production-verification-strict-cache.json`: original literal cache comparison, retained for traceability.

Reproduction:

```powershell
node scripts/verify-production-release.cjs --prepare
node --use-env-proxy scripts/verify-production-release.cjs --run --origin https://play.campus3ai.xyz
```

`--prepare` performs no network requests. `--recheck-account` reuses an existing report only if the origin and all local expected hashes still match, preserving the original report before requesting just `/account` again.

These are anonymous production HTTP/resource checks. They do not claim production authenticated gameplay, a production two-player match, or physical mobile-device acceptance. Browser gameplay and local two-client reconnect evidence remain in the separate billiards and table tennis QA directories.
