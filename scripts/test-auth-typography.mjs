import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const authScreens = [
  "mobile/app/index.tsx",
  "mobile/app/signup.tsx",
  "mobile/app/forget_password.tsx",
];

test("mobile auth screens use the same typography tokens as Home", () => {
  for (const path of authScreens) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /import \{ typography \} from ['"]\.\.\/src\/theme\/tokens['"]/);
    assert.doesNotMatch(source, /Poppins_/);
    assert.match(source, /fontFamily:\s*typography\./);
  }

  const login = readFileSync("mobile/app/index.tsx", "utf8");
  const signup = readFileSync("mobile/app/signup.tsx", "utf8");
  assert.match(login, /appName:[\s\S]*?fontFamily:\s*typography\.title/);
  assert.match(signup, /stepTitle:[^\n]*fontFamily:\s*typography\.title/);
});
