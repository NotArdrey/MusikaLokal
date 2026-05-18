const fs = require("fs");

let content = fs.readFileSync("web/app/profile.tsx", "utf8");

// 1. Remove the old Menu Items block
const menuItemsStart = `{/* Menu Items (Owner Only) */}`;
const mediaSectionStart = `{/* Media Section - Instagram Style Grid */}`;

const menuIndex = content.indexOf(menuItemsStart);
const mediaIndex = content.indexOf(mediaSectionStart);

if (menuIndex !== -1 && mediaIndex !== -1) {
  content = content.slice(0, menuIndex) + content.slice(mediaIndex);
}

// 2. Insert the Tab Navigation after Bio Section
const bioSectionEndPattern = `            {/* Bio Section */}
            {profile?.bio && (
              <View style={styles.bioContainer}>
                <Text style={[styles.bioText, { color: colors.text }]}>
                  {profile.bio}
                </Text>
              </View>
            )}
`;

const tabNavSource = `
            {/* TAB NAVIGATION */}
            <View style={[styles.tabContainer, { borderBottomColor: borderSoft }]}>
              <TouchableOpacity onPress={() => setActiveTab("about")} style={[styles.tabButton, activeTab === "about" && { borderBottomColor: colors.text, borderBottomWidth: 2 }]}>
                <Ionicons name="grid-outline" size={24} color={activeTab === "about" ? colors.text : colors.textSecondary} />
              </TouchableOpacity>
              
              {profile?.role === "musician" && profile?.show_gig_statuses !== false && (
                <TouchableOpacity onPress={() => setActiveTab("gigs")} style={[styles.tabButton, activeTab === "gigs" && { borderBottomColor: colors.text, borderBottomWidth: 2 }]}>
                  <Ionicons name="mic-outline" size={24} color={activeTab === "gigs" ? colors.text : colors.textSecondary} />
                </TouchableOpacity>
              )}
              
              {isOwner && !isGuest && (
                <TouchableOpacity onPress={() => setActiveTab("bookmarks")} style={[styles.tabButton, activeTab === "bookmarks" && { borderBottomColor: colors.text, borderBottomWidth: 2 }]}>
                  <Ionicons name="bookmark-outline" size={24} color={activeTab === "bookmarks" ? colors.text : colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
`;

if (content.includes(bioSectionEndPattern)) {
  content = content.replace(bioSectionEndPattern, bioSectionEndPattern + tabNavSource);
} else {
  console.log("Could not find bioSectionEndPattern");
}

// 3. Wrap sections with activeTab conditional checks
content = content.replace(
  `{profile?.role === "musician" && profile?.show_gig_statuses !== false && (`,
  `{activeTab === "gigs" && profile?.role === "musician" && profile?.show_gig_statuses !== false && (`
);

content = content.replace(
  `{profile?.role === "musician" && profile?.show_gig_statuses === false && isOwner && (`,
  `{activeTab === "gigs" && profile?.role === "musician" && profile?.show_gig_statuses === false && isOwner && (`
);

const oldBookmarkStrStart = `{isOwner && !isGuest && (
              <View style={styles.bookmarkSection}>`;

const oldBookmarkStrEndPattern = `                  ))
                )}
              </View>
            )}`;

const startIdx = content.indexOf(oldBookmarkStrStart);
const endIdx = content.indexOf(oldBookmarkStrEndPattern);

