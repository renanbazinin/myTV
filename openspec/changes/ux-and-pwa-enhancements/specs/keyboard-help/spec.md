## ADDED Requirements

### Requirement: Help overlay trigger via keyboard
The system SHALL display a keyboard shortcuts help overlay when the user presses the `?` key.

#### Scenario: Pressing ? opens help
- **WHEN** user presses `?` (Shift+/) and the help overlay is not visible
- **THEN** the help overlay appears listing all keyboard shortcuts

#### Scenario: Pressing ? closes help
- **WHEN** user presses `?` and the help overlay is already visible
- **THEN** the help overlay closes

#### Scenario: Pressing Escape closes help
- **WHEN** the help overlay is visible and user presses Escape
- **THEN** the help overlay closes

### Requirement: Help button in header
The system SHALL display a `?` button in the header controls area that opens the keyboard shortcuts help overlay on click.

#### Scenario: Clicking help button opens overlay
- **WHEN** user clicks the `?` button in the header
- **THEN** the help overlay appears

### Requirement: Help overlay content
The help overlay SHALL list all available keyboard shortcuts with their descriptions.

#### Scenario: All shortcuts listed
- **WHEN** the help overlay is displayed
- **THEN** it shows at minimum: number keys (1-99 channel select), ArrowUp/ArrowDown (channel switch), Backspace (previous channel), H (toggle picker), Escape (back to channels), ? (this help)

### Requirement: Help overlay dismissal
The system SHALL close the help overlay when the user clicks outside of it (on the backdrop).

#### Scenario: Click outside closes overlay
- **WHEN** the help overlay is visible and user clicks the backdrop area
- **THEN** the help overlay closes
