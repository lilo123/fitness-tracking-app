# Cyber-Gym V2: Dependency Health & Supply-Chain Baseline (DIR-D5)

**Directive:** DIR-D5  
**Workstream:** Security & Supply-Chain Integrity  
**Date:** September 14, 2026  
**Auditor:** Jetski Executor Agent  
**Status:** Complete  

---

## 1. Executive Summary

As part of architectural directive **DIR-D5**, a complete security, supply-chain, and dependency-health audit was conducted for the Cyber-Gym V2 codebase.

### Key Audit Findings & Remediation Actions:
1. **Unused Production Dependency Remediation (`ws`):**
   - Package `ws` (`^8.21.3`) was present in `dependencies` in `package.json`.
   - Comprehensive source code analysis across `src/`, `tests/`, and `scripts/` confirmed `ws` had zero runtime imports or references in the client application (WebSockets are natively handled by browser WebSocket APIs or Supabase Realtime via `@supabase/supabase-js`).
   - `ws` was safely purged from `package.json` and `package-lock.json` via `npm install --package-lock-only`, eliminating unnecessary supply-chain attack surface and transitive dependencies.
2. **Vulnerability Audit (`npm audit --production`):**
   - Production dependencies audit returned **0 vulnerabilities** (zero critical, high, moderate, or low advisories).
   - Full dependency graph audit (including devDependencies, 315 total packages) confirmed **0 vulnerabilities**.
3. **Pre-1.0 Native Integration Risk Assessment (`@kiwi-health/capacitor-health-connect`):**
   - Risk assessment documented below detailing pre-1.0 SemVer volatility, upstream abandonment probability, Android OS/SDK evolution, and architectural mitigation via `src/services/health/index.ts`.
   - Actionable fallback and contingency strategies (local plugin fork/patch, internal minimal plugin, alternative ecosystem libraries) established.
4. **Dependency Pinning & Maintenance Policy:**
   - Formalized lockfile hygiene, reproducible CI installation (`npm ci`), Capacitor 7 peer dependency guardrails, and automated audit cadence.
5. **List Virtualization Introduction (`@tanstack/react-virtual`, DIR-C2):**
   - Adopted under ratified Decision 2 and directive **DIR-C2** to virtualize unbounded workout sessions, exercise history, and nutrition logs, ensuring long-history lists mount $\le 200$ DOM nodes at rest with zero-render fallback handling in JSDOM.

---

## 2. Production Dependency Inventory & Audit Summary

Following the remediation of `ws` and the introduction of `@tanstack/react-virtual` under architectural directive DIR-C2 (Ratified Decision 2), the production runtime bundle consists of 13 production dependencies:

| Package | Version Range | Resolved Version | Category | License | Justification & Usage |
|---|---|---|---|---|---|
| `@capacitor/camera` | `^7.0.5` | `7.0.5` | Native Hardware | MIT | Capturing meal photos for nutritional AI vision parsing |
| `@capacitor/core` | `^7.6.8` | `7.6.8` | Native Runtime | MIT | Capacitor cross-platform bridge and runtime APIs |
| `@kiwi-health/capacitor-health-connect` | `^0.0.42` | `0.0.42` | Native Health | MIT | Native Android Health Connect bridge (exercise, nutrition, hydration) |
| `@supabase/supabase-js` | `^2.109.0` | `2.109.0` | Backend SDK | MIT | PostgREST DB client, Auth session manager, Realtime subscriptions |
| `@tanstack/react-query` | `^5.102.8` | `5.102.8` | State / Cache | MIT | Asynchronous query caching, optimistic UI, background invalidation |
| `@tanstack/react-virtual` | `^3.14.13` | `3.14.13` | UI Virtualization | MIT | Dynamic window and container list virtualization for unbounded history timelines (DIR-C2) |
| `clsx` | `^2.1.1` | `2.1.1` | UI Utility | MIT | Conditional CSS className composition |
| `lucide-react` | `^1.38.0` | `1.38.0` | UI Assets | ISC | Tree-shakable SVG iconography |
| `react` | `^19.2.8` | `19.2.8` | Frontend Core | MIT | Component view layer |
| `react-dom` | `^19.2.8` | `19.2.8` | Frontend Core | MIT | DOM rendering target for React 19 |
| `react-hook-form` | `^7.87.0` | `7.87.0` | UI Forms | MIT | Uncontrolled form validation and state management |
| `react-router-dom` | `^7.18.3` | `7.18.3` | Navigation | MIT | Client-side routing and deep-linking |
| `tailwind-merge` | `^3.6.0` | `3.6.0` | UI Utility | MIT | Conflict-free Tailwind CSS utility merging |

