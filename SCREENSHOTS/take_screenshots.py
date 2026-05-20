#!/usr/bin/env python3
"""
显影 Unearth — 自动截图脚本
用法：python3 take_screenshots.py
"""
from playwright.sync_api import sync_playwright
from pathlib import Path
from datetime import datetime
import time

BASE_URL = "http://localhost:5173"
OUT_DIR = Path(__file__).parent
PREFIX = datetime.now().strftime("%Y%m%d_%H%M")

def ss(page, name: str, wait: float = 1.2):
    time.sleep(wait)
    out = str(OUT_DIR / f"{PREFIX}_{name}.png")
    page.screenshot(path=out)
    print(f"  ✓ {out}")

def fresh_page(browser):
    """每个截图用独立 page，避免 SPA 状态残留"""
    ctx = browser.new_context(viewport={"width": 1440, "height": 860})
    return ctx.new_page()

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)

    # ── 1. StrataView ────────────────────────────────────────────────────────
    print("→ StrataView")
    pg = fresh_page(browser)
    pg.goto(BASE_URL)
    pg.wait_for_selector("text=2023", timeout=10000)
    ss(pg, "StrataView_redesign")
    pg.close()

    # ── 2. SiteView ──────────────────────────────────────────────────────────
    print("→ SiteView")
    pg = fresh_page(browser)
    pg.goto(BASE_URL)
    pg.wait_for_selector("text=2023", timeout=10000)
    time.sleep(0.5)
    pg.locator("button", has_text="5月").first.click()
    pg.wait_for_selector("text=拍摄事件", timeout=10000)
    ss(pg, "SiteView_redesign", wait=1.5)
    pg.close()

    # ── 3. DecisionView ──────────────────────────────────────────────────────
    print("→ DecisionView")
    pg = fresh_page(browser)
    pg.goto(BASE_URL)
    pg.wait_for_selector("text=2023", timeout=10000)
    time.sleep(0.5)
    pg.locator("button", has_text="5月").first.click()
    pg.wait_for_selector("text=拍摄事件", timeout=10000)
    time.sleep(1.2)

    # 用 JS 遍历找第一个 non-done 事件卡片并点击
    clicked = pg.evaluate("""
        () => {
            const btns = [...document.querySelectorAll('button.relative.w-full.overflow-hidden')];
            for (let i = 0; i < btns.length; i++) {
                // pending/in_progress 的 opacity 不是 '0.58'，boxShadow 没有 glow
                const op = btns[i].style.opacity;
                const shadow = btns[i].style.boxShadow || '';
                if (op !== '0.58' && !shadow.includes('28px')) {
                    btns[i].click();
                    return i;
                }
            }
            btns[0] && btns[0].click();
            return 0;
        }
    """)
    print(f"  clicked card index={clicked}")
    # 等待 intro curtain 消失 + 照片加载
    pg.wait_for_selector("text=K", timeout=15000)
    time.sleep(2.0)
    content = pg.content()
    if "这一组挖完了" in content:
        print("  → AllDone 状态，尝试下一个事件...")
        # 点 "下一组"
        pg.locator("button", has_text="下一组").first.click()
        time.sleep(2.5)
    ss(pg, "DecisionView_context_card", wait=0.3)

    # ── 4. AllDoneState ──────────────────────────────────────────────────────
    print("→ AllDoneState (pressing K until done)")
    for _ in range(80):
        if "这一组挖完了" in pg.content():
            break
        pg.keyboard.press("k")
        time.sleep(0.12)
    ss(pg, "AllDoneState", wait=0.8)
    pg.close()

    browser.close()
    print(f"\n✅ 完成！前缀: {PREFIX}")
