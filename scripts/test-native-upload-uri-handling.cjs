const assert = require("node:assert/strict");
const { readdirSync, readFileSync, statSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

const source = readFileSync("mobile/src/utils/storageUpload.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

const sourceFilesUnder = (root) => readdirSync(root).flatMap((entry) => {
  const path = join(root, entry);
  if (statSync(path).isDirectory()) return sourceFilesUnder(path);
  return /\.(?:ts|tsx)$/.test(entry) ? [path] : [];
});

const loadStorageUpload = (platform = "android") => {
  const files = new Set();
  const copies = [];
  const uploads = [];
  const deleted = [];
  const fileSystem = {
    documentDirectory: "file:///app/documents/",
    EncodingType: { Base64: "base64" },
    FileSystemUploadType: { BINARY_CONTENT: 0 },
    makeDirectoryAsync: async () => undefined,
    readDirectoryAsync: async () => [],
    getInfoAsync: async (uri) => ({ exists: files.has(uri), isDirectory: false, size: 42 }),
    copyAsync: async ({ from, to }) => {
      assert.match(from, /^(?:content|file):\/\//);
      copies.push({ from, to });
      files.add(to);
    },
    deleteAsync: async (uri) => {
      deleted.push(uri);
      files.delete(uri);
    },
    readAsStringAsync: async (uri, options) => {
      assert.equal(options.encoding, "base64");
      assert(files.has(uri), `read must use an existing app-owned file: ${uri}`);
      return "dGVzdA==";
    },
    uploadAsync: async (_url, uri) => {
      uploads.push(uri);
      assert(files.has(uri), `upload must use an existing app-owned file: ${uri}`);
      return { status: 200, body: "{}" };
    },
  };
  const supabase = {
    auth: {
      getSession: async () => ({
        data: { session: { access_token: "test-token" } },
        error: null,
      }),
    },
    storage: {
      from: () => ({ upload: async () => ({ data: {}, error: null }) }),
    },
  };
  const module = { exports: {} };
  const localRequire = (id) => {
    if (id === "expo-file-system/legacy") return fileSystem;
    if (id === "react-native") return { Platform: { OS: platform } };
    if (id === "../../lib/supabase") {
      return {
        supabase,
        supabaseAnonKey: "test-anon-key",
        supabaseUrl: "https://example.supabase.co",
      };
    }
    throw new Error(`Unexpected import: ${id}`);
  };

  vm.runInNewContext(`(function (require, module, exports) { ${compiled}\n})`, {
    URL,
    setTimeout,
  })(localRequire, module, module.exports);

  return { api: module.exports, copies, deleted, files, uploads };
};

test("persists a valid Android content URI without rejecting it via a false existence probe", async () => {
  const { api, copies, files } = loadStorageUpload();
  assert.equal(api.DOCUMENT_PICKER_COPY_TO_CACHE_DIRECTORY, false);
  const persisted = await api.persistUploadAsset({
    uri: "content://picker/document/42",
    name: "resume.pdf",
  });

  assert.match(persisted.uri, /^file:\/\/\/app\/documents\/musika-uploads\/pending\//);
  assert.equal(copies.length, 1);
  assert.equal(copies[0].from, "content://picker/document/42");
  assert(files.has(persisted.uri));
});

test("keeps the picker-managed cache copy on iOS", () => {
  const { api } = loadStorageUpload("ios");
  assert.equal(api.DOCUMENT_PICKER_COPY_TO_CACHE_DIRECTORY, true);
});

test("copies picker media before base64 reading and removes the working copy", async () => {
  const { api, copies, deleted } = loadStorageUpload();
  const base64 = await api.readLocalFileAsBase64("content://picker/video/7", "video.mp4");

  assert.equal(base64, "dGVzdA==");
  assert.equal(copies.length, 1);
  assert.match(copies[0].to, /\/musika-uploads\/working\//);
  assert.deepEqual(deleted, [copies[0].to]);
});

test("copies picker files before native binary upload", async () => {
  const { api, copies, deleted, uploads } = loadStorageUpload();
  const result = await api.uploadStorageObject({
    bucket: "documents",
    path: "owner/resume.pdf",
    contentType: "application/pdf",
    uri: "content://picker/document/99",
  });

  assert.equal(result.error, null);
  assert.equal(copies.length, 1);
  assert.deepEqual(uploads, [copies[0].to]);
  assert.deepEqual(deleted, [copies[0].to]);
});

test("every mobile document picker uses the platform-safe cache policy", () => {
  const files = [...sourceFilesUnder("mobile/app"), ...sourceFilesUnder("mobile/src")];
  const pickerCalls = [];

  for (const file of files) {
    const fileSource = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const visit = (node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "getDocumentAsync"
      ) {
        pickerCalls.push({ file, node, source: fileSource });
      }
      ts.forEachChild(node, visit);
    };
    visit(fileSource);
  }

  assert(pickerCalls.length > 0, "expected to find mobile document picker calls");
  for (const { file, node, source: fileSource } of pickerCalls) {
    const options = node.arguments[0];
    assert(
      options &&
        ts.isObjectLiteralExpression(options) &&
        options.properties.some((property) =>
          ts.isPropertyAssignment(property) &&
          property.name.getText(fileSource) === "copyToCacheDirectory" &&
          ts.isIdentifier(property.initializer) &&
          property.initializer.text === "DOCUMENT_PICKER_COPY_TO_CACHE_DIRECTORY"),
      `${file}: getDocumentAsync must use DOCUMENT_PICKER_COPY_TO_CACHE_DIRECTORY`,
    );
  }
});

test("upload thumbnail flows avoid expo-video-thumbnails host-cache files", () => {
  const uploadFrameFiles = [
    "mobile/src/services/visualUploadScreen.ts",
    "mobile/src/components/VideoUploader.tsx",
    "mobile/app/(tabs)/feed.tsx",
  ];

  for (const file of uploadFrameFiles) {
    const fileSource = readFileSync(file, "utf8");
    assert.doesNotMatch(
      fileSource,
      /expo-video-thumbnails|getThumbnailAsync/,
      `${file}: upload frames must not rely on host-cache thumbnail URIs`,
    );
    assert.match(
      fileSource,
      /generateNativeVideoFrame/,
      `${file}: upload frames must use native image references`,
    );
  }

  const helperSource = readFileSync("mobile/src/utils/videoFrames.ts", "utf8");
  assert.match(helperSource, /generateThumbnailsAsync/);
  assert.match(helperSource, /base64:\s*true/);
  assert.doesNotMatch(helperSource, /expo-file-system|copyAsync|readAsStringAsync/);

  const mobileFiles = [...sourceFilesUnder("mobile/app"), ...sourceFilesUnder("mobile/src")];
  for (const file of mobileFiles) {
    const fileSource = readFileSync(file, "utf8");
    assert.doesNotMatch(
      fileSource,
      /from\s+["']expo-video-thumbnails["']|VideoThumbnails\.getThumbnailAsync/,
      `${file}: mobile video frames must not expose host-cache thumbnail paths`,
    );
  }
});

test("the shared image uploader reads picker files through the safe-copy helper", () => {
  const imageUploaderSource = readFileSync("mobile/src/components/ImageUploader.tsx", "utf8");
  assert.match(imageUploaderSource, /persistUploadAsset\(/);
  assert.match(imageUploaderSource, /readLocalFileAsBase64\(asset\.uri, originalName\)/);
  assert.match(imageUploaderSource, /removePersistedUploadAsset\(asset\)/);
  assert.doesNotMatch(imageUploaderSource, /FileSystem\.readAsStringAsync/);
});
