import * as vscode from "vscode";

type Locale = "en" | "ru";

type Messages = Record<string, string>;

const fallbackLocale: Locale = "en";

const dictionaries: Record<Locale, Messages> = {
  en: {
    "tree.configError": "Config error",
    "warning.configIssues": "Project Tree: there are errors in projects.json",
    "action.editConfig": "Edit Config",
    "error.configRead": "Project Tree: failed to read config: {0}",
    "error.configShape": "projects.json must be an object with categories.",
    "error.categoryShape": "Category must be an object with nested projects.",
    "error.projectsArray": "`projects` must be an array of projects.",
    "error.projectShape": "Project entry must be an object.",
    "error.labelRequired": "`label` is required and must be a string.",
    "error.pathRequired": "`path` is required and must be a string.",
    "label.invalidProject": "Invalid project",
    "label.untitledProject": "Untitled",
    "addProject.pickFolder": "Select project folder",
    "addProject.enterLabel": "Enter project name",
    "addProject.chooseCategory": "Select category",
    "addProject.newCategory": "Create new category…",
    "addProject.enterCategory": "Enter new category name",
    "addProject.success": "Project \"{0}\" added to \"{1}\".",
    "addProject.saveError": "Failed to save projects.json: {0}"
  },
  ru: {
    "tree.configError": "Ошибка конфигурации",
    "warning.configIssues": "Project Tree: обнаружены ошибки в projects.json",
    "action.editConfig": "Изменить конфиг",
    "error.configRead": "Project Tree: не удалось прочитать конфиг: {0}",
    "error.configShape": "projects.json должен быть объектом с категориями.",
    "error.categoryShape":
      "Категория должна быть объектом с вложенными проектами.",
    "error.projectsArray": "`projects` должно быть массивом проектов.",
    "error.projectShape": "Проект должен быть объектом.",
    "error.labelRequired": "Поле `label` обязательно и должно быть строкой.",
    "error.pathRequired": "Поле `path` обязательно и должно быть строкой.",
    "label.invalidProject": "Некорректный проект",
    "label.untitledProject": "Без названия",
    "addProject.pickFolder": "Выберите папку проекта",
    "addProject.enterLabel": "Введите название проекта",
    "addProject.chooseCategory": "Выберите категорию",
    "addProject.newCategory": "Создать новую категорию…",
    "addProject.enterCategory": "Введите название категории",
    "addProject.success": "Проект «{0}» добавлен в «{1}».",
    "addProject.saveError": "Не удалось сохранить projects.json: {0}"
  }
};

const resolvedLocale = resolveLocale();

export function localize(
  key: string,
  defaultValue: string,
  ...args: Array<string | number>
): string {
  const template =
    dictionaries[resolvedLocale][key] ??
    dictionaries[fallbackLocale][key] ??
    defaultValue;

  return format(template, args);
}

function resolveLocale(): Locale {
  const language = vscode.env.language?.toLowerCase() ?? fallbackLocale;
  if (isLocale(language)) {
    return language;
  }

  const short = language.split("-")[0];
  if (isLocale(short)) {
    return short;
  }

  return fallbackLocale;
}

function isLocale(value: string): value is Locale {
  return value === "en" || value === "ru";
}

function format(value: string, args: Array<string | number>): string {
  return value.replace(/\{(\d+)\}/g, (match, index) => {
    const argIndex = Number(index);
    const arg =
      Number.isNaN(argIndex) || argIndex >= args.length
        ? undefined
        : args[argIndex];
    return arg !== undefined ? String(arg) : match;
  });
}
