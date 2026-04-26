import { Dimensions, StyleSheet } from "react-native";

export const { width, height } = Dimensions.get("window");
export const IMG_HEIGHT = height < 700 ? height * 0.3 : height * 0.35;

const scaleWidth = Math.min(width, 600);
export const scale = (size: number) => {
  const newSize = (scaleWidth / 375) * size;
  return Math.max(newSize, size * 0.85);
};

export const verticalScale = (size: number) => {
  const baseHeight = 812;
  const ratio = height / baseHeight;
  const clampedRatio = Math.max(0.8, Math.min(1.1, ratio));
  return size * clampedRatio;
};

export const moderateScale = (size: number, factor = 0.3) => {
  const scaled = scale(size);
  return size + (scaled - size) * factor;
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    height: 300,
  },
  scrollContent: {
    paddingBottom: 100,
    minHeight: "100%",
  },
  imageContainer: {
    height: IMG_HEIGHT,
    width: "100%",
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  gradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  headerActions: {
    position: "absolute",
    top: moderateScale(16),
    left: scale(20),
    right: scale(20),
    flexDirection: "row",
    justifyContent: "space-between",
    zIndex: 10,
  },
  rightActions: {
    flexDirection: "row",
    gap: scale(12),
  },
  roundBtn: {
    width: moderateScale(40),
    height: moderateScale(40),
    borderRadius: moderateScale(20),
    backgroundColor: "#FFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  heroIdentity: {
    position: "absolute",
    bottom: moderateScale(24),
    left: scale(24),
    right: scale(24),
  },
  heroTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: height < 700 ? moderateScale(24) : moderateScale(28),
    color: "#FFF",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  heroLocation: {
    color: "#FFF",
    fontFamily: "Poppins_400Regular",
    fontSize: moderateScale(14),
    marginLeft: scale(4),
  },
  statusRow: {
    flexDirection: "row",
    gap: scale(8),
    marginBottom: moderateScale(8),
  },
  tabsContainer: {
    flexDirection: "row",
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: moderateScale(16),
  },
  tabText: {
    fontFamily: "Poppins_500Medium",
    fontSize: moderateScale(14),
  },
  contentBody: {
    flex: 1,
    minHeight: verticalScale(500),
  },
  tabContent: {
    padding: height < 700 ? scale(16) : scale(24),
  },
  section: {
    marginBottom: height < 700 ? moderateScale(16) : moderateScale(24),
  },
  sectionTitle: {
    fontSize: height < 700 ? moderateScale(16) : moderateScale(18),
    fontFamily: "Poppins_600SemiBold",
    marginBottom: moderateScale(12),
  },
  description: {
    fontSize: moderateScale(14),
    lineHeight: moderateScale(22),
  },
  statCard: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
  },
  statLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    fontFamily: "Poppins_600SemiBold",
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontFamily: "Poppins_600SemiBold",
  },
  offerCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 8,
  },
  galleryContainer: {
    gap: 12,
  },
  galleryImage: {
    width: 160,
    height: 112,
    borderRadius: 12,
    marginRight: 12,
  },
  pickerSection: {
    marginBottom: 24,
  },
  dateTimeCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  dateIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  dateTimeLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    fontFamily: "Poppins_600SemiBold",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  dateTimeValue: {
    fontSize: 15,
    fontFamily: "Poppins_600SemiBold",
  },
  timeCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  timeIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  timeLabel: {
    fontSize: 10,
    textTransform: "uppercase",
    fontFamily: "Poppins_600SemiBold",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  timeValue: {
    fontSize: 16,
    fontFamily: "Poppins_700Bold",
  },
  durationBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  pickerContainer: {
    borderRadius: 12,
    overflow: "hidden",
  },
  nativePickerBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  pickerLabel: {
    fontSize: 10,
    textTransform: "uppercase",
    fontFamily: "Poppins_600SemiBold",
  },
  pickerValue: {
    fontSize: 15,
    fontFamily: "Poppins_500Medium",
  },
  durationWrapper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  durationBtn: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
    backgroundColor: "rgba(128,128,128,0.1)",
  },
  durationVal: {
    fontSize: 20,
    fontFamily: "Poppins_600SemiBold",
  },
  reviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginBottom: 24,
  },
  ratingBig: {
    fontSize: 56,
    fontFamily: "Poppins_600SemiBold",
    lineHeight: 64,
    letterSpacing: -1,
  },
  reviewsScroll: {
    gap: 16,
    paddingRight: 24,
  },
  reviewCard: {
    width: "100%",
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
  },
  reviewUser: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  reviewAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  reviewName: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
  },
  reviewDate: {
    fontSize: 12,
    opacity: 0.7,
  },
  reviewBody: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    lineHeight: 22,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    marginBottom: 24,
  },
  tagsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  inputContainer: {
    marginBottom: moderateScale(16),
  },
  label: {
    fontFamily: "Poppins_500Medium",
    marginBottom: moderateScale(8),
  },
  inputWrapper: {
    borderRadius: moderateScale(12),
    paddingHorizontal: scale(16),
    paddingVertical: moderateScale(12),
    justifyContent: "center",
  },
  input: {
    fontFamily: "Poppins_400Regular",
    fontSize: moderateScale(14),
    padding: 0,
  },
  dateBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  paymentSummary: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 24,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  divider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    width: "100%",
  },
  primaryBtn: {
    paddingVertical: moderateScale(16),
    borderRadius: moderateScale(16),
    alignItems: "center",
  },
  primaryBtnText: {
    color: "#FFF",
    fontFamily: "Poppins_600SemiBold",
    fontSize: moderateScale(16),
  },
  secondaryBtn: {
    paddingVertical: moderateScale(14),
    borderRadius: moderateScale(12),
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    borderWidth: 1,
  },
  secondaryBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: moderateScale(14),
  },
  groupSelectChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  bookingCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  timeSlotChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    lineHeight: 20,
  },
  infoCard: {
    flex: 1,
    padding: 16,
    borderRadius: 16,
  },
  infoLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    fontFamily: "Poppins_600SemiBold",
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 18,
    fontFamily: "Poppins_600SemiBold",
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  equipmentIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  equipmentCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  equipmentImage: {
    width: 48,
    height: 48,
    borderRadius: 8,
  },
  uploadBox: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 16,
    height: 120,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  bottomBar: {
    paddingHorizontal: scale(24),
    paddingTop: moderateScale(16),
    paddingBottom: moderateScale(32),
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  priceContainer: {
    justifyContent: "center",
  },
  priceText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: moderateScale(18),
  },
  bookBtn: {
    paddingHorizontal: scale(24),
    paddingVertical: moderateScale(12),
    borderRadius: moderateScale(12),
  },
  bookBtnText: {
    color: "#FFF",
    fontFamily: "Poppins_600SemiBold",
    fontSize: moderateScale(15),
  },
  rowCenter: {
    flexDirection: "row",
    alignItems: "center",
  },
  managerCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  managerLabel: {
    fontSize: 10,
    textTransform: "uppercase",
  },
  hostAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  managerName: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
  },
  visitBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
    borderWidth: 1,
  },
  stagePlotPlaceholder: {
    height: 200,
    width: "100%",
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  inputRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  roleHeader: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: "flex-start",
    marginBottom: 16,
  },
  roleTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    textTransform: "uppercase",
  },
  auditionBanner: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderStyle: "dashed",
  },
  integratedCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 16,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    justifyContent: "space-between",
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  rowContent: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    marginBottom: 2,
  },
  rowValue: {
    fontSize: 15,
    fontFamily: "Poppins_600SemiBold",
  },
  timeContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  timeButton: {
    alignItems: "center",
  },
  slotGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  slotButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 80,
    alignItems: "center",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  durationText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    marginLeft: 4,
  },
  bookingContainer: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    padding: 16,
    marginBottom: 24,
  },
  slotGridContainer: {
    borderTopWidth: 1,
    paddingTop: 16,
    marginTop: 8,
  },
  paymentModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  paymentLoadingContainer: {
    borderRadius: 20,
    padding: 40,
    alignItems: "center",
    width: "100%",
    maxWidth: 320,
  },
  paymentLoadingTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 18,
    marginTop: 20,
    textAlign: "center",
  },
  paymentLoadingSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
  },
  paymentOptionContainer: {
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 380,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  paymentOptionTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 22,
    marginBottom: 6,
    textAlign: "center",
  },
  paymentOptionSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    marginBottom: 24,
    textAlign: "center",
  },
  paymentOptionCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  paymentOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  paymentOptionRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  paymentOptionRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#FFFFFF",
  },
  paymentOptionInfo: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  paymentOptionLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    flex: 1,
  },
  paymentOptionAmount: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
  },
  paymentOptionDesc: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    lineHeight: 18,
    marginLeft: 34,
  },
  paymentOptionButtons: {
    marginTop: 20,
  },
  paymentOptionConfirmBtn: {
    width: "100%",
    paddingVertical: 16,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  paymentOptionConfirmText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: "#FFFFFF",
  },
});

export default styles;

