import * as vscode from 'vscode';

const API_URL = 'https://api.tokenfactory.nebius.com/v1/chat/completions';
const MODEL = 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B';
const MAX_CODE_CHARS = 6000;

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

async function askModel(apiKey: string, language: string, error: string, code: string): Promise<string> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      temperature: 0.3,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Language: ${language}\n\nError:\n${error}\n\nCode:\n${code}` },
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

function showAnswer(text: string, error: string) {
  const panel = vscode.window.createWebviewPanel('errlyAnswer', 'Errly', vscode.ViewColumn.Beside, {});
  panel.webview.html = `<!DOCTYPE html><html><head><style>
    body { padding: 1rem; line-height: 1.5; }
    .text { white-space: pre-wrap; margin-bottom: 0.75rem; }
    pre.code { background: var(--vscode-textCodeBlock-background); padding: 0.75rem; border-radius: 6px; overflow-x: auto; white-space: pre-wrap; }
    code { font-family: var(--vscode-editor-font-family), monospace; }
  </style></head><body>
    <div class="text"><strong>Your error</strong></div>
    <pre class="code"><code>${escapeHtml(error)}</code></pre>
    ${formatAnswer(text)}
  </body></html>`;
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

  const ask = vscode.commands.registerCommand('errly.askErrly', async () => {
    const apiKey = await context.secrets.get('errly.apiKey');
    if (!apiKey) {
      vscode.window.showErrorMessage('Errly: no API key yet. Run "Errly: Set API Key" first.');
      return;
    }
    const clip = (await vscode.env.clipboard.readText()).trim();
    const looksLikeError = /error|exception|traceback/i.test(clip) && clip.length < 2000;
    const error = await vscode.window.showInputBox({
      prompt: 'Paste the error message',
      value: looksLikeError ? clip : '',
      ignoreFocusOut: true,
    });
    if (!error) {
      return;
    }
    let code = '';
    let language = 'unknown';
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      language = editor.document.languageId;
      const selected = editor.document.getText(editor.selection);
      code = (selected || editor.document.getText()).slice(0, MAX_CODE_CHARS);
    }
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Errly is thinking...' },
      async () => {
        try {
          showAnswer(await askModel(apiKey, language, error, code), error);
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

  context.subscriptions.push(statusItem);
  context.subscriptions.push(setKey, ask);
}

export function deactivate() {}