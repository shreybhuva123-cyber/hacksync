/**
 * Route Smoke Test Script (HTTP status & response size validation)
 */
const BASE_URL = "http://localhost:8080";

const ROUTES = [
  "/",
  "/auth",
  "/projects",
  "/security",
  "/pitch",
  "/dashboard",
  "/api",
  "/schema",
  "/health",
  "/code",
  "/git",
  "/activity",
  "/tasks",
  "/settings",
  "/integrations",
  "/architecture",
  "/predemo",
  "/setup",
  "/handoffs",
  "/env",
];

async function runE2ETests() {
  console.log(`\n🚀 Starting Full E2E & Route Validation on ${BASE_URL}...\n`);
  let passed = 0;
  let failed = 0;

  for (const route of ROUTES) {
    const url = `${BASE_URL}${route}`;
    try {
      const startTime = Date.now();
      const res = await fetch(url, { headers: { Accept: "text/html" } });
      const elapsed = Date.now() - startTime;
      const text = await res.text();

      if (res.status === 200 && text.length > 500) {
        console.log(
          `  ✅ [${res.status}] ${route.padEnd(20)} (${text.length} bytes, ${elapsed}ms)`,
        );
        passed++;
      } else {
        console.error(
          `  ❌ [${res.status}] ${route.padEnd(20)} Unexpected response (length: ${text.length})`,
        );
        failed++;
      }
    } catch (err) {
      console.error(
        `  ❌ [ERR] ${route.padEnd(20)} ${err instanceof Error ? err.message : String(err)}`,
      );
      failed++;
    }
  }

  console.log(`\n──────────────────────────────────────────────────`);
  console.log(`Total Routes Tested: ${ROUTES.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`──────────────────────────────────────────────────\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runE2ETests();
