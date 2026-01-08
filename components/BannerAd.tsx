import React from "react";
import { View } from "react-native";
import {
  BannerAd as AdMobBanner,
  BannerAdSize,
  TestIds,
} from "react-native-google-mobile-ads";

// Real Ad Unit ID provided by user
const PRODUCTION_AD_UNIT_ID = "ca-app-pub-1534462500406736/1888419784";

// Use Test ID in development to avoid policy violations, Real ID in production/preview builds if desired.
// For this verification, we use the Real ID if the user explicitly wants to check it,
// but standard practice is TestIds.BANNER for development.
// I will use PRODUCTION_AD_UNIT_ID here as requested for the release preparation.
const adUnitId = __DEV__ ? TestIds.BANNER : PRODUCTION_AD_UNIT_ID;

export default function BannerAd() {
  return (
    <View className="items-center py-2 bg-gray-900 w-full">
      <AdMobBanner
        unitId={adUnitId}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{
          requestNonPersonalizedAdsOnly: true,
        }}
      />
    </View>
  );
}
