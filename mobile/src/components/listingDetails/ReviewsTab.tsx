import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, View } from "react-native";
import CachedImage from "../CachedImage";
import { formatDashedNumericDate } from "../../utils/friendlyDateTime";


interface ReviewsTabProps {
  group: any;
  colors: any;
  styles: any;
  reviews: any[];
  relatedListings?: any[];
}

const ReviewsTab = ({
  group,
  colors,
  styles,
  reviews,
}: ReviewsTabProps) => (
  <View style={[styles.tabContent, { paddingHorizontal: 0 }]}>
    <View style={[styles.reviewHeader, { paddingHorizontal: 24 }]}>
      <Text style={[styles.ratingBig, { color: colors.text }]}>
        {group.rating ? group.rating.toFixed(1) : "0.0"}
      </Text>
      <View>
        <View style={{ flexDirection: "row" }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Ionicons
              key={i}
              name={i <= Math.round(group.rating || 0) ? "star" : "star-outline"}
              size={14}
              color={colors.primary}
            />
          ))}
        </View>
        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
          {group.review_count || 0} reviews
        </Text>
      </View>
    </View>

    <View style={[styles.reviewsScroll, { paddingHorizontal: 24 }]}>
      {reviews.length > 0 ? (
        reviews.map((review) => (
          <View
            key={review.id}
            style={[styles.reviewCard, { borderColor: colors.border, width: "100%" }]}
          >
            <View style={styles.reviewUser}>
              <CachedImage
                uri={review.author?.avatar_url || "https://via.placeholder.com/100"}
                style={styles.reviewAvatar}
                width={100}
                height={100}
                quality={68}
                cacheVersion={review.author?.updated_at || review.updated_at || review.created_at || review.id}
              />
              <View>
                <Text style={[styles.reviewName, { color: colors.text }]}>
                  {review.author?.full_name || "Anonymous"}
                </Text>
                <Text style={[styles.reviewDate, { color: colors.textSecondary }]}> 
                  {formatDashedNumericDate(review.created_at)}
                </Text>
              </View>
            </View>
            <Text style={[styles.reviewBody, { color: colors.text }]}>{review.content}</Text>
          </View>
        ))
      ) : (
        <Text style={{ color: colors.textSecondary, fontStyle: "italic" }}>No reviews yet.</Text>
      )}
    </View>


  </View>
);

export default ReviewsTab;

