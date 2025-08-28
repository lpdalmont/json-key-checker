import * as vscode from "vscode";
import { flattenJsonKeys, loadJsonFiles } from "./utils";
import { JsonKeyCompletionProvider } from "./jsonKeyCompletionProvider";
export function activate(context: vscode.ExtensionContext) {
  console.log("JSON Key Checker extension is now active!");

  const disposable = vscode.commands.registerCommand(
    "helloworld.helloWorld",
    () => {
      vscode.window.showInformationMessage("Hello World VS Code!");
    }
  );

  context.subscriptions.push(disposable);

  const diagnosticCollection =
    vscode.languages.createDiagnosticCollection("unusedJsonKeys");

  context.subscriptions.push(diagnosticCollection);

  if (vscode.window.activeTextEditor) {
    updateDiagnostics(
      vscode.window.activeTextEditor.document,
      diagnosticCollection
    );
  }

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        updateDiagnostics(editor.document, diagnosticCollection);
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      updateDiagnostics(event.document, diagnosticCollection);
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || event.document !== editor.document) return;

      if (event.contentChanges.length === 1) {
        const change = event.contentChanges[0];

        // Backspace
        if (change.text === "" && change.rangeLength === 1) {
          vscode.commands.executeCommand("editor.action.triggerSuggest");
        }

        // Letters or numbers
        if (/^[a-zA-Z0-9]$/.test(change.text)) {
          vscode.commands.executeCommand("editor.action.triggerSuggest");
        }
      }
    })
  );

  // 🔑 Completion provider triggers on quotes and dots
  const completionProvider = vscode.languages.registerCompletionItemProvider(
    ["javascript", "typescript", "vue", "html"],
    new JsonKeyCompletionProvider(),
    '"',
    "'",
    "." // for nested keys
  );
  context.subscriptions.push(completionProvider);
}

export function deactivate() {}

async function updateDiagnostics(
  document: vscode.TextDocument,
  collection: vscode.DiagnosticCollection
) {
  const config = vscode.workspace.getConfiguration("jsonKeyChecker");
  const patterns = config.get<any[]>("patterns", []);

  if (patterns.length === 0) {
    collection.delete(document.uri);
    return;
  }

  const fileName = document.fileName;
  const fileExtension = fileName.split(".").pop()?.toLowerCase();

  let matchedPatterns: any[] = [];

  for (const pattern of patterns) {
    const isJsonMatch = pattern.jsonFiles.some((jsonPattern: string) => {
      if (jsonPattern.includes("*")) {
        const regex = new RegExp(jsonPattern.replace(/\*/g, ".*"));
        return regex.test(fileName);
      } else {
        return fileName.endsWith(jsonPattern);
      }
    });

    if (isJsonMatch) {
      matchedPatterns.push(pattern);
    }
  }

  if (matchedPatterns.length === 0) {
    for (const pattern of patterns) {
      if (pattern.fileExtensions.includes(fileExtension || "")) {
        const text = document.getText();
        const hasMatch = pattern.methodPatterns.some(
          (methodPattern: string) => {
            const regex = new RegExp(methodPattern);
            return regex.test(text);
          }
        );

        if (hasMatch) {
          matchedPatterns.push(pattern);
        }
      }
    }
  }

  if (matchedPatterns.length === 0) {
    collection.delete(document.uri);
    return;
  }

  const relevantJsonFiles = new Set<string>();
  matchedPatterns.forEach((pattern) => {
    pattern.jsonFiles.forEach((jsonFile: string) => {
      relevantJsonFiles.add(jsonFile);
    });
  });

  const jsonData = await loadJsonFiles(Array.from(relevantJsonFiles));

  const isCurrentFileJson = fileName.toLowerCase().endsWith(".json");
  if (isCurrentFileJson) {
    checkUnusedKeysInJsonFile(document, jsonData, matchedPatterns, collection);
  } else {
    checkMissingKeysInSourceFile(
      document,
      jsonData,
      matchedPatterns,
      collection
    );
  }
}

