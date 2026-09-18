#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

/**
 * Parses claims from markdown text (both Markdown tables and HTML comments).
 */
/**
 * Normalizes values for comparison (strips units like B/bytes/ms, commas in numbers).
 */
export function normalizeValue(val) {
  if (val === null || val === undefined) return "";
  const s = String(val).trim();

  // If number with optional commas and optional unit (B, bytes, ms, s)
  const numMatch = s.match(/^-?([\d,]+)(?:\.\d+)?\s*(?:B|bytes|ms|s)?$/i);
  if (numMatch) {
    return numMatch[1].replace(/,/g, "");
  }

  // Ratio like 47/47
  const ratioMatch = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (ratioMatch) {
    return `${ratioMatch[1]}/${ratioMatch[2]}`;
  }

  // Percentage like 100% or 100.0%
  const pctMatch = s.match(/^(\d+(?:\.\d+)?)%$/);
  if (pctMatch) {
    return `${parseFloat(pctMatch[1])}%`;
  }

  return s;
}

export function parseClaims(markdownContent) {
  const claims = [];
  const lines = markdownContent.split("\n");

  let inTable = false;
  let headers = [];
  let colIndexes = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // 1. Check HTML comment claim tags
    const commentMatch = line.match(/<!--\s*claim:(.*?)(?:-->|$)/i);
    if (commentMatch) {
      const body = commentMatch[1];
      const idMatch = body.match(/\bid=["']?([^"'\s]+)["']?/i);
      const valMatch = body.match(/\bvalue=["']?([^"']+)["']?/i);
      const srcMatch = body.match(/\bsource=["']?([^"'\s]+)["']?/i);
      const typeMatch = body.match(/\btype=["']?([^"'\s]+)["']?/i);
      const formulaMatch = body.match(/\bformula=["']?([^"']+)["']?/i);
      const descMatch = body.match(/\bdesc=["']?([^"']+)["']?/i);

      if (idMatch && valMatch) {
        claims.push({
          id: idMatch[1],
          description: descMatch ? descMatch[1] : idMatch[1],
          claimedValue: valMatch[1].trim(),
          source: srcMatch ? srcMatch[1] : "",
          type: (typeMatch ? typeMatch[1] : "measured").toLowerCase(),
          formula: formulaMatch ? formulaMatch[1].trim() : "",
          lineNumber: i + 1,
        });
      }
      continue;
    }

    // 2. Check Markdown table rows
    if (line.startsWith("|") && line.endsWith("|")) {
      const cells = line.slice(1, -1).split("|").map(c => c.trim());

      // Check if next line is separator row -> current line is table header
      const nextLine = (lines[i + 1] || "").trim();
      if (nextLine.startsWith("|") && nextLine.endsWith("|")) {
        const nextCells = nextLine.slice(1, -1).split("|").map(c => c.trim());
        if (nextCells.length > 0 && nextCells.every(c => /^:?-+:?$/.test(c))) {
          inTable = true;
          headers = cells.map(c => c.toLowerCase());
          colIndexes = {
            id: headers.findIndex(c => c.includes("metric id") || c.includes("metric_id") || c === "id" || c === "metric"),
            description: headers.findIndex(c => c.includes("description") || c.includes("name")),
            value: headers.findIndex(c => c.includes("claimed") || c.includes("value") || c.includes("figure")),
            source: headers.findIndex(c => c.includes("source") || c.includes("artifact") || c.includes("retained")),
            type: headers.findIndex(c => c === "type"),
            formula: headers.findIndex(c => c.includes("formula") || c.includes("context")),
          };
          i++; // skip separator line
          continue;
        }
      }

      // Inside table data row
      if (inTable && !cells.every(c => /^:?-+:?$/.test(c))) {
        if (colIndexes.id !== -1 && colIndexes.value !== -1) {
          const id = cells[colIndexes.id] || "";
          const value = cells[colIndexes.value] || "";
          if (id && value && !id.startsWith("-")) {
            claims.push({
              id,
              description: colIndexes.description !== -1 ? cells[colIndexes.description] : id,
              claimedValue: value,
              source: colIndexes.source !== -1 ? cells[colIndexes.source] : "",
              type: (colIndexes.type !== -1 && cells[colIndexes.type] ? cells[colIndexes.type] : "measured").toLowerCase(),
              formula: colIndexes.formula !== -1 ? cells[colIndexes.formula] : "",
              lineNumber: i + 1,
            });
          }
        }
      }
    } else {
      inTable = false;
    }
  }

  return claims;
}

