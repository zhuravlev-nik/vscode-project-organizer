# Project Tree

Project Tree shows a custom tree of your local projects in the Activity Bar.

## Features

- Project categories and projects are loaded from a JSON config file.
- Open config directly from the view.
- Add projects via **Project Tree: Add Project** wizard (select folder, name and category). Paths inside `~/` are stored relative to make configs portable.
- Customize project icons via the optional `icon` field (uses [Codicon IDs](https://microsoft.github.io/vscode-codicons/dist/codicon.html)).
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

`icon` — необязательное поле. Укажите любой идентификатор Codicon (например, `symbol-method`, `github`, `terminal`). Если поле не задано, будет использована стандартная иконка VS Code.
