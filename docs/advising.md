# Group advising

The teacher workspace includes group advising records based on the supplied paper form. Teachers can create and archive groups, maintain a roster, record meeting details and recommendations, track attendance, and print a record with blank signature fields.

The attendance status is entered by the teacher and is **not** a student's signature. The printed document must be signed by each person themselves. Co-advisor names are text on the form; they do not grant those people access. The teacher who creates a record is its sole in-app owner.

## Database installation

`supabase/migrations/20261112165702_advising_groups.sql` adds four new tables and owner-scoped RLS. It grants authenticated users only the table operations needed by this feature; policies additionally require a teacher profile and an owner match. Composite foreign keys prevent combining groups, meetings, and students from different owners or groups. Records are archived rather than deleted through the interface. Participant names and identifiers are snapshots so later roster edits do not rewrite old meeting records.

The existing project was found to have no recorded baseline migration for the older application tables. This advising migration relies on the existing `public.profiles` table and is not by itself a complete schema for creating a fresh database. Capture and verify a separate baseline before using migrations to build an empty test database.

The current Vercel preview and production use the same Supabase project. Applying the migration changes the shared production database even if only the preview website is being tested. Obtain explicit approval before applying it. No real names or signatures from the reference form are included in this repository or seeded into the database.

## Checks

Run `npm test` for navigation, advising workflows, and isolated Postgres RLS checks using PGlite. Run `npm run build` for the Next.js production build. Manual browser testing should include printing with the user's browser and a real Supabase-backed test with authorized test accounts before production release.
