import React from "react";
import { View } from "react-native";
import SmoothTabTransition from "../SmoothTabTransition";

interface ListingContentBodyProps {
  styles: any;
  colors: any;
  group: any;
  activeTab: string;
  activeTabIndex?: number;
  showTabs: boolean;
  renderGroupAbout: () => React.ReactNode;
  renderGroupApply: () => React.ReactNode;
  renderGroupTimeline: () => React.ReactNode;
  renderConnectionTab: () => React.ReactNode;
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
  activeTabIndex,
  showTabs,
  renderGroupAbout,
  renderGroupApply,
  renderGroupTimeline,
  renderConnectionTab,
  renderReviews,
  renderStudioGigVenueAbout,
  renderStudioSetup,
  renderStudioBook,
  renderGigInfo,
  renderGigApply,
}: ListingContentBodyProps) => (
  <View style={[styles.contentBody, { backgroundColor: colors.background }]}>
    <SmoothTabTransition
      activeKey={showTabs ? activeTab : "About"}
      activeIndex={activeTabIndex}
      slideDistance={28}
    >
      {(group.type === "Group" || group.type === "Artist" || !group.type) && (
        <>
          {(activeTab === "About" || !showTabs) && renderGroupAbout()}
          {activeTab === "Connect" && renderConnectionTab()}
          {group.type === "Group" && activeTab === "Apply" && renderGroupApply()}
          {activeTab === "Timeline" && renderGroupTimeline()}
          {activeTab === "Review" && renderReviews()}
        </>
      )}

      {(group.type === "Studio" || group.type === "Gig" || group.type === "Venue") && (
        <>
          {activeTab === "About" && renderStudioGigVenueAbout()}
          {group.type === "Gig" && activeTab === "About" && renderGigInfo()}
          {activeTab === "Connect" && renderConnectionTab()}
          {activeTab === "Setup" && renderStudioSetup()}
          {activeTab === "Specs" && renderStudioSetup()}
          {activeTab === "Book" && renderStudioBook()}
          {activeTab === "Info" && renderGigInfo()}
          {activeTab === "Apply" && renderGigApply()}
          {activeTab === "Review" && renderReviews()}
        </>
      )}
    </SmoothTabTransition>
  </View>
);

export default ListingContentBody;
