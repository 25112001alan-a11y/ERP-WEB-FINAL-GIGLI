/**
 * Test bootstrap. Loaded through --import before any test file, so it applies
 * to every test worker process.
 *
 * The suite performs many auth calls from the same IP against a live database;
 * with rate limiting on, later tests would trip the login/register windows.
 * The limiter logic itself is covered by rateLimit.test.ts, which enables it
 * again for its own strict instance.
 */
process.env.RATE_LIMIT_DISABLED = 'true';

// Free-plan caps are exercised by billing.test.ts with a tiny limit; keep them
// effectively unlimited for the rest of the suite so accumulated test data in
// the shared dev database can never trigger a 402 in unrelated tests.
process.env.BILLING_FREE_DOC_LIMIT = '100000';
process.env.BILLING_FREE_PRODUCT_LIMIT = '100000';
