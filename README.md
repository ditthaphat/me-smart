# ME-Smart Academic Platform — Phase 1

Next.js + Supabase starter for **student self-signup, email confirmation, teacher-managed courses, join requests and approvals**.

## 1. Install

Install Node.js LTS. Extract ZIP, open folder in VS Code, then:

```bash
npm install
```

Copy `.env.example` to `.env.local` and fill your own Supabase Project URL and publishable/anon key. Never put a service-role key in a NEXT_PUBLIC variable.

## 2. Supabase

1. Create a **new** Supabase project. Do not run this schema over an existing project without migration planning.
2. SQL Editor → run `supabase/schema.sql` in full.
3. Authentication → Providers → Email: enable email signup and **Confirm email**. Set Site URL to `http://localhost:3000` for local testing; configure production URL and allowed redirect URLs before deployment.
4. Sign up the first teacher account via Supabase Authentication → Users → Add user (or use the app signup temporarily with an admin-controlled account). The signup trigger always creates a **student** profile.
5. SQL Editor: change only the intended account to teacher:

```sql
update public.profiles set role='teacher', student_id=null
where id=(select id from auth.users where email='teacher@example.edu');
```

Replace `teacher@example.edu` with the actual teacher email. Only run this manually as a trusted database administrator. Do not add a client-side teacher registration feature.

## 3. Start

```bash
npm run dev
```

Open http://localhost:3000.

## 4. Test with 2 accounts

- Teacher: log in, create course `ME301`, title `Fluid Mechanics`, term `1/2569`, join code of at least 8 characters. Note its Course ID.
- Student: click student signup, enter unique student ID and email, confirm email, log in, enter Course ID and join code, request enrollment.
- Teacher: refresh or sign in again, see pending request, approve it.
- Student: refresh, status should show approved.
- Try wrong join code, duplicate request, unauthorized course creation, and another student's records.

## 5. Notes and limitations

- Course join code is stored as a bcrypt-style pgcrypto hash and is only checked in a controlled database function.
- Roles are assigned server-side by the signup trigger; public users cannot self-promote to teacher.
- RLS allows students to see only their own enrollment records. Teachers see their own courses and their students' pending requests.
- **Do not use in production without** abuse protection/rate limiting for join-code guessing, password reset, institutional email/roster verification, privacy notice and retention policy, audit logs, monitoring, and proper deployment tests.
- For reliable roster verification, teachers should compare student IDs to an official enrollment list before approving.
- Teacher list currently shows pending requests only. Enrollment history, edit/delete courses, CSV imports, and attendance are planned for subsequent iterations.
- If your older `me-smart-starter` schema was used, start with a fresh Supabase project; do not blindly run this SQL on top of the old tables.
