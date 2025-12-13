# Change Log

All notable changes to the "vcode-project-tree" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

### Added
- Commands to edit or remove projects directly from the tree, including renaming, changing paths/icons and moving between categories with guided prompts.
- Commands and toolbar actions to create, rename, move or delete categories (including nested ones) plus refreshed codicon buttons (`new-file`/`new-folder`).

### Changed
- Updated Activity Bar and context-menu icons so adding a project uses the `new-file` codicon and adding a category uses `new-folder`.

## [0.1.0] - 2025-12-12

### Added
- Project creation wizard that lets you pick a folder, name it, choose a category and stores `~/`-based paths for portability.
- Localization (English/Russian) for all user-facing strings.
- Optional per-project codicon icons in the tree.

### Fixed
- Added projects now correctly land inside nested categories instead of always at the root.

### Removed
- Dropped the experimental project filtering command to keep the UI focused.

## [0.0.1] - 2025-12-12

### Added
- Initial Project Tree view in the Activity Bar showing categories and projects loaded from `projects.json`.
- Commands to refresh the tree, open the config file, and open a project in the current or a new VS Code window.