if (startIdx !== -1 && endIdx !== -1) {
    const oldBookmarkSectionStr = content.slice(startIdx, endIdx + oldBookmarkStrEndPattern.length);
    
    const newBookmarkStart = `{activeTab === "bookmarks" && isOwner && !isGuest && (
              <View style={styles.bookmarkSection}>
                {loadingBookmarks ? (
                  <View style={[styles.bookmarkEmptyState, { borderColor: borderSoft, backgroundColor: surfaceBackground }]}>
                    <Text style={[styles.bookmarkEmptyText, { color: colors.textSecondary }]}>Loading saved bookmarks...</Text>
                  </View>
                ) : (
                  <>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8, gap: 12, flexGrow: 0 }} style={{ maxHeight: 60, marginBottom: 8 }}>
                       {['all', 'studios', 'gigs', 'musicians'].map((key) => {
                          const isActive = bookmarkFilter === key;
                          return (
                            <TouchableOpacity key={key} onPress={() => setBookmarkFilter(key as any)} style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: isActive ? colors.primary : surfaceBackground, justifyContent: "center" }}>
                               <Text style={{ color: isActive ? "#fff" : colors.textSecondary, fontFamily: "Poppins_500Medium" }}>{key.charAt(0).toUpperCase() + key.slice(1)}</Text>
                            </TouchableOpacity>
                          )
                       })}
                    </ScrollView>

                    <View style={{ paddingHorizontal: 16, gap: 12, paddingBottom: 24 }}>
                      {(() => {
                         const filterToKey: any = { 'studios': 'studios', 'gigs': 'gigs', 'musicians': 'musicians' };
                         let displayedItems: any[] = [];
                         if (bookmarkFilter === "all") {
                            displayedItems = [...bookmarkedListings.studios, ...bookmarkedListings.gigs, ...bookmarkedListings.musicians];
                         } else {
                            displayedItems = bookmarkedListings[filterToKey[bookmarkFilter]];
                         }

                         if (displayedItems.length === 0) {
                            return (
                               <View style={[styles.bookmarkEmptyState, { borderColor: borderSoft, backgroundColor: surfaceBackground }]}>
                                 <Text style={[styles.bookmarkEmptyText, { color: colors.textSecondary }]}>No bookmarks found.</Text>
                               </View>
                            )
                         }

                         return displayedItems.map((item, index) => {
                             let icon = item.type === "Studio" ? "business-outline" : item.type === "Gig" ? "mic-outline" : "people-outline";

                             return (
                                <TouchableOpacity
                                  key={\`\${item.type}-\${item.id}-\${index}\`}
                                  activeOpacity={1}
                                  onPress={() => openBookmarkedListing(item.id)}
                                  style={[
                                    styles.bookmarkCard,
                                    { backgroundColor: pageCardBackground, borderColor: borderSoft, width: "100%", flexDirection: "row", padding: 12, gap: 12 },
                                  ]}
                                >
                                  {item.image ? (
                                    <Image source={{ uri: item.image }} style={[styles.bookmarkCardImage, { width: 64, height: 64 }]} />
                                  ) : (
                                    <View style={[styles.bookmarkCardImageFallback, { backgroundColor: surfaceBackground, width: 64, height: 64 }]}>
                                      <Ionicons name={icon as any} size={24} color={colors.textSecondary} />
                                    </View>
                                  )}

                                  <View style={{ flex: 1, justifyContent: "center" }}>
                                      <Text numberOfLines={1} style={[styles.bookmarkCardTitle, { color: colors.text, fontSize: 16 }]}>
                                        {item.name}
                                      </Text>
                                      <Text numberOfLines={1} style={[styles.bookmarkCardSubtitle, { color: colors.textSecondary }]}>
                                        {item.subtitle}
                                      </Text>
                                      <Text style={[styles.bookmarkCardTitle, { color: colors.primary, fontSize: 12, marginTop: 4, fontFamily: "Poppins_600SemiBold" }]}>
                                        {item.type}
                                      </Text>
                                  </View>
                                  <View style={{ justifyContent: "center" }}>
                                       <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
                                  </View>
                                </TouchableOpacity>
                             )
                         })
                      })()}
                    </View>
                  </>
                )}
              </View>
            )}`;
            
    content = content.replace(oldBookmarkSectionStr, newBookmarkStart);
} else {
    console.log("Could not find old bookmark section");
}


// Media Section Wrap
const mediaSectionWrapStart = `{activeTab === "about" && (
          <View style={styles.mediaSection}>`;

const mediaSectionEndReplace = `              </View>
            )}
          </View>
          )}

          {/* Media Viewer Modal */}`;

content = content.replace(`{/* Media Section - Instagram Style Grid */}
          <View style={styles.mediaSection}>`, `{/* TAB CONTENT: ABOUT */}
          ${mediaSectionWrapStart}`);

content = content.replace(`              </View>
            )}
          </View>

          {/* Media Viewer Modal */}`, mediaSectionEndReplace);

// Inject Tab Styles if missing
const styleStartStr = `const styles = StyleSheet.create({`;
const tabStylesSource = `
  tabContainer: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 8,
    borderBottomWidth: 1,
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
`;

if (!content.includes('tabContainer: {')) {
  content = content.replace(styleStartStr, styleStartStr + tabStylesSource);
}

fs.writeFileSync("web/app/profile.tsx", content);
console.log("Patched successfully!");