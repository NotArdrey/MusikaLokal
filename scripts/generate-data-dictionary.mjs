import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT, 'web', 'supabase', 'migrations');
const OUTPUT_PATH = path.join(ROOT, 'docs', 'DATA_DICTIONARY.md');
const SNAPSHOT_COMMIT = '34c64be5a7542eab23f12e1f581a592febeafd40';
const SNAPSHOT_PATH = 'mobile/supabase/schema_exports/live_schema_full_20260519.sql';
const SNAPSHOT_GENERATED_AT = '2026-05-19T13:28:53+08:00';
const FIRST_MIGRATION = '00000000000000';

const quoteMd = (value) => String(value ?? '').replaceAll('|', '\\|').replace(/\r?\n/g, ' ');
const displayName = (value) => value.replaceAll('_', ' ');

function splitTopLevel(value) {
  const parts = [];
  let start = 0;
  let depth = 0;
  let quote = null;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const next = value[index + 1];

    if (quote) {
      if (char === quote && next === quote) {
        index += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
    } else if (char === '(' || char === '[') {
      depth += 1;
    } else if (char === ')' || char === ']') {
      depth = Math.max(0, depth - 1);
    } else if (char === ',' && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }

  parts.push(value.slice(start).trim());
  return parts.filter(Boolean);
}

function normalizeIdentifier(value) {
  return value.trim().replace(/^"|"$/g, '').toLowerCase();
}

function parseColumnDefinition(definition) {
  const match = definition.match(/^\s*("[^"]+"|[a-zA-Z_][\w$]*)\s+([\s\S]+)$/);
  if (!match) return null;

  const name = normalizeIdentifier(match[1]);
  if (['constraint', 'primary', 'foreign', 'unique', 'check', 'exclude'].includes(name)) return null;

  const body = match[2].trim();
  const keyword = /\s+(?=default\b|not\s+null\b|null\b|constraint\b|primary\s+key\b|unique\b|references\b|check\b|collate\b|generated\b)/i;
  const type = body.split(keyword, 1)[0].trim().replace(/\s+/g, ' ');
  const defaultMatch = body.match(/\bDEFAULT\s+(.+?)(?=\s+NOT\s+NULL\b|\s+NULL\b|\s+CONSTRAINT\b|\s+PRIMARY\s+KEY\b|\s+UNIQUE\b|\s+REFERENCES\b|\s+CHECK\b|$)/i);
  const referenceMatch = body.match(/\bREFERENCES\s+(?:(public|auth|storage)\.)?("?[a-zA-Z_][\w$]*"?)\s*\(([^)]+)\)/i);
  const primaryKey = /\bPRIMARY\s+KEY\b/i.test(body);

  return {
    name,
    type,
    nullable: !primaryKey && !/\bNOT\s+NULL\b/i.test(body),
    default: defaultMatch?.[1]?.trim() ?? '',
    primaryKey,
    unique: /\bUNIQUE\b/i.test(body),
    reference: referenceMatch
      ? `${referenceMatch[1] && referenceMatch[1].toLowerCase() !== 'public' ? `${referenceMatch[1].toLowerCase()}.` : ''}${normalizeIdentifier(referenceMatch[2])}.${normalizeIdentifier(referenceMatch[3])}`
      : '',
    check: body.match(/\bCHECK\s*(\([\s\S]+\))\s*$/i)?.[1]?.trim() ?? '',
  };
}

function upsertColumn(table, column) {
  const existingIndex = table.columns.findIndex((item) => item.name === column.name);
  if (existingIndex >= 0) table.columns[existingIndex] = { ...table.columns[existingIndex], ...column };
  else table.columns.push(column);
}

function ensureTable(tables, name, source = 'migration') {
  const normalized = normalizeIdentifier(name);
  if (!tables.has(normalized)) {
    tables.set(normalized, {
      name: normalized,
      columns: [],
      primaryKeys: new Set(),
      uniqueColumns: new Set(),
      rls: false,
      source,
    });
  }
  return tables.get(normalized);
}

function applySql(tables, sql, source) {
  const createPattern = /^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?("?[a-zA-Z_][\w$]*"?)\s*\(/gim;
  for (const match of sql.matchAll(createPattern)) {
    const tableName = normalizeIdentifier(match[1]);
    const openIndex = match.index + match[0].lastIndexOf('(');
    let depth = 0;
    let quote = null;
    let closeIndex = -1;

    for (let index = openIndex; index < sql.length; index += 1) {
      const char = sql[index];
      const next = sql[index + 1];
      if (quote) {
        if (char === quote && next === quote) index += 1;
        else if (char === quote) quote = null;
        continue;
      }
      if (char === "'" || char === '"') quote = char;
      else if (char === '(') depth += 1;
      else if (char === ')') {
        depth -= 1;
        if (depth === 0) {
          closeIndex = index;
          break;
        }
      }
    }

    if (closeIndex < 0) continue;
    const table = ensureTable(tables, tableName, source);
    if (source.startsWith('snapshot')) table.source = source;
    const definitions = splitTopLevel(sql.slice(openIndex + 1, closeIndex));

    for (const definition of definitions) {
      const column = parseColumnDefinition(definition);
      if (column) {
        upsertColumn(table, column);
        if (column.primaryKey) table.primaryKeys.add(column.name);
        if (column.unique) table.uniqueColumns.add(column.name);
        continue;
      }

      const pkMatch = definition.match(/(?:CONSTRAINT\s+\S+\s+)?PRIMARY\s+KEY\s*\(([^)]+)\)/i);
      if (pkMatch) {
        for (const key of splitTopLevel(pkMatch[1])) table.primaryKeys.add(normalizeIdentifier(key));
      }
      const fkMatch = definition.match(/FOREIGN\s+KEY\s*\(([^)]+)\)\s+REFERENCES\s+(?:(public|auth|storage)\.)?(\S+)\s*\(([^)]+)\)/i);
      if (fkMatch) {
        const sources = splitTopLevel(fkMatch[1]);
        const targets = splitTopLevel(fkMatch[4]);
        sources.forEach((columnName, index) => {
          const column = table.columns.find((item) => item.name === normalizeIdentifier(columnName));
          const schemaPrefix = fkMatch[2] && fkMatch[2].toLowerCase() !== 'public' ? `${fkMatch[2].toLowerCase()}.` : '';
          if (column) column.reference = `${schemaPrefix}${normalizeIdentifier(fkMatch[3])}.${normalizeIdentifier(targets[index] ?? targets[0])}`;
        });
      }
    }
  }

  const alterTablePattern = /^\s*ALTER\s+TABLE(?:\s+ONLY)?\s+(?:IF\s+EXISTS\s+)?(?:public\.)?("?[a-zA-Z_][\w$]*"?)\s+([\s\S]*?);/gim;
  for (const match of sql.matchAll(alterTablePattern)) {
    const table = ensureTable(tables, match[1], source);
    for (const action of splitTopLevel(match[2])) {
      const addMatch = action.match(/^ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([\s\S]+)$/i);
      if (addMatch) {
        const column = parseColumnDefinition(addMatch[1]);
        if (column) upsertColumn(table, column);
        continue;
      }

      const dropMatch = action.match(/^DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?("?[a-zA-Z_][\w$]*"?)/i);
      if (dropMatch) {
        const columnName = normalizeIdentifier(dropMatch[1]);
        table.columns = table.columns.filter((item) => item.name !== columnName);
        table.primaryKeys.delete(columnName);
        table.uniqueColumns.delete(columnName);
        continue;
      }

      const setNotNullMatch = action.match(/^ALTER\s+COLUMN\s+("?[a-zA-Z_][\w$]*"?)\s+SET\s+NOT\s+NULL$/i);
      if (setNotNullMatch) {
        const column = table.columns.find((item) => item.name === normalizeIdentifier(setNotNullMatch[1]));
        if (column) column.nullable = false;
        continue;
      }

      const dropNotNullMatch = action.match(/^ALTER\s+COLUMN\s+("?[a-zA-Z_][\w$]*"?)\s+DROP\s+NOT\s+NULL$/i);
      if (dropNotNullMatch) {
        const column = table.columns.find((item) => item.name === normalizeIdentifier(dropNotNullMatch[1]));
        if (column) column.nullable = true;
        continue;
      }

      const setDefaultMatch = action.match(/^ALTER\s+COLUMN\s+("?[a-zA-Z_][\w$]*"?)\s+SET\s+DEFAULT\s+([\s\S]+)$/i);
      if (setDefaultMatch) {
        const column = table.columns.find((item) => item.name === normalizeIdentifier(setDefaultMatch[1]));
        if (column) column.default = setDefaultMatch[2].trim();
        continue;
      }

      const dropDefaultMatch = action.match(/^ALTER\s+COLUMN\s+("?[a-zA-Z_][\w$]*"?)\s+DROP\s+DEFAULT$/i);
      if (dropDefaultMatch) {
        const column = table.columns.find((item) => item.name === normalizeIdentifier(dropDefaultMatch[1]));
        if (column) column.default = '';
        continue;
      }

      const typeMatch = action.match(/^ALTER\s+COLUMN\s+("?[a-zA-Z_][\w$]*"?)\s+(?:SET\s+DATA\s+)?TYPE\s+(.+?)(?:\s+USING\s+[\s\S]+)?$/i);
      if (typeMatch) {
        const column = table.columns.find((item) => item.name === normalizeIdentifier(typeMatch[1]));
        if (column) column.type = typeMatch[2].trim();
      }
    }
  }

  const pkPattern = /ALTER\s+TABLE(?:\s+ONLY)?\s+(?:public\.)?("?[a-zA-Z_][\w$]*"?)\s+ADD\s+CONSTRAINT\s+\S+\s+PRIMARY\s+KEY\s*\(([^)]+)\)/gi;
  for (const match of sql.matchAll(pkPattern)) {
    const table = ensureTable(tables, match[1], source);
    for (const key of splitTopLevel(match[2])) table.primaryKeys.add(normalizeIdentifier(key));
  }

  const uniquePattern = /ALTER\s+TABLE(?:\s+ONLY)?\s+(?:public\.)?("?[a-zA-Z_][\w$]*"?)\s+ADD\s+CONSTRAINT\s+\S+\s+UNIQUE\s*\(([^)]+)\)/gi;
  for (const match of sql.matchAll(uniquePattern)) {
    const table = ensureTable(tables, match[1], source);
    const keys = splitTopLevel(match[2]);
    if (keys.length === 1) table.uniqueColumns.add(normalizeIdentifier(keys[0]));
  }

  const fkPattern = /ALTER\s+TABLE(?:\s+ONLY)?\s+(?:public\.)?("?[a-zA-Z_][\w$]*"?)\s+ADD\s+CONSTRAINT\s+\S+\s+FOREIGN\s+KEY\s*\(([^)]+)\)\s+REFERENCES\s+(?:(public|auth|storage)\.)?("?[a-zA-Z_][\w$]*"?)\s*\(([^)]+)\)/gi;
  for (const match of sql.matchAll(fkPattern)) {
    const table = ensureTable(tables, match[1], source);
    const sourceColumns = splitTopLevel(match[2]);
    const targetColumns = splitTopLevel(match[5]);
    sourceColumns.forEach((columnName, index) => {
      const column = table.columns.find((item) => item.name === normalizeIdentifier(columnName));
      const schemaPrefix = match[3] && match[3].toLowerCase() !== 'public' ? `${match[3].toLowerCase()}.` : '';
      if (column) column.reference = `${schemaPrefix}${normalizeIdentifier(match[4])}.${normalizeIdentifier(targetColumns[index] ?? targetColumns[0])}`;
    });
  }

  const rlsPattern = /ALTER\s+TABLE(?:\s+ONLY)?\s+(?:public\.)?("?[a-zA-Z_][\w$]*"?)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi;
  for (const match of sql.matchAll(rlsPattern)) ensureTable(tables, match[1], source).rls = true;

  const tableCommentPattern = /COMMENT\s+ON\s+TABLE\s+public\.("?[a-zA-Z_][\w$]*"?)\s+IS\s+'((?:''|[^'])*)'\s*;/gi;
  for (const match of sql.matchAll(tableCommentPattern)) {
    ensureTable(tables, match[1], source).comment = match[2].replaceAll("''", "'").replace(/\s+/g, ' ').trim();
  }

  const columnCommentPattern = /COMMENT\s+ON\s+COLUMN\s+public\.("?[a-zA-Z_][\w$]*"?)\.("?[a-zA-Z_][\w$]*"?)\s+IS\s+'((?:''|[^'])*)'\s*;/gi;
  for (const match of sql.matchAll(columnCommentPattern)) {
    const table = ensureTable(tables, match[1], source);
    const column = table.columns.find((item) => item.name === normalizeIdentifier(match[2]));
    if (column) column.comment = match[3].replaceAll("''", "'").replace(/\s+/g, ' ').trim();
  }

  const dropTablePattern = /^\s*DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?("?[a-zA-Z_][\w$]*"?)/gim;
  for (const match of sql.matchAll(dropTablePattern)) tables.delete(normalizeIdentifier(match[1]));
}

