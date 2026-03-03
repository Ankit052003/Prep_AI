const axios = require("axios");

const baseURL = (process.env.ROUTE_BASE_URL || "http://localhost:5000").replace(/\/+$/, "");

const checks = [
  {
    name: "Root health",
    method: "get",
    path: "/",
    data: undefined,
  },
  {
    name: "Interview start",
    method: "post",
    path: "/api/interview/start",
    data: {},
  },
  {
    name: "Interview generate alias",
    method: "post",
    path: "/api/interview/generate",
    data: {},
  },
  {
    name: "Interview answer",
    method: "post",
    path: "/api/interview/answer",
    data: {
      interviewId: "invalid-id",
      answer: "Test answer",
    },
  },
  {
    name: "Interview answer by param",
    method: "post",
    path: "/api/interview/invalid-id/answer",
    data: {
      answer: "Test answer",
    },
  },
  {
    name: "Interview evaluate",
    method: "post",
    path: "/api/interview/evaluate",
    data: {},
  },
  {
    name: "Interview finish",
    method: "post",
    path: "/api/interview/finish",
    data: {},
  },
  {
    name: "Resume upload",
    method: "post",
    path: "/api/resume/upload",
    data: {},
  },
  {
    name: "Speech-to-text",
    method: "post",
    path: "/api/test/stt",
    data: {},
  },
];

async function runCheck({ name, method, path, data }) {
  const url = `${baseURL}${path}`;

  try {
    const response = await axios({
      method,
      url,
      data,
      timeout: 15000,
      validateStatus: () => true,
    });

    const status = response.status;
    const ok = status !== 404;

    return {
      name,
      method: method.toUpperCase(),
      path,
      status,
      ok,
    };
  } catch (error) {
    if (error.response) {
      return {
        name,
        method: method.toUpperCase(),
        path,
        status: error.response.status,
        ok: error.response.status !== 404,
      };
    }

    return {
      name,
      method: method.toUpperCase(),
      path,
      status: "DOWN",
      ok: false,
      error: error.code || error.message,
    };
  }
}

async function main() {
  console.log(`Checking routes against ${baseURL}`);

  const results = [];
  for (const check of checks) {
    // Run sequentially to avoid triggering external API limits in parallel.
    const result = await runCheck(check);
    results.push(result);

    if (result.status === "DOWN") {
      console.log(
        `[DOWN] ${result.method} ${result.path} (${result.name}) -> ${result.error}`
      );
      continue;
    }

    const label = result.ok ? "OK" : "MISSING";
    console.log(
      `[${label}] ${result.method} ${result.path} (${result.name}) -> ${result.status}`
    );
  }

  const missing = results.filter((r) => r.status === 404);
  const down = results.filter((r) => r.status === "DOWN");
  const ok = results.filter((r) => r.ok).length;

  console.log("\nSummary");
  console.log(`- Total checks: ${results.length}`);
  console.log(`- OK (not 404): ${ok}`);
  console.log(`- Missing (404): ${missing.length}`);
  console.log(`- Server/API down: ${down.length}`);

  if (missing.length || down.length) {
    process.exitCode = 1;
  }
}

main();
