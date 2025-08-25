# JSON Key Checker

A VS Code extension that validates method calls against keys in your JSON files.  
Useful for catching missing or unused keys in localization files, error message dictionaries, and more.

---

## ✨ Features

- 🔍 Checks JSON keys used in your code against JSON files.
- ⚡ Supports configurable regex patterns for method calls.
- 📂 Works across multiple file types (`.ts`, `.tsx`, `.js`, etc.).
- 🎯 Helps prevent runtime errors caused by missing keys.
- 🛠 Fully configurable via VS Code settings.

---

## ⚙️ Extension Settings

This extension contributes the following settings:

| Setting                   | Type            | Default | Description                                                                          |
| ------------------------- | --------------- | ------- | ------------------------------------------------------------------------------------ |
| `jsonKeyChecker.enabled`  | `boolean`       | `true`  | Enable or disable JSON key checking.                                                 |
| `jsonKeyChecker.patterns` | `array<object>` | `[]`    | Define pattern groups for matching JSON files with their corresponding method calls. |

### `jsonKeyChecker.patterns` object fields

Each entry in `jsonKeyChecker.patterns` supports the following properties:

| Property         | Type            | Description                                  |
| ---------------- | --------------- | -------------------------------------------- |
| `name`           | `string`        | A name for this pattern group.               |
| `jsonFiles`      | `array<string>` | JSON file patterns (supports `*` wildcards). |
| `methodPatterns` | `array<string>` | Regex patterns for method calls.             |
| `fileExtensions` | `array<string>` | File extensions to check.                    |

---

## 🔧 Example Configuration

Add the following to your VS Code **`settings.json`** to configure the extension:

```json
{
  "jsonKeyChecker.enabled": true,
  "jsonKeyChecker.patterns": [
    {
      "name": "UI Texts",
      "jsonFiles": [
        "locales/*.json"
      ],
      "methodPatterns": [
        "t\\(['\"]([a-zA-Z0-9_.-]+)['\"]\\)"
      ],
      "fileExtensions": [
        ".ts",
        ".tsx",
        ".js"
      ]
    },
    {
      "name": "Error Messages",
      "jsonFiles": [
        "errors/*.json"
      ],
      "methodPatterns": [
        "error\\(['\"]([a-zA-Z0-9_.-]+)['\"]\\)"
      ],
      "fileExtensions": [
        ".ts",
        ".js"
      ]
    }
  ]
}


## Release Notes

### 0.0.1

This is a pre-release.
```
