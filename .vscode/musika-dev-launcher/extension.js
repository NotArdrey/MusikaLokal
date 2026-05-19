const fs = require("fs");
const path = require("path");
const vscode = require("vscode");

let initialized = false;
let requestWatcher;

function activate(context) {
  if (initialized) {
    return;
  }

  initialized = true;
  initialize(context).catch((error) => {
    vscode.window.showErrorMessage(`MusikaLokal dev launcher failed: ${error.message || error}`);
  });
}

async function initialize(context) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const workspaceFolder = getWorkspaceFolder();
    const projectRoot = workspaceFolder ? workspaceFolder.uri.fsPath : null;

    if (!projectRoot) {
      await sleep(500);
      continue;
    }

    registerStartRequestWatcher(context, workspaceFolder);
    await launchIfRequested(workspaceFolder);
    return;
  }

  vscode.window.showErrorMessage("MusikaLokal workspace was not ready, so the dev terminal was not started.");
}

function registerStartRequestWatcher(context, workspaceFolder) {
  if (requestWatcher) {
    return;
  }

  requestWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(workspaceFolder, ".vscode/start-dev.request")
  );

  const handleRequest = () => {
    launchIfRequested(workspaceFolder).catch((error) => {
      vscode.window.showErrorMessage(`MusikaLokal dev launcher failed: ${error.message || error}`);
    });
  };

  context.subscriptions.push(
    requestWatcher,
    requestWatcher.onDidCreate(handleRequest),
    requestWatcher.onDidChange(handleRequest)
  );
}

async function launchIfRequested(workspaceFolder) {
  const projectRoot = workspaceFolder.uri.fsPath;
  const request = consumeStartRequest(projectRoot);

  if (!request) {
    return;
  }

  launchDevTerminals(projectRoot, request);
}

function launchDevTerminals(projectRoot, request) {
  const mobileDir = path.join(projectRoot, "mobile");
  const webDir = path.join(projectRoot, "web");
  const skipInstall = request.skipInstall === true;

  assertPackageExists(mobileDir, "Mobile");
  assertPackageExists(webDir, "Web");
  disposeExistingDevTerminals();

  const terminals = [
    {
      name: "MusikaLokal Mobile",
      cwd: mobileDir,
      command: buildPowerShellCommand("npm run start", skipInstall),
    },
    {
      name: "MusikaLokal Web",
      cwd: webDir,
      command: buildPowerShellCommand("npm run dev", skipInstall),
    },
  ];

  terminals.forEach((terminalConfig, index) => {
    const terminal = vscode.window.createTerminal({
      name: terminalConfig.name,
      cwd: terminalConfig.cwd,
      shellPath: "powershell.exe",
    });

    terminal.sendText(terminalConfig.command, true);
    terminal.show(index !== terminals.length - 1);
  });

  vscode.window.showInformationMessage("MusikaLokal dev started in separate VS Code terminals.");
}

function buildPowerShellCommand(startCommand, skipInstall) {
  const steps = ['$ErrorActionPreference = "Stop"'];

  if (!skipInstall) {
    steps.push('if (-not (Test-Path ".\\node_modules")) { npm install; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }');
  }

  steps.push(startCommand);
  return steps.join("; ");
}

function assertPackageExists(packageDir, label) {
  if (!fs.existsSync(path.join(packageDir, "package.json"))) {
    throw new Error(`${label} package not found at "${packageDir}".`);
  }
}

function disposeExistingDevTerminals() {
  const devTerminalNames = new Set(["MusikaLokal Mobile", "MusikaLokal Web"]);

  vscode.window.terminals.forEach((terminal) => {
    if (devTerminalNames.has(terminal.name)) {
      terminal.dispose();
    }
  });
}

function getWorkspaceFolder() {
  const folders = vscode.workspace.workspaceFolders || [];
  return (
    folders.find((folder) => path.basename(folder.uri.fsPath).toLowerCase() === "musikalokal") ||
    folders[0]
  );
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function consumeStartRequest(projectRoot) {
  const requestPath = path.join(projectRoot, ".vscode", "start-dev.request");

  if (!fs.existsSync(requestPath)) {
    return null;
  }

  const ageMs = Date.now() - fs.statSync(requestPath).mtimeMs;

  if (ageMs > 120000) {
    fs.unlinkSync(requestPath);
    return null;
  }

  const request = readStartRequest(requestPath);
  fs.unlinkSync(requestPath);
  return request;
}

function readStartRequest(requestPath) {
  try {
    const raw = fs.readFileSync(requestPath, "utf8").trim();

    if (raw.startsWith("{")) {
      return JSON.parse(raw);
    }
  } catch {
    return {};
  }

  return {};
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
