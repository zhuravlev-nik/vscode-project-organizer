import * as assert from "assert";
import { promises as fs } from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { ProjectTreeDataProvider, ProjectTreeItem, Project, RootConfig } from "../../projectTree";

suite("ProjectTreeDataProvider", () => {
  async function createProvider(): Promise<{
    provider: ProjectTreeDataProvider;
    storageDir: string;
  }> {
    const storageDir = await fs.mkdtemp(path.join(os.tmpdir(), "project-tree-tests-"));
    const context = {
      globalStorageUri: vscode.Uri.file(storageDir)
    } as unknown as vscode.ExtensionContext;

    const provider = new ProjectTreeDataProvider(context);
    const loadPromise: Promise<void> | undefined = (provider as unknown as { loadConfigPromise?: Promise<void> }).loadConfigPromise;
    if (loadPromise) {
      await loadPromise;
    }

    return { provider, storageDir };
  }

  async function withProvider(
    callback: (provider: ProjectTreeDataProvider, storageDir: string) => Promise<void>
  ): Promise<void> {
    const { provider, storageDir } = await createProvider();
    try {
      await callback(provider, storageDir);
    } finally {
      provider.dispose();
      await fs.rm(storageDir, { recursive: true, force: true });
    }
  }

  test("resolveProjectReference handles dotted category names", async () => {
    await withProvider(async (provider) => {
      const project: Project = {
        label: "Client Portal",
        path: path.join(os.tmpdir(), "client-portal")
      };

      (provider as unknown as { config: unknown }).config = {
        categories: {
          "Client.App": {
            categories: {},
            projects: [project]
          }
        }
      };

      const item = new ProjectTreeItem(
        project.label,
        vscode.TreeItemCollapsibleState.None,
        "project",
        project.path,
        project.path,
        undefined,
        undefined,
        "Client.App.projects[0]",
        [],
        ["Client.App"],
        project,
        0
      );

      const reference = (provider as unknown as {
        resolveProjectReference(item: ProjectTreeItem): ReturnType<ProjectTreeDataProvider["resolveProjectReference"]>;
      }).resolveProjectReference(item);

      assert.ok(reference);
      assert.deepStrictEqual(reference?.categoryPath, ["Client.App"]);
      assert.strictEqual(reference?.project.label, "Client Portal");
    });
  });

  test("formatPathForConfig collapses home-relative paths", async () => {
    await withProvider(async (provider) => {
      const homeChild = path.join(os.homedir(), "projects", "demo");
      const formatted = (provider as unknown as {
        formatPathForConfig(value: string): string;
      }).formatPathForConfig(homeChild);

      assert.strictEqual(formatted, "~/projects/demo");
    });
  });

  test("parseProjectConfigPath resolves root-level entries", async () => {
    await withProvider(async (provider) => {
      const parsed = (provider as unknown as {
        parseProjectConfigPath(configPath: string): { path: string[]; index: number } | undefined;
      }).parseProjectConfigPath("__root__.projects[2]");

      assert.ok(parsed);
      assert.strictEqual(parsed?.index, 2);
      assert.deepStrictEqual(parsed?.path, []);
    });
  });

  test("validateAndNormalizeConfig builds nested nodes and records issues", async () => {
    await withProvider(async (provider) => {
      const rawConfig = {
        projects: [{ label: "Umbrella", path: "/tmp/umbrella" }],
        Work: {
          projects: [
            { label: "CLI", path: "/tmp/cli" },
            { label: "", path: "" }
          ],
          Personal: {
            projects: [{ label: "Side Quest", path: "/tmp/side" }]
          }
        }
      };

      const normalized = (provider as unknown as {
        validateAndNormalizeConfig(value: unknown): RootConfig;
      }).validateAndNormalizeConfig(rawConfig);

      assert.ok(normalized.projects);
      assert.strictEqual(normalized.projects?.length, 1);
      const workNode = normalized.categories.Work;
      assert.ok(workNode);
      assert.strictEqual(workNode.projects?.length, 2);
      assert.ok(workNode.categories.Personal);
      assert.strictEqual(workNode.categories.Personal.projects?.length, 1);

      const issues: Map<string, string[]> = (provider as unknown as { validationIssues: Map<string, string[]> }).validationIssues;
      assert.ok(issues.get("Work.projects[1].label"));
      assert.ok(issues.get("Work.projects[1].path"));
    });
  });

  test("getChildren returns categories and projects for each level", async () => {
    await withProvider(async (provider) => {
      (provider as unknown as { config: RootConfig }).config = {
        categories: {
          Work: {
            categories: {
              Client: {
                categories: {},
                projects: [
                  { label: "Client Portal", path: "/tmp/client-portal" }
                ]
              }
            },
            projects: [{ label: "Tooling", path: "/tmp/tooling" }]
          }
        },
        projects: [{ label: "Root App", path: "/tmp/root-app" }]
      };

      const roots = await provider.getChildren();
      const workCategory = roots.find((item) => item.label === "Work");
      const rootProject = roots.find((item) => item.label === "Root App");

      assert.ok(workCategory);
      assert.strictEqual(workCategory?.nodeType, "category");
      assert.ok(rootProject);
      assert.strictEqual(rootProject?.nodeType, "project");

      const workChildren = await provider.getChildren(workCategory);
      const toolProject = workChildren.find((item) => item.label === "Tooling");
      const clientCategory = workChildren.find((item) => item.label === "Client");

      assert.ok(toolProject);
      assert.strictEqual(toolProject?.nodeType, "project");
      assert.ok(clientCategory);
      assert.strictEqual(clientCategory?.nodeType, "category");

      const clientChildren = await provider.getChildren(clientCategory);
      assert.strictEqual(clientChildren.length, 1);
      assert.strictEqual(clientChildren[0]?.label, "Client Portal");
    });
  });

  test("resolveAbsolutePath resolves relative input against config directory", async () => {
    await withProvider(async (provider, storageDir) => {
      const resolved = (provider as unknown as {
        resolveAbsolutePath(input: string): string;
      }).resolveAbsolutePath("relative/project");

      assert.strictEqual(resolved, path.join(storageDir, "relative", "project"));
    });
  });
});