async function checkUnusedKeysInJsonFile(
  document: vscode.TextDocument,
  jsonData: Map<string, Set<string>>,
  matchedPatterns: any[],
  collection: vscode.DiagnosticCollection
) {
  try {
    const currentJsonText = document.getText();
    const currentJsonData = JSON.parse(currentJsonText);
    const currentJsonKeys = Array.from(flattenJsonKeys(currentJsonData));

    // Find all keys used across all source files
    const usedKeys = new Set<string>();

    for (const pattern of matchedPatterns) {
      for (const methodPattern of pattern.methodPatterns) {
        const regex = new RegExp(
          methodPattern + `\\s*\\(\\s*(['"])([^'"]+)\\1\\s*\\)`,
          "g"
        );

        // Use configurable scan folders or default to everything
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
        const uniqueFiles = Array.from(
          new Set(allFiles.map((f) => f.fsPath))
        ).map((path) => vscode.Uri.file(path));

        for (const file of uniqueFiles) {
          try {
            const content = await vscode.workspace.fs.readFile(file);
            const text = content.toString();

            let match;
            while ((match = regex.exec(text)) !== null) {
              usedKeys.add(match[2]);
            }
          } catch (error) {
            // Skip files that can't be read
          }
        }
      }
    }

    // Expand used keys to include all parent keys
    const expandedUsedKeys = new Set<string>();
    usedKeys.forEach((key) => {
      expandedUsedKeys.add(key);

      // Add all parent keys
      const parts = key.split(".");
      for (let i = 1; i < parts.length; i++) {
        const parentKey = parts.slice(0, i).join(".");
        expandedUsedKeys.add(parentKey);
      }
    });

    // Use expandedUsedKeys instead of usedKeys for filtering
    const unusedKeys = currentJsonKeys.filter(
      (key) => !expandedUsedKeys.has(key)
    );

    // Create diagnostics for unused keys
    const diagnostics: vscode.Diagnostic[] = [];
    const lines = currentJsonText.split("\n");

    lines.forEach((line, lineIndex) => {
      unusedKeys.forEach((unusedKey) => {
        // Handle both regular keys and nested keys
        const keyParts = unusedKey.split(".");
        const leafKey = keyParts[keyParts.length - 1];

        const keyMatch = line.match(new RegExp(`"(${leafKey})"\\s*:`));
        if (keyMatch) {
          const startIndex = line.indexOf(`"${leafKey}"`);
          const endIndex = startIndex + leafKey.length + 2; // +2 for quotes

          const range = new vscode.Range(
            new vscode.Position(lineIndex, startIndex),
            new vscode.Position(lineIndex, endIndex)
          );

          const diagnostic = new vscode.Diagnostic(
            range,
            `Unused JSON key: "${unusedKey}"`,
            vscode.DiagnosticSeverity.Warning
          );

          diagnostics.push(diagnostic);
        }
      });
    });

    collection.set(document.uri, diagnostics);
  } catch (error) {
    console.error("Error checking unused keys:", error);
    collection.delete(document.uri);
  }
}

function checkMissingKeysInSourceFile(
  document: vscode.TextDocument,
  jsonData: Map<string, Set<string>>,
  matchedPatterns: any[],
  collection: vscode.DiagnosticCollection
) {
  try {
    // Check if current file is in allowed scan folders (if specified)
    const isInScanFolder = matchedPatterns.some((pattern) => {
      if (!pattern.scanFolders || pattern.scanFolders.length === 0) {
        return true; // No restriction, allow all files
      }

      return pattern.scanFolders.some((folder: string) => {
        const relativePath = vscode.workspace.asRelativePath(document.uri);
        return relativePath.startsWith(folder);
      });
    });

    if (!isInScanFolder) {
      collection.delete(document.uri);
      return;
    }

    const sourceText = document.getText();
    const diagnostics: vscode.Diagnostic[] = [];

    // Collect all available keys from loaded JSON files
    const allAvailableKeys = new Set<string>();
    jsonData.forEach((keySet) => {
      keySet.forEach((key) => allAvailableKeys.add(key));
    });

    matchedPatterns.forEach((pattern) => {
      pattern.methodPatterns.forEach((methodPattern: string) => {
        const regex = new RegExp(
          methodPattern + `\\s*\\(\\s*(['"])([^'"]+)\\1\\s*\\)`,
          "g"
        );

        let match;
        while ((match = regex.exec(sourceText)) !== null) {
          const key = match[2];

          if (!allAvailableKeys.has(key)) {
            const keyStart = match.index + match[0].indexOf(match[1] + key);
            const keyEnd = keyStart + key.length + 2;

            const startPos = document.positionAt(keyStart);
            const endPos = document.positionAt(keyEnd);

            const range = new vscode.Range(startPos, endPos);

            const diagnostic = new vscode.Diagnostic(
              range,
              `Missing JSON key: "${key}" not found in any JSON file`,
              vscode.DiagnosticSeverity.Error
            );

            diagnostics.push(diagnostic);
          }
        }
      });
    });

    collection.set(document.uri, diagnostics);
  } catch (error) {
    console.error("Error checking missing keys:", error);
    collection.delete(document.uri);
  }
}
