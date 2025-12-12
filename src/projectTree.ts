import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { localize } from "./localize";

export interface Project {
  label: string;
  path: string;
}


export interface CategoryNode {
  projects?: Project[];
  [key: string]: any;
}

export type RootConfig = {
  [categoryName: string]: CategoryNode;
};

export type NodeType = "category" | "project";

const CONFIG_ERROR_DESCRIPTION = localize(
  "tree.configError",
  "Config error"
);

export class ProjectTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly nodeType: NodeType,
    public readonly projectPath?: string,
    public readonly categoryNode?: CategoryNode,
    public readonly configPath?: string,
    public readonly errors: string[] = []
  ) {
    super(label, collapsibleState);
    const hasErrors = errors.length > 0;
    const tooltipParts: string[] = [];
    if (nodeType === "project" && projectPath) {
      tooltipParts.push(projectPath);
    }
    if (hasErrors) {
      tooltipParts.push(...errors);
    }
    this.tooltip = tooltipParts.length > 0 ? tooltipParts.join("\n") : undefined;

    if (nodeType === "project") {
      this.contextValue = "projectTree.project";
      this.description = hasErrors ? CONFIG_ERROR_DESCRIPTION : undefined;
      this.iconPath = hasErrors
        ? new vscode.ThemeIcon("warning")
        : new vscode.ThemeIcon("project");
      /*this.command = {
        title: "Open Project (Current Window)",
        command: "projectTree.openProjectHere",
        arguments: [this]
      };*/
    } else {
      this.contextValue = "projectTree.category";
      this.description = hasErrors ? CONFIG_ERROR_DESCRIPTION : undefined;
      this.iconPath = new vscode.ThemeIcon("folder");
    }
  }
}