const exactPurposes = {
  profiles: 'Application accounts and public/private profile attributes for musicians, owners, producers, fans, and administrators.',
  gigs: 'Venue opportunities, performance requirements, schedule, location, compensation, permit state, and lifecycle data.',
  groups: 'Musical group and duo listings owned and managed by profiles.',
  studios: 'Bookable studio listings, addresses, rates, verification state, and owner-facing configuration.',
  studio_bookings: 'Studio reservation requests, payment state, schedule, attendance, cancellation, relocation, and completion data.',
  gig_applications: 'Applications from musicians, groups, or production teams to gigs, including acceptance and completion lifecycle.',
  booking_requests: 'Cross-entity invitations and applications, including group membership and production-team connections.',
  conversations: 'Chat conversation containers; membership is normalized through conversation participants.',
  conversation_participants: 'Profiles participating in each conversation and their per-conversation state.',
  messages: 'Chat messages and attachment metadata sent within conversations.',
  notifications: 'In-app notification records and navigation metadata for a profile.',
  wallets: 'Current in-app balance state by owner profile.',
  wallet_transactions: 'Immutable-style wallet ledger entries for earnings, deposits, deductions, and withdrawals.',
  reviews: 'Post-engagement ratings and written reviews between platform participants.',
  reports: 'User-submitted moderation reports and their administrative resolution workflow.',
  feed_posts: 'Social-feed posts authored by profiles, groups, or production teams.',
  post_comments: 'Threaded comments on social-feed posts.',
  playlists: 'Curated audio collections owned by profiles, groups, or other supported entities.',
  playlist_items: 'Ordered tracks and audio metadata within playlists.',
  stations: 'Radio-style stations and their ownership, presentation, and rotation settings.',
  products: 'Marketplace product listings offered by sellers.',
  orders: 'Marketplace purchases with buyer, seller, payment, shipping, and fulfillment state.',
  production_teams: 'Producer-led teams used for collaboration, roster management, and venue-facing applications.',
  audit_events: 'General create, update, and delete audit event headers.',
  upload_moderation_cases: 'Current automated or manual moderation case for an uploaded media object.',
  upload_moderation_history: 'Append-only status history for upload moderation decisions.',
  upload_moderation_restrictions: 'Upload restrictions imposed on a user after moderation outcomes.',
  content_restrictions: 'Scoped restrictions that block selected content-creation actions for a profile.',
};

