import { Platform, useWindowDimensions } from 'react-native';

export default function useAdminLayout() {
  const { width: viewportWidth, height } = useWindowDimensions();
  const hasSidebar = Platform.OS === 'web' && viewportWidth >= 1024;
  const width = viewportWidth - (hasSidebar ? 248 : 0);
  return {
    width,
    height,
    isCompact: width < 640,
    isNarrow: width < 960,
    contentPadding: width < 640 ? 12 : 20,
  };
}