### Remediation Details: Removal of `ws`
- **Package Name:** `ws` (`^8.21.3`)
- **Reason for Removal:** Client-side React code executes in standard web browser and WebView contexts where standard `window.WebSocket` is globally available. Supabase Realtime manages its own internal WebSocket transport without needing Node.js `ws` in the client bundle.
- **Audit Verification:** Rigorous AST search and code search across `src/` confirmed zero imports or references.
- **Lockfile Impact:** Successfully dropped `node_modules/ws` from `package-lock.json`. Reduced attack surface with zero bundle regressions.

### Security Audit Command Outputs

#### Production Audit (`npm audit --omit=dev` / `npm audit --production`):
```text
> npm audit --omit=dev
found 0 vulnerabilities
```

#### Full Dependency Tree Audit:
```text
> npm audit
found 0 vulnerabilities
```

---

## 3. Risk Assessment: `@kiwi-health/capacitor-health-connect@^0.0.42`

### 3.1 Overview & Technical Context
`@kiwi-health/capacitor-health-connect` is an open-source Capacitor plugin providing Android Health Connect API integration. It was selected during the architectural audit because alternative community plugins failed critical functional requirements:
- `@devmaxime/capacitor-health-connect` is strictly read-only and lacks nutrition/hydration write capabilities.
- `@capgo/capacitor-health` only supports `dietaryEnergyConsumed` (calories) and `dietaryWater`, completely lacking support for macronutrients (`protein`, `carbohydrates`, `totalFat`, and `dietaryFiber`).
- `@kiwi-health/capacitor-health-connect` is the only available plugin with full support for all required macro records (`energy`, `protein`, `totalCarbohydrate`, `totalFat`, `dietaryFiber`), `Hydration`, and `ExerciseSession`.

However, the package is published at version `0.0.42` (pre-1.0.0 SemVer), warranting a thorough supply-chain and maintainability risk assessment.

### 3.2 Key Risk Factors

```
+-----------------------------------------------------------------------------+
|                      RISK FACTOR MATRIX                                     |
+------------------------------------+------------+----------+----------------+
| Risk Description                   | Likelihood | Severity | Overall Risk   |
+------------------------------------+------------+----------+----------------+
| 1. Pre-1.0 SemVer Instability      | High       | Medium   | MEDIUM         |
| 2. Upstream Abandonment            | Medium     | High     | MEDIUM-HIGH    |
| 3. Capacitor Core Peer Lock-in     | High       | High     | HIGH (at v8)   |
| 4. Android Health Connect Changes  | Medium     | Medium   | MEDIUM         |
+------------------------------------+------------+----------+----------------+
```

1. **Pre-1.0 SemVer Volatility (`0.0.x`):**
   - In Semantic Versioning, version numbers `0.0.x` do not offer API stability guarantees. Any minor or patch bump may introduce breaking changes, renamed methods, or modified return types without a major version increment.
2. **Upstream Maintenance & Community Cadence:**
   - The plugin is maintained by Kiwi Health with a small number of core contributors. Community velocity is lower than first-party `@capacitor/*` plugins. If issues arise with future Android versions or Google Play Health Connect requirements, fixes from upstream may be delayed.
3. **Capacitor 7 Peer Dependency Lock-in:**
   - The plugin's `package.json` specifies:
     ```json
     "peerDependencies": {
       "@capacitor/core": "^7.0.0"
     }
     ```
   - Attempting to upgrade `@capacitor/core` to Capacitor 8 triggers fatal npm `ERESOLVE` peer dependency conflicts. Any future upgrade of the app to Capacitor 8 requires updating, patching, or replacing this plugin.
4. **Android Health Connect Platform Evolution:**
   - On Android 13 and below, Health Connect operates as a standalone Play Store application (`com.google.android.apps.healthdata`).
   - On Android 14+ (API Level 34+), Health Connect is integrated directly into the Android system framework (`android.permission.health.*`).
   - Changes in Android platform permission models or AndroidX Health Connect SDK require rapid compatibility updates in the plugin's Java source code.

### 3.3 Architectural Mitigations Implemented

The application architecture has already implemented defensive boundaries preventing hard coupling to this plugin:

1. **Service Abstraction Layer (`src/services/health/index.ts`):**
   - The React UI and business logic never interact directly with `@kiwi-health/capacitor-health-connect`.
   - All interactions are mediated through the `HealthDataSyncService` interface:
     ```typescript
     export interface HealthDataSyncService {
       requestPermissions(): Promise<boolean>;
       writeWorkout(name: string, startTime: string, endTime: string, calories: number): Promise<void>;
       writeNutrition(name: string, calories: number, protein: number, carbs: number, fat: number, time: string): Promise<void>;
     }
     ```
   - When running on Web / Dev (`!Capacitor.isNativePlatform()`), `WebHealthMock` automatically handles calls with safe console logs and mock responses.
