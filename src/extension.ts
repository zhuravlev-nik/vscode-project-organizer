import * as vscode from "vscode";
import { ProjectTreeDataProvider, ProjectTreeItem } from "./projectTree";
import { localize } from "./localize";

let treeDataProvider: ProjectTreeDataProvider | null = null;

export function activate(context: vscode.ExtensionContext) {
  treeDataProvider = new ProjectTreeDataProvider(context);

  const treeView = vscode.window.createTreeView("projectTreeView", {
    treeDataProvider
  });
  treeDataProvider.registerTreeView(treeView);

  context.subscriptions.push(treeView, treeDataProvider);
  context.subscriptions.push(
    vscode.commands.registerCommand("projectTree.openConfig", async () => {
      if (!treeDataProvider) {
        return;
      }

      const configPath = treeDataProvider.getConfigPath();

      const fs = await import("fs");

      if (!fs.existsSync(configPath)) {
        fs.writeFileSync(configPath, "{}\n", "utf8");
      }

      const doc = await vscode.workspace.openTextDocument(configPath);
      await vscode.window.showTextDocument(doc);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("projectTree.refresh", () => {
      treeDataProvider?.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("projectTree.filter", async () => {
      if (!treeDataProvider) {
        return;
      }

      const value = await vscode.window.showInputBox({
        prompt: localize("filter.prompt", "Filter projects by name or path"),
        placeHolder: localize("filter.prompt", "Filter projects by name or path"),
        value: treeDataProvider.getFilter()
      });

      if (value === undefined) {
        return;
      }

      treeDataProvider.setFilter(value);

      if (!value.trim()) {
        vscode.window.showInformationMessage(
          localize("filter.clear", "Filter cleared")
        );
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("projectTree.addProject", async () => {
      await treeDataProvider?.addProject();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "projectTree.openProjectHere",
      async (item: ProjectTreeItem) => {
        if (!item || !item.projectPath) return;

        const uri = vscode.Uri.file(item.projectPath);
        await vscode.commands.executeCommand("vscode.openFolder", uri, false); // текущее окно
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "projectTree.openProject",
      async (item: ProjectTreeItem) => {
        if (!item || !item.projectPath) return;

        const uri = vscode.Uri.file(item.projectPath);
        await vscode.commands.executeCommand("vscode.openFolder", uri, true); // новое окно
      }
    )
  );
}

export function deactivate() {
  treeDataProvider?.dispose();
}
