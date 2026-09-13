# Product Status

## Current Active Features
- **Coach/Athlete Tier System**: Multi-tier access for coaches and athletes.
- **Ghost Sets Tracking**: Intelligent tracking that dynamically calculates target weights and reps.
- **AI Nutrition Analysis**: AI-powered nutritional analysis for logging meals via natural language.

## Recent Milestones
- **Capacitor 7 Alignment**: Pinned and migrated the project strictly to Capacitor 7 to resolve dependency peer issues.
- **Health Connect Integration**: Successful migration to `@kiwi-health/capacitor-health-connect` supporting complete nutritional sync (energy, protein, carbohydrate, fat, dietary fiber), hydration, and workout sessions.

## Known Limitations & Technical Debt Priorities
- **PostgreSQL RLS Recursion**: Resolved the infinite recursion by migrating roles checks to a `SECURITY DEFINER` function (`is_coach()`), but RLS changes remain a fragile area.
- **Offline Sync & UI**: Currently shifting towards an offline-first architecture for Edge environments (Phase 4).
- **Health Connect Native Mocks**: Web environment lacks native Health Connect parsing so mock abstraction is heavily utilized.

## Future Roadmap
- **Phase 4 Execution**: Implementation of React Offline UI & Dexie Outbox Engine.
- **Phase 5 Execution**: Further Supabase Edge AI integrations.
