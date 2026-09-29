import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const envPath = fileURLToPath(new URL("../.env", import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);

const password = process.env.RESET_USER_PASSWORD;
const projectUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const projectRef = process.env.SUPABASE_PROJECT_REF;
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

assert(password, "Set RESET_USER_PASSWORD in the environment.");
assert(password.length >= 6, "RESET_USER_PASSWORD must contain at least 6 characters.");
assert(projectUrl, "Set SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL in the environment.");

if (projectRef) {
  assert.equal(
    new URL(projectUrl).hostname,
    `${projectRef}.supabase.co`,
    "SUPABASE_PROJECT_REF does not match the configured Supabase URL.",
  );
}

async function getServiceRoleKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return process.env.SUPABASE_SERVICE_ROLE_KEY;
  }

  assert(projectRef && accessToken, "Set SUPABASE_SERVICE_ROLE_KEY, or both SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN.");

  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/api-keys`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  assert(response.ok, `Could not obtain the service-role key (HTTP ${response.status}).`);

  const keys = await response.json();
  const serviceRoleKey = keys.find((key) => key.name === "service_role")?.api_key;
  assert(serviceRoleKey, "The project did not return a service-role key.");
  return serviceRoleKey;
}

async function listAllUsers(client) {
  const users = [];
  const perPage = 1000;

  for (let page = 1; ; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < perPage) break;
  }

  return users;
}

async function main() {
  const serviceRoleKey = await getServiceRoleKey();
  const client = createClient(projectUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const users = await listAllUsers(client);

  console.log(`Found ${users.length} Auth users. Resetting passwords...`);
  const failures = [];

  for (let index = 0; index < users.length; index += 1) {
    const { error } = await client.auth.admin.updateUserById(users[index].id, { password });
    if (error) failures.push({ id: users[index].id, message: error.message });
    if ((index + 1) % 25 === 0 || index + 1 === users.length) {
      console.log(`Processed ${index + 1}/${users.length}.`);
    }
  }

  if (failures.length > 0) {
    console.error(`Reset failed for ${failures.length} of ${users.length} users.`);
    for (const failure of failures) console.error(`${failure.id}: ${failure.message}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Successfully reset passwords for all ${users.length} users.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
