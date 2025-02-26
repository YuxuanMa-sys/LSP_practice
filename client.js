// client.js
const cp = require('child_process');
const path = require('path');
const {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter
} = require('vscode-jsonrpc');

// Spawn the server as a child process.
const serverPath = path.join(__dirname, 'server.js');
const serverProcess = cp.spawn('node', [serverPath]);

// Capture server stderr (for debugging).
serverProcess.stderr.on('data', (data) => {
  console.error('Server error output:', data.toString());
});

// Create a JSON-RPC connection over the server's stdio.
const connection = createMessageConnection(
  new StreamMessageReader(serverProcess.stdout),
  new StreamMessageWriter(serverProcess.stdin)
);

// Listen for diagnostics notifications.
connection.onNotification('textDocument/publishDiagnostics', (params) => {
  console.log('\n[Diagnostics]');
  console.log(`File: ${params.uri}`);
  console.log(JSON.stringify(params.diagnostics, null, 2));
});

// Start the connection.
connection.listen();

async function run() {
  console.log('Client: starting initialization...');
  const initializeResult = await connection.sendRequest('initialize', {
    processId: process.pid,
    rootUri: null,
    capabilities: {}
  });
  console.log('Client: Server capabilities:', initializeResult.capabilities);

  // Use sample text without a leading newline for predictable line numbers.
  const documentUri = 'file://demo.js';
  const sampleText = `// A sample JavaScript file
let myVar = 10;
function myFunc() {
  console.log(myVar);
}
// This line is intentionally very long to trigger a line-length warning because it definitely exceeds 80 characters in total length.`;

  // Simulate opening the document.
  connection.sendNotification('textDocument/didOpen', {
    textDocument: {
      uri: documentUri,
      languageId: 'javascript',
      version: 1,
      text: sampleText
    }
  });

  // Give the server a moment to process the document.
  await new Promise(resolve => setTimeout(resolve, 100));

  // Request completions at line 1, character 6 (inside "myVar" in "let myVar = 10;").
  const completions = await connection.sendRequest('textDocument/completion', {
    textDocument: { uri: documentUri },
    position: { line: 1, character: 4 }
  });
  console.log('\n[Completions]');
  console.log(JSON.stringify(completions, null, 2));

  // Request hover at line 1, character 6 (within "myVar").
  const hover = await connection.sendRequest('textDocument/hover', {
    textDocument: { uri: documentUri },
    position: { line: 1, character: 5 }
  });
  console.log('\n[Hover]');
  console.log(JSON.stringify(hover, null, 2));

  // Request definition for "myVar" usage in console.log on line 3.
  // In line 3 ("  console.log(myVar);"), "myVar" starts at character 14.
  const definition = await connection.sendRequest('textDocument/definition', {
    textDocument: { uri: documentUri },
    position: { line: 3, character: 14 }
  });
  console.log('\n[Definition]');
  console.log(JSON.stringify(definition, null, 2));

  // Request references for "myVar" on line 3.
  const references = await connection.sendRequest('textDocument/references', {
    textDocument: { uri: documentUri },
    position: { line: 3, character: 14 },
    context: { includeDeclaration: false }
  });
  console.log('\n[References]');
  console.log(JSON.stringify(references, null, 2));

  // Request rename: rename "myVar" to "newVar" at line 1, character 6.
  const renameResult = await connection.sendRequest('textDocument/rename', {
    textDocument: { uri: documentUri },
    position: { line: 1, character: 6 },
    newName: 'newVar'
  });
  console.log('\n[Rename]');
  console.log(JSON.stringify(renameResult, null, 2));
}

run().catch((err) => {
  console.error('Error in client:', err);
});
