import React from "react";
import { View } from "react-native";

interface ListingContentBodyProps {
  styles: any;
  colors: any;
  group: any;
  activeTab: string;
  showTabs: boolean;
  renderGroupAbout: () => React.ReactNode;
  renderGroupTimeline: () => React.ReactNode;
  renderReviews: () => React.ReactNode;
  renderStudioGigVenueAbout: () => React.ReactNode;
  renderStudioSetup: () => React.ReactNode;
  renderStudioBook: () => React.ReactNode;
  renderGigInfo: () => React.ReactNode;
  renderGigApply: () => React.ReactNode;
}

const ListingContentBody = ({
  styles,
  colors,
  group,
  activeTab,
  showTabs,
  renderGroupAbout,
  renderGroupTimeline,
  renderReviews,
  renderStudioGigVenueAbout,
  renderStudioSetup,
  renderStudioBook,
  renderGigInfo,
  renderGigApply,
}: ListingContentBodyProps) => (
  <View style={[styles.contentBody, { backgroundColor: colors.background }]}>
    {(group.type === "Group" || group.type === "Artist" || !group.type) && (
      <>
        {(activeTab === "About" || !showTabs) && renderGroupAbout()}
        {activeTab === "Timeline" && renderGroupTimeline()}
        {activeTab === "Review" && renderReviews()}
      </>
    )}

    {(group.type === "Studio" || group.type === "Gig" || group.type === "Venue") && (
      <>
        {activeTab === "About" && renderStudioGigVenueAbout()}
        {group.type === "Gig" && activeTab === "About" && renderGigInfo()}
        {activeTab === "Setup" && renderStudioSetup()}
        {activeTab === "Specs" && renderStudioSetup()}
        {activeTab === "Book" && renderStudioBook()}
        {activeTab === "Info" && renderGigInfo()}
        {activeTab === "Apply" && renderGigApply()}
        {activeTab === "Review" && renderReviews()}
      </>
    )}
  </View>
);

export default ListingContentBody;
