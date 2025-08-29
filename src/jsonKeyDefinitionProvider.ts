import * as vscode from "vscode";
import { loadJsonFiles } from "./utils";

export class JsonKeyDefinitionProvider implements vscode.DefinitionProvider {
  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Definition | undefined> {
    const config = vscode.workspace.getConfiguration("jsonKeyChecker");
    const patterns = config.get<any[]>("patterns", []);

    if (patterns.length === 0) return undefined;

    // Get the word at cursor position
    const range = document.getWordRangeAtPosition(position);
    if (!range) return undefined;

    // Get the line to check if we're in a method call
    const line = document.lineAt(position.line).text;

    // Check if cursor is on a string within a method call
    for (const pattern of patterns) {
      for (const methodPattern of pattern.methodPatterns) {
        const regex = new RegExp(
          methodPattern + `\\s*\\(\\s*(['"])([^'"]+)\\1\\s*\\)`,
          "g"
        );

        let match;
        while ((match = regex.exec(line)) !== null) {
          const key = match[2];
          const keyStartInLine =
            match.index + match[0].indexOf(match[1] + key) + 1;
          const keyEndInLine = keyStartInLine + key.length;

          // Check if cursor is on this key
          if (
            position.character >= keyStartInLine &&
            position.character <= keyEndInLine
          ) {
            return await this.findKeyDefinition(key, pattern);
          }
        }
      }
    }

    return undefined;
  }

  private async findKeyDefinition(
    key: string,
    pattern: any
  ): Promise<vscode.Location | undefined> {
    // Load JSON files to find the key
    const jsonData = await loadJsonFiles(pattern.jsonFiles);

    for (const [filePath, keySet] of jsonData) {
      if (keySet.has(key)) {
        // Find the exact location in the JSON file
        const uri = vscode.Uri.file(filePath);
        const document = await vscode.workspace.openTextDocument(uri);
        const text = document.getText();

        // Find the key in the JSON file
        const keyLocation = this.findKeyLocationInJson(text, key);
        if (keyLocation) {
          return new vscode.Location(uri, keyLocation);
        }
      }
    }

    return undefined;
  }

  private findKeyLocationInJson(
    jsonText: string,
    targetKey: string
  ): vscode.Range | undefined {
    const lines = jsonText.split("\n");

    // Handle nested keys like "user.name"
    if (targetKey.includes(".")) {
      const keyParts = targetKey.split(".");
      const leafKey = keyParts[keyParts.length - 1];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const keyMatch = line.match(new RegExp(`"(${leafKey})"\\s*:`));
        if (keyMatch) {
          const startIndex = line.indexOf(`"${leafKey}"`);
          const endIndex = startIndex + leafKey.length + 2;

          return new vscode.Range(
            new vscode.Position(i, startIndex),
            new vscode.Position(i, endIndex)
          );
        }
      }
    } else {
      // Handle top-level keys
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const keyMatch = line.match(new RegExp(`"(${targetKey})"\\s*:`));
        if (keyMatch) {
          const startIndex = line.indexOf(`"${targetKey}"`);
          const endIndex = startIndex + targetKey.length + 2;

          return new vscode.Range(
            new vscode.Position(i, startIndex),
            new vscode.Position(i, endIndex)
          );
        }
      }
    }

    return undefined;
  }
}
