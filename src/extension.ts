// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Use the  to output diagnostic information (.log) and errors (.error)
  // This line of code will only be executed once when your extension is activated

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  const disposable = vscode.commands.registerCommand(
    "helloworld.helloWorld",
    () => {
      // The code you place here will be executed every time your command is executed
      // Display a message box to the user
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
}

// This method is called when your extension is deactivated
export function deactivate() {}

async function updateDiagnostics(
  document: vscode.TextDocument,
  collection: vscode.DiagnosticCollection
) {
  const config = vscode.workspace.getConfiguration("jsonKeyChecker");
  const patterns = config.get<any[]>("patterns", []); // Fixed typo from "partterns"

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
        // Fixed: was fileExtension, now fileExtensions
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
      // Fixed: removed .array
      relevantJsonFiles.add(jsonFile);
    });
  });

  const jsonData = await loadJsonFiles(Array.from(relevantJsonFiles));

  // Check based on current file type
  const isCurrentFileJson = fileName.toLowerCase().endsWith(".json");
  if (isCurrentFileJson) {
    // Check for unused keys in this JSON file
    checkUnusedKeysInJsonFile(document, jsonData, matchedPatterns, collection);
  } else {
    // Check for missing keys in this source file
    checkMissingKeysInSourceFile(
      document,
      jsonData,
      matchedPatterns,
      collection
    );
  }
}

async function loadJsonFiles(
  jsonFilePatterns: string[]
): Promise<Map<string, any>> {
  const jsonData = new Map<string, any>();

  for (const pattern of jsonFilePatterns) {
    try {
      if (pattern.includes("*")) {
        // Handle glob patterns
        const files = await vscode.workspace.findFiles(pattern);
        for (const file of files) {
          const content = await vscode.workspace.fs.readFile(file);
          const data = JSON.parse(content.toString());
          jsonData.set(file.fsPath, data);
        }
      } else {
        // Handle specific file
        const files = await vscode.workspace.findFiles(`**/${pattern}`);
        for (const file of files) {
          const content = await vscode.workspace.fs.readFile(file);
          const data = JSON.parse(content.toString());
          jsonData.set(file.fsPath, data);
        }
      }
    } catch (error) {}
  }

  return jsonData;
}

async function checkUnusedKeysInJsonFile(
  document: vscode.TextDocument,
  jsonData: Map<string, any>,
  matchedPatterns: any[],
  collection: vscode.DiagnosticCollection
) {
  try {
    const currentJsonText = document.getText();
    const currentJsonData = JSON.parse(currentJsonText);
    const currentJsonKeys = Object.keys(currentJsonData);

    // Find all keys used across all source files
    const usedKeys = new Set<string>();

    // Make this properly async
    for (const pattern of matchedPatterns) {
      for (const methodPattern of pattern.methodPatterns) {
        // More robust regex that handles different quote types
        const regex = new RegExp(
          methodPattern + `\\s*\\(\\s*(['"])([^'"]+)\\1\\s*\\)`,
          "g"
        );

        const searchPattern = `**/*.{${pattern.fileExtensions.join(",")}}`;

        const files = await vscode.workspace.findFiles(
          searchPattern,
          "**/node_modules/**"
        );

        for (const file of files) {
          try {
            const content = await vscode.workspace.fs.readFile(file);
            const text = content.toString();

            let match;
            while ((match = regex.exec(text)) !== null) {
              usedKeys.add(match[2]); // Changed to match[2]
            }
          } catch (error) {
            // Skip files that can't be read
          }
        }
      }
    }

    const unusedKeys = currentJsonKeys.filter((key) => !usedKeys.has(key));

    // Create diagnostics for unused keys
    const diagnostics: vscode.Diagnostic[] = [];
    const lines = currentJsonText.split("\n");

    lines.forEach((line, lineIndex) => {
      unusedKeys.forEach((unusedKey) => {
        const keyMatch = line.match(new RegExp(`"(${unusedKey})"\\s*:`));
        if (keyMatch) {
          const startIndex = line.indexOf(`"${unusedKey}"`);
          const endIndex = startIndex + unusedKey.length + 2; // +2 for quotes

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
    collection.delete(document.uri);
  }
}

function checkMissingKeysInSourceFile(
  document: vscode.TextDocument,
  jsonData: Map<string, any>,
  matchedPatterns: any[],
  collection: vscode.DiagnosticCollection
) {
  try {
    const sourceText = document.getText();
    const diagnostics: vscode.Diagnostic[] = [];

    // Collect all available keys from loaded JSON files
    const allAvailableKeys = new Set<string>();
    jsonData.forEach((data) => {
      Object.keys(data).forEach((key) => allAvailableKeys.add(key));
    });

    // For each matched pattern, find method calls and check if keys exist
    matchedPatterns.forEach((pattern) => {
      pattern.methodPatterns.forEach((methodPattern: string) => {
        // Create regex to capture the key parameter
        const regex = new RegExp(
          methodPattern + `\\s*\\(\\s*(['"\`])([^'"\`]+)\\1\\s*\\)`,
          "g"
        );

        let match;
        while ((match = regex.exec(sourceText)) !== null) {
          const key = match[2];

          // Check if key exists in any of the JSON files
          if (!allAvailableKeys.has(key)) {
            // Find the position of the key string within the match
            const keyStart = match.index + match[0].indexOf(match[1] + key);
            const keyEnd = keyStart + key.length + 2; // +2 for quotes

            // Convert string positions to VS Code positions
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
    collection.delete(document.uri);
  }
}
