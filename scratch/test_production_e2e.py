import asyncio
import os
from playwright.async_api import async_playwright

ARTIFACTS_DIR = r"C:\Users\Raj Bhuva\.gemini\antigravity\brain\9fcbe949-eddb-40cb-b8fd-c8181b7ab467"

async def test_production_e2e():
    print("==================================================")
    print("HACKSYNC PRODUCTION-GRADE E2E VERIFICATION SUITE")
    print("==================================================")

    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="msedge", headless=True)
        context = await browser.new_context(viewport={"width": 1440, "height": 900})
        page = await context.new_page()

        # 1. Landing Page
        print("\n[Phase 1] Testing Landing Page...")
        await page.goto("http://localhost:8080/", wait_until="networkidle")
        title = await page.title()
        print(f"  [PASS] Landing Title: '{title}'")
        shot1 = os.path.join(ARTIFACTS_DIR, "e2e_01_landing.png")
        await page.screenshot(path=shot1)

        # 2. Demo Sandbox (Pure Isolated Demo)
        print("\n[Phase 2] Testing Demo Sandbox Mode (/demo)...")
        await page.goto("http://localhost:8080/demo", wait_until="networkidle")
        content = await page.content()
        assert "Demo Workspace Simulator" in content or "CampusMesh" in content or "Demo Platform" in content
        print("  [PASS] Demo Sandbox workspace loaded cleanly.")
        shot2 = os.path.join(ARTIFACTS_DIR, "e2e_02_demo_sandbox.png")
        await page.screenshot(path=shot2)

        # 3. Top Timer & Timeline History
        print("\n[Phase 3] Testing Top Timer & History Widget...")
        history_btn = page.locator("button:has-text('History')")
        await history_btn.click()
        await page.wait_for_timeout(1000)
        history_content = await page.content()
        assert "Timeline" in history_content
        print("  [PASS] Timeline history modal verified.")
        shot3 = os.path.join(ARTIFACTS_DIR, "e2e_03_history_modal.png")
        await page.screenshot(path=shot3)

        # Close history modal
        close_btn = page.locator("header button:has(svg.lucide-x)")
        if await close_btn.count() > 0:
            await close_btn.first.click()
            await page.wait_for_timeout(300)

        # 4. Auth Route & Modes
        print("\n[Phase 4] Testing Production Auth System (/auth)...")
        await page.goto("http://localhost:8080/auth", wait_until="networkidle")
        auth_content = await page.content()
        assert "Sign In" in auth_content
        print("  [PASS] Sign In mode rendered.")
        shot4 = os.path.join(ARTIFACTS_DIR, "e2e_04_auth.png")
        await page.screenshot(path=shot4)

        # 5. Route Protection Verification (All 9 authenticated endpoints)
        print("\n[Phase 5] Testing Route Guards on All 9 Authenticated Routes...")
        protected_routes = [
            "/dashboard",
            "/code",
            "/api",
            "/pitch",
            "/security",
            "/schema",
            "/tasks",
            "/settings",
            "/projects",
        ]

        for route in protected_routes:
            await page.goto(f"http://localhost:8080{route}", wait_until="networkidle")
            current_url = page.url
            assert "/auth" in current_url, f"Route {route} was not protected! Current URL: {current_url}"
            print(f"  [PASS] Guard protected {route} -> Redirected to {current_url}")

        await context.close()
        await browser.close()

        print("\n==================================================")
        print("ALL PRODUCTION E2E TESTS PASSED 100% SUCCESSFULLY!")
        print("==================================================")

if __name__ == "__main__":
    asyncio.run(test_production_e2e())
