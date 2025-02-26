// client.js
const cp = require('child_process');
const path = require('path');
const {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter
} = require('vscode-jsonrpc');

const serverPath = path.join(__dirname, 'server.js');
const serverProcess = cp.spawn('node', [serverPath], {
  // Optional: stdio: 'pipe' is default, but ensure we're piping stdout/stderr
});

// Log if the server fails to spawn
serverProcess.on('error', (err) => {
  console.error('Client: Failed to start server process:', err);
});

// Log server stderr (where many crashes or exceptions appear)
serverProcess.stderr.on('data', (data) => {
  console.error('Client: Server error output:', data.toString());
});

const connection = createMessageConnection(
  new StreamMessageReader(serverProcess.stdout),
  new StreamMessageWriter(serverProcess.stdin)
);

// Listen for notifications (e.g., diagnostics)
connection.onNotification('textDocument/publishDiagnostics', (params) => {
  console.log('Client: Diagnostics received for', params.uri);
  console.log(JSON.stringify(params.diagnostics, null, 2));
});

// Start the JSON-RPC connection
connection.listen();
console.log('Client: started and listening...');

// Send an initialize request
connection.sendRequest('initialize', {
  processId: process.pid,
  rootUri: null,
  capabilities: {}
}).then((result) => {
  console.log('Client: Server capabilities:', result.capabilities);
  
  // Simulate opening a document
  const documentUri = 'file://example.js';
  const sampleText = `
// A sample JavaScript file
const a = 1;
console.log(a);
// This line is intentionally very long to trigger a diagnostic warning because it exceeds 80 characters in length.
  `;

  connection.sendNotification('textDocument/didOpen', {
    textDocument: {
      uri: documentUri,
      languageId: 'javascript',
      version: 1,
      text: sampleText
    }
  });

  // Request completions
  connection.sendRequest('textDocument/completion', {
    textDocument: { uri: documentUri },
    position: { line: 2, character: 15 }
  }).then((completions) => {
    console.log('Client: Completions:', completions);
  }).catch((err) => {
    console.error('Client: Error during completion request:', err);
  });

}).catch((error) => {
  console.error('Client: Error during initialization:', error);
});
