import * as assert from "assert";
import { promises as fs } from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { ProjectTreeDataProvider, ProjectTreeItem, Project } from "../../projectTree";

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
    callback: (provider: ProjectTreeDataProvider) => Promise<void>
  ): Promise<void> {
    const { provider, storageDir } = await createProvider();
    try {
      await callback(provider);
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
});
