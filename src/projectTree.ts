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
