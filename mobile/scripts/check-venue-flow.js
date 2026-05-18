const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.");
  process.exit(1);
}

const headers = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
};

async function fetchTable(table, select = "*", limit = 1000) {
  const url = `${supabaseUrl}/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=${limit}`;
  const res = await fetch(url, { headers });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${table} fetch failed: ${res.status} ${text}`);
  }
  return JSON.parse(text);
}

function indexById(rows) {
  const map = new Map();
  rows.forEach((row) => map.set(row.id, row));
  return map;
}

(async () => {
  try {
    const [profiles, groups, gigs, applications] = await Promise.all([
      fetchTable("profiles", "id,role"),
      fetchTable("groups", "id,owner_id"),
      fetchTable("gigs", "id,organizer_id"),
      fetchTable("gig_applications", "id,applicant_id,group_id,gig_id"),
    ]);

    const profilesById = indexById(profiles);
    const groupsById = indexById(groups);
    const gigsById = indexById(gigs);

    const issues = [];

    // Validate gig organizers are venue owners
    gigs.forEach((gig) => {
      const organizer = profilesById.get(gig.organizer_id);
      if (!organizer) {
        issues.push({
          type: "gig",
          id: gig.id,
          issue: "organizer_id not found in profiles",
        });
        return;
      }
      if (organizer.role !== "venue-owner") {
        issues.push({
          type: "gig",
          id: gig.id,
          issue: `organizer role is ${organizer.role}, expected venue-owner`,
        });
      }
    });

    // Validate gig applications
    applications.forEach((app) => {
      const applicant = profilesById.get(app.applicant_id);
      if (!applicant) {
        issues.push({
          type: "gig_application",
          id: app.id,
          issue: "applicant_id not found in profiles",
        });
      } else if (applicant.role !== "musician") {
        issues.push({
          type: "gig_application",
          id: app.id,
          issue: `applicant role is ${applicant.role}, expected musician`,
        });
      }

      if (!gigsById.get(app.gig_id)) {
        issues.push({
          type: "gig_application",
          id: app.id,
          issue: "gig_id not found in gigs",
        });
      }

      if (app.group_id) {
        const group = groupsById.get(app.group_id);
        if (!group) {
          issues.push({
            type: "gig_application",
            id: app.id,
            issue: "group_id not found in groups",
          });
        } else if (group.owner_id !== app.applicant_id) {
          issues.push({
            type: "gig_application",
            id: app.id,
            issue: "group owner_id does not match applicant_id",
          });
        }
      }
    });

    const summary = {
      profiles: profiles.length,
      groups: groups.length,
      gigs: gigs.length,
      gig_applications: applications.length,
      issues: issues.length,
    };


    if (issues.length) {
      issues.forEach((issue) => undefined);
    } else {
    }
  } catch (error) {
    console.error(error.message || String(error));
    process.exit(1);
  }
})();
