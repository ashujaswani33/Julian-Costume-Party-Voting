# Guest Results Button Fix

This fixes the admin **Show Results to Guests** button.

## What was wrong
The visibility marker was being uploaded to the `costume-photos` bucket as `text/plain`, but the bucket only permits JPG, PNG, and WebP files. Supabase rejected it.

## Fix
The marker is now a tiny PNG, which is allowed by the existing bucket configuration.

## Update
Replace this file in GitHub:

`lib/resultsVisibility.js`

No SQL or Supabase database changes are required.

After committing, allow Vercel to deploy the new commit. Then:
1. Close voting.
2. Click **Show Results to Guests** in Admin.
3. The admin badge should change to **Guest results visible**.
4. Guest phones should show the final standings after refresh, or automatically within about 15 seconds.
