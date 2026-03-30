const fs = require("fs");

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.");
  process.exit(1);
}

const schemaPath = "E:\\React-Native-Projects\\MusikaLokal\\supabase_schema.sql";
const sql = fs.readFileSync(schemaPath, "utf8");

const tableRegex = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-zA-Z0-9_]+)/gi;
const tableNames = [...new Set([...sql.matchAll(tableRegex)].map((match) => match[1]))];

const limit = 3;

(async () => {
  for (const table of tableNames) {
    try {
      const endpoint = `${supabaseUrl}/rest/v1/${table}?select=*&limit=${limit}`;
      const response = await fetch(endpoint, {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      });

      const text = await response.text();

      if (!response.ok) {
        console.log(`${table}: error ${response.status}`);
        continue;
      }

      const data = JSON.parse(text);
      console.log(`${table}: ${data.length} rows`);
      if (data[0]) {
        console.log(JSON.stringify(data[0]));
      }
    } catch (error) {
      console.log(`${table}: error`);
    }
  }
})();
