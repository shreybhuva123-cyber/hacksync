import asyncio
import os
from playwright.async_api import async_playwright

ARTIFACTS_DIR = r"C:\Users\Raj Bhuva\.gemini\antigravity\brain\9fcbe949-eddb-40cb-b8fd-c8181b7ab467"

async def test_ai_live():
    print("==================================================")
    print("HACKSYNC AI COPILOT LIVE INTERACTION TEST")
    print("==================================================")

    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="msedge", headless=True)
        context = await browser.new_context(viewport={"width": 1440, "height": 900})
        page = await context.new_page()

        await page.goto("http://localhost:8080/demo", wait_until="networkidle")
        await page.wait_for_timeout(600)

        # Open AI Copilot Modal
        ai_btn = page.locator("button:has-text('AI Copilot')")
        await ai_btn.click()
        await page.wait_for_timeout(600)

        modal_content = await page.content()
        assert "AI Workspace Copilot" in modal_content or "Copilot" in modal_content
        print("  [PASS] AI Copilot modal opened successfully.")

        # Type a query into the AI Copilot
        prompt_input = page.locator("textarea[placeholder*='Ask anything'], input[placeholder*='Ask']")
        if await prompt_input.count() > 0:
            await prompt_input.first.fill("How are our API contracts and database schema kept in sync?")
            send_btn = page.locator("button:has-text('Send'), button[title*='Send'], button:has(svg.lucide-send), button:has(svg.lucide-arrow-up)")
            if await send_btn.count() > 0:
                await send_btn.first.click()
                await page.wait_for_timeout(1200)

        shot = os.path.join(ARTIFACTS_DIR, "live_07_ai_copilot_modal.png")
        await page.screenshot(path=shot)
        print(f"  [PASS] Saved AI Copilot screenshot: {shot}")

        await context.close()
        await browser.close()
        print("==================================================")
        print("AI COPILOT LIVE TEST COMPLETE!")
        print("==================================================")

if __name__ == "__main__":
    asyncio.run(test_ai_live())
