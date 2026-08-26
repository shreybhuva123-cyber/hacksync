import sys
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from playwright.sync_api import sync_playwright
import time

def test_auth():
    print("Testing live auth against new Supabase project...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:8080/auth")
        page.wait_for_load_state("networkidle")

        # Check if Register tab exists
        reg_btn = page.locator("button:has-text('Register')").first
        if reg_btn.is_visible():
            reg_btn.click()
            time.sleep(0.5)
            
            # Fill registration form
            name_input = page.locator("input[placeholder*='Alex' i], input[placeholder*='name' i]").first
            if name_input.is_visible():
                name_input.fill("Test Engineer")
            
            email_input = page.locator("input[type='email']").first
            email_input.fill("test.engineer@hacksync.dev")
            
            pw_input = page.locator("input[type='password']").first
            pw_input.fill("Password123!")
            
            submit_btn = page.locator("button[type='submit']").first
            submit_btn.click()
            time.sleep(3)
            
            page.screenshot(path=r"C:\Users\Raj Bhuva\.gemini\antigravity\brain\9fcbe949-eddb-40cb-b8fd-c8181b7ab467\auth_after_signup.png")
            
            # Check for error or success alert
            error_el = page.locator(".text-destructive, .bg-destructive\\/15, [role='alert']")
            success_el = page.locator(".text-success, .bg-success\\/15")
            
            if error_el.count() > 0:
                print(f"Auth Error Result: {error_el.first.inner_text()}")
            if success_el.count() > 0:
                print(f"Auth Success Result: {success_el.first.inner_text()}")
            
            print(f"Current URL after submit: {page.url}")

        browser.close()

if __name__ == "__main__":
    test_auth()
