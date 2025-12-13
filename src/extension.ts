import * as vscode from "vscode";
import { ProjectTreeDataProvider, ProjectTreeItem } from "./projectTree";

let treeDataProvider: ProjectTreeDataProvider | null = null;

export function activate(context: vscode.ExtensionContext) {
  treeDataProvider = new ProjectTreeDataProvider(context);

  const treeView = vscode.window.createTreeView("projectTreeView", {
    treeDataProvider
  });

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
    vscode.commands.registerCommand("projectTree.addProject", async () => {
      await treeDataProvider?.addProject();
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "projectTree.addCategory",
      async (item?: ProjectTreeItem) => {
        await treeDataProvider?.addCategory(item);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "projectTree.editProject",
      async (item: ProjectTreeItem) => {
        await treeDataProvider?.editProject(item);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "projectTree.renameCategory",
      async (item: ProjectTreeItem) => {
        await treeDataProvider?.renameCategory(item);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "projectTree.removeCategory",
      async (item: ProjectTreeItem) => {
        await treeDataProvider?.removeCategory(item);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "projectTree.removeProject",
      async (item: ProjectTreeItem) => {
        await treeDataProvider?.removeProject(item);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "projectTree.openProjectHere",
      async (item: ProjectTreeItem) => {
        if (!item || !item.projectPath) return;

        const uri = vscode.Uri.file(item.projectPath);
        await vscode.commands.executeCommand("vscode.openFolder", uri, false);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "projectTree.openProject",
      async (item: ProjectTreeItem) => {
        if (!item || !item.projectPath) return;

        const uri = vscode.Uri.file(item.projectPath);
        await vscode.commands.executeCommand("vscode.openFolder", uri, true);
      }
    )
  );
}

export function deactivate() {
  treeDataProvider?.dispose();
}
