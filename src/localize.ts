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
    "error.iconString": "`icon` must be a string with a codicon id.",
    "addProject.pickFolder": "Select project folder",
    "addProject.enterLabel": "Enter project name",
    "addProject.chooseCategory": "Select category",
    "addProject.newCategory": "Create new category…",
    "addProject.enterCategory": "Enter new category name",
    "addProject.success": "Project \"{0}\" added to \"{1}\".",
    "addProject.saveError": "Failed to save projects.json: {0}",
    "project.tooltip.originalPath": "Config path: {0}",
    "project.tooltip.resolvedPath": "Resolved path: {0}",
    "project.command.openHereTitle": "Open Project (Current Window)",
    "addCategory.enterName": "Enter category name",
    "addCategory.nameValidation": "Category name cannot be empty.",
    "addCategory.duplicate": "Category \"{0}\" already exists.",
    "addCategory.chooseParent": "Select parent category",
    "addCategory.success": "Category \"{0}\" created.",
    "addCategory.saveError": "Failed to add category: {0}",
    "category.rootLabel": "Top level",
    "category.rootDescription": "Create category at the root",
    "category.selectCategory": "Select a category in the Project Tree first.",
    "renameCategory.enterName": "Enter new category name",
    "renameCategory.nameValidation": "Category name cannot be empty.",
    "renameCategory.invalidCharacters": "Category name cannot contain '/'.",
    "renameCategory.chooseParent": "Select new parent category",
    "renameCategory.keepParent": "Keep current parent ({0})",
    "renameCategory.currentParentDescription": "Current parent",
    "renameCategory.duplicate": "Category \"{0}\" already exists.",
    "renameCategory.success": "Category moved to \"{0}\".",
    "renameCategory.saveError": "Failed to rename category: {0}",
    "removeCategory.confirm": "Remove category \"{0}\" and all nested items?",
    "removeCategory.confirmYes": "Remove",
    "removeCategory.confirmNo": "Cancel",
    "removeCategory.optionDelete": "Delete everything",
    "removeCategory.optionMove": "Move contents to top level",
    "removeCategory.chooseAction": "Category \"{0}\" contains nested items. What should be done?",
    "removeCategory.moveSuccess": "Category \"{0}\" removed and contents moved to top level.",
    "removeCategory.success": "Category \"{0}\" removed.",
    "removeCategory.saveError": "Failed to remove category: {0}",
    "error.categoryMissing": "Category entry could not be found in config.",
    "editProject.enterLabel": "Update project name",
    "editProject.labelValidation": "Project name cannot be empty.",
    "editProject.enterPath": "Update project path",
    "editProject.pathValidation": "Project path cannot be empty.",
    "editProject.enterIcon": "Enter codicon id (optional, leave empty to clear)",
    "editProject.keepCategory": "Keep current category ({0})",
    "editProject.chooseCategory": "Select target category",
    "editProject.currentCategoryDescription": "Current category",
    "editProject.success": "Project \"{0}\" updated.",
    "editProject.saveError": "Failed to update project: {0}",
    "removeProject.confirm": "Remove project \"{0}\" from \"{1}\"?",
    "removeProject.confirmYes": "Remove",
    "removeProject.confirmNo": "Cancel",
    "removeProject.success": "Project \"{0}\" removed.",
    "removeProject.saveError": "Failed to remove project: {0}",
    "project.selectProject": "Select a project in the Project Tree first.",
    "error.projectMissing": "Project entry could not be found in config."
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
    "error.iconString": "Поле `icon` должно быть строкой с идентификатором codicon.",
    "addProject.pickFolder": "Выберите папку проекта",
    "addProject.enterLabel": "Введите название проекта",
    "addProject.chooseCategory": "Выберите категорию",
    "addProject.newCategory": "Создать новую категорию…",
    "addProject.enterCategory": "Введите название категории",
    "addProject.success": "Проект «{0}» добавлен в «{1}».",
    "addProject.saveError": "Не удалось сохранить projects.json: {0}",
    "project.tooltip.originalPath": "Путь в конфиге: {0}",
    "project.tooltip.resolvedPath": "Абсолютный путь: {0}",
    "project.command.openHereTitle": "Открыть проект (текущее окно)",
    "addCategory.enterName": "Введите название категории",
    "addCategory.nameValidation": "Название категории не может быть пустым.",
    "addCategory.duplicate": "Категория «{0}» уже существует.",
    "addCategory.chooseParent": "Выберите родительскую категорию",
    "addCategory.success": "Категория «{0}» создана.",
    "addCategory.saveError": "Не удалось добавить категорию: {0}",
    "category.rootLabel": "Корень",
    "category.rootDescription": "Создать категорию в корне",
    "category.selectCategory": "Сначала выберите категорию в дереве.",
    "renameCategory.enterName": "Введите новое название категории",
    "renameCategory.nameValidation": "Название категории не может быть пустым.",
    "renameCategory.invalidCharacters": "Название категории не должно содержать «/».",
    "renameCategory.chooseParent": "Выберите новую родительскую категорию",
    "renameCategory.keepParent": "Оставить текущего родителя ({0})",
    "renameCategory.currentParentDescription": "Текущий родитель",
    "renameCategory.duplicate": "Категория «{0}» уже существует.",
    "renameCategory.success": "Категория перемещена в «{0}».",
    "renameCategory.saveError": "Не удалось переименовать категорию: {0}",
    "removeCategory.confirm": "Удалить категорию «{0}» и всё её содержимое?",
    "removeCategory.confirmYes": "Удалить",
    "removeCategory.confirmNo": "Отмена",
    "removeCategory.optionDelete": "Удалить всё",
    "removeCategory.optionMove": "Перенести содержимое в корень",
    "removeCategory.chooseAction": "Категория «{0}» содержит вложенные элементы. Что сделать?",
    "removeCategory.moveSuccess": "Категория «{0}» удалена, содержимое перенесено в корень.",
    "removeCategory.success": "Категория «{0}» удалена.",
    "removeCategory.saveError": "Не удалось удалить категорию: {0}",
    "error.categoryMissing": "Не удалось найти категорию в конфиге.",
    "editProject.enterLabel": "Измените название проекта",
    "editProject.labelValidation": "Название проекта не может быть пустым.",
    "editProject.enterPath": "Измените путь проекта",
    "editProject.pathValidation": "Путь проекта не может быть пустым.",
    "editProject.enterIcon": "Укажите codicon (опционально, оставьте пустым чтобы очистить)",
    "editProject.keepCategory": "Оставить категорию «{0}»",
    "editProject.chooseCategory": "Выберите категорию",
    "editProject.currentCategoryDescription": "Текущая категория",
    "editProject.success": "Проект «{0}» обновлён.",
    "editProject.saveError": "Не удалось обновить проект: {0}",
    "removeProject.confirm": "Удалить проект «{0}» из «{1}»?",
    "removeProject.confirmYes": "Удалить",
    "removeProject.confirmNo": "Отмена",
    "removeProject.success": "Проект «{0}» удалён.",
    "removeProject.saveError": "Не удалось удалить проект: {0}",
    "project.selectProject": "Сначала выберите проект в дереве.",
    "error.projectMissing": "Не удалось найти проект в конфиге."
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
