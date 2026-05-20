import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	ActivityIndicator,
	Modal,
	Platform,
	Pressable,
	ScrollView,
	StatusBar,
	StyleSheet,
	Text,
	TextInput,
	TouchableOpacity,
	useWindowDimensions,
	View,
} from "react-native";
import { supabase } from "../lib/supabase";
import CachedImage from "../src/components/CachedImage";
import ListingDetailsSheet from "../src/components/ListingDetailsSheet";
import { useAuth } from "../src/context/AuthContext";
import { useTheme } from "../src/context/ThemeContext";

type ListingType = "Studio" | "Gig" | "Group" | "Artist" | "Production";
type FilterChip = "All" | "Studios" | "Gigs" | "Groups" | "Artists" | "Production Teams";

type DiscoverListing = {
	id: string;
	type: ListingType;
	name: string;
	description?: string;
	image?: string;
	images?: string[];
	location?: string;
	genre?: string;
	rating?: number;
	review_count?: number;
	hourly_rate?: number | string;
	budget?: number | string;
	rate?: number | string;
	permit_status?: string;
	created_at?: string;
	owner_id?: string | null;
	logo_url?: string | null;
	open_production_applications?: boolean;
};

const FULL_FILTERS: FilterChip[] = ["All", "Studios", "Gigs", "Groups", "Artists", "Production Teams"];
const MUSICIAN_ONLY_FILTERS: FilterChip[] = ["All", "Groups", "Artists"];
const CHIP_TO_TYPE: Record<Exclude<FilterChip, "All">, ListingType> = {
	Studios: "Studio",
	Gigs: "Gig",
	Groups: "Group",
	Artists: "Artist",
	"Production Teams": "Production",
};

const toSearchable = (value: unknown) =>
	typeof value === "string" ? value.toLowerCase() : "";

