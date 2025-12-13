# Project Tree Organizer

Project Tree Organizer shows a custom tree of your local projects in the Activity Bar.

## Features

- Project categories and projects are loaded from a JSON config file.
- Open config directly from the view.
- Add projects via **Project Tree: Add Project** wizard (select folder, name and category). Paths inside `~/` are stored relative to make configs portable.
- Edit or remove existing projects from the tree (rename, change path/icon, move to another category).
- Create, rename, move or delete categories directly from the tree (including nested ones).
- Add projects straight from a category row (or keep them at the top level) and choose whether to delete or move nested content when removing a category.
- Customize project icons via the optional `icon` field (uses [Codicon IDs](https://microsoft.github.io/vscode-codicons/dist/codicon.html)).
- Edit `projects.json` with auto-complete and inline validation thanks to the bundled JSON schema.
- The tree auto-refreshes whenever you edit `projects.json` in global storage.
- Refresh the tree.
- Open a project in the current window or in a new window.

## Config location

The config is stored in VS Code global storage:

`<globalStorage>/projects.json`

You can open it from the view using **Project Tree: Edit Config**.

## Config format

```json
{
  "Work": {
    "projects": [
      {
        "label": "My Project",
        "path": "~/projects/my-project",
        "icon": "symbol-function"
      }
    ],
    "Client": {
      "projects": [
        { "label": "Client App", "path": "/home/user/projects/client-app" }
      ]
    }
  }
}
```

`icon` is optional. Provide any [Codicon](https://microsoft.github.io/vscode-codicons/dist/codicon.html) identifier (for example `symbol-method`, `github`, `terminal`). If omitted, VS Code's default project icon is used.
