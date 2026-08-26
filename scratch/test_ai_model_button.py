import sys
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from playwright.sync_api import sync_playwright
import time

def test_model_btn():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:8080/demo")
        page.wait_for_load_state("networkidle")
        
        # Open Copilot with button click
        copilot_btn = page.locator("button:has-text('AI Copilot')").first
        copilot_btn.click()
        time.sleep(1)
        
        # Click Model button in header
        model_btn = page.locator("header button:has-text('Model')").first
        print("Model button visible:", model_btn.is_visible())
        model_btn.click()
        time.sleep(1)
        
        page.screenshot(path=r"C:\Users\Raj Bhuva\.gemini\antigravity\brain\9fcbe949-eddb-40cb-b8fd-c8181b7ab467\model_popover_opened.png")
        
        # Check if settings drawer appeared
        drawer = page.locator("text=AI Model Selection")
        print("Settings drawer visible:", drawer.is_visible())
        
        # Click Google Gemini option
        gemini_opt = page.locator("text=Google Gemini").first
        if gemini_opt.is_visible():
            gemini_opt.click()
            time.sleep(0.5)
            page.screenshot(path=r"C:\Users\Raj Bhuva\.gemini\antigravity\brain\9fcbe949-eddb-40cb-b8fd-c8181b7ab467\gemini_selected_with_input.png")
            print("Gemini option clicked, key input visible:", page.locator("input[placeholder*='AIza' i]").is_visible())
            
        browser.close()

if __name__ == "__main__":
    test_model_btn()
