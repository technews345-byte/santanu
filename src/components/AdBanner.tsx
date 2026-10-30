import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ads, bannerUnitId } from '../services/ads';
import { spacing } from '../theme/tokens';

/** A banner ad that takes no space at all when there is none to show. */
export function AdBanner() {
  const mod = ads();
  const [failed, setFailed] = useState(false);
  if (!mod || failed) return null;
  const { BannerAd, BannerAdSize } = mod;
  return (
    <View style={styles.slot}>
      <BannerAd
        unitId={bannerUnitId(mod)}
        size={BannerAdSize.LARGE_ANCHORED_ADAPTIVE_BANNER}
        onAdFailedToLoad={() => setFailed(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  slot: { alignItems: 'center', marginTop: spacing.md },
});
