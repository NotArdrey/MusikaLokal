const fs = require("fs");
const files = [
  "mobile/app/seller_hub.tsx",
  "mobile/app/orders.tsx",
  "mobile/app/shop.tsx",
  "mobile/app/producer_projects.tsx"
];

for (const file of files) {
  let content = fs.readFileSync(file, "utf-8");

  // Fix header styles
  if (content.includes("useTheme();")) {
    // Add isDark from useTheme
    if (!content.includes("isDark")) {
      content = content.replace(/const { colors } = useTheme\(\);/, 'const { colors, isDark } = useTheme();');
    }
  }

  // 1. Fix Tab Row
  content = content.replace(/styles\.tabRow(?!,)/g, 'styles.tabRow');
  content = content.replace(/tabRow:\s*\{[^}]+\}/, `tabRow: { flexDirection: "row" }`);
  
  // Add a wrapper to the tab definition to use borderBottomColor dynamically
  // We'll replace the existing tabRow render
  content = content.replace(
    /<View style=\{styles\.tabRow\}>/g,
    `<View style={[styles.tabRow, { borderBottomWidth: 1, borderBottomColor: isDark ? "#334155" : "#E2E8F0" }]}>`
  );

  // 2. Fix Tab
  content = content.replace(/tab:\s*\{[^}]+\}/, `tab: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 14 }`);
  content = content.replace(/tabText:\s*\{[^}]+\}/, `tabText: { fontSize: moderateScale(13), fontFamily: "Poppins_600SemiBold" }`);

  // 3. Fix active tab styling inline:
  // Usually it relies on conditional styles
  content = content.replace(
    /borderBottomColor:\s*colors.primary,\s*borderBottomWidth:\s*2/g,
    `borderBottomColor: colors.primary, borderBottomWidth: 2, borderBottomLeftRadius: 1, borderBottomRightRadius: 1`
  );

  // 4. Update standard typography to use Poppins where fontWeight is used
  // Just use Regex replacing for "600" and "700" to fontFamily
  content = content.replace(/fontWeight:\s*"400"/g, 'fontFamily: "Poppins_400Regular"');
  content = content.replace(/fontWeight:\s*"500"/g, 'fontFamily: "Poppins_500Medium"');
  content = content.replace(/fontWeight:\s*"600"/g, 'fontFamily: "Poppins_600SemiBold"');
  content = content.replace(/fontWeight:\s*"700"/g, 'fontFamily: "Poppins_700Bold"');
  content = content.replace(/fontWeight:\s*"800"/g, 'fontFamily: "Poppins_700Bold"');

  // Fix all non-fontFamily text so it defaults to regular
  // Find fontSize: something that doesn't have fontFamily next to it
  // Skipped for simplicity of regex, I'll just rely on the ones above explicitly mapped.
  
  // Empty states enhancement
  content = content.replace(
    /<Text style=\{\[styles\.emptyText, \{ color: colors\.textSecondary \}\]\}>([^<]+)<\/Text>/g,
    `<View style={{flex: 1, alignItems: "center", justifyContent: "center", minHeight: 400}}>
       <Ionicons name="cube-outline" size={48} color={isDark ? "#334155" : "#E2E8F0"} />
       <Text style={[styles.emptyText, { color: colors.textSecondary }]}>$1</Text>
     </View>`
  );

  // Fix empty text style
  content = content.replace(/emptyText:\s*\{[^}]+\}/, `emptyText: { textAlign: "center", marginTop: 12, fontSize: moderateScale(15), fontFamily: "Poppins_500Medium" }`);

  // Change input borders
  content = content.replace(/searchBar:\s*\{[^}]+\}/, `searchBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, borderWidth: 1 }`);
  
  // Make list rendering stretch cards with flex:1 if needed, but not breaking cards.
  // Make borders contextual
  content = content.replace(/borderColor:\s*colors\.border/g, `borderColor: isDark ? "#334155" : "#E2E8F0"`);

  fs.writeFileSync(file, content, "utf-8");
  console.log("Patched", file);
}
