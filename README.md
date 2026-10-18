# Demo data admin tool

Upload these files to the same paths in your GitHub repository:

- `app/admin/page.js`
- `app/api/admin/demo-data/route.js`
- `lib/demoImages.js`

No Supabase SQL changes are required.

After Vercel redeploys, open `/admin`. A new **Demo party data** section lets you choose any number from 5 to 50 and click **Create Demo Data**.

The tool:
- creates clearly labeled `DEMO` contestants
- creates lightweight Halloween demo pictures in Supabase Storage
- gives every demo contestant one random vote for another demo contestant
- replaces previous demo entries when regenerated
- never deletes real guests

Use **Remove Demo Data** to delete only demo contestants, their demo photos, and votes involving those demo contestants. Real guests stay untouched.
