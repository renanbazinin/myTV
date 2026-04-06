## ADDED Requirements

### Requirement: Volume slider control in header
The system SHALL display a range slider input in the header controls that allows the user to adjust volume from 0% to 100%.

#### Scenario: User drags slider to adjust volume
- **WHEN** the user drags the volume slider to 50%
- **THEN** all active media elements (video and audio) SHALL have their volume set to 0.5

#### Scenario: User drags slider to zero
- **WHEN** the user drags the volume slider to 0%
- **THEN** the system SHALL set mute state to true and update the mute button to show the muted icon (🔇)

#### Scenario: User drags slider above zero while muted
- **WHEN** the user is muted and drags the volume slider above 0%
- **THEN** the system SHALL set mute state to false and update the mute button to show the unmuted icon (🔊)

### Requirement: Mute button syncs with volume slider
The mute button SHALL visually sync with the volume slider position.

#### Scenario: User clicks mute
- **WHEN** the user clicks the mute button to mute
- **THEN** the volume slider SHALL move to 0 position

#### Scenario: User clicks unmute
- **WHEN** the user clicks the mute button to unmute
- **THEN** the volume slider SHALL restore to the previously stored volume level

### Requirement: Audio state persists in localStorage
The system SHALL store the user's volume level and mute state in localStorage whenever either value changes.

#### Scenario: Volume level is stored on slider change
- **WHEN** the user adjusts the volume slider
- **THEN** localStorage key `myTV_volume` SHALL be updated with the current volume (0 to 1)

#### Scenario: Mute state is stored on toggle
- **WHEN** the user toggles the mute button
- **THEN** localStorage key `myTV_isMuted` SHALL be updated with the current mute state

### Requirement: Audio state restored on app initialization
The system SHALL read `myTV_isMuted` and `myTV_volume` from localStorage on startup. If no values exist, the system SHALL default to muted with volume at 1.

#### Scenario: Returning user with stored preferences
- **WHEN** the app loads and localStorage contains `myTV_isMuted = "false"` and `myTV_volume = "0.75"`
- **THEN** the initial mute state SHALL be false, volume SHALL be 0.75, and the slider SHALL reflect 75%

#### Scenario: First-time visitor
- **WHEN** the app loads and localStorage has no audio keys
- **THEN** the mute state SHALL be true, volume SHALL be 1, and the slider SHALL show 100%

### Requirement: Audio state preserved across channel switches
The system SHALL apply the current volume and mute state when loading a new channel.

#### Scenario: User switches channels with custom volume
- **WHEN** the user has volume at 60% unmuted and selects a different channel
- **THEN** the new channel SHALL play at volume 0.6, unmuted

#### Scenario: User switches channels while muted
- **WHEN** the user is muted and selects a different channel
- **THEN** the new channel SHALL play muted, preserving the user's preference
