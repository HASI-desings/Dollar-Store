# Dollar Store Billing (HASI Designs)
Upload every file EXCEPT nothing (tools/ and supabase/ are ignored by Vercel via .vercelignore) to one GitHub repo, import into Vercel, open the link, install.
Run /tests.html for the money tests.

## Cloud setup (optional, once per shop)
1. Make a free Supabase project. Auth settings: turn OFF "Allow new users to sign up", then create ONE owner user by hand.
2. Run the files in supabase/migrations in order (SQL editor). 1 and 2 create tables with row-level security. 3 schedules emails (read its header first).
3. Put the project URL and anon/publishable key in config.js. Never use the service_role key in the app.
4. Emails: supabase functions deploy report --no-verify-jwt. Set secrets RESEND_API_KEY, REPORT_FROM, CRON_SECRET. Store the same CRON_SECRET in vault as cron_secret.
5. Test: sign in with a second account and confirm it cannot read the owner's rows.

## Licenses
Open tools/license-admin.html on your own computer only. Generate a key pair once, paste the PUBLIC key into LICENSE_PUBLIC_JWK in config.js, make one code per sale. Keep the private key secret.

## Known limits
Roles, PINs and licenses are convenience and deterrents, not tamper-proof. A lost backup passphrase cannot be recovered.
