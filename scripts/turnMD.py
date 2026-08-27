# pip install playwright beautifulsoup4 markdownify
# python -m playwright install chromium

"""
GENERIC FULL SUBTREE WEBSITE -> MARKDOWN CRAWLER

FIXES:
- Crawls ALL sub-pages under the provided START_URL subtree
- Handles static sites, mkdocs, sphinx, docusaurus, GitHub Pages
- Follows:
    - relative links
    - sidebar links
    - index pages
    - links missing trailing slash
    - .html pages
- Prevents crawling parent directories
- Same domain only
- Better subtree matching for GitHub Pages and docs sites
"""

import os
import re
import time
from collections import deque
from urllib.parse import urljoin, urlparse, urldefrag

from bs4 import BeautifulSoup
from markdownify import markdownify as md
from playwright.sync_api import sync_playwright


# =========================================================
# CHANGE ONLY THIS
# =========================================================
START_URL = "https://docs.b.ai/llmservice/deepseek-harness/integration-guide/"
# =========================================================


OUTPUT_DIR = "site_md_output"
HEADLESS = True
REQUEST_TIMEOUT = 90000
CRAWL_DELAY = 0.5


SKIP_EXTENSIONS = (
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp",
    ".pdf", ".zip", ".rar", ".7z",
    ".mp4", ".mp3", ".avi", ".mov",
    ".css", ".js", ".json", ".xml",
    ".ico"
)


# =========================================================
# START URL ANALYSIS
# =========================================================
parsed_start = urlparse(START_URL)
BASE_DOMAIN = parsed_start.netloc.lower()

# KEY FIX:
# If starting from a file page, use its directory as subtree root
# Example:
# /TradingView-Screener/3.0.0/tradingview_screener.html
# -> /TradingView-Screener/3.0.0/
start_path = parsed_start.path

if "." in os.path.basename(start_path):
    SUBTREE_ROOT = os.path.dirname(start_path).rstrip("/") + "/"
else:
    SUBTREE_ROOT = start_path.rstrip("/") + "/"

if not SUBTREE_ROOT.startswith("/"):
    SUBTREE_ROOT = "/" + SUBTREE_ROOT


# =========================================================
# PREP
# =========================================================
visited = set()
queue = deque()

os.makedirs(OUTPUT_DIR, exist_ok=True)


# =========================================================
# HELPERS
# =========================================================
def normalize_url(url: str) -> str:
    """
    Normalize URL:
    - Remove fragments
    - Remove query
    - Keep .html pages
    - Standardize directory slash
    """
    clean, _ = urldefrag(url)
    parsed = urlparse(clean)

    path = parsed.path or "/"

    # Standardize directory paths only
    if not os.path.basename(path).count("."):
        if not path.endswith("/"):
            path += "/"

    return f"{parsed.scheme}://{parsed.netloc}{path}"


def is_same_domain(url: str) -> bool:
    return urlparse(url).netloc.lower() == BASE_DOMAIN


def is_valid_subpage(url: str) -> bool:
    """
    Allow:
    - Same domain
    - Under subtree root
    - Files/pages inside subtree
    """
    parsed = urlparse(url)

    if parsed.scheme not in ("http", "https"):
        return False

    if parsed.netloc.lower() != BASE_DOMAIN:
        return False

    path = parsed.path or "/"

    # Skip assets
    lower_path = path.lower()
    if lower_path.endswith(SKIP_EXTENSIONS):
        return False

    # MAIN FIX:
    # Must stay inside subtree root
    if not path.startswith(SUBTREE_ROOT):
        return False

    return True


def filename_from_url(url: str) -> str:
    parsed = urlparse(url)

    path = parsed.path.strip("/")

    if not path:
        path = "index"

    # If directory page, save index
    if path.endswith("/"):
        path += "index"

    safe_name = re.sub(r"[^a-zA-Z0-9_-]", "_", path)

    return os.path.join(OUTPUT_DIR, f"{safe_name}.md")


