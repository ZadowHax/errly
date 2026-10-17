import * as vscode from 'vscode';

const API_URL = 'https://api.tokenfactory.nebius.com/v1/chat/completions';
const MODEL = 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B';
const MAX_CODE_CHARS = 6000;

interface FixTarget {
  uri: vscode.Uri;
  startLine: number; // 0-based
  endLine: number; // 0-based, inclusive
  version: number;
  language: string;
}

const FIX_PROMPT = `You fix bugs for beginner programmers.
You get a programming language, an error message and a snippet of code.
Return ONLY the corrected snippet inside one fenced code block.
Keep the same indentation and leave everything that is not broken unchanged.
Make the smallest change that fixes the error. Do not explain anything.`;

const SYSTEM_PROMPT = `You are Errly, a friendly debugging helper for beginner programmers who may know very little jargon.

Explain the error using the user's own code and variable names.
Answer with exactly these four headings, in this order:
What happened?
Why?
How can I fix it?
Example

Rules:
- "What happened?" describes the problem in plain words. Never just repeat the error message.
- "Why?" explains the cause in the user's code. If you use a technical word, explain it in simple terms.
- "How can I fix it?" gives one clear step, not a list of alternatives.
- "Example" shows the user's own code corrected, in a fenced code block. The corrected code must run without the same error.
- Keep every section to one or two short sentences, except Example.`;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function callModel(apiKey: string, system: string, user: string, temperature: number): Promise<string> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      temperature,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`Request failed (${res.status}). Check your API key and credit balance.`);
  }
  const data: any = await res.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error('The model returned an empty answer. Try again.');
  }
  return text;
}

async function askModel(apiKey: string, language: string, error: string, code: string): Promise<string> {
  return callModel(apiKey, SYSTEM_PROMPT, `Language: ${language}\n\nError:\n${error}\n\nCode:\n${code}`, 0.3);
}

async function askForFix(apiKey: string, language: string, error: string, snippet: string): Promise<string> {
  const text = await callModel(
    apiKey,
    FIX_PROMPT,
    `Language: ${language}\n\nError:\n${error}\n\nCode to fix:\n${snippet}`,
    0.2
  );
  const match = text.match(/```[a-zA-Z]*\r?\n([\s\S]*?)```/);
  if (!match) {
    throw new Error('The model did not return code I could use. Try again.');
  }
  return match[1].replace(/\r?\n$/, '');
}

