import sys
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.on("console", lambda msg: print(f"[BROWSER CONSOLE] {msg.type}: {msg.text}"))
        
        page.goto("http://localhost:8080/demo")
        page.wait_for_load_state("networkidle")
        time.sleep(1)
        
        # Click the AI Copilot button in top navbar
        page.click("button:has-text('AI Copilot')")
        time.sleep(1)
        
        # Find Model button inside the dialog / modal
        model_btn = page.locator("[data-testid='model-selector-btn']")
        print("Model button count:", model_btn.count())
        model_btn.click(force=True)
        time.sleep(1)
        
        # Click Google Gemini card
        page.locator("button:has-text('Google Gemini')").first.click()
        time.sleep(1)
        
        page.screenshot(path=r"C:\Users\Raj Bhuva\.gemini\antigravity\brain\9fcbe949-eddb-40cb-b8fd-c8181b7ab467\model_gemini_card_selected.png")
        print("Gemini selection screenshot captured.")
        browser.close()

if __name__ == "__main__":
    run()
