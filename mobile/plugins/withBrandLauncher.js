const { withDangerousMod } = require("expo/config-plugins");
const fs = require("node:fs/promises");
const path = require("node:path");

// Keep the approved logo intact and give Android's adaptive mask room around it.
module.exports = (config) => withDangerousMod(config, ["android", async (mod) => {
  const resources = path.join(mod.modRequest.platformProjectRoot, "app/src/main/res");
  const drawable = path.join(resources, "drawable");
  await fs.mkdir(drawable, { recursive: true });
  await fs.writeFile(path.join(drawable, "brand_launcher_foreground.xml"), `<?xml version="1.0" encoding="utf-8"?>
<inset xmlns:android="http://schemas.android.com/apk/res/android"
  android:drawable="@mipmap/ic_launcher_foreground"
  android:insetLeft="16dp" android:insetTop="16dp"
  android:insetRight="16dp" android:insetBottom="16dp" />
`);
  for (const name of ["ic_launcher.xml", "ic_launcher_round.xml"]) {
    const file = path.join(resources, "mipmap-anydpi-v26", name);
    const xml = await fs.readFile(file, "utf8");
    await fs.writeFile(file, xml.replace('@mipmap/ic_launcher_foreground', '@drawable/brand_launcher_foreground'));
  }
  return mod;
}]);
