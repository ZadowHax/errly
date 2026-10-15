# Errly

A friendly debugging helper for beginner programmers, built as a VS Code extension.
Paste an error message and Errly explains it in plain language, using your own code,
with a short example of the fix.

## How it works

Errly sends your error message and the code from your open file (or your selection)
to an NVIDIA open model hosted on Nebius, and shows the answer in a side panel:

1. **Your error**: the message you pasted
2. **What happened?**
3. **Why?**
4. **How can I fix it?**
5. **Example**

## Models and services used

- **NVIDIA Nemotron**: `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` writes the explanations.
- **Nebius Token Factory**: hosts the model and serves it through an OpenAI-compatible API.
  (Describe here how Token Factory helped, for example the speed or how easy it was to start.)

## Setup

You need [Node.js](https://nodejs.org) and a free
[Nebius Token Factory](https://tokenfactory.nebius.com) account with an API key.

### Run from source

```
git clone https://github.com/YOUR-USERNAME/errly.git
cd errly
npm install
npm run compile
[LINUX/MacOS] code --extensionDevelopmentPath="$PWD"
[WINDOWS] code --extensionDevelopmentPath="%CD%"
```

### Install the packaged extension

Download `errly.vsix` from the Releases page, then run:

```
code --install-extension errly-0.0.1.vsix
```

## Usage

1. Press `Ctrl+Shift+P`, run **Errly: Set API Key**, and paste your Token Factory key.
   It is stored in VS Code's secret storage, not in any file.
2. Open a file with a bug, run it, and copy the error message.
3. Press `Ctrl+Shift+P`, run **Ask Errly**, and paste the error.
   Select part of your code first to send only that part.

## Languages

Errly passes the file's language to the model, so it can explain errors in any language.
It has been tested mainly with Python and JavaScript.
In the future it's planned to add support for more programming languages such as Java, C#, C, C++.

## Limitations

- Errors are pasted in manually. Errly does not detect them automatically.
- The model reads your text but never runs your code, so its explanations can be wrong.

## License

MIT, see [LICENSE](LICENSE).