import sys
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from playwright.sync_api import sync_playwright
import time

def capture():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:8080/demo")
        page.wait_for_load_state("networkidle")
        
        # Click the AI Copilot button in the header
        btn = page.locator("button:has-text('AI Copilot')").first
        btn.click()
        time.sleep(1)
        
        # Click the Model button in the modal header
        model_btn = page.locator("[data-testid='model-selector-btn']").first
        print("Model button found:", model_btn.is_visible())
        model_btn.click()
        time.sleep(1)
        
        page.screenshot(path=r"C:\Users\Raj Bhuva\.gemini\antigravity\brain\9fcbe949-eddb-40cb-b8fd-c8181b7ab467\model_drawer_active.png")
        print("Successfully captured model_drawer_active.png!")
        browser.close()

if __name__ == "__main__":
    capture()
