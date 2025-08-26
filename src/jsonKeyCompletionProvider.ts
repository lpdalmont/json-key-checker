import * as vscode from "vscode";
import { loadJsonFiles } from "./utils";

export class JsonKeyCompletionProvider
  implements vscode.CompletionItemProvider
{
  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): Promise<vscode.CompletionItem[]> {
    const lineText = document.lineAt(position).text;
    const beforeCursor = lineText.substring(0, position.character);
    const afterCursor = lineText.substring(position.character);

    const config = vscode.workspace.getConfiguration("jsonKeyChecker");
    const patterns = config.get<any[]>("patterns", []);

    if (patterns.length === 0) {
      return [];
    }

    for (const pattern of patterns) {
      for (const methodPattern of pattern.methodPatterns) {
        // Match method("partialKey...
        const beforeRegex = new RegExp(
          methodPattern + `\\s*\\(\\s*['"]([^'"]*)$`
        );
        const beforeMatch = beforeCursor.match(beforeRegex);

        if (beforeMatch) {
          // We are inside quotes → always suggest
          const partialKey = beforeMatch[1] || "";
          return await this.getCompletionItems(pattern, partialKey);
        }
      }
    }

    return [];
  }

  private async getCompletionItems(
    pattern: any,
    partialKey: string
  ): Promise<vscode.CompletionItem[]> {
    try {
      const jsonData = await loadJsonFiles(pattern.jsonFiles);
      const allKeys = new Set<string>();

      jsonData.forEach((keySet) => {
        keySet.forEach((key) => allKeys.add(key));
      });

      // --- Top-level case (no dot in partialKey)
      if (!partialKey.includes(".")) {
        const topLevelKeys = Array.from(allKeys)
          .filter((key) => !key.includes(".")) // only top-level keys
          .filter((key) =>
            key.toLowerCase().startsWith(partialKey.toLowerCase())
          );

        return topLevelKeys.map((key) => {
          const item = new vscode.CompletionItem(
            key,
            vscode.CompletionItemKind.Property
          );
          item.detail = "JSON Key";
          item.documentation = "Top-level key from JSON";
          item.insertText = key;
          return item;
        });
      }

      // --- Nested case (partialKey contains a dot)
      const lastDotIndex = partialKey.lastIndexOf(".");
      const parentPath = partialKey.substring(0, lastDotIndex);
      const childPrefix = partialKey.substring(lastDotIndex + 1);

      const childKeys = Array.from(allKeys)
        .filter((key) => key.startsWith(parentPath + "."))
        .map((key) => key.substring(parentPath.length + 1))
        .filter((key) => !key.includes(".")) // only direct children
        .filter((key) =>
          key.toLowerCase().startsWith(childPrefix.toLowerCase())
        );

      return childKeys.map((childKey) => {
        const item = new vscode.CompletionItem(
          childKey,
          vscode.CompletionItemKind.Property
        );
        item.detail = "JSON Key";
        item.documentation = `Child key of ${parentPath}`;
        item.insertText = childKey;
        return item;
      });
    } catch (error) {
      console.error("Error generating completion items:", error);
      return [];
    }
  }
}
