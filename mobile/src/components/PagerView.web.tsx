import React from "react";
import { View } from "react-native";

const PagerView = React.forwardRef<any, any>((props, ref) => {
  return <View ref={ref} {...props} />;
});

PagerView.displayName = "PagerViewWebFallback";

export default PagerView;