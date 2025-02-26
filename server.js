// server.js

const {
  createConnection,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
  CompletionItemKind
} = require('vscode-languageserver/node');

const {
  StreamMessageReader,
  StreamMessageWriter
} = require('vscode-jsonrpc/node');

// Create the LSP connection using stdio
const connection = createConnection(
  new StreamMessageReader(process.stdin),
  new StreamMessageWriter(process.stdout),
  { ...ProposedFeatures }
);

// Manage open text documents
const documents = new TextDocuments();

// In-memory symbol table: symbolTable[uri] = Array of symbol objects.
let symbolTable = {};

// -----------------------------------------------------------------------------
// 1. Initialization: advertise server capabilities.
connection.onInitialize(() => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: { triggerCharacters: ['.'] },
      hoverProvider: true,
      definitionProvider: true,
      referencesProvider: true,
      renameProvider: true
    }
  };
});

// -----------------------------------------------------------------------------
// 2. Document Changes: validate and parse symbols on open/change.
documents.onDidChangeContent((change) => {
  validateTextDocument(change.document);
  parseDocumentSymbols(change.document);
});

// -----------------------------------------------------------------------------
// 3. Diagnostics: warn if any line exceeds 80 characters.
// Now also returns the diagnostics array for testing.
function validateTextDocument(textDocument) {
  const text = textDocument.getText();
  const lines = text.split(/\r?\n/g);
  let diagnostics = [];

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].length > 80) {
      diagnostics.push({
        severity: 2, // Warning
        range: {
          start: { line: i, character: 80 },
          end: { line: i, character: lines[i].length }
        },
        message: 'Line exceeds 80 characters.',
        source: 'demo-lsp'
      });
    }
  }
  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
  return diagnostics;
}

// -----------------------------------------------------------------------------
// 4. Naive Symbol Parsing: find variables and functions.
function parseDocumentSymbols(textDocument) {
  const text = textDocument.getText();
  const lines = text.split(/\r?\n/g);
  const uri = textDocument.uri;

  // Reset symbols for this file.
  symbolTable[uri] = [];

  // Regex patterns for variable and function declarations.
  const varRegex = /\b(?:let|const)\s+([a-zA-Z0-9_$]+)\s*=/;
  const funcRegex = /\bfunction\s+([a-zA-Z0-9_$]+)\s*\(/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Variable declarations.
    const varMatch = line.match(varRegex);
    if (varMatch && varMatch[1]) {
      const name = varMatch[1];
      const startChar = line.indexOf(name);
      const endChar = startChar + name.length;
      symbolTable[uri].push({
        name,
        range: {
          start: { line: i, character: startChar },
          end: { line: i, character: endChar }
        },
        type: 'variable',
        docUri: uri
      });
    }

    // Function declarations.
    const funcMatch = line.match(funcRegex);
    if (funcMatch && funcMatch[1]) {
      const name = funcMatch[1];
      const startChar = line.indexOf(name);
      const endChar = startChar + name.length;
      symbolTable[uri].push({
        name,
        range: {
          start: { line: i, character: startChar },
          end: { line: i, character: endChar }
        },
        type: 'function',
        docUri: uri
      });
    }
  }
  // Debug output to stderr.
  console.error(`Parsed symbols for ${uri}:`, symbolTable[uri]);
}

// -----------------------------------------------------------------------------
// 5. Word Extraction with Debug Logging.
function getWordAtPosition(textDocument, line, character) {
  const text = textDocument.getText();
  const lines = text.split(/\r?\n/g);

  if (line >= lines.length) {
    console.error(`Debug: Requested line ${line} is out of bounds. Total lines: ${lines.length}`);
    return null;
  }
  const lineText = lines[line];
  if (character >= lineText.length) {
    console.error(`Debug: Requested character position ${character} is out of bounds for line: "${lineText}"`);
    return null;
  }

  console.error(`Debug: At line ${line}, character ${character}: '${lineText[character]}'`);

  let start = character;
  while (start > 0 && /[a-zA-Z0-9_$]/.test(lineText[start - 1])) {
    start--;
  }
  let end = character;
  while (end < lineText.length && /[a-zA-Z0-9_$]/.test(lineText[end])) {
    end++;
  }

  const word = lineText.substring(start, end);
  console.error(`Debug: Word boundaries for line ${line} (start: ${start}, end: ${end}) -> Extracted word: '${word}'`);
  return word;
}

