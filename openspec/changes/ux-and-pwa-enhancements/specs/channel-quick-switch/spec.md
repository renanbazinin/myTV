## ADDED Requirements

### Requirement: Channel up/down navigation
The system SHALL allow the user to switch to the next or previous channel using the ArrowUp and ArrowDown keys while a channel is playing.

#### Scenario: Arrow down switches to next channel
- **WHEN** user presses ArrowDown while watching channel 3
- **THEN** channel 4 starts playing

#### Scenario: Arrow up switches to previous channel
- **WHEN** user presses ArrowUp while watching channel 5
- **THEN** channel 4 starts playing

#### Scenario: Arrow down wraps at end of list
- **WHEN** user presses ArrowDown while watching the last channel
- **THEN** channel 1 starts playing

#### Scenario: Arrow up wraps at beginning of list
- **WHEN** user presses ArrowUp while watching channel 1
- **THEN** the last channel starts playing

#### Scenario: Arrow keys ignored on channel picker
- **WHEN** user presses ArrowUp or ArrowDown while the channel picker is visible
- **THEN** no channel switch occurs (normal page scrolling behavior)

### Requirement: Previous channel recall
The system SHALL allow the user to switch back to the previously watched channel using the Backspace key.

#### Scenario: Backspace returns to previous channel
- **WHEN** user switches from channel 3 to channel 7, then presses Backspace
- **THEN** channel 3 starts playing

#### Scenario: Backspace with no previous channel
- **WHEN** user presses Backspace but has not switched channels yet
- **THEN** nothing happens

### Requirement: Channel info overlay on switch
The system SHALL display a brief overlay showing the channel number and name when switching channels via keyboard shortcuts (arrows, Backspace, or numeric input).

#### Scenario: Overlay appears on channel switch
- **WHEN** user switches channels via ArrowDown
- **THEN** an overlay showing the channel number and name appears on screen

#### Scenario: Overlay auto-hides
- **WHEN** the channel info overlay is displayed
- **THEN** it fades out and hides after 2 seconds

### Requirement: Current channel index tracking
The system SHALL track the index of the currently playing channel so that arrow key navigation and previous channel recall can function.

#### Scenario: Index updates on channel play
- **WHEN** a channel starts playing (via grid click, side menu, numeric input, or arrow keys)
- **THEN** `currentChannelIndex` is set to that channel's index in the channel list
