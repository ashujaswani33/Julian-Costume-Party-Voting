# Costume Party Voting App

A deployable party app with:

- QR-ready guest page
- Guest name + costume photo registration
- Private photo storage in Supabase
- One vote per registered guest
- No self-voting
- Admin password protected results
- Open/close registration
- Open/close voting
- Winner and vote totals visible only in admin
- QR code generated automatically on the admin page

## What you need

You do not need to be a programmer. You only need free accounts at:

1. Supabase — database and photo storage
2. Vercel — puts the app on the internet
3. GitHub — easiest way to transfer this project to Vercel

## Step 1 — Create the Supabase project

1. Go to https://supabase.com and create an account.
2. Click **New project**.
3. Pick any project name, such as `costume-party`.
4. Create a strong database password and save it somewhere safe.
5. Wait for the project to finish creating.

## Step 2 — Create the database and photo storage

1. In Supabase, open **SQL Editor**.
2. Click **New query**.
3. Open the file `supabase/schema.sql` from this project.
4. Copy everything in that file into the Supabase SQL Editor.
5. Click **Run**.

That creates the party settings, contestants, votes, and private photo bucket.

## Step 3 — Copy the two Supabase secrets you need

In Supabase, open the project **Connect** dialog for the project URL, and **Settings -> API Keys** for keys.

You need:

- Project URL → this becomes `SUPABASE_URL`
- Secret key (`sb_secret_...`) → this becomes `SUPABASE_SECRET_KEY`

Important: keep the secret key private. Do not use a publishable key here. Never put it in a public post or screenshot.

## Step 4 — Choose the admin password

Pick the password you want to use for `/admin`.

Example:

`MyParty-2026!`

You also need a long random session secret. You can use a password manager to generate one, or create a long random string of at least 32 characters.

## Step 5 — Put this project on GitHub

The simplest non-technical way:

1. Go to https://github.com and make an account.
2. Create a new repository, for example `costume-party-voting`.
3. Upload all files and folders from this project into that repository.

Do NOT upload a `.env.local` file if you create one. This project already includes `.gitignore` to protect it.

## Step 6 — Deploy with Vercel

1. Go to https://vercel.com and sign in with GitHub.
2. Click **Add New -> Project**.
3. Choose your `costume-party-voting` GitHub repository.
4. Vercel should recognize it as a Next.js project.
5. Before deploying, open **Project Settings -> Environment Variables** and add these four values. In the current Vercel UI, use **Secret** type for the Supabase key, admin password, and session secret:

### SUPABASE_URL
Your Supabase Project URL.

### SUPABASE_SECRET_KEY
Your Supabase Secret key (`sb_secret_...`).

### ADMIN_PASSWORD
The private password you want to use for the admin page.

### ADMIN_SESSION_SECRET
A long random secret, ideally 32+ characters.

6. Click **Deploy**.

Vercel will give you a public address similar to:

`https://costume-party-voting.vercel.app`

That is the address your guests will use.

## Step 7 — Get the QR code

After deployment:

1. Open your Vercel website.
2. Add `/admin` to the end of the address.
   Example: `https://costume-party-voting.vercel.app/admin`
3. Enter your admin password.
4. The admin page automatically creates a QR code for the guest website.
5. Print the QR code or display it at the party entrance.

## Party-night workflow

### Before guests arrive

- Open `/admin`.
- Keep **Registration open**.
- Keep **Voting closed**.
- Put the QR code at the entrance.

### When guests arrive

Each guest:

1. Scans the QR code.
2. Enters their name.
3. Uploads their costume photo.
4. Keeps the same phone/browser for voting later.

The app stores a private random voting token in that browser. The token is not the vote and does not reveal vote totals.

### When you are ready to vote

In `/admin`:

1. Click **Close registration**.
2. Click **Open voting**.
3. Tell guests to scan the same QR code again or refresh the page.
4. Each registered guest selects one costume.
5. They cannot vote for themselves.
6. They can vote only once.

Guests never receive the vote totals from the public API.

### When voting is finished

1. Click **Close voting**.
2. The private admin results page shows the winner and all vote totals.

## Important practical note

A guest's voting identity is stored in that phone/browser. If they register and then switch to a different phone, private/incognito browser, or clear browser storage, the new browser will not know their voter token. For a normal private party this is usually the easiest and least confusing system.

## Changing the party name

The database starts with the name `Costume Party`.

For now, the easiest way to change it is in Supabase:

1. Open **Table Editor**.
2. Open `party_settings`.
3. Change `party_name` in the row with ID `1`.

## Security design

- Supabase database tables have Row Level Security enabled with no public access policies.
- The Supabase secret key is used only by server-side API routes.
- Costume photos are kept in a private Supabase Storage bucket and displayed with temporary signed links.
- Admin results require an HttpOnly signed admin-session cookie.
- The admin password is an environment variable and is not shipped to the guest browser.
- Guest-facing API responses never include vote counts.

This is appropriate for a private social event. It is not intended as a high-security public election system.

## Admin vote audit update
The admin results page now includes a private **Who voted for whom** table. This information is returned only by the password-protected admin API and is never sent to the guest page.