def extract_main_content(soup: BeautifulSoup):
    selectors = [
        "main",
        "article",
        '[role="main"]',
        ".md-content",
        ".rst-content",
        ".document",
        ".content",
        ".main-content",
        ".post-content",
        ".entry-content",
        ".markdown",
        ".theme-doc-markdown",
        ".docMainContainer",
        ".documentation",
        "body"
    ]

    for selector in selectors:
        content = soup.select_one(selector)
        if content:
            return content

    return soup.body


def clean_content(main_content):
    remove_selectors = [
        "nav",
        "header",
        "footer",
        "script",
        "style",
        "noscript",
        "aside",
        ".sidebar",
        ".menu",
        ".navigation",
        ".toc",
        ".table-of-contents",
        ".theme-doc-toc-desktop",
        ".pagination-nav",
        ".breadcrumbs",
        ".breadcrumb"
    ]

    for selector in remove_selectors:
        for tag in main_content.select(selector):
            tag.decompose()


def discover_links(soup: BeautifulSoup, current_url: str):
    """
    Aggressively discover internal subtree links
    """
    found = set()

    # Standard href links
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()

        if not href:
            continue

        if href.startswith(("javascript:", "mailto:", "tel:")):
            continue

        full_url = normalize_url(urljoin(current_url, href))

        if is_valid_subpage(full_url):
            found.add(full_url)

    # Extra: some docs frameworks store links in data attributes
    for tag in soup.find_all(attrs={"data-href": True}):
        href = tag.get("data-href", "").strip()

        if href:
            full_url = normalize_url(urljoin(current_url, href))

            if is_valid_subpage(full_url):
                found.add(full_url)

    return found


# =========================================================
# MAIN
# =========================================================
def crawl_site():
    queue.append(normalize_url(START_URL))

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=HEADLESS)

        page = browser.new_page()

        while queue:
            current_url = queue.popleft()

            if current_url in visited:
                continue

            visited.add(current_url)

            try:
                print(f"Crawling: {current_url}")

                page.goto(
                    current_url,
                    wait_until="networkidle",
                    timeout=REQUEST_TIMEOUT
                )

                # Expand navigation menus/buttons
                for selector in [
                    "button",
                    "[aria-expanded='false']",
                    ".md-nav__toggle",
                    ".toctree-expand"
                ]:
                    for el in page.query_selector_all(selector):
                        try:
                            el.click(timeout=300)
                        except:
                            pass

                # Scroll full page
                page.evaluate("""
                    window.scrollTo(0, document.body.scrollHeight);
                """)

                time.sleep(1)

                html = page.content()
                soup = BeautifulSoup(html, "html.parser")

                # -------------------------
                # LINK DISCOVERY
                # -------------------------
                new_links = discover_links(soup, current_url)

                for link in sorted(new_links):
                    if link not in visited and link not in queue:
                        queue.append(link)

                # -------------------------
                # CONTENT EXTRACTION
                # -------------------------
                main_content = extract_main_content(soup)

                if main_content:
                    clean_content(main_content)

                    markdown = md(
                        str(main_content),
                        heading_style="ATX",
                        bullets="-"
                    )

                    if markdown.strip():
                        filepath = filename_from_url(current_url)

                        with open(filepath, "w", encoding="utf-8") as f:
                            f.write(f"Source: {current_url}\n\n")
                            f.write(markdown)

                        print(f"Saved: {filepath}")

                time.sleep(CRAWL_DELAY)

            except Exception as e:
                print(f"Failed: {current_url} -> {e}")

        browser.close()


# =========================================================
# RUN
# =========================================================
if __name__ == "__main__":
    print(f"START URL: {START_URL}")
    print(f"SUBTREE ROOT: {SUBTREE_ROOT}")

    crawl_site()

    print(f"\nDONE: {len(visited)} pages crawled.")
    print(f"Files saved to: {os.path.abspath(OUTPUT_DIR)}")