function formatAnswer(text: string): string {
  // Split on ``` so code blocks can be shown as boxes
  const parts = text.split(/```[a-zA-Z]*\n?/);
  return parts
    .map((part, i) => {
      const safe = escapeHtml(part.trim());
      if (!safe) {
        return '';
      }
      if (i % 2 === 1) {
        return `<pre class="code"><code>${safe}</code></pre>`;
      }
      return `<div class="text">${safe
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/^(What happened\?|Why\?|How can I fix it\?|Example)$/gm, '<strong>$1</strong>')}</div>`;
    })
    .join('');
}

function showAnswer(text: string, error: string, onFix?: () => void) {
  const panel = vscode.window.createWebviewPanel('errlyAnswer', 'Errly', vscode.ViewColumn.Beside, {
    enableScripts: true,
  });
  const nonce = Math.random().toString(36).slice(2);
  const fixArea = onFix
    ? '<button id="fix">Suggest a fix</button>'
    : '<p class="hint">Open the file with the bug to get a fix suggestion.</p>';
    panel.webview.html = `<!DOCTYPE html><html><head>
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <style>
    body { padding: 1rem; line-height: 1.5; }
    .text { white-space: pre-wrap; margin-bottom: 0.75rem; }
    pre.code { background: var(--vscode-textCodeBlock-background); padding: 0.75rem; border-radius: 6px; overflow-x: auto; white-space: pre-wrap; }
    code { font-family: var(--vscode-editor-font-family), monospace; }
    button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; }
    .hint { opacity: 0.7; }
  </style></head><body>
    <div class="text"><strong>Your error</strong></div>
    <pre class="code"><code>${escapeHtml(error)}</code></pre>
    ${formatAnswer(text)}
    ${fixArea}
    <script nonce="${nonce}">
      const vscodeApi = acquireVsCodeApi();
      const btn = document.getElementById('fix');
      if (btn) { btn.addEventListener('click', () => vscodeApi.postMessage({ type: 'fix' })); }
    </script>
  </body></html>`;
  panel.webview.onDidReceiveMessage((m) => {
    if (m.type === 'fix' && onFix) {
      onFix();
    }
  });
}

interface ErrorInfo {
  message: string;
  line?: number;
}

function isErrorInfo(x: unknown): x is ErrorInfo {
  return typeof x === 'object' && x !== null && typeof (x as ErrorInfo).message === 'string';
}

class ErrlyCodeActionProvider implements vscode.CodeActionProvider {
  static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
    context: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    const diagnostic = context.diagnostics.find(
      (d) => d.severity === vscode.DiagnosticSeverity.Error
    );
    if (!diagnostic) {
      return [];
    }
    const action = new vscode.CodeAction('Ask Errly about this error', vscode.CodeActionKind.QuickFix);
    action.diagnostics = [diagnostic];
    const info: ErrorInfo = { message: diagnostic.message, line: diagnostic.range.start.line + 1 };
    action.command = { command: 'errly.askErrly', title: 'Ask Errly', arguments: [info] };
    return [action];
  }
}

export function activate(context: vscode.ExtensionContext) {
  const setKey = vscode.commands.registerCommand('errly.setApiKey', async () => {
    const key = await vscode.window.showInputBox({
      prompt: 'Paste your Nebius Token Factory API key',
      password: true,
      ignoreFocusOut: true,
    });
    if (key) {
      await context.secrets.store('errly.apiKey', key.trim());
      vscode.window.showInformationMessage('Errly: API key saved.');
    }
  });

    const ask = vscode.commands.registerCommand('errly.askErrly', async (arg?: unknown) => {
    const apiKey = await context.secrets.get('errly.apiKey');
    if (!apiKey) {
      vscode.window.showErrorMessage('Errly: no API key yet. Run "Errly: Set API Key" first.');
      return;
    }

    let rawError: string | undefined;
    if (isErrorInfo(arg)) {
      rawError = arg.line ? `Line ${arg.line}: ${arg.message}` : arg.message;
    } else {
      const clip = (await vscode.env.clipboard.readText()).trim();
      const looksLikeError = /error|exception|traceback/i.test(clip) && clip.length < 2000;
      rawError = await vscode.window.showInputBox({
        prompt: 'Paste the error message',
        value: looksLikeError ? clip : '',
        ignoreFocusOut: true,
      });
    }
    if (!rawError) {
      return;
    }
    const error: string = rawError;

    let code = '';
    let language = 'unknown';
    let target: FixTarget | undefined;
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      const doc = editor.document;
      language = doc.languageId;
      const selected = doc.getText(editor.selection);
      code = (selected || doc.getText()).slice(0, MAX_CODE_CHARS);

      const makeTarget = (start: number, end: number): FixTarget => ({
        uri: doc.uri,
        startLine: Math.max(0, start),
        endLine: Math.min(doc.lineCount - 1, end),
        version: doc.version,
        language,
      });

      if (isErrorInfo(arg) && arg.line) {
        target = makeTarget(arg.line - 4, arg.line + 2);
      } else if (!editor.selection.isEmpty) {
        target = makeTarget(editor.selection.start.line, editor.selection.end.line);
      } else {
        const fileName = doc.uri.path.split('/').pop() ?? '';
        const guessed = guessErrorLine(error, fileName, language);
        if (guessed !== undefined && guessed >= 1 && guessed <= doc.lineCount) {
          target = makeTarget(guessed - 4, guessed + 2);
        } else if (doc.getText().length <= MAX_CODE_CHARS) {
          target = makeTarget(0, doc.lineCount - 1);
        } else {
          const cursor = editor.selection.active.line;
          target = makeTarget(cursor - 5, cursor + 5);
        }
      }
    }
    const fixTarget = target;
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Errly is thinking...' },
      async () => {
        try {
          const answer = await askModel(apiKey, language, error, code);
          showAnswer(
            answer,
            error,
            fixTarget ? () => { void suggestFix(apiKey, fixTarget, error); } : undefined
          );
        } catch (e) {
          vscode.window.showErrorMessage(`Errly: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    );
  });

  const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusItem.text = '$(bug) Errly';
  statusItem.tooltip = 'Ask Errly about an error';
  statusItem.command = 'errly.askErrly';
  statusItem.show();

  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      [{ language: 'python' }, { language: 'javascript' }, { language: 'typescript' }, { language: 'java' }, { language: 'csharp' }],
      new ErrlyCodeActionProvider(),
      { providedCodeActionKinds: ErrlyCodeActionProvider.providedCodeActionKinds }
    )
  );

  context.subscriptions.push(statusItem);
  context.subscriptions.push(setKey, ask);
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider('errly-fix', {
      provideTextDocumentContent(uri) {
        return proposedFixes.get(uri.query) ?? '';
      },
    })
  );
}

