# App icon assets

The logo artwork is preserved from the supplied 1792 × 1792 source image.

## iOS

- `ios/AppIcon.appiconset/` is ready to place in an Xcode asset catalog.
- Includes iPhone, iPad, and 1024 × 1024 App Store sizes.
- All iOS icons are intentionally opaque because Apple app icons must not contain transparency.

## Android

- `android/res/` is a drop-in Android resource set with legacy launcher icons and adaptive-icon layers.
- `android/legacy/` contains opaque launcher PNGs at 48, 72, 96, 144, and 192 px.
- `android/adaptive/foreground/` contains genuine-alpha foreground PNGs at 108, 162, 216, 324, and 432 px. The complete logo is scaled into Android's adaptive-icon safe zone so masks do not crop it.
- `android/adaptive/background/` contains matching opaque white background PNGs.
- `android/play-store/icon-512.png` is the 512 × 512 Play Store icon.

## Masters

- `masters/icon-opaque-1024.png` is the opaque master.
- `masters/logo-transparent-1024.png` is the genuine-alpha transparent master.

## Web / PWA

- `web/apple-touch-icon.png` is 180 × 180 for Safari **Add to Home Screen**.
- `web/icon-192.png` and `web/icon-512.png` are the standard web app manifest icons.
- `web/manifest-icons.json` is a ready-to-copy manifest icon array.

Do not pre-round the PNGs. iOS and Android apply the device-appropriate mask automatically.
