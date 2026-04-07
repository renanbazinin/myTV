## ADDED Requirements

### Requirement: Web app manifest
The system SHALL include a `manifest.json` that declares the app name, icons, theme color, and standalone display mode.

#### Scenario: Manifest is linked in HTML
- **WHEN** the page loads
- **THEN** a `<link rel="manifest">` tag points to `manifest.json`

#### Scenario: Manifest enables installation
- **WHEN** a user visits the site in a supported browser (Chrome, Edge, Safari)
- **THEN** the browser's install prompt becomes available

### Requirement: Service worker registration
The system SHALL register a service worker on page load to enable offline caching of static assets.

#### Scenario: Service worker registers successfully
- **WHEN** the page loads and the browser supports service workers
- **THEN** `sw.js` is registered without errors

#### Scenario: Graceful fallback without SW support
- **WHEN** the page loads in a browser that does not support service workers
- **THEN** the app functions normally without caching

### Requirement: Static asset caching
The service worker SHALL cache static assets (HTML, CSS, JS files, favicon) on install and serve them cache-first.

#### Scenario: Assets cached on install
- **WHEN** the service worker installs
- **THEN** `index.html`, `style.css`, all `js/*.js` files, and the favicon are added to the cache

#### Scenario: Cached assets served offline
- **WHEN** the user is offline and navigates to the app
- **THEN** the cached HTML, CSS, and JS load successfully (channel list and streams will not work)

#### Scenario: Cache versioning on update
- **WHEN** a new version of the service worker is deployed with an updated cache key
- **THEN** old caches are deleted during activation and new assets are cached

### Requirement: Standalone display mode
The installed PWA SHALL run in standalone mode without browser chrome (address bar, tabs).

#### Scenario: Installed app hides browser UI
- **WHEN** the user opens the installed PWA from their home screen or app launcher
- **THEN** the app displays without browser address bar or navigation controls
