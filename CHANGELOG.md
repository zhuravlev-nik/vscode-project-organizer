# Change Log

All notable changes to the "vcode-project-tree" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

## [0.3.3] - 2025-12-16

### Changed
- Refined the Marketplace icon (`resources/icon.png`) once more so the extension listing and Activity Bar show the final branding.

## [0.3.2] - 2025-12-16

### Added
- Set a custom marketplace icon (`resources/icon.png`) so the extension displays branded art in the VS Code UI and Marketplace listings.

## [0.3.1] - 2025-12-16

### Fixed
- Corrected the repository URL in `package.json` so Marketplace links point to the public GitHub repo.

## [0.3.0] - 2025-12-16

### Changed
- Category pickers (add, edit and rename flows) now share one streamlined Quick Pick that lets you keep the current category, jump to the root or create a new branch without leaving the dialog.
- Adding a project from the view toolbar always targets the root, while invoking the command from a category row still drops it inside that category for predictable placement.
- Config loading became fully asynchronous, so add/edit/remove commands no longer block on disk I/O and react immediately even while the config is being re-read.
- The projects.json watcher was hardened to recover from deletes or recreations automatically, which keeps the tree in sync with manual edits in external editors.
- Internal category storage is now strongly typed, simplifying tree rendering and eliminating redundant validation checks.

### Fixed
- Project paths are normalized through a single code path, so edits that use relative locations, `~/` shortcuts or absolute paths all resolve consistently everywhere in the UI.
- Removing or moving categories no longer leaves behind orphaned entries because all mutations operate on the structured tree representation.

## [0.2.0] - 2025-12-13

### Added
- Commands to edit or remove projects directly from the tree, including renaming, changing paths/icons and moving between categories with guided prompts.
- Commands and toolbar actions to create, rename, move or delete categories (including nested ones) plus refreshed codicon buttons (`new-file`/`new-folder`).
- Adding a project from a category row automatically targets that category, and root-level projects are now displayed and editable.
- Bundled JSON schema so editing `projects.json` in VS Code provides auto-complete and validation.

### Changed
- Updated Activity Bar and context-menu icons so adding a project uses the `new-file` codicon and adding a category uses `new-folder`.
- Removing a category now lets you choose between deleting nested items or moving the entire subtree to the top level while keeping its hierarchy intact.
- Project paths are always normalized against the config location or home directory, so relative entries are stable regardless of the currently opened workspace.
- The config watcher is debounced and resilient to file recreation, ensuring the tree refreshes reliably after editing `projects.json`.
- Categories created from the toolbar now default to the root level for predictable placement.

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