const applicationViews = {
  conversations_display_projection: 'Chat conversation display projection with participant-derived names and avatars.',
  gigs_legacy_projection: 'Compatibility projection that rebuilds legacy gig fields from normalized tables.',
  gigs_with_stats: 'Gig listing projection enriched with application, review, and permit statistics.',
  groups_legacy_projection: 'Compatibility projection that rebuilds legacy group members and media fields.',
  groups_with_stats: 'Group listing projection enriched with membership, review, and completion statistics.',
  profiles_legacy_projection: 'Compatibility projection that rebuilds profile skills, genres, and portfolio fields.',
  profiles_with_stats: 'Profile projection enriched with review and performance statistics.',
  studios_legacy_projection: 'Compatibility projection that rebuilds legacy studio types, amenities, media, and instrument fields.',
  studios_with_stats: 'Studio listing projection enriched with review, booking, and permit statistics.',
};

function tableDomain(name) {
  if (/^(profile|identity|verification|address_verification|registration|musician_verification)/.test(name)) return 'Identity & Profiles';
  if (/^(gig|group|studio|booking|review|favorite)/.test(name)) return 'Listings & Bookings';
  if (/^(wallet|withdrawal|payout|platform_withdrawal)/.test(name)) return 'Wallet & Payments';
  if (/^(conversation|message|notification|push_notification|email_notification)/.test(name)) return 'Messaging & Notifications';
  if (/^(production|staff_listing)/.test(name)) return 'Production & Collaboration';
  if (/^(feed|post|follow|social|listing_comment)/.test(name)) return 'Social';
  if (/^(playlist|station|external_platform)/.test(name)) return 'Playlists & Radio';
  if (/^(product|order|shipping|user_entitlement)/.test(name)) return 'Marketplace';
  if (/^(report|audit|permit|deletion|normalization|booking_incident|upload_moderation|content_restriction)/.test(name)) return 'Moderation & Audit';
  return 'Platform Support';
}

