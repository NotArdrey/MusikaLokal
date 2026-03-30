import React from 'react';
import { View } from 'react-native';

const PagerView = React.forwardRef((props: any, ref) => {
  return <View ref={ref} {...props} />;
});

export default PagerView;