export class ProjectTreeDataProvider
  implements vscode.TreeDataProvider<ProjectTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<ProjectTreeItem | undefined | void> =
    new vscode.EventEmitter<ProjectTreeItem | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<ProjectTreeItem | undefined | void> =
    this._onDidChangeTreeData.event;

  private config: RootConfig = {};
  private watcher?: fs.FSWatcher;
  private validationIssues: Map<string, string[]> = new Map();
  private hadValidationErrors = false;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.loadConfig();
    this.setupWatcher();
  }


  getTreeItem(element: ProjectTreeItem): vscode.TreeItem {
    if (element.nodeType === "category") {
      if (element.errors.length > 0) {
        element.iconPath = new vscode.ThemeIcon("warning");
        if (!element.tooltip) {
          element.tooltip = element.errors.join("\n");
        }
      } else {
        element.iconPath = new vscode.ThemeIcon(
          element.collapsibleState === vscode.TreeItemCollapsibleState.Collapsed
            ? "folder"
            : "folder-opened"
        );
      }
    }

    return element;
  }


  getChildren(element?: ProjectTreeItem): Thenable<ProjectTreeItem[]> {
    if (!this.config) {
      return Promise.resolve([]);
    }

    // Корневой уровень: верхние категории из конфига
    if (!element) {
      const items: ProjectTreeItem[] = [];
      for (const [name, node] of Object.entries(this.config)) {
        const configPath = name;
        items.push(
          new ProjectTreeItem(
            name,
            vscode.TreeItemCollapsibleState.Collapsed,
            "category",
            undefined,
            node,
            configPath,
            this.getIssuesForKey(configPath)
          )
        );
      }
      return Promise.resolve(items);
    }

    if (element.nodeType === "category" && element.categoryNode) {
      const node = element.categoryNode;
      const items: ProjectTreeItem[] = [];

      if (Array.isArray(node.projects)) {
        node.projects.forEach((proj, index) => {
          const projectKey = this.buildProjectKey(
            element.configPath ?? element.label,
            index
          );
          items.push(
            new ProjectTreeItem(
              proj.label,
              vscode.TreeItemCollapsibleState.None,
              "project",
              proj.path,
              undefined,
              projectKey,
              this.getIssuesForKey(projectKey)
            )
          );
        });
      }

      for (const [key, value] of Object.entries(node)) {
        if (key === "projects") continue;
        if (typeof value === "object" && value !== null) {
          const childPath = this.joinConfigPath(
            element.configPath ?? element.label,
            key
          );
          items.push(
            new ProjectTreeItem(
              key,
              vscode.TreeItemCollapsibleState.Collapsed,
              "category",
              undefined,
              value as CategoryNode,
              childPath,
              this.getIssuesForKey(childPath)
            )
          );
        }
      }

      return Promise.resolve(items);
    }

    return Promise.resolve([]);
  }

  refresh(): void {
    this.loadConfig();
    this._onDidChangeTreeData.fire();
  }

  async addProject(): Promise<void> {
    const folder = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: localize("addProject.pickFolder", "Select project folder")
    });

    if (!folder || folder.length === 0) {
      return;
    }

    const folderPath = folder[0].fsPath;
    const defaultLabel = path.basename(folderPath);

    const labelInput = await vscode.window.showInputBox({
      prompt: localize("addProject.enterLabel", "Enter project name"),
      value: defaultLabel,
      valueSelection: [0, defaultLabel.length]
    });

    const label = labelInput?.trim();
    if (!label) {
      return;
    }

    this.loadConfig();
    type CategoryPick = vscode.QuickPickItem & {
      pathSegments?: string[];
      node?: CategoryNode;
      createNew?: boolean;
    };

    const categoryNodes = this.collectCategoryNodes();
    const newCategoryLabel = localize(
      "addProject.newCategory",
      "Create new category…"
    );

    const picks: CategoryPick[] = categoryNodes.map((category) => ({
      label: this.formatCategoryPath(category.path),
      pathSegments: category.path,
      node: category.node
    }));

    picks.push({
      label: newCategoryLabel,
      description: localize("addProject.enterCategory", "Enter new category name"),
      createNew: true
    });

    const selected = await vscode.window.showQuickPick(picks, {
      placeHolder: localize("addProject.chooseCategory", "Select category")
    });

    if (!selected) {
      return;
    }

    let targetNode: CategoryNode | undefined = selected.node;
    let targetPath = selected.pathSegments ?? [];

    if (selected.createNew) {
      const categoryInput = await vscode.window.showInputBox({
        prompt: localize("addProject.enterCategory", "Enter new category name")
      });
      const categoryName = categoryInput?.trim();
      if (!categoryName) {
        return;
      }
      targetPath = [categoryName];
      targetNode =
        this.config[categoryName] && typeof this.config[categoryName] === "object"
          ? this.config[categoryName]
          : {};
      this.config[categoryName] = targetNode;
    }

    if (!targetNode) {
      return;
    }

    if (!Array.isArray(targetNode.projects)) {
      targetNode.projects = [];
    }

    targetNode.projects.push({
      label,
      path: folderPath
    });

    const categoryDisplay = this.formatCategoryPath(targetPath);

    try {
      await this.saveConfigToDisk();
      this.loadConfig();
      this.setupWatcher();
      this._onDidChangeTreeData.fire();
      vscode.window.showInformationMessage(
        localize("addProject.success", 'Project "{0}" added to "{1}".', label, categoryDisplay)
      );
    } catch (err) {
      vscode.window.showErrorMessage(
        localize(
          "addProject.saveError",
          "Failed to save projects.json: {0}",
          (err as Error).message
        )
      );
    }
  }

  dispose(): void {
    if (this.watcher) {
      this.watcher.close();
    }
  }

  public getConfigPath(): string {
    const storagePath = this.context.globalStorageUri.fsPath;

    if (!fs.existsSync(storagePath)) {
      fs.mkdirSync(storagePath, { recursive: true });
    }

    return path.join(storagePath, "projects.json");
  }

  private joinConfigPath(base: string | undefined, key: string): string {
    if (!base) {
      return key;
    }

    return `${base}.${key}`;
  }

  private buildProjectKey(base: string | undefined, index: number): string {
    const prefix = base ?? "projects";
    return `${prefix}.projects[${index}]`;
  }

  private getIssuesForKey(key: string | undefined): string[] {
    if (!key) {
      return [];
    }

    return this.validationIssues.get(key) ?? [];
  }

  private collectCategoryNodes(): Array<{ path: string[]; node: CategoryNode }> {
    const result: Array<{ path: string[]; node: CategoryNode }> = [];

    for (const [name, value] of Object.entries(this.config)) {
      if (this.isPlainObject(value)) {
        this.walkCategoryTree(value as CategoryNode, [name], result);
      }
    }

    return result;
  }

  private walkCategoryTree(
    node: CategoryNode,
    pathSegments: string[],
    bucket: Array<{ path: string[]; node: CategoryNode }>
  ): void {
    bucket.push({ path: [...pathSegments], node });

    for (const [key, value] of Object.entries(node)) {
      if (key === "projects") {
        continue;
      }

      if (this.isPlainObject(value)) {
        this.walkCategoryTree(
          value as CategoryNode,
          [...pathSegments, key],
          bucket
        );
      }
    }
  }

  private formatCategoryPath(pathSegments: string[]): string {
    return pathSegments.join(" / ");
  }


  private loadConfig(): void {
    const configPath = this.getConfigPath();
    this.validationIssues.clear();

    try {
      if (!fs.existsSync(configPath)) {
        this.config = {};
        return;
      }

      const raw = fs.readFileSync(configPath, "utf8");
      if (!raw.trim()) {
        this.config = {};
        return;
      }

      const parsed = JSON.parse(raw);
      this.config = this.validateAndNormalizeConfig(parsed);
    } catch (err) {
      const message = (err as Error).message;
      const localized = localize(
        "error.configRead",
        "Project Tree: failed to read config: {0}",
        message
      );
      vscode.window.showErrorMessage(localized);
      this.recordIssue("__root__", localized);
      this.config = {};
    } finally {
      this.handleValidationWarning();
    }
  }

  private async saveConfigToDisk(): Promise<void> {
    const configPath = this.getConfigPath();
    const content = JSON.stringify(this.config, null, 2);
    await fs.promises.writeFile(configPath, `${content}\n`, "utf8");
  }

  private validateAndNormalizeConfig(raw: unknown): RootConfig {
    if (!this.isPlainObject(raw)) {
      this.recordIssue(
        "__root__",
        localize(
          "error.configShape",
          "projects.json must be an object with categories."
        )
      );
      return {};
    }

    const result: RootConfig = {};
    for (const [name, value] of Object.entries(raw)) {
      if (!this.isPlainObject(value)) {
        this.recordIssue(
          name,
          localize(
            "error.categoryShape",
            "Category must be an object with nested projects."
          )
        );
        continue;
      }

      result[name] = this.normalizeCategoryNode(
        value as Record<string, unknown>,
        name
      );
    }

    return result;
  }

  private normalizeCategoryNode(
    source: Record<string, unknown>,
    pathKey: string
  ): CategoryNode {
    const node: CategoryNode = {};

    if ("projects" in source) {
      const projectsValue = source.projects;
      if (Array.isArray(projectsValue)) {
        node.projects = projectsValue.map((proj, index) =>
          this.normalizeProject(proj, this.buildProjectKey(pathKey, index))
        );
      } else {
        this.recordIssue(
          `${pathKey}.projects`,
          localize(
            "error.projectsArray",
            "`projects` must be an array of projects."
          )
        );
      }
    }

    for (const [key, value] of Object.entries(source)) {
      if (key === "projects") {
        continue;
      }

      if (this.isPlainObject(value)) {
        node[key] = this.normalizeCategoryNode(
          value as Record<string, unknown>,
          this.joinConfigPath(pathKey, key)
        );
      } else {
        node[key] = value;
      }
    }

    return node;
  }

  private normalizeProject(value: unknown, pathKey: string): Project {
    if (!this.isPlainObject(value)) {
      this.recordIssue(
        pathKey,
        localize("error.projectShape", "Project entry must be an object.")
      );
      return {
        label: localize("label.invalidProject", "Invalid project"),
        path: ""
      };
    }

    const project = value as Record<string, unknown>;

    const labelValue = project.label;
    const pathValue = project.path;

    if (typeof labelValue !== "string" || !labelValue.trim()) {
      this.recordIssue(
        `${pathKey}.label`,
        localize(
          "error.labelRequired",
          "`label` is required and must be a string."
        )
      );
    }

    if (typeof pathValue !== "string" || !pathValue.trim()) {
      this.recordIssue(
        `${pathKey}.path`,
        localize(
          "error.pathRequired",
          "`path` is required and must be a string."
        )
      );
    }

    return {
      label:
        typeof labelValue === "string" && labelValue.trim()
          ? labelValue
          : localize("label.untitledProject", "Untitled"),
      path:
        typeof pathValue === "string" && pathValue.trim()
          ? pathValue
          : ""
    };
  }

  private handleValidationWarning(): void {
    const hasIssues = this.validationIssues.size > 0;
    if (hasIssues && !this.hadValidationErrors) {
      this.hadValidationErrors = true;
      vscode.window
        .showWarningMessage(
          localize(
            "warning.configIssues",
            "Project Tree: there are errors in projects.json"
          ),
          localize("action.editConfig", "Edit Config")
        )
        .then((selection) => {
          if (selection === localize("action.editConfig", "Edit Config")) {
            vscode.commands.executeCommand("projectTree.openConfig");
          }
        });
    } else if (!hasIssues) {
      this.hadValidationErrors = false;
    }
  }

  private recordIssue(key: string, message: string): void {
    const bucket = this.validationIssues.get(key) ?? [];
    bucket.push(message);
    this.validationIssues.set(key, bucket);
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private setupWatcher(): void {
    const configPath = this.getConfigPath();

    try {
      if (this.watcher) {
        this.watcher.close();
      }

      if (!fs.existsSync(configPath)) {
        return;
      }

      this.watcher = fs.watch(configPath, { persistent: false }, () => {
        this.loadConfig();
        this._onDidChangeTreeData.fire();
      });
    } catch (err) {
      console.error("ProjectTree watcher error:", err);
    }
  }
}
