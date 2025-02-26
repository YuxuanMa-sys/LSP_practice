// test/test.js
const assert = require('assert');
const {
  symbolTable,
  validateTextDocument,
  parseDocumentSymbols,
  getWordAtPosition,
  documents,
  handleHover,
  handleDefinition,
  handleReferences,
  handleRenameRequest,
  handleCompletion
} = require('./server');

// A helper to simulate a minimal text document object.
function createFakeTextDocument(uri, text) {
  return {
    uri,
    getText: () => text
  };
}

describe('LSP Server Unit Tests', () => {

  describe('getWordAtPosition', () => {
    it('should extract the correct word from a line', () => {
      const text = "let myVar = 10;";
      const doc = createFakeTextDocument('file://test.js', text);
      // "myVar" is expected to start around character 4, so pick position 6.
      const word = getWordAtPosition(doc, 0, 6);
      assert.strictEqual(word, "myVar");
    });

    it('should return null if position is out of bounds', () => {
      const text = "let myVar = 10;";
      const doc = createFakeTextDocument('file://test.js', text);
      const word = getWordAtPosition(doc, 0, 100);
      assert.strictEqual(word, null);
    });
  });

  describe('parseDocumentSymbols', () => {
    it('should parse variable and function symbols', () => {
      const text = `let myVar = 10;
function myFunc() {
  console.log(myVar);
}`;
      const uri = 'file://testSymbols.js';
      const doc = createFakeTextDocument(uri, text);
      // Clear any previous symbols.
      symbolTable[uri] = [];
      parseDocumentSymbols(doc);

      const symbols = symbolTable[uri];
      assert(symbols, 'Symbols array exists');
      assert.strictEqual(symbols.length, 2, 'Should find 2 symbols');
      const names = symbols.map(s => s.name);
      assert(names.includes('myVar'), 'Should detect variable "myVar"');
      assert(names.includes('myFunc'), 'Should detect function "myFunc"');
    });
  });

  describe('validateTextDocument', () => {
    it('should produce diagnostics for lines exceeding 80 characters', () => {
      const longLine = 'a'.repeat(85);
      const text = `Short line\n${longLine}`;
      const uri = 'file://testDiagnostics.js';
      const doc = createFakeTextDocument(uri, text);

      // Call validateTextDocument and capture its return value.
      const diagnostics = validateTextDocument(doc);
      assert.strictEqual(diagnostics.length, 1, 'Should have 1 diagnostic for the long line');
      assert.strictEqual(diagnostics[0].range.start.line, 1, 'Diagnostic should be on line 1');
    });
  });

  describe('handleHover', () => {
    it('should return hover info for a symbol', () => {
      const text = `let myVar = 10;`;
      const uri = 'file://hoverTest.js';
      const doc = createFakeTextDocument(uri, text);
      // Reset and parse symbols.
      symbolTable[uri] = [];
      parseDocumentSymbols(doc);
      // Manually add the document to the documents manager.
      documents._documents = documents._documents || {};
      documents._documents[uri] = doc;

      const params = {
        textDocument: { uri },
        position: { line: 0, character: 6 } // Within "myVar"
      };

      const result = handleHover(params);
      assert(result, 'Hover result should not be null');
      assert(result.contents.value.includes('myVar'), 'Hover info should include "myVar"');
    });
  });

  describe('handleDefinition', () => {
    it('should return a definition location for a symbol', () => {
      const text = `let myVar = 10;
function myFunc() {
  console.log(myVar);
}`;
      const uri = 'file://defTest.js';
      const doc = createFakeTextDocument(uri, text);
      symbolTable[uri] = [];
      parseDocumentSymbols(doc);
      // Inject the document into the manager.
      documents._documents = documents._documents || {};
      documents._documents[uri] = doc;

      const params = {
        textDocument: { uri },
        position: { line: 0, character: 6 } // within "myVar"
      };

      const result = handleDefinition(params);
      assert(result, 'Definition result should not be null');
      assert.strictEqual(result.uri, uri, 'Definition should be in the same document');
    });
  });

  describe('handleReferences', () => {
    it('should return references for a symbol', () => {
      const text = `let myVar = 10;
function myFunc() {
  console.log(myVar);
}`;
      const uri = 'file://refTest.js';
      const doc = createFakeTextDocument(uri, text);
      symbolTable[uri] = [];
      parseDocumentSymbols(doc);
      // Inject the document.
      documents._documents = documents._documents || {};
      documents._documents[uri] = doc;

      const params = {
        textDocument: { uri },
        position: { line: 0, character: 6 }, // in "myVar"
        context: { includeDeclaration: false }
      };

      const references = handleReferences(params);
      assert(Array.isArray(references), 'Should return an array of locations');
      // Expect at least one reference (the usage in console.log).
      assert(references.length >= 1, 'Should find at least one usage');
    });
  });

  describe('handleRenameRequest', () => {
    it('should return a workspace edit for renaming a symbol', () => {
      const text = `let myVar = 10;
function myFunc() {
  console.log(myVar);
}`;
      const uri = 'file://renameTest.js';
      const doc = createFakeTextDocument(uri, text);
      symbolTable[uri] = [];
      parseDocumentSymbols(doc);
      // Inject the document.
      documents._documents = documents._documents || {};
      documents._documents[uri] = doc;

      const params = {
        textDocument: { uri },
        position: { line: 0, character: 6 }, // in "myVar"
        newName: 'newVar'
      };

      const result = handleRenameRequest(params);
      assert(result, 'Rename result should not be null');
      assert(result.changes[uri], 'Workspace edit should include changes for the document');
      result.changes[uri].forEach(edit => {
        assert.strictEqual(edit.newText, 'newVar', 'Each edit should change the text to "newVar"');
      });
    });
  });

  describe('handleCompletion', () => {
    it('should return static completions', () => {
      const completions = handleCompletion();
      assert(Array.isArray(completions), 'Completion result should be an array');
      assert(completions.length >= 2, 'Should have at least 2 completions');
      const labels = completions.map(item => item.label);
      assert(labels.includes('HelloWorld'), 'Should include "HelloWorld"');
      assert(labels.includes('Print'), 'Should include "Print"');
    });
  });
});
