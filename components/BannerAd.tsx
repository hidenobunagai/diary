import { AdMobBanner } from "expo-ads-admob";
import React from "react";
import { View } from "react-native";

const BANNER_AD_UNIT_ID = "ca-app-pub-1534462500406736/1888419784";
// Test ID for development: 'ca-app-pub-3940256099942544/6300978111'

interface BannerAdProps {
  style?: object;
}

export const BannerAd: React.FC<BannerAdProps> = ({ style }) => {
  return (
    <View style={[{ alignItems: "center", marginVertical: 8 }, style]}>
      <AdMobBanner
        bannerSize="banner"
        adUnitID={BANNER_AD_UNIT_ID}
        servePersonalizedAds={true}
        onDidFailToReceiveAdWithError={(error) =>
          console.log("Ad error:", error)
        }
      />
    </View>
  );
};

export default BannerAd;