// Utility: check if a position is within a given range.
function isPositionInRange(line, character, range) {
  if (line < range.start.line || line > range.end.line) return false;
  if (line === range.start.line && character < range.start.character) return false;
  if (line === range.end.line && character > range.end.character) return false;
  return true;
}

// -----------------------------------------------------------------------------
// 6. LSP Feature Handlers (named functions).
function handleHover(params) {
  const { uri } = params.textDocument;
  const { line, character } = params.position;
  const docSymbols = symbolTable[uri] || [];
  for (const sym of docSymbols) {
    if (isPositionInRange(line, character, sym.range)) {
      return {
        contents: {
          kind: 'markdown',
          value: `**Symbol**: \`${sym.name}\`\n**Type**: \`${sym.type}\``
        }
      };
    }
  }
  return null;
}

function handleDefinition(params) {
  const { uri } = params.textDocument;
  // Retrieve the document from our manager.
  const doc = documents.get(uri);
  if (!doc) return null;
  const word = getWordAtPosition(doc, params.position.line, params.position.character);
  if (!word) return null;
  const docSymbols = symbolTable[uri] || [];
  const foundSymbol = docSymbols.find(sym => sym.name === word);
  if (!foundSymbol) return null;
  return {
    uri: foundSymbol.docUri,
    range: foundSymbol.range
  };
}

function handleReferences(params) {
  const { uri } = params.textDocument;
  const doc = documents.get(uri);
  if (!doc) return [];
  const word = getWordAtPosition(doc, params.position.line, params.position.character);
  if (!word) return [];
  const text = doc.getText();
  const lines = text.split(/\r?\n/g);
  let locations = [];
  for (let i = 0; i < lines.length; i++) {
    const idx = lines[i].indexOf(word);
    if (idx !== -1) {
      locations.push({
        uri,
        range: {
          start: { line: i, character: idx },
          end: { line: i, character: idx + word.length }
        }
      });
    }
  }
  return locations;
}

function handleRenameRequest(params) {
  const { uri } = params.textDocument;
  const doc = documents.get(uri);
  if (!doc) return null;
  const oldName = getWordAtPosition(doc, params.position.line, params.position.character);
  const newName = params.newName;
  if (!oldName || !newName) return null;
  const text = doc.getText();
  const lines = text.split(/\r?\n/g);
  let edits = [];
  for (let i = 0; i < lines.length; i++) {
    const idx = lines[i].indexOf(oldName);
    if (idx !== -1) {
      edits.push({
        range: {
          start: { line: i, character: idx },
          end: { line: i, character: idx + oldName.length }
        },
        newText: newName
      });
    }
  }
  return { changes: { [uri]: edits } };
}

function handleCompletion() {
  return [
    {
      label: 'HelloWorld',
      kind: CompletionItemKind.Text,
      detail: 'Example Completion',
      documentation: 'A static completion item.'
    },
    {
      label: 'Print',
      kind: CompletionItemKind.Function,
      detail: 'Example Function',
      documentation: 'Another static completion item.'
    }
  ];
}

// -----------------------------------------------------------------------------
// 7. Register handlers with the connection.
connection.onHover(handleHover);
connection.onDefinition(handleDefinition);
connection.onReferences(handleReferences);
connection.onRenameRequest(handleRenameRequest);
connection.onCompletion(handleCompletion);

// -----------------------------------------------------------------------------
// 8. Start listening.
documents.listen(connection);
connection.listen();

// -----------------------------------------------------------------------------
// 9. Export for unit testing.
module.exports = {
  // Data & utilities
  symbolTable,
  validateTextDocument,
  parseDocumentSymbols,
  getWordAtPosition,
  documents, // exported so tests can inject documents
  // Named handlers
  handleHover,
  handleDefinition,
  handleReferences,
  handleRenameRequest,
  handleCompletion
};
