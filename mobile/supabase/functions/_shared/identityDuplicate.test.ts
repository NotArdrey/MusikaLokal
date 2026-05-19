import {
  buildIdentityDocumentFingerprint,
  findSameRoleIdentityDuplicate,
  normalizeBirthDate,
  normalizeFullLegalName,
  prepareIdentityNameBirthDateDuplicateInput,
} from "./identityDuplicate.ts";

function assert(condition: unknown, message = "Assertion failed") {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
  }
}

function createIdentityClaimsClient(data: any[]) {
  const query = {
    select: () => query,
    eq: () => query,
    in: () => query,
    not: () => query,
    limit: () => query,
    neq: () => query,
    then: (resolve: any, reject: any) => Promise.resolve({ data, error: null }).then(resolve, reject),
  };
  return {
    from: (table: string) => {
      assertEquals(table, "identity_document_claims");
      return query;
    },
  };
}

Deno.env.set("IDENTITY_DOCUMENT_HASH_SECRET", "identity-duplicate-test-secret");

Deno.test("buildIdentityDocumentFingerprint does not fall back to name and birthdate", async () => {
  const fingerprint = await buildIdentityDocumentFingerprint({
    full_name: "Maria Reyes",
    date_of_birth: "1991-05-06",
  }, {
    documentType: "passport",
    documentCountry: "PHL",
  });

  assertEquals(fingerprint, null);
});

Deno.test("buildIdentityDocumentFingerprint requires number, type, and country", async () => {
  assertEquals(
    await buildIdentityDocumentFingerprint({ document_number: "A123" }, { documentCountry: "PHL" }),
    null,
  );
  assertEquals(
    await buildIdentityDocumentFingerprint({ document_number: "A123" }, { documentType: "passport" }),
    null,
  );
});

Deno.test("buildIdentityDocumentFingerprint uses document-only canonical data", async () => {
  const first = await buildIdentityDocumentFingerprint({
    document_number: " A-123 456 ",
    full_name: "Maria Reyes",
    date_of_birth: "1991-05-06",
  }, {
    documentType: "passport",
    documentCountry: "PHL",
  });
  const second = await buildIdentityDocumentFingerprint({
    document_number: "A123456",
    full_name: "Different Person",
    date_of_birth: "2000-01-01",
  }, {
    documentType: "passport",
    documentCountry: "PHL",
  });

  assert(first?.startsWith("v1:"), "expected v1 fingerprint");
  assertEquals(first, second);
});

Deno.test("normalizeFullLegalName handles spaces, casing, punctuation, and diacritics", () => {
  assertEquals(normalizeFullLegalName("  Jose  Dela-Cruz, Jr.  "), "JOSE DELA CRUZ JR");
  assertEquals(normalizeFullLegalName("  Maria   Luisa  "), "MARIA LUISA");
  assertEquals(normalizeFullLegalName(""), null);
});

Deno.test("normalizeBirthDate returns YYYY-MM-DD or null", () => {
  assertEquals(normalizeBirthDate("1990-2-3"), "1990-02-03");
  assertEquals(normalizeBirthDate("1990-02-31"), null);
  assertEquals(normalizeBirthDate("not a date"), null);
  assertEquals(normalizeBirthDate(null), null);
});

Deno.test("prepareIdentityNameBirthDateDuplicateInput returns plain match input, not a fingerprint", () => {
  assertEquals(
    prepareIdentityNameBirthDateDuplicateInput({
      full_name: "  Maria  Reyes ",
      date_of_birth: "1991-05-06",
    }),
    {
      fullLegalName: "Maria Reyes",
      normalizedFullLegalName: "MARIA REYES",
      birthDate: "1991-05-06",
      hasNameBirthDate: true,
    },
  );
});

Deno.test("findSameRoleIdentityDuplicate ignores stale claims without an active profile", async () => {
  const result = await findSameRoleIdentityDuplicate(createIdentityClaimsClient([
    {
      id: "claim-1",
      user_id: "00000000-0000-0000-0000-000000000001",
      role: "musician",
      status: "APPROVED",
      normalized_email: "old@example.com",
      profiles: null,
    },
  ]), {
    documentFingerprint: "v1:abc123",
    role: "musician",
    email: "new@example.com",
  });

  assertEquals(result, { hasDuplicate: false, matches: [] });
});
