import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { localize } from "./localize";

export interface Project {
  label: string;
  path: string;
  icon?: string;
}


export interface CategoryNode {
  projects?: Project[];
  [key: string]: any;
}

export type RootConfig = CategoryNode;

export type NodeType = "category" | "project";

type CategoryPath = string[];

type CategoryPick = vscode.QuickPickItem & {
  pathSegments?: CategoryPath;
  node?: CategoryNode;
  createNew?: boolean;
};

type CategoryPickOptions = {
  placeholder: string;
  allowCreate?: boolean;
  currentPath?: CategoryPath;
  includeKeepCurrent?: boolean;
  keepCurrentLabel?: string;
  includeRootOption?: boolean;
  rootLabel?: string;
  rootDescription?: string;
};

type CategorySelection = {
  node: CategoryNode;
  path: CategoryPath;
};

type ParentCategoryPickOptions = {
  placeholder: string;
  excludePath?: CategoryPath;
  currentParentPath?: CategoryPath;
  keepCurrentLabel?: string;
};

type ProjectReference = {
  categoryNode: CategoryNode;
  categoryPath: CategoryPath;
  index: number;
  project: Project;
};

type CategoryContainer = {
  container: RootConfig | CategoryNode;
  key: string;
};

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
    public readonly rawProjectPath?: string,
    public readonly iconId?: string,
    public readonly categoryNode?: CategoryNode,
    public readonly configPath?: string,
    public readonly errors: string[] = [],
    public readonly categoryPath?: CategoryPath,
    public readonly project?: Project,
    public readonly projectIndex?: number
  ) {
    super(label, collapsibleState);
    const hasErrors = errors.length > 0;
    if (nodeType === "project") {
      const tooltipParts: string[] = [];
      if (this.rawProjectPath) {
        tooltipParts.push(
          localize(
            "project.tooltip.originalPath",
            "Config path: {0}",
            this.rawProjectPath
          )
        );
      }
      if (this.projectPath && this.projectPath !== this.rawProjectPath) {
        tooltipParts.push(
          localize(
            "project.tooltip.resolvedPath",
            "Resolved path: {0}",
            this.projectPath
          )
        );
      } else if (this.projectPath && tooltipParts.length === 0) {
        tooltipParts.push(this.projectPath);
      }
      if (hasErrors) {
        tooltipParts.push(...errors);
      }
      this.tooltip = tooltipParts.length > 0 ? tooltipParts.join("\n") : undefined;
    } else if (hasErrors) {
      this.tooltip = errors.join("\n");
    }

    if (nodeType === "project") {
      this.contextValue = "projectTree.project";
      this.description = hasErrors ? CONFIG_ERROR_DESCRIPTION : undefined;
      this.iconPath = hasErrors
        ? new vscode.ThemeIcon("warning")
        : new vscode.ThemeIcon(this.iconId ?? "project");
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
  private watcherDebounce?: NodeJS.Timeout;
  private watcherRetryTimeout?: NodeJS.Timeout;
  private validationIssues: Map<string, string[]> = new Map();
  private hadValidationErrors = false;
  private resolvedPathCache: WeakMap<Project, string> = new WeakMap();

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

    if (!element) {
      const items: ProjectTreeItem[] = [];
      for (const [name, node] of Object.entries(this.config)) {
        if (name === "projects") {
          continue;
        }
        if (!this.isPlainObject(node)) {
          continue;
        }
        const configPath = name;
        const categoryPath: CategoryPath = [name];
        items.push(
          this.createCategoryTreeItem({
            label: name,
            node: node as CategoryNode,
            configPath,
            categoryPath
          })
        );
      }

      const rootProjects = this.config.projects;
      if (Array.isArray(rootProjects)) {
        rootProjects.forEach((proj, index) => {
          const projectKey = this.buildProjectKey("__root__", index);
          items.push(
            this.createProjectTreeItem({
              project: proj,
              configPath: projectKey,
              categoryPath: [],
              index
            })
          );
        });
      }
      return Promise.resolve(items);
    }

    if (element.nodeType === "category" && element.categoryNode) {
      const node = element.categoryNode;
      const items: ProjectTreeItem[] = [];

      const currentCategoryPath =
        element.categoryPath ?? [element.label];

      if (Array.isArray(node.projects)) {
        node.projects.forEach((proj, index) => {
          const projectKey = this.buildProjectKey(
            element.configPath ?? element.label,
            index
          );
          items.push(
            this.createProjectTreeItem({
              project: proj,
              configPath: projectKey,
              categoryPath: currentCategoryPath,
              index
            })
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
          const childSegments: CategoryPath = [
            ...currentCategoryPath,
            key
          ];
          items.push(
            this.createCategoryTreeItem({
              label: key,
              node: value as CategoryNode,
              configPath: childPath,
              categoryPath: childSegments
            })
          );
        }
      }

      return Promise.resolve(items);
    }

    return Promise.resolve([]);
  }

  private createCategoryTreeItem(options: {
    label: string;
    node: CategoryNode;
    configPath: string;
    categoryPath: CategoryPath;
  }): ProjectTreeItem {
    return new ProjectTreeItem(
      options.label,
      vscode.TreeItemCollapsibleState.Collapsed,
      "category",
      undefined,
      undefined,
      undefined,
      options.node,
      options.configPath,
      this.getIssuesForKey(options.configPath),
      options.categoryPath
    );
  }

  private createProjectTreeItem(options: {
    project: Project;
    configPath: string;
    categoryPath: CategoryPath;
    index: number;
  }): ProjectTreeItem {
    return new ProjectTreeItem(
      options.project.label,
      vscode.TreeItemCollapsibleState.None,
      "project",
      this.getProjectResolvedPath(options.project),
      options.project.path,
      this.getProjectIconId(options.project),
      undefined,
      options.configPath,
      this.getIssuesForKey(options.configPath),
      options.categoryPath,
      options.project,
      options.index
    );
  }
 
  refresh(): void {
    this.loadConfig();
    this._onDidChangeTreeData.fire();
  }

  async addProject(targetItem?: ProjectTreeItem): Promise<void> {
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
    let targetNode: CategoryNode | undefined;
    let targetPath: CategoryPath = [];

    if (targetItem && targetItem.nodeType === "category") {
      targetPath = targetItem.categoryPath ?? [targetItem.label];
      targetNode = this.getCategoryNodeByPath(targetPath);
    }

    if (!targetNode) {
      const categorySelection = await this.pickCategory({
        placeholder: localize("addProject.chooseCategory", "Select category"),
        allowCreate: true,
        includeRootOption: true
      });

      if (!categorySelection) {
        return;
      }

      targetNode = categorySelection.node;
      targetPath = categorySelection.path;
    }

    if (!Array.isArray(targetNode.projects)) {
      targetNode.projects = [];
    }

    targetNode.projects.push({
      label,
      path: this.formatPathForConfig(folderPath)
    });

    const categoryDisplay = this.formatCategoryPath(targetPath);

    try {
      await this.persistChanges(
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

  async addCategory(
    item?: ProjectTreeItem,
    options?: { forceRoot?: boolean }
  ): Promise<void> {
    this.loadConfig();
    let basePath: CategoryPath;

    const shouldForceRoot = options?.forceRoot ?? false;

    if (!shouldForceRoot && item && item.nodeType === "category") {
      basePath = item.categoryPath ?? [item.label];
    } else {
      basePath = [];
    }

    const nameInput = await vscode.window.showInputBox({
      prompt: localize("addCategory.enterName", "Enter category name"),
      validateInput: (value) =>
        value.trim()
          ? undefined
          : localize("addCategory.nameValidation", "Category name cannot be empty.")
    });

    if (nameInput === undefined) {
      return;
    }

    const newSegments = this.normalizeCategorySegments(nameInput);
    if (newSegments.length === 0) {
      vscode.window.showErrorMessage(
        localize("addCategory.nameValidation", "Category name cannot be empty.")
      );
      return;
    }

    const newPath: CategoryPath = [...basePath, ...newSegments];

    if (this.getCategoryNodeByPath(newPath)) {
      vscode.window.showErrorMessage(
        localize(
          "addCategory.duplicate",
          'Category "{0}" already exists.',
          this.formatCategoryPath(newPath)
        )
      );
      return;
    }

    this.getOrCreateCategoryNode(newPath);

    try {
      await this.persistChanges(
        localize(
          "addCategory.success",
          'Category "{0}" created.',
          this.formatCategoryPath(newPath)
        )
      );
    } catch (err) {
      vscode.window.showErrorMessage(
        localize(
          "addCategory.saveError",
          "Failed to add category: {0}",
          (err as Error).message
        )
      );
    }
  }

  async editProject(item?: ProjectTreeItem): Promise<void> {
    this.loadConfig();
    const reference = this.resolveProjectReference(item);
    if (!reference) {
      return;
    }

    const { project } = reference;

    const labelInput = await vscode.window.showInputBox({
      prompt: localize("editProject.enterLabel", "Update project name"),
      value: project.label,
      valueSelection: [0, project.label.length],
      validateInput: (value) =>
        value.trim()
          ? undefined
          : localize("editProject.labelValidation", "Project name cannot be empty.")
    });

    if (labelInput === undefined) {
      return;
    }

    const pathInput = await vscode.window.showInputBox({
      prompt: localize("editProject.enterPath", "Update project path"),
      value: project.path,
      validateInput: (value) =>
        value.trim()
          ? undefined
          : localize("editProject.pathValidation", "Project path cannot be empty.")
    });

    if (pathInput === undefined) {
      return;
    }

    const iconInput = await vscode.window.showInputBox({
      prompt: localize(
        "editProject.enterIcon",
        "Enter codicon id (optional, leave empty to clear)"
      ),
      value: project.icon ?? ""
    });

    if (iconInput === undefined) {
      return;
    }

    const keepLabel = localize(
      "editProject.keepCategory",
      "Keep current category ({0})",
      this.formatCategoryPath(reference.categoryPath)
    );

    const targetCategory = await this.pickCategory({
      placeholder: localize("editProject.chooseCategory", "Select target category"),
      allowCreate: true,
      currentPath: reference.categoryPath,
      includeKeepCurrent: true,
      keepCurrentLabel: keepLabel
    });

    if (!targetCategory) {
      return;
    }

    const normalizedPath = this.normalizePathInput(pathInput);
    const normalizedIcon = iconInput.trim() ? iconInput.trim() : undefined;
    const updatedProject: Project = {
      label: labelInput.trim(),
      path: normalizedPath,
      icon: normalizedIcon
    };

    if (
      this.pathsEqual(reference.categoryPath, targetCategory.path)
    ) {
      if (Array.isArray(reference.categoryNode.projects)) {
        reference.categoryNode.projects[reference.index] = updatedProject;
      }
    } else {
      if (Array.isArray(reference.categoryNode.projects)) {
        reference.categoryNode.projects.splice(reference.index, 1);
      }
      if (!Array.isArray(targetCategory.node.projects)) {
        targetCategory.node.projects = [];
      }
      targetCategory.node.projects.push(updatedProject);
    }

    try {
      await this.persistChanges(
        localize("editProject.success", 'Project "{0}" updated.', updatedProject.label)
      );
    } catch (err) {
      vscode.window.showErrorMessage(
        localize(
          "editProject.saveError",
          "Failed to update project: {0}",
          (err as Error).message
        )
      );
    }
  }

  async renameCategory(item?: ProjectTreeItem): Promise<void> {
    this.loadConfig();
    const categoryPath = this.resolveCategoryPath(item);
    if (!categoryPath) {
      return;
    }

    const currentName = categoryPath[categoryPath.length - 1];
    const parentPath = categoryPath.slice(0, -1);
    const input = await vscode.window.showInputBox({
      prompt: localize("renameCategory.enterName", "Enter new category name"),
      value: currentName,
      valueSelection: [0, currentName.length],
      validateInput: (value) =>
        value.trim()
          ? undefined
          : localize("renameCategory.nameValidation", "Category name cannot be empty.")
    });

    if (input === undefined) {
      return;
    }

    const newName = input.trim();
    if (!newName) {
      return;
    }

    if (newName.includes("/")) {
      vscode.window.showErrorMessage(
        localize(
          "renameCategory.invalidCharacters",
          "Category name cannot contain '/'."
        )
      );
      return;
    }

    const keepParentLabel = localize(
      "renameCategory.keepParent",
      "Keep current parent ({0})",
      this.formatCategoryPath(parentPath)
    );

    const targetParent = await this.pickParentCategoryPath({
      placeholder: localize(
        "renameCategory.chooseParent",
        "Select new parent category"
      ),
      excludePath: categoryPath,
      currentParentPath: parentPath,
      keepCurrentLabel: keepParentLabel
    });

    if (!targetParent) {
      return;
    }

    const container = this.getCategoryContainer(categoryPath);
    if (!container) {
      vscode.window.showErrorMessage(
        localize("error.categoryMissing", "Category entry could not be found in config.")
      );
      return;
    }

    const targetPath = [...targetParent, newName];
    const isSameDestination =
      this.pathsEqual(targetPath, categoryPath);
    if (!isSameDestination && this.getCategoryNodeByPath(targetPath)) {
      vscode.window.showErrorMessage(
        localize(
          "renameCategory.duplicate",
          'Category "{0}" already exists.',
          this.formatCategoryPath(targetPath)
        )
      );
      return;
    }

    if (
      isSameDestination &&
      newName === currentName &&
      this.pathsEqual(targetParent, parentPath)
    ) {
      return;
    }

    const node = (container.container as Record<string, unknown>)[container.key] as CategoryNode;
    delete (container.container as Record<string, unknown>)[container.key];

    if (targetParent.length === 0) {
      this.config[newName] = node;
    } else {
      const destination = this.getCategoryNodeByPath(targetParent);
      if (!destination) {
        vscode.window.showErrorMessage(
          localize("error.categoryMissing", "Category entry could not be found in config.")
        );
        return;
      }
      destination[newName] = node;
    }

    try {
      await this.persistChanges(
        localize(
          "renameCategory.success",
          'Category moved to "{0}".',
          this.formatCategoryPath(targetPath)
        )
      );
    } catch (err) {
      vscode.window.showErrorMessage(
        localize(
          "renameCategory.saveError",
          "Failed to rename category: {0}",
          (err as Error).message
        )
      );
    }
  }

  async removeCategory(item?: ProjectTreeItem): Promise<void> {
    this.loadConfig();
    const categoryPath = this.resolveCategoryPath(item);
    if (!categoryPath) {
      return;
    }

    const container = this.getCategoryContainer(categoryPath);
    if (!container) {
      vscode.window.showErrorMessage(
        localize("error.categoryMissing", "Category entry could not be found in config.")
      );
      return;
    }

    const containerRecord = container.container as Record<string, unknown>;
    const nodeValue = containerRecord[container.key];
    if (!this.isPlainObject(nodeValue)) {
      delete containerRecord[container.key];
      await this.persistChanges();
      return;
    }

    const categoryNode = nodeValue as CategoryNode;
    const label = this.formatCategoryPath(categoryPath);

    if (!this.categoryHasContent(categoryNode)) {
      delete containerRecord[container.key];
      try {
        await this.persistChanges(
          localize("removeCategory.success", 'Category "{0}" removed.', label)
        );
      } catch (err) {
        vscode.window.showErrorMessage(
          localize(
            "removeCategory.saveError",
            "Failed to remove category: {0}",
            (err as Error).message
          )
        );
      }
      return;
    }

    const deleteOption = localize("removeCategory.optionDelete", "Delete everything");
    const moveOption = localize(
      "removeCategory.optionMove",
      "Move contents to top level"
    );

    const choice = await vscode.window.showWarningMessage(
      localize(
        "removeCategory.chooseAction",
        'Category "{0}" contains nested items. What should be done?',
        label
      ),
      { modal: true },
      deleteOption,
      moveOption
    );

    if (!choice) {
      return;
    }

    delete containerRecord[container.key];

    try {
      if (choice === moveOption) {
        this.mergeCategoryIntoRoot(categoryNode);
        await this.persistChanges(
          localize(
            "removeCategory.moveSuccess",
            'Category "{0}" removed and contents moved to top level.',
            label
          )
        );
      } else {
        await this.persistChanges(
          localize("removeCategory.success", 'Category "{0}" removed.', label)
        );
      }
    } catch (err) {
      vscode.window.showErrorMessage(
        localize(
          "removeCategory.saveError",
          "Failed to remove category: {0}",
          (err as Error).message
        )
      );
    }
  }

  async removeProject(item?: ProjectTreeItem): Promise<void> {
    this.loadConfig();
    const reference = this.resolveProjectReference(item);
    if (!reference || !Array.isArray(reference.categoryNode.projects)) {
      return;
    }

    const categoryLabel = this.formatCategoryPath(reference.categoryPath);
    const confirmation = await vscode.window.showWarningMessage(
      localize(
        "removeProject.confirm",
        'Remove project "{0}" from "{1}"?',
        reference.project.label,
        categoryLabel
      ),
      { modal: true },
      localize("removeProject.confirmYes", "Remove")
    );

    if (confirmation !== localize("removeProject.confirmYes", "Remove")) {
      return;
    }

    reference.categoryNode.projects.splice(reference.index, 1);
    if (reference.categoryNode.projects.length === 0) {
      delete reference.categoryNode.projects;
    }

    try {
      await this.persistChanges(
        localize("removeProject.success", 'Project "{0}" removed.', reference.project.label)
      );
    } catch (err) {
      vscode.window.showErrorMessage(
        localize(
          "removeProject.saveError",
          "Failed to remove project: {0}",
          (err as Error).message
        )
      );
    }
  }

  dispose(): void {
    this.disposeWatcher();
  }

  public getConfigPath(): string {
    const storagePath = this.context.globalStorageUri.fsPath;

    if (!fs.existsSync(storagePath)) {
      fs.mkdirSync(storagePath, { recursive: true });
    }

    return path.join(storagePath, "projects.json");
  }

  private getConfigDirectory(): string {
    return path.dirname(this.getConfigPath());
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

  private getProjectIconId(project: Project): string | undefined {
    const icon = project.icon?.trim();
    return icon ? icon : undefined;
  }

  private getProjectResolvedPath(project: Project): string {
    const cached = this.resolvedPathCache.get(project);
    if (cached !== undefined) {
      return cached;
    }

    const resolved = this.resolveProjectPathValue(project.path);
    this.resolvedPathCache.set(project, resolved);
    return resolved;
  }

  private resolveProjectPathValue(rawPath: string): string {
    const input = rawPath?.trim();
    if (!input) {
      return "";
    }

    let expanded = input;
    const homeDir = os.homedir();

    if (expanded.startsWith("~")) {
      const remainder = expanded.slice(1);
      if (!remainder || remainder.startsWith("/") || remainder.startsWith("\\")) {
        const relativePart = remainder.replace(/^[\\/]/, "");
        expanded = path.join(homeDir, relativePart);
      }
    }

    if (!path.isAbsolute(expanded)) {
      const configDir = this.getConfigDirectory();
      expanded = path.resolve(configDir, expanded);
    }

    return path.normalize(expanded);
  }

  private formatPathForConfig(fullPath: string): string {
    const normalized = path.normalize(fullPath);
    const homeDir = path.normalize(os.homedir());

    const normalizedLower = normalized.toLowerCase();
    const homeLower = homeDir.toLowerCase();

    if (normalizedLower === homeLower) {
      return "~";
    }

    if (normalizedLower.startsWith(homeLower + path.sep)) {
      const relative = normalized.slice(homeDir.length + 1);
      return `~/${this.toPosixPath(relative)}`;
    }

    return this.toPosixPath(normalized);
  }

  private toPosixPath(value: string): string {
    return value.replace(/\\/g, "/");
  }

  private formatCategoryPath(pathSegments: CategoryPath): string {
    if (pathSegments.length === 0) {
      return localize("category.rootLabel", "Top level");
    }
    return pathSegments.join(" / ");
  }

  private async pickCategory(
    options: CategoryPickOptions
  ): Promise<CategorySelection | undefined> {
    const picks: CategoryPick[] = [];
    const categories = this.collectCategoryNodes();

    if (
      options.includeKeepCurrent &&
      options.currentPath
    ) {
      const currentNode = this.getCategoryNodeByPath(options.currentPath);
      if (currentNode) {
        picks.push({
          label:
            options.keepCurrentLabel ??
            this.formatCategoryPath(options.currentPath),
          description: localize("editProject.currentCategoryDescription", "Current category"),
          pathSegments: options.currentPath,
          node: currentNode
        });
      }
    }

    if (
      options.includeRootOption &&
      !(
        options.includeKeepCurrent &&
        options.currentPath &&
        this.pathsEqual(options.currentPath, [])
      )
    ) {
      picks.push({
        label: options.rootLabel ?? localize("category.rootLabel", "Top level"),
        description:
          options.rootDescription ??
          localize("category.rootDescription", "Create category at the root"),
        pathSegments: [],
        node: this.config
      });
    }

    for (const category of categories) {
      if (
        options.includeKeepCurrent &&
        options.currentPath &&
        this.pathsEqual(category.path, options.currentPath)
      ) {
        continue;
      }
      picks.push({
        label: this.formatCategoryPath(category.path),
        pathSegments: category.path,
        node: category.node
      });
    }

    if (options.allowCreate) {
      picks.push({
        label: localize("addProject.newCategory", "Create new category…"),
        description: localize("addProject.enterCategory", "Enter new category name"),
        createNew: true
      });
    }

    if (picks.length === 0) {
      return undefined;
    }

    const selection = await vscode.window.showQuickPick(picks, {
      placeHolder: options.placeholder
    });

    if (!selection) {
      return undefined;
    }

    if (selection.createNew) {
      return this.promptForNewCategory();
    }

    if (!selection.node || !selection.pathSegments) {
      return undefined;
    }

    return {
      node: selection.node,
      path: selection.pathSegments
    };
  }

  private async promptForNewCategory(): Promise<CategorySelection | undefined> {
    const categoryInput = await vscode.window.showInputBox({
      prompt: localize("addProject.enterCategory", "Enter new category name")
    });

    const trimmed = categoryInput?.trim();
    if (!trimmed) {
      return undefined;
    }

    const pathSegments = trimmed
      .split("/")
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);

    if (pathSegments.length === 0) {
      return undefined;
    }

    const node = this.getOrCreateCategoryNode(pathSegments);
    return { node, path: pathSegments };
  }

  private async pickParentCategoryPath(
    options: ParentCategoryPickOptions
  ): Promise<CategoryPath | undefined> {
    const picks: Array<vscode.QuickPickItem & { path: CategoryPath }> = [];

    if (options.currentParentPath) {
      picks.push({
        label:
          options.keepCurrentLabel ??
          this.formatCategoryPath(options.currentParentPath),
        description: localize(
          "renameCategory.currentParentDescription",
          "Current parent"
        ),
        path: options.currentParentPath
      });
    }

    const rootPick = {
      label: localize("category.rootLabel", "Top level"),
      description: localize(
        "category.rootDescription",
        "Create category at the root"
      ),
      path: [] as CategoryPath
    };

    if (
      !options.currentParentPath ||
      options.currentParentPath.length > 0
    ) {
      picks.push(rootPick);
    }

    const categories = this.collectCategoryNodes();
    for (const category of categories) {
      if (
        options.excludePath &&
        this.isSameOrDescendantPath(category.path, options.excludePath)
      ) {
        continue;
      }

      if (
        options.currentParentPath &&
        this.pathsEqual(category.path, options.currentParentPath)
      ) {
        continue;
      }

      picks.push({
        label: this.formatCategoryPath(category.path),
        path: category.path
      });
    }

    if (picks.length === 0) {
      return undefined;
    }

    const selection = await vscode.window.showQuickPick(picks, {
      placeHolder: options.placeholder
    });

    if (!selection) {
      return undefined;
    }

    return selection.path;
  }

  private normalizeCategorySegments(value: string): string[] {
    return value
      .split("/")
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);
  }

  private resolveCategoryPath(item?: ProjectTreeItem): CategoryPath | undefined {
    if (!item || item.nodeType !== "category") {
      vscode.window.showWarningMessage(
        localize(
          "category.selectCategory",
          "Select a category in the Project Tree first."
        )
      );
      return undefined;
    }

    if (item.categoryPath && item.categoryPath.length > 0) {
      return item.categoryPath;
    }

    if (item.label) {
      return [item.label];
    }

    return undefined;
  }

  private getCategoryContainer(path: CategoryPath): CategoryContainer | undefined {
    if (path.length === 0) {
      return undefined;
    }

    if (path.length === 1) {
      const key = path[0];
      if (!this.isPlainObject(this.config[key])) {
        return undefined;
      }
      return { container: this.config, key };
    }

    const parentPath = path.slice(0, -1);
    const parentNode = this.getCategoryNodeByPath(parentPath);
    if (!parentNode) {
      return undefined;
    }

    const key = path[path.length - 1];
    if (!this.isPlainObject(parentNode[key])) {
      return undefined;
    }

    return {
      container: parentNode,
      key
    };
  }

  private loadConfig(): void {
    const configPath = this.getConfigPath();
    this.validationIssues.clear();
    this.resolvedPathCache = new WeakMap();

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

  private collectCategoryNodes(): Array<{ path: CategoryPath; node: CategoryNode }> {
    const result: Array<{ path: CategoryPath; node: CategoryNode }> = [];

    for (const [name, value] of Object.entries(this.config)) {
      if (name === "projects") {
        continue;
      }
      if (this.isPlainObject(value)) {
        this.walkCategoryTree(value as CategoryNode, [name], result);
      }
    }

    return result;
  }

  private walkCategoryTree(
    node: CategoryNode,
    pathSegments: CategoryPath,
    bucket: Array<{ path: CategoryPath; node: CategoryNode }>
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
      if (name === "projects") {
        if (Array.isArray(value)) {
          result.projects = value.map((proj, index) =>
            this.normalizeProject(proj, this.buildProjectKey("__root__", index))
          );
        } else {
          this.recordIssue(
            "__root__.projects",
            localize(
              "error.projectsArray",
              "`projects` must be an array of projects."
            )
          );
        }
        continue;
      }

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
    const iconValue = project.icon;

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

    let resolvedIcon: string | undefined;
    if (iconValue !== undefined) {
      if (typeof iconValue === "string" && iconValue.trim()) {
        resolvedIcon = iconValue.trim();
      } else {
        this.recordIssue(
          `${pathKey}.icon`,
          localize("error.iconString", "`icon` must be a string with a codicon id.")
        );
      }
    }

    return {
      label:
        typeof labelValue === "string" && labelValue.trim()
          ? labelValue
          : localize("label.untitledProject", "Untitled"),
      path:
        typeof pathValue === "string" && pathValue.trim()
          ? pathValue
          : "",
      icon: resolvedIcon
    };
  }

  private mergeCategoryIntoRoot(source: CategoryNode): void {
    const root = this.config;

    if (Array.isArray(source.projects) && source.projects.length > 0) {
      if (!Array.isArray(root.projects)) {
        root.projects = [];
      }
      root.projects.push(...source.projects);
    }

    for (const [key, value] of Object.entries(source)) {
      if (key === "projects") {
        continue;
      }

      if (this.isPlainObject(value)) {
        const existing = root[key];
        if (this.isPlainObject(existing)) {
          this.mergeCategoryNodes(existing as CategoryNode, value as CategoryNode);
        } else {
          root[key] = value as CategoryNode;
        }
      } else {
        root[key] = value;
      }
    }
  }

  private mergeCategoryNodes(target: CategoryNode, source: CategoryNode): CategoryNode {
    if (Array.isArray(source.projects) && source.projects.length > 0) {
      if (!Array.isArray(target.projects)) {
        target.projects = [];
      }
      target.projects.push(...source.projects);
    }

    for (const [key, value] of Object.entries(source)) {
      if (key === "projects") {
        continue;
      }

      if (this.isPlainObject(value)) {
        const existing = target[key];
        if (this.isPlainObject(existing)) {
          this.mergeCategoryNodes(existing as CategoryNode, value as CategoryNode);
        } else {
          target[key] = value as CategoryNode;
        }
      } else {
        target[key] = value;
      }
    }

    return target;
  }

  private categoryHasContent(node: CategoryNode): boolean {
    if (Array.isArray(node.projects) && node.projects.length > 0) {
      return true;
    }

    for (const [key, value] of Object.entries(node)) {
      if (key === "projects") {
        continue;
      }
      if (this.isPlainObject(value)) {
        return true;
      }
    }

    return false;
  }

  private getCategoryNodeByPath(pathSegments?: CategoryPath): CategoryNode | undefined {
    if (!pathSegments) {
      return undefined;
    }

    if (pathSegments.length === 0) {
      return this.config;
    }

    const [first, ...rest] = pathSegments;
    const rootValue = this.config[first];
    if (!this.isPlainObject(rootValue)) {
      return undefined;
    }

    let current: CategoryNode = rootValue as CategoryNode;
    for (const segment of rest) {
      const next = current[segment];
      if (!this.isPlainObject(next)) {
        return undefined;
      }
      current = next as CategoryNode;
    }

    return current;
  }

  private getOrCreateCategoryNode(pathSegments: CategoryPath): CategoryNode {
    if (pathSegments.length === 0) {
      return this.config;
    }

    const [first, ...rest] = pathSegments;
    let current: CategoryNode;

    if (this.isPlainObject(this.config[first])) {
      current = this.config[first];
    } else {
      current = {};
      this.config[first] = current;
    }

    for (const segment of rest) {
      const existing = current[segment];
      if (this.isPlainObject(existing)) {
        current = existing as CategoryNode;
      } else {
        const newNode: CategoryNode = {};
        current[segment] = newNode;
        current = newNode;
      }
    }

    return current;
  }

  private resolveProjectReference(
    item: ProjectTreeItem | undefined
  ): ProjectReference | undefined {
    if (!item || item.nodeType !== "project") {
      vscode.window.showWarningMessage(
        localize("project.selectProject", "Select a project in the Project Tree first.")
      );
      return undefined;
    }

    const parsed = this.parseProjectConfigPath(item.configPath);
    const categoryPath = parsed?.path ?? item.categoryPath;
    const index = parsed?.index ?? item.projectIndex;

    if (!categoryPath || index === undefined) {
      vscode.window.showErrorMessage(
        localize("error.projectMissing", "Project entry could not be found in config.")
      );
      return undefined;
    }

    const targetNode = this.getCategoryNodeByPath(categoryPath);
    if (!targetNode || !Array.isArray(targetNode.projects)) {
      vscode.window.showErrorMessage(
        localize("error.projectMissing", "Project entry could not be found in config.")
      );
      return undefined;
    }

    if (index < 0 || index >= targetNode.projects.length) {
      vscode.window.showErrorMessage(
        localize("error.projectMissing", "Project entry could not be found in config.")
      );
      return undefined;
    }

    return {
      categoryNode: targetNode,
      categoryPath,
      index,
      project: targetNode.projects[index]
    };
  }

  private parseProjectConfigPath(
    configPath: string | undefined
  ): { path: CategoryPath; index: number } | undefined {
    if (!configPath) {
      return undefined;
    }

    const match = /(.*)\.projects\[(\d+)\]$/.exec(configPath);
    if (!match) {
      return undefined;
    }

    const [, categoryPart, indexPart] = match;
    const index = Number(indexPart);
    if (Number.isNaN(index)) {
      return undefined;
    }

    const pathSegments = categoryPart
      .split(".")
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);

    if (pathSegments.length === 0) {
      return undefined;
    }

    if (pathSegments.length === 1 && pathSegments[0] === "__root__") {
      return { path: [], index };
    }

    return { path: pathSegments, index };
  }

  private pathsEqual(a?: CategoryPath, b?: CategoryPath): boolean {
    if (!a || !b) {
      return false;
    }

    if (a.length !== b.length) {
      return false;
    }

    return a.every((segment, index) => segment === b[index]);
  }

  private isSameOrDescendantPath(
    path: CategoryPath,
    ancestor: CategoryPath
  ): boolean {
    if (ancestor.length === 0) {
      return false;
    }

    if (path.length < ancestor.length) {
      return false;
    }

    return ancestor.every((segment, index) => path[index] === segment);
  }

  private normalizePathInput(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      return "";
    }

    if (trimmed.startsWith("~")) {
      const remainder = trimmed.slice(1).replace(/^[\\/]/, "");
      const absolute = path.join(os.homedir(), remainder);
      return this.formatPathForConfig(absolute);
    }

    if (path.isAbsolute(trimmed)) {
      return this.formatPathForConfig(trimmed);
    }

    const configDir = this.getConfigDirectory();
    const resolved = path.resolve(configDir, trimmed);
    return this.formatPathForConfig(resolved);
  }

  private async persistChanges(successMessage?: string): Promise<void> {
    await this.saveConfigToDisk();
    this.loadConfig();
    this.setupWatcher();
    this._onDidChangeTreeData.fire();
    if (successMessage) {
      vscode.window.showInformationMessage(successMessage);
    }
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
    const fileExists = fs.existsSync(configPath);
    const targetPath = fileExists ? configPath : path.dirname(configPath);
    const watchType = fileExists ? "file" : "dir";

    try {
      this.disposeWatcher();
      this.watcher = fs.watch(targetPath, { persistent: false }, (_, filename) => {
        if (watchType === "dir") {
          if (!filename || filename !== path.basename(configPath)) {
            return;
          }
          if (fs.existsSync(configPath)) {
            this.scheduleWatcherRestart();
          }
        } else {
          if (!fs.existsSync(configPath)) {
            this.scheduleWatcherRestart();
          }
        }
        this.scheduleConfigReload();
      });

      this.watcher.on("error", (err) => {
        console.error("ProjectTree watcher error:", err);
        this.scheduleWatcherRestart();
      });
    } catch (err) {
      console.error("ProjectTree watcher setup error:", err);
      this.scheduleWatcherRestart();
    }
  }

  private scheduleConfigReload(): void {
    if (this.watcherDebounce) {
      clearTimeout(this.watcherDebounce);
    }

    this.watcherDebounce = setTimeout(() => {
      this.watcherDebounce = undefined;
      this.loadConfig();
      this._onDidChangeTreeData.fire();
    }, 200);
  }

  private scheduleWatcherRestart(): void {
    this.disposeWatcher();
    if (this.watcherRetryTimeout) {
      return;
    }

    this.watcherRetryTimeout = setTimeout(() => {
      this.watcherRetryTimeout = undefined;
      this.setupWatcher();
    }, 1000);
  }

  private disposeWatcher(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = undefined;
    }
    if (this.watcherDebounce) {
      clearTimeout(this.watcherDebounce);
      this.watcherDebounce = undefined;
    }
    if (this.watcherRetryTimeout) {
      clearTimeout(this.watcherRetryTimeout);
      this.watcherRetryTimeout = undefined;
    }
  }
}
