"use strict";

const {
  execFileSync
} = require("node:child_process");
const crypto =
  require("node:crypto");

const EXPECTED_REPOSITORY =
  "takechanman12250711-oss/chappy-boatrace-ai";
const PAGES_URL =
  "https://takechanman12250711-oss.github.io/chappy-boatrace-ai/";
const API_BASE_URL =
  "https://chappy-boatrace-api.vercel.app";
const WITH_API =
  process.argv.includes("--with-api");

function runGit(
  args,
  { trim = true } = {}
) {
  const output = execFileSync(
    "git",
    args,
    {
      encoding: "utf8",
      stdio: [
        "ignore",
        "pipe",
        "pipe"
      ]
    }
  );
  return trim ? output.trim() : output;
}

function repositorySlug(remote) {
  const value =
    String(remote || "").trim();
  const allowed = new Set([
    `https://github.com/${EXPECTED_REPOSITORY}`,
    `https://github.com/${EXPECTED_REPOSITORY}.git`,
    `git@github.com:${EXPECTED_REPOSITORY}`,
    `git@github.com:${EXPECTED_REPOSITORY}.git`
  ]);

  return allowed.has(value)
    ? EXPECTED_REPOSITORY
    : "";
}

function jstDateKey() {
  return new Intl.DateTimeFormat(
    "sv-SE",
    { timeZone: "Asia/Tokyo" }
  )
    .format(new Date())
    .replaceAll("-", "");
}

function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(value)
    .digest("hex");
}

async function fetchText(url) {
  const response = await fetch(
    url,
    {
      headers: {
        "user-agent":
          "chappy-connection-preflight"
      },
      signal:
        AbortSignal.timeout(30000)
    }
  );
  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `${new URL(url).host} が HTTP ${response.status} を返しました`
    );
  }

  return text;
}

function wait(milliseconds) {
  return new Promise(resolve =>
    setTimeout(resolve, milliseconds)
  );
}

async function fetchPublishedMain(
  expectedHtml
) {
  for (
    let attempt = 1;
    attempt <= 3;
    attempt += 1
  ) {
    const separator =
      PAGES_URL.includes("?")
        ? "&"
        : "?";
    const liveHtml = await fetchText(
      `${PAGES_URL}${separator}connection_preflight=${Date.now()}-${attempt}`
    );

    if (
      sha256(expectedHtml) ===
      sha256(liveHtml)
    ) {
      return liveHtml;
    }

    if (attempt < 3) {
      await wait(2000);
    }
  }

  throw new Error(
    "GitHub Pages の内容が origin/main と一致しません"
  );
}

async function main() {
  const root = runGit([
    "rev-parse",
    "--show-toplevel"
  ]);
  const remote = runGit([
    "-C",
    root,
    "remote",
    "get-url",
    "origin"
  ]);

  if (
    repositorySlug(remote) !==
    EXPECTED_REPOSITORY
  ) {
    throw new Error(
      "origin が想定外のリポジトリを指しています"
    );
  }

  runGit([
    "-C",
    root,
    "fetch",
    "--quiet",
    "origin",
    "main"
  ]);
  const mainHtml = runGit([
    "-C",
    root,
    "show",
    "origin/main:index.html"
  ], { trim: false });

  await fetchPublishedMain(mainHtml);

  console.log(
    `GitHub read: OK (${EXPECTED_REPOSITORY} main)`
  );
  console.log(
    `GitHub Pages: OK (${PAGES_URL})`
  );
  console.log(
    "GitHub Pages content: origin/main と一致"
  );

  if (WITH_API) {
    const apiBody = await fetchText(
      `${API_BASE_URL}/api/schedule?date=${jstDateKey()}`
    );
    let apiData = null;
    try {
      apiData = JSON.parse(apiBody);
    } catch {
      throw new Error(
        "Vercel API がJSON以外を返しました"
      );
    }
    if (apiData?.ok === false) {
      throw new Error(
        `Vercel API エラー: ${String(apiData?.error || "詳細なし")}`
      );
    }
    console.log(
      `Vercel API: OK (${API_BASE_URL})`
    );
  }

  console.log(
    "Connector権限は資格情報を保存せず、各Connectorの読み取り操作で確認してください。"
  );
}

if (require.main === module) {
  main().catch(error => {
    console.error(
      `接続事前確認: 失敗 - ${error?.message || error}`
    );
    process.exitCode = 1;
  });
}

module.exports = {
  repositorySlug,
  jstDateKey,
  sha256,
  fetchPublishedMain
};