function hasEvidenceFile(evidenceDir, fileName) {
  if (typeof evidenceDir === 'object' && evidenceDir !== null) {
    return evidenceDir[fileName] !== undefined;
  }
  return fs.existsSync(path.join(evidenceDir, fileName));
}

function readEvidenceFile(evidenceDir, fileName) {
  if (typeof evidenceDir === 'object' && evidenceDir !== null) {
    if (evidenceDir[fileName] === undefined) {
      throw new Error(`Evidence file not found: ${fileName}`);
    }
    const val = evidenceDir[fileName];
    return typeof val === 'string' ? val : JSON.stringify(val);
  }
  const filePath = path.join(evidenceDir, fileName);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Evidence file not found: ${fileName} (looked in ${evidenceDir})`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

function computeEvidenceHash(evidenceDir, fileName) {
  const content = readEvidenceFile(evidenceDir, fileName);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Metric Binder & Extractor Registry
 * Binds metric ID to exact extraction logic on raw retained evidence.
 */
export function extractMetricFromEvidence(metricId, sourceFileName, evidenceDir, context = '', manifest = null) {
  if (!hasEvidenceFile(evidenceDir, sourceFileName)) {
    throw new Error(`Evidence file not found: ${sourceFileName}`);
  }

  // JSON evidence artifact
  if (sourceFileName.endsWith('.json')) {
    const raw = readEvidenceFile(evidenceDir, sourceFileName);
    const json = JSON.parse(raw);

    if (sourceFileName.includes('perf-trace-results')) {
      return extractPerfTraceMetric(metricId, json, context);
    }
    if (context && context.startsWith('json:')) {
      const jsonPath = context.replace('json:', '').trim();
      const parts = jsonPath.split('.');
      let cur = json;
      for (const p of parts) {
        if (cur === undefined || cur === null) break;
        cur = cur[p];
      }
      return String(cur);
    }
    return String(json[metricId] ?? '');
  }

  // Text evidence artifact
  const content = readEvidenceFile(evidenceDir, sourceFileName);

  // Check manifest exitCode if metric is exit code
  if (metricId.endsWith('_exit') && manifest && manifest.artifacts && manifest.artifacts[sourceFileName]) {
    return String(manifest.artifacts[sourceFileName].exitCode);
  }

  switch (metricId) {
    case 'gate_tsc_exit': {
      if (manifest?.artifacts?.[sourceFileName]) {
        return String(manifest.artifacts[sourceFileName].exitCode);
      }
      return content.includes('error TS') ? '1' : '0';
    }

    case 'gate_lint_exit': {
      if (manifest?.artifacts?.[sourceFileName]) {
        return String(manifest.artifacts[sourceFileName].exitCode);
      }
      return content.includes('0 errors') ? '0' : '1';
    }

    case 'gate_vitest_files': {
      const m = content.match(/Test Files\s+(\d+)\s+passed/);
      if (!m) throw new Error(`Could not find 'Test Files <N> passed' in ${sourceFileName}`);
      return m[1];
    }

    case 'gate_vitest_tests': {
      const m = content.match(/Tests\s+(\d+)\s+passed/);
      if (!m) throw new Error(`Could not find 'Tests <N> passed' in ${sourceFileName}`);
      return m[1];
    }

    case 'gate_bounds_count': {
      const m = content.match(/BOUNDS\s+(\d+)/);
      if (m) return m[1];
      if (content.includes('PASS: All Supabase user-data .select() query sites carry explicit row bounds')) {
        return '0';
      }
      throw new Error(`Could not determine bounds count in ${sourceFileName}`);
    }

    case 'gate_cache_keys': {
      const m = content.match(/CACHE\s+(\d+)\s+keys/) || content.match(/KEYCOUNT\s+(\d+)/);
      if (!m) throw new Error(`Could not find 'CACHE <N> keys' in ${sourceFileName}`);
      return m[1];
    }

    case 'gate_cache_collisions': {
      const m = content.match(/(\d+)\s+collisions/) || content.match(/COLLISIONS\s+(\d+)/);
      if (!m) throw new Error(`Could not find '<N> collisions' in ${sourceFileName}`);
      return m[1];
    }

    case 'gate_fidelity_serviced': {
      const m = content.match(/FIDELITY\s+(\d+\/\d+)/) || content.match(/Asserted Queries:\s*(\d+\s*\/\s*\d+)/);
      if (!m) throw new Error(`Could not find 'FIDELITY <N/M>' in ${sourceFileName}`);
      return m[1].replace(/\s+/g, '');
    }

    case 'gate_fidelity_percent': {
      const m = content.match(/FIDELITY\s+\d+\/\d+\s+\((\d+%)\)/) || content.match(/Asserted Queries:\s*\d+\s*\/\s*\d+\s+\((\d+(?:\.\d+)?%)\)/) || content.match(/(\d+(?:\.\d+)?%)\s+of distinct database queries serviced/);
      if (!m) throw new Error(`Could not find 'FIDELITY ... (<N>%)' in ${sourceFileName}`);
      return m[1];
    }

    case 'gate_payload_status': {
      const m = content.match(/GATEA\s+(PASS|FAIL)/) || content.match(/VERDICT:\s*(PASS|FAIL)/);
      if (!m) throw new Error(`Could not find 'GATEA PASS/FAIL' in ${sourceFileName}`);
      return m[1];
    }

    case 'gate_csp_violations': {
      const m = content.match(/CSP\s+(\d+)/);
      if (m) return m[1];
      if (content.includes('CSP check passed') || content.includes('No deprecated X-XSS-Protection headers')) {
        return '0';
      }
      throw new Error(`Could not determine CSP violations in ${sourceFileName}`);
    }

    case 'gate_query_indexes': {
      const m = content.match(/(\d+)\s+public schema indexes match/);
      if (!m) throw new Error(`Could not find '<N> public schema indexes match' in ${sourceFileName}`);
      return m[1];
    }

    case 'gate_perf_budget_exit': {
      if (manifest?.artifacts?.[sourceFileName]) {
        return String(manifest.artifacts[sourceFileName].exitCode);
      }
      return content.includes('PERF BUDGET FAILURE') ? '1' : '0';
    }

    case 'gate_perf_artifact_exit': {
      if (manifest?.artifacts?.[sourceFileName]) {
        return String(manifest.artifacts[sourceFileName].exitCode);
      }
      return content.includes('VERDICT: PASS') ? '0' : '1';
    }

    case 'gate_db_residue_status': {
      if (content.includes('ZERO RESIDUE')) return 'ZERO RESIDUE';
      if (content.includes('RESIDUE DETECTED')) return 'RESIDUE DETECTED';
      throw new Error(`Could not determine db residue status in ${sourceFileName}`);
    }

    case 'gate_e2e_passed': {
      const m = content.match(/(\d+)\s+passed/);
      if (!m) throw new Error(`Could not find '<N> passed' in ${sourceFileName}`);
      return m[1];
    }

    case 'gate_e2e_skipped': {
      const m = content.match(/(\d+)\s+skipped/);
      if (!m) throw new Error(`Could not find '<N> skipped' in ${sourceFileName}`);
      return m[1];
    }

    default: {
      // Regex extractor specified in context
      if (context && context.startsWith('regex:')) {
        const regexStr = context.replace('regex:', '').trim();
        const rx = new RegExp(regexStr);
        const match = content.match(rx);
        if (!match) throw new Error(`Regex ${regexStr} did not match in ${sourceFileName}`);
        return match[1] || match[0];
      }
      throw new Error(`No bound extractor registered for metric ID: ${metricId}`);
    }
  }
}

/**
 * Extracts route payload metrics from perf-trace-results.json.
 * Strictly binds routes and queries to avoid cross-route number collisions.
 */
function extractPerfTraceMetric(metricId, json, context) {
  function getRouteData(routeName) {
    if (json.routes) {
      if (json.routes[routeName]) return json.routes[routeName];
      const stripped = routeName.replace(/^\//, '');
      if (json.routes[stripped]) return json.routes[stripped];
      if (stripped === 'workout' && json.routes.workout_seeded) return json.routes.workout_seeded;
    }
    const map = {
      '/workout': ['workout_seeded', 'workout'],
      '/history': ['history'],
      '/nutrition': ['nutrition'],
      '/coach': ['coach'],
    };
    const candidates = map[routeName] || [routeName.replace(/^\//, '')];
    for (const c of candidates) {
      if (json[c]) return json[c];
    }
    return null;
  }

  function getTotal(r) {
    if (!r) return 0;
    if (r.totalBytes !== undefined) return r.totalBytes;
    if (r.supabaseTransferredBytes !== undefined) return r.supabaseTransferredBytes;
    if (r.totalTransferredBytes !== undefined) return r.totalTransferredBytes;
    return 0;
  }

  function getQueries(r) {
    if (!r) return [];
    return r.queries || r.queryBreakdown || [];
  }

  switch (metricId) {
    // --- Provenance binding -------------------------------------------------
    // These make the artifact's *identity* a checked claim rather than prose.
    // A close-out that cites a runId it was not generated from is precisely the
    // decay defect this checker exists to catch, and a UUID or a hex digest is
    // invisible to the numeric-token sweep (which only sees numbers), so it can
    // never be caught there. It has to be bound explicitly, here.
    case 'provenance_run_id': {
      const v = json._meta && json._meta.runId;
      if (!v) throw new Error('_meta.runId missing from perf-trace-results.json');
      return String(v);
    }

    case 'provenance_source_fingerprint': {
      const v = json._meta && json._meta.sourceFingerprint;
      if (!v) throw new Error('_meta.sourceFingerprint missing from perf-trace-results.json');
      return String(v);
    }

    case 'provenance_git_commit': {
      const v = json._meta && json._meta.gitCommit;
      if (!v) throw new Error('_meta.gitCommit missing from perf-trace-results.json');
      return String(v);
    }

    case 'provenance_seed_profile': {
      const v = json._meta && json._meta.seedProfile;
      if (!v) throw new Error('_meta.seedProfile missing from perf-trace-results.json');
      return String(v);
    }

    case 'provenance_ceiling_bytes': {
      const v = json._meta && json._meta.ceilingBytes;
      if (v === undefined || v === null) {
        throw new Error('_meta.ceilingBytes missing from perf-trace-results.json');
      }
      return String(v);
    }

    case 'route_payload_workout_total': {
      const r = getRouteData('/workout');
      if (!r) throw new Error('Route /workout not found in perf-trace-results.json');
      return String(getTotal(r));
    }

    case 'route_payload_workout_query': {
      const r = getRouteData('/workout');
      if (!r) throw new Error('Route /workout not found in perf-trace-results.json');
      const queries = getQueries(r);
      const targetTable = (context && context.trim()) || 'workouts';
      let q = queries.find(item => (item.table || item.path) === targetTable);
      if (!q) {
        q = queries.find(item => {
          const name = item.table || item.path || '';
          return (name === 'workouts' || name === 'routine_templates') && !item.select?.includes('exercises');
        });
      }
      if (!q) throw new Error('workout query not found in /workout');
      return String(q.bytes);
    }

    case 'route_payload_workout_exercises': {
      const r = getRouteData('/workout');
      if (!r) throw new Error('Route /workout not found in perf-trace-results.json');
      const queries = getQueries(r);
      const q = queries.find(item => (item.table || item.path) === 'exercises');
      if (!q) throw new Error('exercises query not found in /workout');
      return String(q.bytes);
    }

    case 'route_payload_history': {
      const r = getRouteData('/history');
      if (!r) throw new Error('Route /history not found in perf-trace-results.json');
      return String(getTotal(r));
    }

    case 'route_payload_nutrition': {
      const r = getRouteData('/nutrition');
      if (!r) throw new Error('Route /nutrition not found in perf-trace-results.json');
      return String(getTotal(r));
    }

    case 'route_payload_coach_total': {
      const r = getRouteData('/coach');
      if (!r) throw new Error('Route /coach not found in perf-trace-results.json');
      return String(getTotal(r));
    }

    case 'route_payload_coach_query': {
      const r = getRouteData('/coach');
      if (!r) throw new Error('Route /coach not found in perf-trace-results.json');
      const queries = getQueries(r);
      const q = queries.find(item => (item.table || item.path) === 'workouts');
      if (!q) throw new Error('workouts query not found in /coach');
      return String(q.bytes);
    }

    case 'route_payload_coach_exercises': {
      const r = getRouteData('/coach');
      if (!r) throw new Error('Route /coach not found in perf-trace-results.json');
      const queries = getQueries(r);
      const q = queries.find(item => (item.table || item.path) === 'exercises');
      if (!q) throw new Error('exercises query not found in /coach');
      return String(q.bytes);
    }

    case 'route_payload_coach_master':
    case 'route_payload_coach_routines': {
      const r = getRouteData('/coach');
      if (!r) throw new Error('Route /coach not found in perf-trace-results.json');
      const queries = getQueries(r);
      const q = queries.find(item => (item.table || item.path) === 'routine_templates');
      if (!q) throw new Error('routine_templates query not found in /coach');
      return String(q.bytes);
    }

    default: {
      if (context && context.includes('route=')) {
        const routeMatch = context.match(/route=([^\s,]+)/);
        if (routeMatch) {
          const r = getRouteData(routeMatch[1]);
          if (r) return String(getTotal(r));
        }
      }
      throw new Error(`Unrecognized perf trace metric ID: ${metricId}`);
    }
  }
}

/**
 * INFORMATIONAL REFERENCE ONLY: Historical stale values from previous programme stages.
 * This is NEVER used for gating or check validation — it exists solely to provide human-readable warnings in logs.
 * All verification checks are strictly allowlist/evidence-based.
 */
export const INFORMATIONAL_HISTORICAL_DECAY_HINTS = {
  route_payload_workout_query: ['122311', '122,311'],
  route_payload_coach_query: ['844'],
};

/**
 * Safely evaluates an arithmetic expression given a map of resolved metric values.
 */
export function evaluateFormula(formulaStr, resolvedMetrics) {
  // Extract all potential metric tokens (letters, numbers, underscores)
  const tokens = formulaStr.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
  
  let expr = formulaStr;
  for (const t of tokens) {
    if (resolvedMetrics[t] !== undefined) {
      const cleanNum = normalizeValue(resolvedMetrics[t]);
      if (isNaN(Number(cleanNum))) {
        throw new Error(`Metric '${t}' resolved to non-numeric value '${resolvedMetrics[t]}' in formula '${formulaStr}'`);
      }
      // Replace whole word token
      const re = new RegExp(`\\b${t}\\b`, 'g');
      expr = expr.replace(re, cleanNum);
    } else {
      throw new Error(`Formula references unknown or unresolved metric: '${t}' in '${formulaStr}'`);
    }
  }

  // Sanitize expr: only digits, decimal point, whitespace, +, -, *, /, (, )
  if (!/^[0-9.\s+\-*/()]+$/.test(expr)) {
    throw new Error(`Invalid characters in evaluated arithmetic expression: "${expr}"`);
  }

  try {
    const fn = new Function(`return (${expr});`);
    const res = fn();
    return Math.round(res);
  } catch (err) {
    throw new Error(`Failed to evaluate arithmetic expression "${expr}": ${err.message}`);
  }
}

/**
 * Unaccounted-Figure Sweep (RFIX-24).
 * After the declared-claim pass, scans the entire document for numeric tokens.
 * Every numeric token must be:
 *   1. Bound to a declared claim or value extracted from evidence, OR
 *   2. Covered by a narrow, individually justified ignore rule (timestamps, SHAs, section headers, etc.), OR
 *   3. Explicitly waived inline by a marker with a human reason, e.g. <!-- figure-ok: reason -->.
 */
export function sweepUnaccountedFigures(markdownText, verifiedResults = [], manifest = null) {
  const allowlist = new Set();

  for (const c of verifiedResults) {
    const val = String(c.claimedValue ?? c.claimed ?? '').trim();
    if (val) {
      allowlist.add(val);
      allowlist.add(normalizeValue(val));
      allowlist.add(val.replace(/,/g, ''));
      allowlist.add(normalizeValue(val).replace(/,/g, ''));
      if (val.includes('/')) {
        val.split('/').forEach((p) => {
          const part = p.trim();
          allowlist.add(part);
          allowlist.add(normalizeValue(part));
        });
      }
      if (val.endsWith('%')) {
        const pctNum = val.replace('%', '').trim();
        allowlist.add(pctNum);
        allowlist.add(normalizeValue(pctNum));
      }
    }

    if (c.extracted !== undefined && c.extracted !== null) {
      const ext = String(c.extracted).trim();
      allowlist.add(ext);
      allowlist.add(normalizeValue(ext));
      allowlist.add(ext.replace(/,/g, ''));
      allowlist.add(normalizeValue(ext).replace(/,/g, ''));
      if (ext.includes('/')) {
        ext.split('/').forEach((p) => {
          const part = p.trim();
          allowlist.add(part);
          allowlist.add(normalizeValue(part));
        });
      }
      if (ext.endsWith('%')) {
        const pctNum = ext.replace('%', '').trim();
        allowlist.add(pctNum);
        allowlist.add(normalizeValue(pctNum));
      }
    }
  }

  // Include exit codes from manifest if available
  if (manifest?.artifacts) {
    for (const meta of Object.values(manifest.artifacts)) {
      if (meta.exitCode !== undefined) {
        allowlist.add(String(meta.exitCode));
      }
    }
  }

  const lines = markdownText.split('\n');
  const unhandledFigures = [];
  let waiveNextLine = false;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    let line = lines[i];

    // Rule 10: Explicit waiver <!-- figure-ok: <reason> -->
    // Can be inline on the same line, or a comment on the preceding line
    if (/<!--\s*figure-ok:\s*([^>]+)-->/.test(line)) {
      if (/^\s*(?:>\s*)*<!--\s*figure-ok:\s*([^>]+)-->\s*$/.test(line)) {
        waiveNextLine = true;
      }
      continue;
    }

    if (waiveNextLine) {
      waiveNextLine = false;
      continue;
    }

    // Rule 9: Markdown table formatting lines (e.g. | :--- | :--- |)
    if (/^\|(?:\s*:?-+:?\s*\|)+$/.test(line.trim())) {
      continue;
    }

    // Rule 4: Section / Heading numbering & CyberGym Tier N
    if (/^#+\s+\d+(?:\.\d+)*\.?\s+/.test(line.trim())) {
      line = line.replace(/^#+\s+\d+(?:\.\d+)*\.?\s+/, '');
    }
    line = line.replace(/\bTier\s+\d+\b/gi, '');

    // Rule 5: List item numbering (e.g. "1. ", "2. ")
    line = line.replace(/^\s*\d+\.\s+/, '');

    // Rule 6: URLs and web links
    line = line.replace(/https?:\/\/[^\s)\]]+/gi, '');

    // Rule 1: ISO 8601 Timestamps (e.g. 2026-09-17T16:29:02.369Z, 2026-09-17)
    line = line.replace(/\b\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)?\b/g, '');

    // Rule 2: UUIDs / Run IDs (e.g. 4efb212f-3ead-4fd8-bd9a-b81e37fd9082)
    line = line.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '');

    // Rule 3: Git SHAs (hexadecimal strings 7 to 40 chars containing at least one a-f letter)
    line = line.replace(/\b(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/gi, '');

    // Rule 7: Requirement / work-item identifiers (e.g. RFIX-24, P3-0, W-10, DIR-D6, NC-1).
    //
    // Anchored to an UPPERCASE-initial alphabetic prefix on purpose. The previous
    // form stripped `[A-Za-z]+-[A-Za-z0-9_]+` and `[A-Za-z0-9_]+-[A-Za-z]+`, which
    // also swallowed any figure merely adjacent to a hyphenated word: both
    // `999999-byte` and `pre-888888` were invisible to this sweep. That silently
    // reopened the exact hole the sweep exists to close, so keep this narrow.
    line = line.replace(/\b[A-Z][A-Za-z]{0,5}\d{0,2}-[A-Za-z0-9]{1,5}\b/g, '');

    // Rule 8: Hex color codes (e.g. #fff, #1a1a1a)
    line = line.replace(/#[0-9a-fA-F]{3,8}\b/g, '');

    // Match candidate numeric tokens
    const matches = line.match(/\b\d+(?:,\d{3})*(?:\.\d+)?%?\b/g);
    if (!matches) continue;

    for (const token of matches) {
      const norm = normalizeValue(token);
      const rawNoComma = token.replace(/,/g, '');
      const normNoComma = norm.replace(/,/g, '');

      if (
        !allowlist.has(token) &&
        !allowlist.has(norm) &&
        !allowlist.has(rawNoComma) &&
        !allowlist.has(normNoComma)
      ) {
        unhandledFigures.push({
          lineNumber: lineNum,
          figure: token,
          line: lines[i].trim(),
        });
      }
    }
  }

  return {
    passed: unhandledFigures.length === 0,
    unhandledFigures,
  };
}

/**
 * Main verification engine.
 */
export function verifyCloseoutClaims(markdownContent, evidenceDir) {
  const claims = parseClaims(markdownContent);
  if (claims.length === 0) {
    return {
      passed: false,
      error: 'No claims found in markdown document.',
      results: [],
    };
  }

  // Verify manifest
  let manifest = null;
  if (hasEvidenceFile(evidenceDir, 'manifest.json')) {
    try {
      manifest = JSON.parse(readEvidenceFile(evidenceDir, 'manifest.json'));
    } catch (e) {
      return {
        passed: false,
        error: `Corrupted manifest.json: ${e.message}`,
        results: [],
      };
    }
  }

  // Verify checksums of all files cited in manifest
  const checksumErrors = [];
  if (manifest?.artifacts) {
    for (const [relFile, meta] of Object.entries(manifest.artifacts)) {
      if (!hasEvidenceFile(evidenceDir, relFile)) {
        checksumErrors.push(`Evidence file in manifest does not exist: ${relFile}`);
        continue;
      }
      const actualSha = computeEvidenceHash(evidenceDir, relFile);
      if (actualSha !== meta.sha256) {
        checksumErrors.push(`SHA256 mismatch for ${relFile}: expected ${meta.sha256}, got ${actualSha}`);
      }
    }
  }

  if (checksumErrors.length > 0) {
    return {
      passed: false,
      error: `Manifest integrity failure:\n${checksumErrors.join('\n')}`,
      results: [],
    };
  }

  const results = [];
  const resolvedMetrics = {};
  let anyFailure = false;

  // First pass: verify measured figures
  for (const c of claims) {
    if (c.type === 'derived') continue;

    const normalizedClaim = normalizeValue(c.claimedValue);
    let extracted = null;
    let error = null;

    // Human informational hint only: check historical stale figures
    const isDecayed = Boolean(INFORMATIONAL_HISTORICAL_DECAY_HINTS[c.id]?.includes(normalizedClaim));

    try {
      extracted = extractMetricFromEvidence(c.id, c.source, evidenceDir, c.formula, manifest);
      resolvedMetrics[c.id] = extracted;
    } catch (err) {
      error = err.message;
    }

    const normalizedExtracted = extracted !== null ? normalizeValue(extracted) : null;
    const match = !error && normalizedClaim === normalizedExtracted;

    if (!match) {
      anyFailure = true;
    }

    results.push({
      id: c.id,
      description: c.description,
      claimed: c.claimedValue,
      normalizedClaim,
      extracted,
      normalizedExtracted,
      source: c.source,
      type: 'measured',
      match,
      isDecayed,
      error,
      lineNumber: c.lineNumber,
    });
  }

  // Second pass: verify derived figures
  for (const c of claims) {
    if (c.type !== 'derived') continue;

    const normalizedClaim = normalizeValue(c.claimedValue);
    let computed = null;
    let error = null;

    try {
      if (!c.formula) {
        throw new Error(`Derived metric '${c.id}' has no formula specified.`);
      }
      computed = evaluateFormula(c.formula, resolvedMetrics);
      resolvedMetrics[c.id] = String(computed);
    } catch (err) {
      error = err.message;
    }

    const normalizedComputed = computed !== null ? String(computed) : null;
    const match = !error && normalizedClaim === normalizedComputed;

    if (!match) {
      anyFailure = true;
    }

    results.push({
      id: c.id,
      description: c.description,
      claimed: c.claimedValue,
      normalizedClaim,
      extracted: computed !== null ? String(computed) : null,
      normalizedExtracted: normalizedComputed,
      source: c.source || 'derived',
      type: 'derived',
      formula: c.formula,
      match,
      error,
      lineNumber: c.lineNumber,
    });
  }

  // Third pass: unaccounted-figure sweep (RFIX-24)
  const sweep = sweepUnaccountedFigures(markdownContent, results, manifest);
  if (!sweep.passed) {
    anyFailure = true;
  }

  return {
    passed: !anyFailure,
    totalClaims: claims.length,
    results,
    sweep,
    manifestGitCommit: manifest?.gitCommit,
    manifestDirty: manifest?.dirty,
  };
}

// CLI Execution
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  let closeoutPath = 'docs/closeout.md';
  let evidenceDir = 'docs/evidence';

  for (const a of args) {
    if (a.startsWith('--evidence-dir=')) {
      evidenceDir = a.replace('--evidence-dir=', '');
    } else if (!a.startsWith('--')) {
      closeoutPath = a;
    }
  }

  console.log('==============================================================================');
  console.log('🔍 CyberGym Closeout Claims Verifier (RFIX-24)');
  console.log(`Document:    ${closeoutPath}`);
  console.log(`Evidence:    ${evidenceDir}`);
  console.log('==============================================================================\n');

  if (!fs.existsSync(closeoutPath)) {
    console.error(`❌ Closeout document not found: ${closeoutPath}`);
    process.exit(1);
  }

  if (!fs.existsSync(evidenceDir)) {
    console.error(`❌ Evidence directory not found: ${evidenceDir}`);
    process.exit(1);
  }

  const content = fs.readFileSync(closeoutPath, 'utf8');
  const result = verifyCloseoutClaims(content, evidenceDir);

  if (result.error) {
    console.error(`❌ Verification failed: ${result.error}`);
    process.exit(1);
  }

  console.log(`Verified against Manifest Commit: ${result.manifestGitCommit || 'N/A'} (dirty: ${result.manifestDirty ?? 'N/A'})\n`);

  console.log(
    `${'Status'.padEnd(8)} ${'Type'.padEnd(9)} ${'Metric ID'.padEnd(36)} ${'Claimed'.padEnd(16)} ${'Evidence/Calc'.padEnd(16)} Source`
  );
  console.log('-'.repeat(105));

  for (const r of result.results) {
    const status = r.match ? '✅ PASS' : '❌ FAIL';
    const type = r.type.padEnd(9);
    const id = r.id.padEnd(36);
    const claimed = (r.claimed || '').padEnd(16);
    const extracted = (r.extracted || (r.error ? 'ERROR' : '')).padEnd(16);
    const source = r.source || '';

    console.log(`${status} ${type} ${id} ${claimed} ${extracted} ${source}`);
    if (!r.match) {
      if (r.isDecayed) {
        console.log(`   ⚠️ DECAY WARNING: Claim matches known stale/decayed historical value!`);
      }
      if (r.error) {
        console.log(`   ⚠️ Reason: ${r.error}`);
      } else {
        console.log(`   ⚠️ Mismatch: Claimed '${r.claimed}' (${r.normalizedClaim}) vs Evidence '${r.extracted}' (${r.normalizedExtracted})`);
      }
    }
  }

  console.log('-'.repeat(105));
  const passCount = result.results.filter(r => r.match).length;
  const failCount = result.results.length - passCount;

  console.log(`\nSummary: ${passCount} PASSED, ${failCount} FAILED out of ${result.totalClaims} total claims.`);

  if (result.sweep && !result.sweep.passed) {
    console.log('\n❌ UNACCOUNTED FIGURE SWEEP FAILED:');
    for (const u of result.sweep.unhandledFigures) {
      console.log(`   Line ${u.lineNumber}: Unaccounted figure '${u.figure}' in line: "${u.line}"`);
      console.log(`      (Figure is not bound to any verified claim, evidence artifact, or justified ignore rule.)`);
    }
  } else if (result.sweep) {
    console.log('\n✅ Unaccounted-figure sweep passed: all numeric tokens are bound to verified claims or justified ignore rules.');
  }

  if (!result.passed) {
    console.error('\n❌ Closeout claims verification FAILED.');
    process.exit(1);
  } else {
    console.log('\n✅ ALL CLOSEOUT CLAIMS VERIFIED SUCCESSFULLY AGAINST RAW EVIDENCE.');
    process.exit(0);
  }
}