2. **Fault-Tolerant, Non-Blocking Sync:**
   - Health Connect synchronization is an auxiliary sync target. Database persistence in Supabase (`workouts`, `nutrition_logs`) operates independently.
   - `health_connect_record_id` is nullable in database schemas. A failure or unavailability of Health Connect does not block core workout logging or nutrition tracking.

### 3.4 Contingency & Fallback Plans

If `@kiwi-health/capacitor-health-connect` is abandoned, becomes incompatible with future Android OS releases, or blocks Capacitor 8 upgrades, the engineering team has three verified contingency paths:

#### Option A: Local Vendoring / In-Repo Capacitor Plugin (Recommended)
- **Effort:** Low (1–2 engineer days).
- **Execution:** 
  1. Copy the plugin's TypeScript bridge and Android Java source (`android/src/main/java/...`) into a local directory: `plugins/capacitor-health-connect`.
  2. Update `package.json` dependency:
     ```json
     "@kiwi-health/capacitor-health-connect": "file:plugins/capacitor-health-connect"
     ```
  3. Direct ownership of AndroidX Health Connect SDK dependencies (`androidx.health.connect:connect-client`) and Capacitor peer dependency ranges.

#### Option B: `patch-package` / Custom Build Script
- **Effort:** Minimal (< 2 hours for minor fixes).
- **Execution:**
  1. Use `patch-package` to modify `peerDependencies` or Java method signatures directly in `node_modules`.
  2. Suitable for resolving Capacitor 8 peer dependency warnings without full vendoring.

#### Option C: Alternative Plugin Migration
- **Effort:** Medium (3–4 engineer days).
- **Execution:**
  1. Track `@capgo/capacitor-health` and official Capacitor Community health plugins.
  2. If upstream adds macro support (protein, carbs, fat, fiber), replace the implementation inside `src/services/health/index.ts` without modifying any UI components or database schemas.

---

## 4. Version Pinning and Dependency Maintenance Policy

To maintain long-term supply-chain integrity, prevent inadvertent breaking updates, and protect against malicious upstream releases, the following policy is enforced:

### 4.1 Lockfile Hygiene & Installation Protocol
1. **Commit `package-lock.json`:** Every dependency addition, deletion, or version update must be committed with its corresponding lockfile diff.
2. **Deterministic CI Installs:**
   - All CI/CD pipelines and automated build environments must use `npm ci` rather than `npm install`.
   - `npm ci` guarantees strictly reproducible installs matching the exact hashes specified in `package-lock.json`.
3. **No Direct Lockfile Hand-Editing:**
   - Never manually edit `package-lock.json`. All changes must be produced via `npm install --package-lock-only` or official npm tooling.

### 4.2 SemVer Pinning Guidelines
1. **Capacitor Ecosystem Pinning (Version 7.x):**
   - Capacitor packages (`@capacitor/core`, `@capacitor/cli`, `@capacitor/android`, `@capacitor/camera`) must remain strictly aligned on version `7.x.x` until a coordinated migration to Capacitor 8 is planned.
2. **Pre-1.0 Dependencies:**
   - Any package with version `< 1.0.0` (such as `@kiwi-health/capacitor-health-connect@0.0.42`) must be pinned with exact versions or locked via `package-lock.json` to prevent unintended breakage from breaking zero-major releases.
3. **Third-Party Build Plugins:**
   - Build tooling (`vite`, `@vitejs/plugin-react`, `@tailwindcss/vite`, `typescript`, `oxlint`, `vitest`) should use compatible caret ranges but require explicit verification before major version upgrades.

### 4.3 Automated Security Audits & Supply-Chain Cadence
1. **Continuous Audit Gate:**
   - The CI test pipeline must enforce:
     ```bash
     npm audit --omit=dev
     ```
   - Zero high or critical vulnerabilities are permitted in production builds. If an upstream vulnerability is identified with no immediate fix, a documented exception must be recorded in this document along with an isolation plan.
2. **Routine Review Cadence:**
   - **Monthly:** Run `npm outdated` to review security patches and minor feature updates.
   - **Quarterly:** Conduct supply-chain review of transitive dependencies and evaluate plugin health.

---

## 5. Verification & Test Suite Results

Following dependency cleanup, virtualization addition (`@tanstack/react-virtual`), and documentation, the complete verification pipeline was executed:

```bash
npm run build && npm run test && npm run lint && npm audit --omit=dev
```

### Verification Summary:
- **Build (`tsc -b && vite build`):** PASSED. Client bundle built successfully in 711ms with chunk size and asset optimizations (including `tanstack` chunk for `@tanstack/react-virtual`).
- **Unit Test Suite (`vitest run`):** PASSED. 35 test files passed, 595 unit tests passed with 0 failures.
- **Linter (`oxlint`):** PASSED. 134 files analyzed across 116 rules with 0 errors.
- **Security Audit (`npm audit --omit=dev`):** PASSED. 0 vulnerabilities found.
