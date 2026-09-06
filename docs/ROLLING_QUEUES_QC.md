# Rolling connection queues validation

- Supports four unfinished logical queues, 15 recipients per queue, FIFO execution and automatic fill of unstarted queues.
- Migration deployed: 20260906222402_rolling_connection_queues.
- Local clean PostgreSQL baseline plus all migrations: passed.
- Rolling SQL assertions: passed (allocation, replacements, stable numbering, capacity release, uncertain delivery, cancellation, idempotency).
- Concurrent database checks: passed (identical request recovery, stale allocation, FIFO concurrent starts, no duplicate recipients).
- Frontend: 128 tests passed; type checking, full lint and Pages build passed.
- Queue panel checked at 320px and 390px. Keyboard-accessible native disclosures retain visible focus and scrolling.
- No outreach was sent during validation. Database workflow tests used disposable synthetic records.

Run concurrency checks only against a disposable migrated database with OUTREACH_DISPOSABLE_DATABASE=yes, OUTREACH_TEST_DATABASE set, and PSQL/PGHOST/PGPORT/PGUSER as needed. Run supabase/tests/rolling-queues.assert.sql against that database for rollback-only behavior checks.