const proposedFixes = new Map<string, string>();

async function suggestFix(apiKey: string, target: FixTarget, error: string) {
  const doc = await vscode.workspace.openTextDocument(target.uri);
  if (doc.version !== target.version) {
    vscode.window.showWarningMessage('Errly: the file changed since the question. Ask Errly again.');
    return;
  }
  const range = new vscode.Range(target.startLine, 0, target.endLine, doc.lineAt(target.endLine).text.length);
  const snippet = doc.getText(range);
  const eol = doc.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';

  const fixed = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Errly is preparing a fix...' },
    async () => {
      try {
        return (await askForFix(apiKey, target.language, error, snippet)).replace(/\r?\n/g, eol);
      } catch (e) {
        vscode.window.showErrorMessage(`Errly: ${e instanceof Error ? e.message : String(e)}`);
        return undefined;
      }
    }
  );
  if (fixed === undefined) {
    return;
  }
  if (fixed === snippet) {
    vscode.window.showInformationMessage('Errly: no change to suggest for these lines.');
    return;
  }

  const fullText = doc.getText();
  const proposedText = fullText.slice(0, doc.offsetAt(range.start)) + fixed + fullText.slice(doc.offsetAt(range.end));
  const id = String(Date.now());
  proposedFixes.set(id, proposedText);
  const fileName = target.uri.path.split('/').pop() ?? 'fix';
  const previewUri = vscode.Uri.from({ scheme: 'errly-fix', path: '/' + fileName, query: id });
  await vscode.commands.executeCommand(
    'vscode.diff',
    doc.uri,
    previewUri,
    'Errly: suggested fix (left = your code, right = suggestion)'
  );

  const choice = await vscode.window.showInformationMessage('Apply Errly\'s suggested fix?', 'Apply fix', 'Cancel');
  if (choice !== 'Apply fix') {
    return;
  }
  if (doc.version !== target.version) {
    vscode.window.showWarningMessage('Errly: the file changed, so the fix was not applied.');
    return;
  }
  const edit = new vscode.WorkspaceEdit();
  edit.replace(doc.uri, range, fixed);
  await vscode.workspace.applyEdit(edit);
  vscode.window.showInformationMessage('Errly: fix applied. Press Ctrl+Z to undo it.');
}

function guessErrorLine(error: string, fileName: string, language: string): number | undefined {
  const escaped = fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const found: number[] = [];
  const patterns = [
    new RegExp(`${escaped}:(\\d+)`, 'g'), // test.js:3 or Test.java:5
    new RegExp(`${escaped}[^\\n]*?line (\\d+)`, 'gi'), // File "test.py", line 3
  ];
  for (const re of patterns) {
    for (const m of error.matchAll(re)) {
      found.push(Number(m[1]));
    }
  }
  if (found.length === 0) {
    const m = error.match(/line (\d+)/i);
    if (m) {
      found.push(Number(m[1]));
    }
  }
  if (found.length === 0) {
    return undefined;
  }
  // Python lists the failing line last; Java and JavaScript list it first
  return language === 'python' ? found[found.length - 1] : found[0];
}

export function deactivate() {}