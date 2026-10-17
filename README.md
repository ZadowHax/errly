# Errly

A friendly debugging helper for beginner programmers, built as a VS Code extension.
Click the lightbulb on an error (or paste one from your terminal) and Errly explains it in plain language, 
using your own code, with a short example and a suggested fix you can review before applying.

Built for the Nebius x NVIDIA Global AI Hackathon.

## How it works

Errly sends your error message and the code from your file (or your clipboard)
to an NVIDIA open model hosted on Nebius, and shows the answer in a side panel:

1. **Your error**
2. **What happened?**
3. **Why?**
4. **How can I fix it?**
5. **Example**

## Models and services used

- **NVIDIA Nemotron**: `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` writes the explanations.
- **Nebius Token Factory**: serves the model through an OpenAI-compatible API. Every explanation
  and every suggested fix in Errly is one request to Token Factory, made with a plain `fetch` call
  and an API key. That means Errly needs no SDK and no backend server of its own.

Token Factory was the only Nebius service used. Having the model ready behind a hosted API
meant I could focus on the extension itself and skip any GPU or server setup.

## Setup

You need [VS Code](https://code.visualstudio.com) and a 
[Nebius Token Factory](https://tokenfactory.nebius.com) account with an API key.

### Option 1: Install from the release (quickest)

1. Download the latest `.vsix` file from the [Releases page](https://github.com/ZadowHax/errly/releases).
2. Open a VS Code terminal in the folder where it was downloaded and run:

```
   # Go to the location where the file is downloaded (example path)
   cd C:\Users\ZadowHax\Downloads
```

```
   # Install the extension
   code --install-extension errly-0.0.1.vsix
```

   Or in VS Code open the Extensions panel, click the `...` menu, choose **Install from VSIX...**,
   and pick the file.
3. Restart VS Code, then follow the **Usage** steps below to add your API key.

### Option 2: Run from source

You also need [Node.js](https://nodejs.org).

```
git clone https://github.com/ZadowHax/errly.git
cd errly
npm install
npm run compile
```

Then launch VS Code with the extension loaded:

```
# macOS, Linux or Windows PowerShell
code --extensionDevelopmentPath="$PWD"

# Windows Command Prompt
code --extensionDevelopmentPath="%CD%"
```

## Usage

1. Press `Ctrl+Shift+P`, run **Errly: Set API Key**, and paste your Token Factory key.
   It is stored in VS Code's secret storage, not in any file.
2. Get an explanation in whichever way is easiest:
   - **Lightbulb:** click the lightbulb and choose **Ask Errly about this error**. Errly reads the error for you.
   - **Right-click** in the editor and choose **Ask Errly**
     or press `Ctrl+K Ctrl+E`, then paste an error from your terminal.
   - **Errly icon:** click the Errly icon on the bottom left of your screen in the status bar.
   - **CTRL+SHIFT+P:** search in the command palette for "Ask Errly"
   If you already copied an error, it is filled in automatically for every way of asking Errly.
3. Read the explanation: your error, what happened, why, how to fix it, and a short example.
4. Click **Suggest a fix**. Errly shows the change as a side-by-side diff, and nothing changes
   in your file unless you click **Apply fix**. `Ctrl+Z` undoes it.

## Languages

Errly passes the file's language to the model, so it can explain errors in any language.

- **Python and JavaScript:** tested with lightbulb errors and pasted terminal errors.
   The lightbulb for Python needs the Python extension
- **Java and C#:** tested with pasted errors. The lightbulb needs the language's VS Code
  extension (for example the Extension Pack for Java).

## Limitations

- Errly only sees errors that VS Code underlines, or ones you paste from the terminal.
- The model reads your text but never runs your code, so explanations and fixes can be wrong.
  That is why every fix is shown as a diff first.
- Fixes cover only a few lines around the error (or your selection), never the whole file.

## Privacy

When you ask Errly, your error message and the code from your file are sent to Nebius Token Factory.
Your API key stays in VS Code's secret storage and is never written to a file.

## License

MIT, see [LICENSE](LICENSE).