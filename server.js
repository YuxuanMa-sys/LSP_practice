// server.js
const {
    createConnection,
    ProposedFeatures,
    TextDocuments,
    TextDocumentSyncKind
  } = require('vscode-languageserver/node');
  
  const {
    StreamMessageReader,
    StreamMessageWriter
  } = require('vscode-jsonrpc/node');
  
  // Create the connection via stdio
  const connection = createConnection(
    new StreamMessageReader(process.stdin),
    new StreamMessageWriter(process.stdout),
    { ...ProposedFeatures }
  );
  
  // Manage text documents
  const documents = new TextDocuments();
  
  connection.onInitialize(() => {
    return {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        completionProvider: {
          triggerCharacters: ['.']
        }
      }
    };
  });
  
  documents.onDidChangeContent(change => {
    // For demo, do nothing or implement diagnostics
  });
  
  connection.onCompletion(() => {
    return [
      {
        label: 'HelloWorld',
        kind: 1,
        detail: 'Example Completion',
        documentation: 'Demo completion item.'
      }
    ];
  });
  
  // Listen
  documents.listen(connection);
  connection.listen();
  