export default function DiscoverScreen() {
	const { colors, isDark } = useTheme();
	const { userRole, isGuest } = useAuth();
	const { width } = useWindowDimensions();

	const [activeFilter, setActiveFilter] = useState<FilterChip>("All");
	const [searchQuery, setSearchQuery] = useState("");
	const [listings, setListings] = useState<DiscoverListing[]>([]);
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [showFilters, setShowFilters] = useState(false);
	const [priceRange, setPriceRange] = useState<"all" | "low" | "mid" | "high">("all");
	const [sortBy, setSortBy] = useState<"newest" | "rating" | "price_low" | "price_high">("newest");
	const [selectedListing, setSelectedListing] = useState<DiscoverListing | null>(null);
	const [sheetListingId, setSheetListingId] = useState<string | null>(null);
	const listingSheetRef = useRef<any>(null);

	const isOwner = userRole === "venue-owner" || userRole === "studio-owner";
	const showMusiciansOnly = isGuest || isOwner;
	const isWebDesktop = Platform.OS === "web" && width >= 768;
	const frameHorizontalPadding = isWebDesktop ? 20 : 16;
	const gridGap = 16;
	const cardsPerRow = isWebDesktop ? 3 : width >= 680 ? 2 : 1;
	const frameWidth = Platform.OS === "web" ? Math.min(width, 1240) : width;
	const cardWidth = Math.min(
		420,
		Math.max(
			260,
			Math.floor(
				(frameWidth - frameHorizontalPadding * 2 - gridGap * (cardsPerRow - 1)) /
					cardsPerRow,
			),
		),
	);

	const pageFrameStyle =
		Platform.OS === "web"
			? ({
					alignSelf: "center",
					width: "100%",
					maxWidth: 1240,
				} as const)
			: undefined;

	const filterChips = useMemo(
		() => (showMusiciansOnly ? MUSICIAN_ONLY_FILTERS : FULL_FILTERS),
		[showMusiciansOnly],
	);

	useEffect(() => {
		if (!filterChips.includes(activeFilter)) {
			setActiveFilter("All");
		}
	}, [activeFilter, filterChips]);

	const searchPlaceholder = useMemo(() => {
		if (showMusiciansOnly) return "Search artists and groups...";
		return "Search studios, gigs, and production teams...";
	}, [showMusiciansOnly]);

	const fetchListings = useCallback(async (isRefresh = false) => {
		if (isRefresh) {
			setRefreshing(true);
		} else {
			setLoading(true);
		}

		try {
			const [studiosRes, gigsRes, groupsRes, artistsRes] = await Promise.all([
				supabase
					.from("studios_with_stats")
					.select("*")
					.eq("permit_status", "approved")
					.order("created_at", { ascending: false })
					.limit(40),
				supabase
					.from("gigs_with_stats")
					.select("*")
					.eq("status", "open")
					.eq("permit_status", "approved")
					.order("created_at", { ascending: false })
					.limit(40),
				supabase
					.from("groups_with_stats")
					.select("*")
					.order("created_at", { ascending: false })
					.limit(40),
				supabase
					.from("profiles")
					.select("id, full_name, bio, avatar_url, address, created_at, role, show_gig_statuses")
					.eq("role", "musician")
					.order("created_at", { ascending: false })
					.limit(40),
			]);
			const teamsRes = showMusiciansOnly
				? { data: [], error: null }
				: await supabase
						.from("production_teams")
						.select("*")
						.order("created_at", { ascending: false })
						.limit(40);

			if (studiosRes.error) console.error("Discover studios fetch error:", studiosRes.error);
			if (gigsRes.error) console.error("Discover gigs fetch error:", gigsRes.error);
			if (groupsRes.error) console.error("Discover groups fetch error:", groupsRes.error);
			if (artistsRes.error) console.error("Discover artists fetch error:", artistsRes.error);
			if (teamsRes.error) console.error("Discover production teams fetch error:", teamsRes.error);

			const studioListings: DiscoverListing[] = showMusiciansOnly
				? []
				: (studiosRes.data || []).map((studio: any) => ({
						...studio,
						id: studio.id,
						type: "Studio",
						name: studio.name || "Studio",
						description: studio.description || "",
						images: Array.isArray(studio.images)
							? studio.images
							: studio.image
								? [studio.image]
								: [],
						image: Array.isArray(studio.images)
							? studio.images[0]
							: studio.image || undefined,
						location: studio.location || studio.address || "",
						rating: Number(studio.rating || studio.average_rating || 0),
						review_count: Number(studio.review_count || 0),
						hourly_rate: studio.hourly_rate,
						permit_status: studio.permit_status,
						created_at: studio.created_at,
					}));

			const gigListings: DiscoverListing[] = showMusiciansOnly
				? []
				: (gigsRes.data || []).map((gig: any) => ({
						...gig,
						id: gig.id,
						type: "Gig",
						name: gig.name || "Gig",
						description: gig.description || "",
						images: Array.isArray(gig.images)
							? gig.images
							: gig.image
								? [gig.image]
								: [],
						image: Array.isArray(gig.images)
							? gig.images[0]
							: gig.image || undefined,
						location: gig.location || "",
						rating: Number(gig.rating || 0),
						review_count: Number(gig.review_count || 0),
						budget: gig.budget,
						permit_status: gig.permit_status,
						created_at: gig.created_at,
					}));

			const groupListings: DiscoverListing[] = (groupsRes.data || []).map(
				(group: any) => ({
					...group,
					id: group.id,
					type: "Group",
					name: group.name || "Group",
					description: group.description || "",
					images: Array.isArray(group.images)
						? group.images
						: group.image
							? [group.image]
							: [],
					image: Array.isArray(group.images)
						? group.images[0]
						: group.image || undefined,
					location: group.location || "",
					genre: group.genre || "",
					rating: Number(group.rating || 0),
					review_count: Number(group.review_count || 0),
					created_at: group.created_at,
				}),
			);

			const artistListings: DiscoverListing[] = (artistsRes.data || []).map(
				(artist: any) => ({
					...artist,
					id: artist.id,
					type: "Artist",
					name: artist.full_name || "Artist",
					description: artist.bio || "",
					image: artist.avatar_url || undefined,
					images: artist.avatar_url ? [artist.avatar_url] : [],
					location: artist.address || "",
					rating: 0,
					review_count: 0,
					created_at: artist.created_at,
				}),
			);
			const productionListings: DiscoverListing[] = (teamsRes.data || []).map(
				(team: any) => ({
					...team,
					id: team.id,
					type: "Production",
					name: team.name || "Production Team",
					description: team.description || "",
					image: team.logo_url || undefined,
					images: team.logo_url ? [team.logo_url] : [],
					location: team.description || "Production Team",
					rating: 0,
					review_count: 0,
					created_at: team.created_at,
					owner_id: team.owner_id || null,
					logo_url: team.logo_url || null,
					open_production_applications: team.open_production_applications === true,
				}),
			);

			const merged = [
				...studioListings,
				...gigListings,
				...groupListings,
				...artistListings,
				...productionListings,
			].sort((a, b) => {
				const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
				const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
				return bTime - aTime;
			});

			setListings(merged);
		} catch (error) {
			console.error("Discover fetch failed:", error);
			setListings([]);
		} finally {
			setLoading(false);
			setRefreshing(false);
		}
	}, [showMusiciansOnly]);

	useEffect(() => {
		fetchListings();
	}, [fetchListings]);

	const filteredListings = useMemo(() => {
		let items = listings;

		if (activeFilter !== "All") {
			const matchType = CHIP_TO_TYPE[activeFilter];
			items = items.filter((item) => item.type === matchType);
		}

		const priceOf = (item: DiscoverListing) =>
			Number(item.hourly_rate || item.budget || item.rate || 0);

		if (priceRange !== "all") {
			items = items.filter((item) => {
				if (item.type === "Group" || item.type === "Artist" || item.type === "Production") return true;
				const p = priceOf(item);
				if (priceRange === "low") return p > 0 && p < 1000;
				if (priceRange === "mid") return p >= 1000 && p <= 3000;
				if (priceRange === "high") return p > 3000;
				return true;
			});
		}

		const q = searchQuery.trim().toLowerCase();
		if (q) {
			items = items.filter((item) => {
				return (
					toSearchable(item.name).includes(q) ||
					toSearchable(item.location).includes(q) ||
					toSearchable(item.genre).includes(q) ||
					toSearchable(item.description).includes(q)
				);
			});
		}

		const sorted = [...items];
		if (sortBy === "rating") {
			sorted.sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0));
		} else if (sortBy === "price_low") {
			sorted.sort((a, b) => priceOf(a) - priceOf(b));
		} else if (sortBy === "price_high") {
			sorted.sort((a, b) => priceOf(b) - priceOf(a));
		} else {
			sorted.sort(
				(a, b) =>
					new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
			);
		}
		return sorted;
	}, [activeFilter, listings, searchQuery, priceRange, sortBy]);

	const getCardIcon = (type: ListingType) => {
		switch (type) {
			case "Studio":
				return "business";
			case "Gig":
				return "musical-notes";
			case "Group":
				return "people";
			case "Production":
				return "briefcase";
			default:
				return "person";
		}
	};

	const getPriceLabel = (item: DiscoverListing) => {
		const hourly = Number(item.hourly_rate || 0);
		const budget = Number(item.budget || 0);
		const rate = Number(item.rate || 0);

		if (item.type === "Group" || item.type === "Artist" || item.type === "Production") {
			return "";
		}

		if (hourly > 0) {
			return `₱${hourly.toLocaleString()} / hr`;
		}

		if (budget > 0) {
			return `₱${budget.toLocaleString()}${item.type === "Gig" ? " Talent Fee" : ""}`;
		}

		if (rate > 0) {
			return `₱${rate.toLocaleString()}`;
		}

		return "";
	};

	const openListing = useCallback((item: DiscoverListing) => {
		if (item.type === "Artist") {
			setSelectedListing(item);
			return;
		}
		if (item.type === "Production") {
			router.push({ pathname: "/production_team", params: { teamId: String(item.id) } });
			return;
		}
		setSheetListingId(String(item.id));
		setTimeout(() => {
			listingSheetRef.current?.present?.();
		}, 0);
	}, []);

	const dismissSheet = useCallback(() => {
		setSheetListingId(null);
	}, []);

	return (
		<View style={[styles.container, { backgroundColor: colors.background }]}>
			<StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

			<ScrollView
				style={pageFrameStyle}
				showsVerticalScrollIndicator={false}
				contentContainerStyle={{ paddingBottom: isWebDesktop ? 56 : 120 }}
			>
				<View
					style={[
						styles.heroContainer,
						isWebDesktop && styles.heroContainerWeb,
						{ marginHorizontal: frameHorizontalPadding },
					]}
				>
					<LinearGradient
						colors={
							isDark
								? ["#0B1224", "#17233E", "#1D4ED8"]
								: ["#0F172A", "#1E293B", "#2563EB"]
						}
						style={styles.heroGradient}
					>
						<View style={styles.heroHeaderRow}>
							<View style={{ flex: 1 }}>
								<Text style={styles.heroTitle}>Discover</Text>
								<Text style={styles.heroSubtitle}>
									Browse cards directly on this page.
								</Text>
							</View>

							<TouchableOpacity
								activeOpacity={1}
								onPress={() => router.replace("/ai_suggestions")}
								style={styles.aiShortcut}
							>
								<Ionicons name="sparkles" size={16} color="#FFFFFF" />
								<Text style={styles.aiShortcutText}>AI</Text>
							</TouchableOpacity>
						</View>
					</LinearGradient>
				</View>

				<View style={{ paddingHorizontal: frameHorizontalPadding, marginTop: 18 }}>
					<View
						style={[
							styles.searchRow,
							{
								backgroundColor: isDark ? "#111827" : "#FFFFFF",
								borderColor: colors.border,
							},
						]}
					>
						<Ionicons
							name="search"
							size={18}
							color={colors.textSecondary}
							style={{ marginRight: 8 }}
						/>
						<TextInput
							value={searchQuery}
							onChangeText={setSearchQuery}
							placeholder={searchPlaceholder}
							placeholderTextColor={colors.textSecondary}
							style={[styles.searchInput, { color: colors.text }]}
							returnKeyType="search"
							autoCorrect={false}
						/>

						{searchQuery.length > 0 && (
							<TouchableOpacity
								activeOpacity={1}
								onPress={() => setSearchQuery("")}
								style={{ marginLeft: 4 }}
							>
								<Ionicons name="close-circle" size={18} color={colors.textSecondary} />
							</TouchableOpacity>
						)}

						<TouchableOpacity
							activeOpacity={1}
							onPress={() => fetchListings(true)}
							style={[
								styles.refreshButton,
								{
									backgroundColor: isDark ? "#1F2937" : "#EEF2FF",
									borderColor: isDark ? "#374151" : "#DBEAFE",
								},
							]}
						>
							{refreshing ? (
								<ActivityIndicator size="small" color={colors.primary} />
							) : (
								<Ionicons name="refresh" size={16} color={colors.primary} />
							)}
						</TouchableOpacity>

						<TouchableOpacity
							activeOpacity={1}
							onPress={() => setShowFilters((v) => !v)}
							style={[
								styles.refreshButton,
								{
									backgroundColor: showFilters
										? colors.primary
										: isDark
											? "#374151"
											: "#F3F4F6",
									borderColor: showFilters
										? colors.primary
										: isDark
											? "#4B5563"
											: "#E5E7EB",
								},
							]}
							accessibilityRole="button"
							accessibilityLabel="Filters"
						>
							<Ionicons
								name="options-outline"
								size={18}
								color={showFilters ? "#FFFFFF" : colors.textSecondary}
							/>
						</TouchableOpacity>
					</View>
				</View>

				{showFilters && (
					<View
						style={{
							marginTop: 12,
							marginHorizontal: frameHorizontalPadding,
							padding: 14,
							borderRadius: 14,
							borderWidth: 1,
							backgroundColor: isDark ? "#111827" : "#FFFFFF",
							borderColor: colors.border,
							gap: 12,
						}}
					>
						<View>
							<Text style={[styles.filterPanelLabel, { color: colors.textSecondary }]}>
								Sort by
							</Text>
							<View style={styles.filterPanelRow}>
								{(
									[
										["newest", "Newest"],
										["rating", "Top rated"],
										["price_low", "Price: Low"],
										["price_high", "Price: High"],
									] as const
								).map(([val, label]) => {
									const active = sortBy === val;
									return (
										<TouchableOpacity
											key={val}
											activeOpacity={1}
											onPress={() => setSortBy(val)}
											style={[
												styles.chip,
												{
													backgroundColor: active
														? colors.primary
														: isDark
															? "#1F2937"
															: "#EEF2FF",
													borderColor: active
														? colors.primary
														: isDark
															? "#374151"
															: "#DBEAFE",
												},
											]}
										>
											<Text
												style={[
													styles.chipText,
													{ color: active ? "#FFFFFF" : colors.text },
												]}
											>
												{label}
											</Text>
										</TouchableOpacity>
									);
								})}
							</View>
						</View>

						<View>
							<Text style={[styles.filterPanelLabel, { color: colors.textSecondary }]}>
								Price range
							</Text>
							<View style={styles.filterPanelRow}>
								{(
									[
										["all", "Any"],
										["low", "Under ₱1k"],
										["mid", "₱1k–3k"],
										["high", "Over ₱3k"],
									] as const
								).map(([val, label]) => {
									const active = priceRange === val;
									return (
										<TouchableOpacity
											key={val}
											activeOpacity={1}
											onPress={() => setPriceRange(val)}
											style={[
												styles.chip,
												{
													backgroundColor: active
														? colors.primary
														: isDark
															? "#1F2937"
															: "#EEF2FF",
													borderColor: active
														? colors.primary
														: isDark
															? "#374151"
															: "#DBEAFE",
												},
											]}
										>
											<Text
												style={[
													styles.chipText,
													{ color: active ? "#FFFFFF" : colors.text },
												]}
											>
												{label}
											</Text>
										</TouchableOpacity>
									);
								})}
							</View>
						</View>

						<TouchableOpacity
							activeOpacity={1}
							onPress={() => {
								setPriceRange("all");
								setSortBy("newest");
								setActiveFilter("All");
							}}
							style={{ alignSelf: "flex-end" }}
						>
							<Text style={{ color: colors.primary, fontFamily: "Poppins_600SemiBold", fontSize: 13 }}>
								Reset filters
							</Text>
						</TouchableOpacity>
					</View>
				)}

				<View style={{ paddingHorizontal: frameHorizontalPadding, marginTop: 14 }}>
					<ScrollView
						horizontal
						showsHorizontalScrollIndicator={false}
						contentContainerStyle={styles.chipsRow}
					>
						{filterChips.map((chip) => {
							const active = activeFilter === chip;
							return (
								<TouchableOpacity
									key={chip}
									activeOpacity={1}
									onPress={() => setActiveFilter(chip)}
									style={[
										styles.chip,
										{
											backgroundColor: active
												? colors.primary
												: isDark
													? "#1F2937"
													: "#EEF2FF",
											borderColor: active
												? colors.primary
												: isDark
													? "#374151"
													: "#DBEAFE",
										},
									]}
								>
									<Text
										style={[
											styles.chipText,
											{ color: active ? "#FFFFFF" : colors.text },
										]}
									>
										{chip}
									</Text>
								</TouchableOpacity>
							);
						})}
					</ScrollView>
				</View>

				<View
					style={{
						paddingHorizontal: frameHorizontalPadding,
						marginTop: 12,
						flexDirection: "row",
						alignItems: "center",
						justifyContent: "space-between",
					}}
				>
					<Text style={[styles.resultsTitle, { color: colors.text }]}>Results</Text>
					<Text style={[styles.resultsCount, { color: colors.textSecondary }]}>
						{filteredListings.length} cards
					</Text>
				</View>

				{loading ? (
					<View style={{ paddingTop: 40, alignItems: "center" }}>
						<ActivityIndicator size="large" color={colors.primary} />
					</View>
				) : filteredListings.length === 0 ? (
					<View
						style={{
							paddingHorizontal: frameHorizontalPadding,
							paddingTop: 40,
							alignItems: "center",
						}}
					>
						<Ionicons name="search" size={34} color={colors.textSecondary} />
						<Text style={[styles.emptyTitle, { color: colors.text }]}>No cards found</Text>
						<Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
							Try changing your search or filter.
						</Text>
					</View>
				) : (
					<View
						style={{
							paddingHorizontal: frameHorizontalPadding,
							marginTop: 14,
							flexDirection: "row",
							flexWrap: "wrap",
						}}
					>
						{filteredListings.map((item, index) => {
							const isEndOfRow = cardsPerRow === 1 || (index + 1) % cardsPerRow === 0;
							const badgeColor =
								item.type === "Studio"
									? "#7C3AED"
									: item.type === "Gig"
										? "#10B981"
										: item.type === "Group"
											? "#3B82F6"
											: item.type === "Production"
												? "#F97316"
												: "#EC4899";

							return (
								<View
									key={`${item.type}-${item.id}`}
									style={{
										width: cardWidth,
										marginRight: isEndOfRow ? 0 : gridGap,
										marginBottom: gridGap,
									}}
								>
									<TouchableOpacity
										activeOpacity={0.85}
										onPress={() => openListing(item)}
										style={[
											styles.listCard,
											{ backgroundColor: isDark ? "#1F2937" : "#FFFFFF" },
										]}
									>
										<View style={styles.listCardMedia}>
											{item.image ? (
												<CachedImage
													uri={item.image}
													style={styles.listCardImage}
													width={640}
													height={360}
													quality={72}
													cacheVersion={item.created_at || item.id}
												/>
											) : (
												<View
													style={[
														styles.listCardImage,
														{
															backgroundColor: isDark ? "#374151" : "#E5E7EB",
															alignItems: "center",
															justifyContent: "center",
														},
													]}
												>
													<Ionicons
														name={getCardIcon(item.type) as any}
														size={28}
														color={colors.textSecondary}
													/>
												</View>
											)}

											<View style={[styles.typePill, { backgroundColor: badgeColor }]}>
												<Text style={styles.typePillText}>{item.type}</Text>
											</View>

											{item.type === "Production" && item.open_production_applications === true ? (
												<View style={[styles.openApplicationsPill, { backgroundColor: colors.primary }]}>
													<Text style={styles.typePillText}>Open Applications</Text>
												</View>
											) : null}
										</View>

										<View style={styles.listCardBody}>
											<Text
												style={[styles.listCardTitle, { color: colors.text }]}
												numberOfLines={1}
											>
												{item.name}
											</Text>

											<View style={styles.cardMetaRow}>
												<Ionicons
													name="location-outline"
													size={13}
													color={colors.textSecondary}
												/>
												<Text
													style={[styles.cardMetaText, { color: colors.textSecondary }]}
													numberOfLines={1}
												>
													{item.location || item.genre || "Location not set"}
												</Text>
											</View>

											<View style={styles.cardMetaRow}>
												<Ionicons name="star" size={13} color="#FBBF24" />
												<Text style={[styles.cardMetaText, { color: colors.textSecondary }]}>
													{item.rating && item.rating > 0
														? `${item.rating.toFixed(1)} (${item.review_count || 0})`
														: "No ratings yet"}
												</Text>
											</View>

											{getPriceLabel(item) ? (
												<Text style={[styles.cardPrice, { color: colors.primary }]}>
													{getPriceLabel(item)}
												</Text>
											) : null}
										</View>
									</TouchableOpacity>
								</View>
							);
						})}
					</View>
				)}
			</ScrollView>

			<Modal
				visible={!!selectedListing}
				transparent
				animationType="fade"
				onRequestClose={() => setSelectedListing(null)}
			>
				<Pressable
					style={styles.modalOverlay}
					onPress={() => setSelectedListing(null)}
				>
					<Pressable
						onPress={(e) => e.stopPropagation?.()}
						style={[
							styles.modalCard,
							{ backgroundColor: isDark ? "#111827" : "#FFFFFF", borderColor: colors.border },
						]}
					>
						{selectedListing && (
							<>
								<View style={styles.modalMedia}>
									{selectedListing.image ? (
										<CachedImage
											uri={selectedListing.image}
											style={styles.modalImage}
											width={1200}
											height={600}
											quality={78}
											cacheVersion={selectedListing.created_at || selectedListing.id}
										/>
									) : (
										<View
											style={[
												styles.modalImage,
												{
													backgroundColor: isDark ? "#374151" : "#E5E7EB",
													alignItems: "center",
													justifyContent: "center",
												},
											]}
										>
											<Ionicons
												name={getCardIcon(selectedListing.type) as any}
												size={48}
												color={colors.textSecondary}
											/>
										</View>
									)}

									<View
										style={[
											styles.typePill,
											{
												backgroundColor:
													selectedListing.type === "Studio"
														? "#7C3AED"
														: selectedListing.type === "Gig"
															? "#10B981"
															: selectedListing.type === "Group"
																? "#3B82F6"
																: selectedListing.type === "Production"
																	? "#F97316"
																	: "#EC4899",
											},
										]}
									>
										<Text style={styles.typePillText}>{selectedListing.type}</Text>
									</View>

									<TouchableOpacity
										activeOpacity={1}
										onPress={() => setSelectedListing(null)}
										style={styles.modalClose}
									>
										<Ionicons name="close" size={20} color="#FFFFFF" />
									</TouchableOpacity>
								</View>

								<ScrollView
									style={{ maxHeight: 360 }}
									contentContainerStyle={{ padding: 18 }}
									showsVerticalScrollIndicator={false}
								>
									<Text style={[styles.modalTitle, { color: colors.text }]}>
										{selectedListing.name}
									</Text>

									<View style={[styles.cardMetaRow, { marginTop: 6 }]}>
										<Ionicons
											name="location-outline"
											size={14}
											color={colors.textSecondary}
										/>
										<Text style={[styles.cardMetaText, { color: colors.textSecondary }]}>
											{selectedListing.location ||
												selectedListing.genre ||
												"Location not set"}
										</Text>
									</View>

									<View style={styles.cardMetaRow}>
										<Ionicons name="star" size={14} color="#FBBF24" />
										<Text style={[styles.cardMetaText, { color: colors.textSecondary }]}>
											{selectedListing.rating && selectedListing.rating > 0
												? `${selectedListing.rating.toFixed(1)} (${
														selectedListing.review_count || 0
													} reviews)`
												: "No ratings yet"}
										</Text>
									</View>

									{getPriceLabel(selectedListing) ? (
										<Text
											style={[
												styles.cardPrice,
												{ color: colors.primary, fontSize: 16, marginTop: 10 },
											]}
										>
											{getPriceLabel(selectedListing)}
										</Text>
									) : null}

									{selectedListing.description ? (
										<Text
											style={[
												styles.modalDescription,
												{ color: colors.textSecondary },
											]}
										>
											{selectedListing.description}
										</Text>
									) : null}
								</ScrollView>

								<View
									style={[
										styles.modalActions,
										{ borderTopColor: colors.border },
									]}
								>
									<TouchableOpacity
										activeOpacity={1}
										onPress={() => setSelectedListing(null)}
										style={[
											styles.modalSecondaryBtn,
											{
												borderColor: colors.border,
												backgroundColor: isDark ? "#1F2937" : "#F3F4F6",
											},
										]}
									>
										<Text style={[styles.modalBtnText, { color: colors.text }]}>
											Close
										</Text>
									</TouchableOpacity>

									<TouchableOpacity
										activeOpacity={1}
										onPress={() => {
											const id = String(selectedListing.id);
											setSelectedListing(null);
											router.push({ pathname: "/profile", params: { userId: id } });
										}}
										style={[
											styles.modalPrimaryBtn,
											{ backgroundColor: colors.primary },
										]}
									>
										<Text style={[styles.modalBtnText, { color: "#FFFFFF" }]}>
											View profile
										</Text>
									</TouchableOpacity>
								</View>
							</>
						)}
					</Pressable>
				</Pressable>
			</Modal>

			<ListingDetailsSheet
				ref={listingSheetRef}
				listingId={sheetListingId}
				onDismiss={dismissSheet}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	heroContainer: {
		marginTop: 12,
		borderRadius: 20,
		overflow: "hidden",
	},
	heroContainerWeb: {
		marginTop: 14,
	},
	heroGradient: {
		paddingHorizontal: 20,
		paddingTop: 20,
		paddingBottom: 20,
		borderWidth: 1,
		borderColor: "rgba(255,255,255,0.08)",
	},
	heroHeaderRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
	},
	heroTitle: {
		color: "#F8FAFC",
		fontFamily: "Poppins_700Bold",
		fontSize: 32,
		letterSpacing: -0.5,
	},
	heroSubtitle: {
		color: "#CBD5E1",
		fontFamily: "Poppins_400Regular",
		fontSize: 15,
		marginTop: 2,
	},
	aiShortcut: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(255,255,255,0.18)",
		borderWidth: 1,
		borderColor: "rgba(255,255,255,0.28)",
		borderRadius: 12,
		paddingHorizontal: 10,
		paddingVertical: 8,
		gap: 5,
	},
	aiShortcutText: {
		color: "#FFFFFF",
		fontFamily: "Poppins_600SemiBold",
		fontSize: 12,
	},
	searchRow: {
		height: 56,
		borderRadius: 16,
		borderWidth: 1,
		paddingLeft: 12,
		paddingRight: 8,
		flexDirection: "row",
		alignItems: "center",
	},
	searchInput: {
		flex: 1,
		fontFamily: "Poppins_500Medium",
		fontSize: 14,
		...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null),
	},
	refreshButton: {
		width: 34,
		height: 34,
		borderRadius: 10,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
		marginLeft: 6,
	},
	chipsRow: {
		paddingRight: 8,
	},
	filterPanelLabel: {
		fontFamily: "Poppins_500Medium",
		fontSize: 12,
		marginBottom: 6,
		textTransform: "uppercase",
		letterSpacing: 0.5,
	},
	filterPanelRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 8,
	},
	chip: {
		paddingHorizontal: 14,
		paddingVertical: 9,
		borderRadius: 999,
		borderWidth: 1,
		marginRight: 10,
	},
	chipText: {
		fontFamily: "Poppins_500Medium",
		fontSize: 13,
	},
	resultsTitle: {
		fontFamily: "Poppins_600SemiBold",
		fontSize: 20,
	},
	resultsCount: {
		fontFamily: "Poppins_500Medium",
		fontSize: 12,
	},
	emptyTitle: {
		fontFamily: "Poppins_600SemiBold",
		fontSize: 17,
		marginTop: 8,
	},
	emptySubtitle: {
		fontFamily: "Poppins_400Regular",
		fontSize: 13,
		marginTop: 2,
	},
	listCard: {
		borderRadius: 18,
		overflow: "hidden",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 6 },
		shadowOpacity: 0.14,
		shadowRadius: 14,
		elevation: 6,
	},
	listCardMedia: {
		height: 168,
		position: "relative",
	},
	listCardImage: {
		width: "100%",
		height: "100%",
	},
	typePill: {
		position: "absolute",
		top: 10,
		left: 10,
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderRadius: 999,
	},
	openApplicationsPill: {
		position: "absolute",
		right: 10,
		bottom: 10,
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderRadius: 999,
	},
	typePillText: {
		color: "#FFFFFF",
		fontFamily: "Poppins_600SemiBold",
		fontSize: 10,
	},
	listCardBody: {
		paddingHorizontal: 12,
		paddingTop: 10,
		paddingBottom: 12,
	},
	listCardTitle: {
		fontFamily: "Poppins_600SemiBold",
		fontSize: 15,
		marginBottom: 4,
	},
	cardMetaRow: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 4,
		gap: 5,
	},
	cardMetaText: {
		flex: 1,
		fontFamily: "Poppins_400Regular",
		fontSize: 12,
	},
	cardPrice: {
		fontFamily: "Poppins_600SemiBold",
		fontSize: 12,
		marginTop: 2,
	},
	modalOverlay: {
		flex: 1,
		backgroundColor: "rgba(0,0,0,0.55)",
		alignItems: "center",
		justifyContent: "center",
		padding: 20,
	},
	modalCard: {
		width: "100%",
		maxWidth: 560,
		borderRadius: 18,
		borderWidth: 1,
		overflow: "hidden",
	},
	modalMedia: {
		height: 220,
		position: "relative",
	},
	modalImage: {
		width: "100%",
		height: "100%",
	},
	modalClose: {
		position: "absolute",
		top: 12,
		right: 12,
		width: 32,
		height: 32,
		borderRadius: 16,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(0,0,0,0.55)",
	},
	modalTitle: {
		fontFamily: "Poppins_700Bold",
		fontSize: 20,
	},
	modalDescription: {
		marginTop: 12,
		fontFamily: "Poppins_400Regular",
		fontSize: 13,
		lineHeight: 19,
	},
	modalActions: {
		flexDirection: "row",
		gap: 10,
		padding: 14,
		borderTopWidth: 1,
	},
	modalSecondaryBtn: {
		flex: 1,
		paddingVertical: 12,
		borderRadius: 12,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	modalPrimaryBtn: {
		flex: 1,
		paddingVertical: 12,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	modalBtnText: {
		fontFamily: "Poppins_600SemiBold",
		fontSize: 14,
	},
});
