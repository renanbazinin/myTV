# RENAN TV (myTV)

Live TV in the browser, designed for three screens:

- **TV** — 10-foot layout with full TV-remote (D-pad) navigation, ▲/▼ to change channel, OK for the channel list, Back to close. Open `https://renanbazinin.github.io/myTV/?tv=1` once to force the TV layout (or pick it in Settings).
- **Phone** — video docked on top with the channel list underneath in portrait, full-screen in landscape, swipe left/right on the video to change channel, lock-screen controls.
- **PC** — keyboard shortcuts (press `?`), picture-in-picture, mouse-friendly controls.

Favorites, "continue watching", channel numbers (type `1`–`99`) and search work everywhere.

Channels come from the playlist in [renanbazinin/myM3U](https://github.com/renanbazinin/myM3U).

## Run locally

Double-click `index.html`. Or serve the folder and open http://localhost:5173/ (closer to how GitHub Pages runs it):

```
npm start
```

## Develop

The source is plain ES modules in `js/`, with no framework or dependencies. Browsers won't load modules from a double-clicked file, so `js/app.bundle.js` holds the same code as one script. After editing anything in `js/`, regenerate it and commit it (CI checks that it's up to date):

```
npm run build
```

Before pushing, run the unit tests and check the code still parses on 2019+ TV browsers:

```
npm test
```

```
npm run check
```

See [CLAUDE.md](CLAUDE.md) for the architecture and the compatibility rules.
