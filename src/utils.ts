import * as vscode from "vscode";

export function flattenJsonKeys(obj: any, prefix: string = ""): Set<string> {
  const keys = new Set<string>();

  for (const key in obj) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (
      typeof obj[key] === "object" &&
      obj[key] !== null &&
      !Array.isArray(obj[key])
    ) {
      keys.add(fullKey);
      const childKeys = flattenJsonKeys(obj[key], fullKey);
      childKeys.forEach((childKey) => keys.add(childKey));
    } else {
      keys.add(fullKey);
    }
  }

  return keys;
}

export async function loadJsonFiles(
  jsonFilePatterns: string[]
): Promise<Map<string, Set<string>>> {
  const jsonData = new Map<string, Set<string>>();

  for (const pattern of jsonFilePatterns) {
    try {
      if (pattern.includes("*")) {
        const files = await vscode.workspace.findFiles(pattern);
        for (const file of files) {
          const content = await vscode.workspace.fs.readFile(file);
          const data = JSON.parse(content.toString());
          const flatKeys = flattenJsonKeys(data);
          jsonData.set(file.fsPath, flatKeys);
        }
      } else {
        const files = await vscode.workspace.findFiles(`**/${pattern}`);
        for (const file of files) {
          const content = await vscode.workspace.fs.readFile(file);
          const data = JSON.parse(content.toString());
          const flatKeys = flattenJsonKeys(data);
          jsonData.set(file.fsPath, flatKeys);
        }
      }
    } catch (error) {
      console.warn(`Failed to load JSON files for pattern ${pattern}:`, error);
    }
  }

  return jsonData;
}