function tablePurpose(name) {
  if (exactPurposes[name]) return exactPurposes[name];
  if (name.endsWith('_media')) return `Media assets attached to ${displayName(name.slice(0, -6))} records.`;
  if (name.endsWith('_members')) return `Normalized membership records for ${displayName(name.slice(0, -8))}.`;
  if (name.endsWith('_events')) return `Event history for ${displayName(name.slice(0, -7))}.`;
  if (name.endsWith('_audit')) return `Audit history for ${displayName(name.slice(0, -6))} operations.`;
  return `Stores ${displayName(name)} records used by the MusikaLokal platform.`;
}

function columnDescription(column, table) {
  if (column.comment) return column.comment;
  const name = column.name;
  if (column.reference) return `References \`${column.reference}\`.`;
  if (table.primaryKeys.has(name)) return `Primary identifier for the ${displayName(table.name)} row.`;
  if (name === 'created_at') return 'Timestamp when the row was created.';
  if (name === 'updated_at') return 'Timestamp when the row was last updated.';
  if (name === 'deleted_at') return 'Soft-deletion timestamp; null while active.';
  if (name.endsWith('_at')) return `Timestamp for the ${displayName(name.slice(0, -3))} event.`;
  if (name.endsWith('_date')) return `Calendar date for ${displayName(name.slice(0, -5))}.`;
  if (name === 'status') return 'Current lifecycle state of this record.';
  if (name.endsWith('_status')) return `Lifecycle state for ${displayName(name.replace(/_status$/, ''))}.`;
  if (name.endsWith('_url')) return `URL for the ${displayName(name.slice(0, -4))} resource.`;
  if (name.endsWith('_count')) return `Stored count of ${displayName(name.slice(0, -6))}.`;
  if (/^(is_|has_|can_|allow_|requires_|enabled$)/.test(name)) return `Boolean flag for ${displayName(name)}.`;
  if (/(amount|price|fee|balance|rate|cost)/.test(name)) return `Monetary or rate value for ${displayName(name)}.`;
  if (name === 'metadata' || name.endsWith('_metadata') || name === 'meta') return 'Structured supplemental metadata.';
  if (name === 'description') return `Human-readable description of the ${displayName(table.name)} record.`;
  if (name === 'notes') return 'Free-form notes about this record.';
  if (name.endsWith('_notes')) return `Free-form notes about ${displayName(name.replace(/_notes$/, ''))}.`;
  return `Stores the ${displayName(name)} value for this record.`;
}

