import { Animated, Image, ImageBackground, StyleSheet, Text, View } from 'react-native';
import { useEffect, useRef, useState } from 'react';

const HERO_IMAGES = [
  'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?q=80&w=2069&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=2070&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?q=80&w=2069&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?q=80&w=2070&auto=format&fit=crop',
];

const IMAGE_SWITCH_INTERVAL_MS = 6500;
const FADE_DURATION_MS = 1400;

type AuthMusicHeroProps = {
  title: string;
  subtitle: string;
};

export default function AuthMusicHero({ title, subtitle }: AuthMusicHeroProps) {
  const fadeOpacity = useRef(new Animated.Value(0)).current;
  const activeIndexRef = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [nextIndex, setNextIndex] = useState(1);

  useEffect(() => {
    let mounted = true;

    if (HERO_IMAGES.length < 2) {
      return () => {
        mounted = false;
      };
    }

    const interval = setInterval(() => {
      const upcomingIndex = (activeIndexRef.current + 1) % HERO_IMAGES.length;
      setNextIndex(upcomingIndex);
      fadeOpacity.setValue(0);

      Animated.timing(fadeOpacity, {
        toValue: 1,
        duration: FADE_DURATION_MS,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!mounted || !finished) return;

        activeIndexRef.current = upcomingIndex;
        setActiveIndex(upcomingIndex);
        fadeOpacity.setValue(0);
      });
    }, IMAGE_SWITCH_INTERVAL_MS);

    return () => {
      mounted = false;
      clearInterval(interval);
      fadeOpacity.stopAnimation();
    };
  }, [fadeOpacity]);

  return (
    <View style={styles.panel}>
      <ImageBackground
        source={{ uri: HERO_IMAGES[activeIndex] }}
        style={styles.fullSurface}
        resizeMode="cover"
      />

      {HERO_IMAGES.length > 1 && (
        <Animated.View pointerEvents="none" style={[styles.fullSurface, { opacity: fadeOpacity }]}>
          <ImageBackground
            source={{ uri: HERO_IMAGES[nextIndex] }}
            style={styles.fullSurface}
            resizeMode="cover"
          />
        </Animated.View>
      )}

      <View style={styles.overlayBase} />
      <View style={styles.overlayAccent} />

      <View style={styles.content}>
        <View style={styles.logoWrapper}>
          <Image
            source={require('../../assets/images/Musika-lokal-logo.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </View>

        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        <Text style={styles.caption}>Live bands. Studio nights. Local scenes.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    overflow: 'hidden',
    borderRightWidth: 1,
    borderRightColor: 'rgba(148, 163, 184, 0.18)',
  },
  fullSurface: {
    ...StyleSheet.absoluteFillObject,
  },
  overlayBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 6, 23, 0.62)',
  },
  overlayAccent: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.25)',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 52,
    paddingVertical: 64,
  },
  logoWrapper: {
    width: 92,
    height: 92,
    borderRadius: 24,
    backgroundColor: 'rgba(79, 70, 229, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.26)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30,
  },
  logoImage: {
    width: 98,
    height: 98,
    tintColor: '#FFFFFF',
  },
  title: {
    color: '#F8FAFC',
    fontSize: 56,
    lineHeight: 62,
    fontFamily: 'Poppins_700Bold',
    marginBottom: 14,
  },
  subtitle: {
    color: 'rgba(241, 245, 249, 0.86)',
    fontSize: 20,
    lineHeight: 30,
    maxWidth: 470,
    fontFamily: 'Poppins_400Regular',
    marginBottom: 22,
  },
  caption: {
    color: 'rgba(191, 219, 254, 0.92)',
    fontSize: 13,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontFamily: 'Poppins_500Medium',
  },
});
