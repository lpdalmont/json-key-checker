import * as vscode from "vscode";
import { flattenJsonKeys } from "./utils";
export class JsonKeyReferenceProvider implements vscode.DefinitionProvider {
  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Definition | undefined> {
    const config = vscode.workspace.getConfiguration("jsonKeyChecker");
    const patterns = config.get<any[]>("patterns", []);

    if (patterns.length === 0) return undefined;

    // Get the key at cursor position in JSON
    const key = this.getKeyAtPosition(document, position);
    if (!key) return undefined;

    // Find which pattern this JSON file belongs to
    const matchingPattern = patterns.find((pattern) =>
      pattern.jsonFiles.some((jsonFile: string) =>
        document.fileName.endsWith(jsonFile)
      )
    );

    if (!matchingPattern) return undefined;

    // Find all references to this key
    return await this.findKeyReferences(key, matchingPattern);
  }

  private getKeyAtPosition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): string | undefined {
    const line = document.lineAt(position).text;

    // Check if cursor is on a key (before the colon)
    const keyMatch = line.match(/"([^"]+)"\s*:/);
    if (keyMatch) {
      const keyStart = line.indexOf(`"${keyMatch[1]}"`);
      const keyEnd = keyStart + keyMatch[1].length + 2;

      if (position.character >= keyStart && position.character <= keyEnd) {
        // Need to construct full nested key path
        return this.getFullKeyPath(document, position, keyMatch[1]);
      }
    }

    return undefined;
  }

  private getFullKeyPath(
    document: vscode.TextDocument,
    position: vscode.Position,
    leafKey: string
  ): string {
    const text = document.getText();
    const currentOffset = document.offsetAt(position);

    // Parse JSON to find the full path to this key
    try {
      const jsonData = JSON.parse(text);
      const flatKeys = Array.from(flattenJsonKeys(jsonData));

      // Find the key that ends with our leaf key and is closest to cursor position
      const matchingKeys = flatKeys.filter((key) => {
        const parts = key.split(".");
        return parts[parts.length - 1] === leafKey;
      });

      // For now, return the first match (could be improved with better position matching)
      return matchingKeys[0] || leafKey;
    } catch (error) {
      return leafKey;
    }
  }

  private async findKeyReferences(
    key: string,
    pattern: any
  ): Promise<vscode.Location[]> {
    const locations: vscode.Location[] = [];

    // Build search patterns based on scan folders
    const searchPatterns =
      pattern.scanFolders && pattern.scanFolders.length > 0
        ? pattern.scanFolders.map(
            (folder: string) =>
              `${folder}**/*.{${pattern.fileExtensions.join(",")}}`
          )
        : [`**/*.{${pattern.fileExtensions.join(",")}}`];

    const allFiles: vscode.Uri[] = [];
    for (const searchPattern of searchPatterns) {
      const files = await vscode.workspace.findFiles(
        searchPattern,
        "**/node_modules/**"
      );
      allFiles.push(...files);
    }

    // Remove duplicates
    const uniqueFiles = Array.from(new Set(allFiles.map((f) => f.fsPath))).map(
      (path) => vscode.Uri.file(path)
    );

    // Search for the key in all files
    for (const file of uniqueFiles) {
      try {
        const document = await vscode.workspace.openTextDocument(file);
        const text = document.getText();

        for (const methodPattern of pattern.methodPatterns) {
          const regex = new RegExp(
            methodPattern +
              `\\s*\\(\\s*(['"])${key.replace(
                /[.*+?^${}()|[\]\\]/g,
                "\\$&"
              )}\\1\\s*\\)`,
            "g"
          );

          let match;
          while ((match = regex.exec(text)) !== null) {
            const startPos = document.positionAt(match.index);
            const endPos = document.positionAt(match.index + match[0].length);
            locations.push(
              new vscode.Location(file, new vscode.Range(startPos, endPos))
            );
          }
        }
      } catch (error) {
        // Skip files that can't be read
      }
    }

    return locations;
  }
}