function renderDictionary(tables, migrationFiles) {
  const orderedTables = [...tables.values()]
    .filter((table) => table.columns.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
  const totalColumns = orderedTables.reduce((sum, table) => sum + table.columns.length, 0);
  const latestMigration = migrationFiles.at(-1)?.replace(/\.sql$/, '') ?? 'none';
  const lines = [];

  lines.push('# MusikaLokal Data Dictionary', '');
  lines.push(`Last generated: 2026-09-12 (Asia/Manila)  `);
  lines.push(`Coverage: \`public\` application tables reconstructed through migration \`${latestMigration}\`.  `);
  lines.push(`Inventory: **${orderedTables.length} tables**, **${totalColumns} columns**, and **${Object.keys(applicationViews).length} application-facing views**.`, '');
  lines.push('## Scope and provenance', '');
  lines.push(`This dictionary starts from the repository's catalog-derived production schema snapshot generated at \`${SNAPSHOT_GENERATED_AT}\` and folds in all ${migrationFiles.length} version-controlled SQL migrations in filename order so schema additions not present in that snapshot are still represented. Supabase-managed schemas such as \`auth\`, \`storage\`, and \`realtime\` are intentionally excluded. View column definitions, functions, triggers, indexes, policies, and storage buckets are outside this column dictionary.`);
  lines.push('');
  lines.push('The linked production database could not be queried directly with the available project credentials, so this is a repository-derived contract rather than a live catalog dump. SQL built dynamically inside procedural blocks may require live verification. Column descriptions without explicit database comments are concise business interpretations based on names, constraints, foreign keys, migrations, and application usage.');
  lines.push('');
  lines.push('Legend: **PK** = primary key; **FK** = foreign key; **UQ** = single-column unique constraint; “Required” reflects \`NOT NULL\` in the reconstructed DDL. RLS indicates whether row-level security was explicitly enabled in the parsed schema history.');
  lines.push('');
  lines.push('## Table inventory', '');
  lines.push('| Domain | Table | Purpose | Columns | RLS |');
  lines.push('|---|---|---|---:|:---:|');
  for (const table of orderedTables) {
    lines.push(`| ${tableDomain(table.name)} | [\`${table.name}\`](#${table.name.replaceAll('_', '-')}) | ${quoteMd(tablePurpose(table.name))} | ${table.columns.length} | ${table.rls ? 'Yes' : 'Not detected'} |`);
  }
  lines.push('');
  lines.push('## Column definitions', '');

  for (const table of orderedTables) {
    lines.push(`### ${table.name}`, '');
    lines.push(`${table.comment || tablePurpose(table.name)} Domain: **${tableDomain(table.name)}**. RLS: **${table.rls ? 'enabled' : 'not detected'}**.`, '');
    lines.push('| Column | Type | Required | Key | Default | References | Rules | Description |');
    lines.push('|---|---|:---:|---|---|---|---|---|');
    for (const column of table.columns) {
      const keys = [];
      if (table.primaryKeys.has(column.name) || column.primaryKey) keys.push('PK');
      if (column.reference) keys.push('FK');
      if (table.uniqueColumns.has(column.name) || column.unique) keys.push('UQ');
      lines.push(`| \`${column.name}\` | \`${quoteMd(column.type)}\` | ${column.nullable ? 'No' : 'Yes'} | ${keys.join(', ')} | ${column.default ? `\`${quoteMd(column.default)}\`` : '--'} | ${column.reference ? `\`${column.reference}\`` : '--'} | ${column.check ? `\`${quoteMd(column.check)}\`` : '--'} | ${quoteMd(columnDescription(column, table))} |`);
    }
    lines.push('');
  }

  lines.push('## Application-facing views', '');
  lines.push('These relations are queried by the application but are not expanded into column definitions because their output is computed from underlying tables and may change when the view SQL changes.', '');
  lines.push('| View | Purpose |');
  lines.push('|---|---|');
  for (const [name, purpose] of Object.entries(applicationViews)) {
    lines.push(`| \`${name}\` | ${purpose} |`);
  }
  lines.push('');
  lines.push('The additional application reference \`listings\` is a Supabase Storage bucket name, not a database relation.', '');
  lines.push('## Maintenance', '');
  lines.push('Regenerate after schema changes with:', '', '```powershell', 'node scripts/generate-data-dictionary.mjs', '```', '');
  lines.push('For a release-grade database audit, compare this file with a fresh `information_schema.columns`, `pg_constraint`, and `pg_policies` export from the intended MusikaLokal Supabase project.');

  return `${lines.join('\n')}\n`;
}

const snapshot = execFileSync('git', ['show', `${SNAPSHOT_COMMIT}:${SNAPSHOT_PATH}`], {
  cwd: ROOT,
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024,
});
const migrationFiles = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.endsWith('.sql') && name.slice(0, 14) >= FIRST_MIGRATION)
  .sort();

const tables = new Map();
applySql(tables, snapshot, `snapshot ${SNAPSHOT_GENERATED_AT}`);
for (const migrationFile of migrationFiles) {
  applySql(tables, fs.readFileSync(path.join(MIGRATIONS_DIR, migrationFile), 'utf8'), migrationFile);
}

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, renderDictionary(tables, migrationFiles), 'utf8');

const populatedTables = [...tables.values()].filter((table) => table.columns.length > 0);
const totalColumns = populatedTables.reduce((sum, table) => sum + table.columns.length, 0);
console.log(`Wrote ${path.relative(ROOT, OUTPUT_PATH)} with ${populatedTables.length} tables and ${totalColumns} columns.`);
