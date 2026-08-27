# Browser tests

`npm run build && npm run e2e`

They load `.output/chrome-mv3` into a real Chromium and assert the things unit
tests structurally cannot reach:

- the MV3 service worker starts and logs no errors
- the popup renders without a page error
- the capture script is injected into the PAGE WORLD and patches `window.fetch`
- it is NOT injected when the device is not connected
- the page world receives its configuration on the script tag

The fourth and fifth matter most: inspection now happens in the page world, so
"did the script arrive, and did it know which site it was on" is the difference
between a working guard and a silent one.

`npm run e2e:install` fetches the browser binary. CI does this itself.
