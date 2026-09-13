# Deployment Guidelines

## Frontend Hosting (Vercel)
- The React application is deployed via Vercel. 
- Ensure `vercel.json` contains proper routing fallbacks to `index.html` for React Router.
- Vercel Environment Variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) must point to production assets.

## Backend Migrations (Supabase)
- Database schema changes are version controlled in `supabase/migrations/`.
- Deploy changes via Supabase CLI:
  ```bash
  npx supabase db push
  ```
- Deploy Edge Functions:
  ```bash
  npx supabase functions deploy
  ```

## Mobile Deployment (Android)
To build and release the CyberGym APK/AAB bundle:
1. Ensure a production web build exists:
   ```bash
   npm run build
   ```
2. Sync the built assets into the Capacitor Android project:
   ```bash
   npx cap sync android
   ```
3. Open Android Studio to build the signed release bundle:
   ```bash
   npx cap open android
   ```
   Provide valid keystore credentials when generating the Signed Bundle for the Google Play Store.
