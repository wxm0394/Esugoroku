#!/usr/bin/env python3
"""Browser E2E for 江戸浮世絵・絵双六.

The suite starts the zero-dependency preview server unless --base-url is given,
opens the game in headless Chromium and verifies that the four volumes have
independent geometry, UI skins, dice furniture and rule branches.

Examples:
    python3 tools/test_browser_e2e.py
    python3 tools/test_browser_e2e.py --base-url http://127.0.0.1:8090/
    python3 tools/test_browser_e2e.py --keep-screenshots --screenshot-dir /tmp/esr
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
import traceback
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXPECTED = [
    {
        "id": "tokaido",
        "layout": "spiral-corridor",
        "shape": "arrow-strip",
        "skin": "cedar-passport",
        "hud": "tokaido-gourmet",
        "device": "染付青花茶碗",
        "dice_shape": "porcelain-bowl",
        "nodes": 25,
        "goal": 24,
        "required": 0,
    },
    {
        "id": "yokai",
        "layout": "irregular-collage",
        "shape": "collage",
        "skin": "dark-temple",
        "hud": "hyakumonogatari-lanterns",
        "device": "朱符黒竹筒",
        "dice_shape": "talisman-bamboo",
        "nodes": 25,
        "goal": 24,
        "required": 0,
    },
    {
        "id": "kesshu",
        "layout": "tilted-warrior-cards",
        "shape": "warrior-card",
        "skin": "black-lacquer-armor",
        "hud": "kesshu-regalia",
        "device": "六角金蒔絵陣中筒",
        "dice_shape": "hex-makie",
        "nodes": 24,
        "goal": 23,
        "required": 3,
    },
    {
        "id": "genji",
        "layout": "four-color-split-tracks",
        "shape": "vertical-strip",
        "skin": "gold-nashiji-casket",
        "hud": "genji-balance",
        "device": "朱漆金鶴蒔絵振筒",
        "dice_shape": "vermilion-crane",
        "nodes": 27,
        "goal": 26,
        "required": 0,
    },
]
FOUR_STRIP_COLORS = {"#5383a6", "#e8b954", "#e09879", "#b8b6a8"}

CLICK_JS = r"""
const [sx, sy] = arguments;
const c = document.querySelector('#stage');
const r = c.getBoundingClientRect();
const sc = Math.min(c.width / 1280, c.height / 800);
const ox = (c.width - 1280 * sc) / 2;
const oy = (c.height - 800 * sc) / 2;
const px = r.left + (ox + sx * sc) * (r.width / c.width);
const py = r.top + (oy + sy * sc) * (r.height / c.height);
for (const type of ['pointerdown', 'pointerup']) {
  c.dispatchEvent(new PointerEvent(type, {
    clientX: px, clientY: py, pointerId: 1, bubbles: true,
    pointerType: 'mouse', button: 0, buttons: 1,
  }));
}
"""


class E2EFailure(AssertionError):
    pass


class Suite:
    def __init__(self) -> None:
        self.checks = 0
        self.failures: list[str] = []

    def check(self, condition: object, label: str, detail: str = "") -> bool:
        self.checks += 1
        if condition:
            print(f"  ok   {label}")
            return True
        message = label + (f"  [{detail}]" if detail else "")
        self.failures.append(message)
        print(f"  FAIL {label}" + (f"\n       {detail}" if detail else ""))
        return False

    def eq(self, actual: object, expected: object, label: str) -> bool:
        return self.check(actual == expected, label, f"expected={expected!r} actual={actual!r}")

    def require(self, condition: object, label: str, detail: str = "") -> None:
        if not self.check(condition, label, detail):
            raise E2EFailure(label)

    def section(self, name: str, fn) -> None:
        print(f"\n{name}")
        started = time.time()
        try:
            fn()
        except E2EFailure:
            pass
        except Exception as exc:  # keep testing the remaining sections
            self.checks += 1
            self.failures.append(f"{name}: {exc}")
            print(f"  FAIL {name}: {exc}")
            traceback.print_exc(limit=2)
        else:
            print(f"  ── {name} completed in {time.time() - started:.2f}s")


def wait_for(driver, expression: str, timeout: float = 15.0, label: str = "condition"):
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        try:
            value = driver.execute_script(expression)
            if value:
                return value
        except Exception as exc:  # module may still be loading
            last = exc
        time.sleep(0.05)
    raise E2EFailure(f"timeout waiting for {label}" + (f": {last}" if last else ""))


def snapshot(driver) -> dict:
    return driver.execute_script("return window.__ESR__.snapshot()")


def js(driver, source: str, *args):
    return driver.execute_script(source, *args)


def click_stage(driver, x: float, y: float) -> None:
    driver.execute_script(CLICK_JS, x, y)
    time.sleep(0.18)


def browser_errors(driver) -> list[str]:
    out = []
    try:
        for entry in driver.get_log("browser"):
            if entry.get("level") != "SEVERE":
                continue
            message = entry.get("message", "")
            if "favicon" in message.lower():
                continue
            out.append(message)
    except Exception:
        pass
    return out


def screenshot(driver, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    driver.save_screenshot(str(path))


def stage_crop(driver, x: int, y: int, w: int, h: int):
    """Return a PIL crop of the 1280x800 stage coordinate rectangle."""
    from io import BytesIO

    from PIL import Image

    image = Image.open(BytesIO(driver.get_screenshot_as_png())).convert("RGB")
    rect = driver.execute_script(
        "const r=document.querySelector('#stage').getBoundingClientRect();"
        "return {left:r.left,top:r.top,width:r.width,height:r.height,"
        "cw:document.querySelector('#stage').width,ch:document.querySelector('#stage').height};"
    )
    sc = min(rect["cw"] / 1280, rect["ch"] / 800)
    ox = (rect["cw"] - 1280 * sc) / 2
    oy = (rect["ch"] - 800 * sc) / 2
    x0 = int(round((ox + x * sc) * rect["width"] / rect["cw"]))
    y0 = int(round((oy + y * sc) * rect["height"] / rect["ch"]))
    x1 = int(round((ox + (x + w) * sc) * rect["width"] / rect["cw"]))
    y1 = int(round((oy + (y + h) * sc) * rect["height"] / rect["ch"]))
    return image.crop((x0, y0, x1, y1))


def image_diff_ratio(a, b) -> float:
    from PIL import ImageChops

    if a.size != b.size:
        return 1.0
    diff = ImageChops.difference(a, b).convert("L")
    changed = sum(1 for value in diff.getdata() if value > 18)
    return changed / max(1, a.size[0] * a.size[1])


def fetch_headers(url: str) -> dict[str, str]:
    request = urllib.request.Request(url, method="HEAD")
    with urllib.request.urlopen(request, timeout=8) as response:
        return {k.lower(): v for k, v in response.headers.items()}


def port_open(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.35)
        return sock.connect_ex((host, port)) == 0


class PreviewServer:
    def __init__(self, port: int):
        self.port = port
        self.process: subprocess.Popen | None = None
        self.url = f"http://127.0.0.1:{port}/"

    def __enter__(self):
        if port_open("127.0.0.1", self.port):
            raise E2EFailure(
                f"port {self.port} is already in use; stop the old preview server or pass --port"
            )
        node = os.environ.get("NODE") or shutil.which("node")
        if not node:
            raise E2EFailure("node executable not found")
        env = dict(os.environ)
        env["PORT"] = str(self.port)
        env["HOST"] = "127.0.0.1"
        self.process = subprocess.Popen(
            [node, str(ROOT / "server.js")],
            cwd=str(ROOT),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            start_new_session=True,
        )
        deadline = time.time() + 10
        while time.time() < deadline:
            try:
                with urllib.request.urlopen(self.url + "index.html", timeout=1) as response:
                    if response.status == 200:
                        return self
            except Exception:
                pass
            if self.process.poll() is not None:
                output = self.process.stdout.read() if self.process.stdout else ""
                raise E2EFailure(f"preview server exited early:\n{output}")
            time.sleep(0.08)
        raise E2EFailure("preview server did not start")

    def __exit__(self, exc_type, exc, tb):
        if self.process and self.process.poll() is None:
            try:
                os.killpg(self.process.pid, signal.SIGTERM)
            except Exception:
                self.process.terminate()
            try:
                self.process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(self.process.pid, signal.SIGKILL)
                except Exception:
                    self.process.kill()
        return False


PLAYWRIGHT_WORKER_JS = r"""
const { chromium } = require('playwright');
const readline = require('readline');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--mute-audio',
      '--window-size=1440,900',
    ],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const logs = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      logs.push({ level: 'SEVERE', message: msg.text() });
    }
  });
  page.on('pageerror', err => {
    logs.push({ level: 'SEVERE', message: String(err && err.stack || err) });
  });

  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let req;
    try {
      req = JSON.parse(line);
    } catch (e) {
      process.stdout.write(JSON.stringify({ ok: false, error: String(e) }) + '\n');
      continue;
    }
    try {
      if (req.cmd === 'goto') {
        await page.goto(req.url, { waitUntil: 'domcontentloaded', timeout: 25000 });
        process.stdout.write(JSON.stringify({ ok: true, result: true }) + '\n');
      } else if (req.cmd === 'exec') {
        const val = await page.evaluate(({ body, args }) => {
          const fn = new Function(body);
          return fn(...args);
        }, { body: req.source, args: req.args || [] });
        process.stdout.write(JSON.stringify({ ok: true, result: val === undefined ? null : val }) + '\n');
      } else if (req.cmd === 'screenshot') {
        const buf = await page.screenshot({ path: req.path || undefined, type: 'png' });
        process.stdout.write(JSON.stringify({ ok: true, result: buf.toString('base64') }) + '\n');
      } else if (req.cmd === 'logs') {
        const out = logs.splice(0, logs.length);
        process.stdout.write(JSON.stringify({ ok: true, result: out }) + '\n');
      } else if (req.cmd === 'quit') {
        await browser.close();
        process.stdout.write(JSON.stringify({ ok: true, result: true }) + '\n');
        process.exit(0);
      } else {
        process.stdout.write(JSON.stringify({ ok: false, error: 'unknown cmd: ' + req.cmd }) + '\n');
      }
    } catch (err) {
      process.stdout.write(JSON.stringify({ ok: false, error: String(err && err.message || err) }) + '\n');
    }
  }
})();
"""


class PlaywrightDriver:
    """WebDriver-compatible adapter over a persistent Node Playwright headless Chromium session."""

    def __init__(self) -> None:
        import base64

        self._base64 = base64
        node = os.environ.get("NODE") or shutil.which("node")
        if not node:
            raise E2EFailure("node executable not found for PlaywrightDriver")
        env = dict(os.environ)
        bun_nm = "/usr/local/share/bun-global/node_modules"
        env["NODE_PATH"] = f"{bun_nm}:{env.get('NODE_PATH', '')}".rstrip(":")
        self.proc = subprocess.Popen(
            [node, "-e", PLAYWRIGHT_WORKER_JS],
            cwd=str(ROOT),
            env=env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )

    def _rpc(self, payload: dict) -> object:
        if not self.proc or not self.proc.stdin or not self.proc.stdout:
            raise E2EFailure("Playwright worker is not running")
        self.proc.stdin.write(json.dumps(payload) + "\n")
        self.proc.stdin.flush()
        line = self.proc.stdout.readline()
        if not line:
            err = self.proc.stderr.read() if self.proc.stderr else ""
            raise E2EFailure(f"Playwright worker exited unexpectedly: {err}")
        resp = json.loads(line)
        if not resp.get("ok"):
            raise RuntimeError(resp.get("error", "Playwright RPC error"))
        return resp.get("result")

    def get(self, url: str) -> None:
        self._rpc({"cmd": "goto", "url": url})

    def execute_script(self, source: str, *args):
        return self._rpc({"cmd": "exec", "source": source, "args": list(args)})

    def save_screenshot(self, path: str) -> None:
        self._rpc({"cmd": "screenshot", "path": str(path)})

    def get_screenshot_as_png(self) -> bytes:
        b64 = self._rpc({"cmd": "screenshot"})
        return self._base64.b64decode(str(b64))

    def get_log(self, log_type: str = "browser") -> list[dict]:
        res = self._rpc({"cmd": "logs"})
        return list(res) if isinstance(res, list) else []

    def quit(self) -> None:
        if self.proc and self.proc.poll() is None:
            try:
                self._rpc({"cmd": "quit"})
            except Exception:
                pass
            try:
                self.proc.terminate()
                self.proc.wait(timeout=3)
            except Exception:
                self.proc.kill()


def make_driver(chrome: str, chromedriver: str):
    if Path(chrome).exists() and Path(chromedriver).exists():
        try:
            from selenium import webdriver
            from selenium.webdriver.chrome.options import Options
            from selenium.webdriver.chrome.service import Service

            options = Options()
            options.binary_location = chrome
            for arg in (
                "--headless=new",
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--hide-scrollbars",
                "--mute-audio",
                "--window-size=1440,900",
                "--force-device-scale-factor=1",
                "--font-render-hinting=none",
            ):
                options.add_argument(arg)
            options.set_capability("goog:loggingPrefs", {"browser": "ALL"})
            service = Service(executable_path=chromedriver)
            driver = webdriver.Chrome(service=service, options=options)
            driver.set_page_load_timeout(25)
            return driver
        except ImportError:
            pass
    return PlaywrightDriver()


def resolve_chromium_Display() -> str:
    for candidate in (
        os.environ.get("CHROME_BIN", ""),
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
        "/ms-playwright/chromium-1247/chrome-linux64/chrome",
    ):
        if candidate and Path(candidate).exists():
            return candidate
    return "playwright-chromium"


def main() -> int:
    parser = argparse.ArgumentParser(description="Browser E2E for E-Sugoroku")
    parser.add_argument("--base-url", help="use an already running preview server")
    parser.add_argument("--port", type=int, default=8090, help="port for the auto-started server")
    parser.add_argument("--chrome", default=resolve_chromium_Display())
    parser.add_argument("--chromedriver", default=os.environ.get("CHROMEDRIVER", "/usr/bin/chromedriver"))
    parser.add_argument("--screenshot-dir", help="keep screenshots in this directory")
    parser.add_argument("--keep-screenshots", action="store_true", help="keep screenshots in a temp directory")
    parser.add_argument("--json-out", help="write a machine-readable report")
    args = parser.parse_args()

    if args.screenshot_dir:
        shot_dir = Path(args.screenshot_dir).expanduser().resolve()
    elif args.keep_screenshots:
        shot_dir = Path(tempfile.mkdtemp(prefix="esugoroku-e2e-"))
    else:
        shot_dir = None
    suite = Suite()
    console: list[str] = []
    driver = None
    server_ctx = None
    started = time.time()

    if args.base_url:
        base_url = args.base_url.rstrip("/") + "/"
        server_ctx = None
    else:
        server_ctx = PreviewServer(args.port)

    try:
        if server_ctx is not None:
            server_ctx.__enter__()
            base_url = server_ctx.url

        print("E-Sugoroku browser E2E")
        print(f"  base: {base_url}")
        print(f"  chromium: {args.chrome}")

        suite.section("Static server headers", lambda: test_server(base_url, suite))

        driver = make_driver(args.chrome, args.chromedriver)
        driver.get(base_url)
        wait_for(driver, "return !!window.__ESR__", 20, "window.__ESR__")
        wait_for(driver, "return document.body.classList.contains('ready')", 10, "loading veil")
        time.sleep(0.45)

        suite.section("Boot and selection", lambda: test_selection(driver, suite, shot_dir))
        suite.section("Four independent volumes", lambda: test_volumes(driver, suite, shot_dir))
        suite.section("Independent rule branches", lambda: test_rules(driver, suite))
        suite.section("Dice physics and stable board", lambda: test_dice_and_stability(driver, suite))
        suite.section("Gallery and settlement flows", lambda: test_flows(driver, suite, shot_dir))

        console = browser_errors(driver)
        suite.check(not console, "no SEVERE browser console errors", "\n       ".join(console[:4]))
        if console:
            print("  console errors:")
            for message in console[:8]:
                print(f"       {message[:300]}")
    except Exception as exc:
        suite.checks += 1
        suite.failures.append(str(exc))
        print(f"\nFATAL {exc}")
        traceback.print_exc(limit=3)
    finally:
        if driver is not None:
            try:
                driver.quit()
            except Exception:
                pass
        if server_ctx is not None:
            server_ctx.__exit__(None, None, None)

    elapsed = time.time() - started
    print("\n" + "-" * 64)
    print(f"Browser checks: {suite.checks}, failures: {len(suite.failures)}")
    if suite.failures:
        print("Failed checks:")
        for failure in suite.failures:
            print(f"  - {failure}")
    else:
        print("All browser E2E checks passed.")
    if shot_dir:
        print(f"Screenshots: {shot_dir}")
    print(f"Elapsed: {elapsed:.2f}s")

    if args.json_out:
        report = {
            "suite": "browser-e2e",
            "checks": suite.checks,
            "failures": suite.failures,
            "passed": not suite.failures,
            "elapsedSeconds": round(elapsed, 3),
            "baseUrl": base_url,
            "screenshots": str(shot_dir) if shot_dir else None,
            "consoleErrors": console,
        }
        Path(args.json_out).write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    return 0 if not suite.failures else 1


def test_server(base_url: str, suite: Suite) -> None:
    headers = fetch_headers(base_url + "index.html")
    suite.eq(
        headers.get("cache-control", "").lower().replace(" ", ""),
        "no-store,no-cache,must-revalidate",
        "index.html sends the required no-cache policy",
    )
    suite.check("content-security-policy" in headers, "index.html sends a CSP")
    suite.check(headers.get("x-content-type-options") == "nosniff", "nosniff header is present")
    js_headers = fetch_headers(base_url + "js/main.js")
    suite.check(js_headers.get("content-type", "").startswith("text/javascript"), "JS module MIME type")
    manifest_headers = fetch_headers(base_url + "manifest.json")
    suite.check(
        manifest_headers.get("content-type", "").startswith("application/manifest+json"),
        "web manifest MIME type",
    )
    with urllib.request.urlopen(base_url + "manifest.json", timeout=5) as response:
        manifest = json.loads(response.read().decode("utf-8"))
    suite.eq(manifest.get("short_name"), "絵双六", "manifest short_name")
    suite.eq(len(manifest.get("icons", [])), 2, "manifest declares normal and maskable icons")


def test_selection(driver, suite: Suite, shot_dir: Path | None) -> None:
    snap = snapshot(driver)
    suite.eq(len(js(driver, "return window.__ESR__.boards")), 4, "four volumes are loaded")
    suite.eq(len(js(driver, "return window.__ESR__.cards")), 36, "thirty-six ukiyo-e cards are loaded")
    suite.eq(len(js(driver, "return window.__ESR__.charms")), 12, "twelve pocket charms are loaded in the V1.2 pool")
    suite.eq(len(snap["charms"]), 3, "three pocket charms are equipped in the active loadout")
    suite.eq(len(js(driver, "return window.__ESR__.achievements")), 24, "twenty-four achievements are defined")
    suite.check(snap["collection"] >= 13, "starter collection unlocks at least 13 prints")
    suite.check(
        js(driver, "return getComputedStyle(document.querySelector('#loading')).visibility") == "hidden",
        "loading veil is dismissed",
    )

    # Open the four-volume lobby modal via #btn-lobby and verify selection rectangles
    js(driver, "document.getElementById('btn-lobby').click()")
    wait_for(driver, "return window.__ESR__.snapshot().screen === 'SELECT_BOARD'", 5, "select board screen")
    snap = snapshot(driver)
    suite.eq(snap["screen"], "SELECT_BOARD", "opens the four-volume selection screen")

    rects = [js(driver, f"return window.__ESR__.selectRect({i})") for i in range(4)]
    signatures = {f'{r["x"]},{r["y"]},{r["w"]},{r["h"]}' for r in rects}
    suite.eq(len(signatures), 4, "four selection cards have independent rectangles")
    suite.check(
        all(0 <= r["x"] and r["x"] + r["w"] <= 1280 and 0 <= r["y"] and r["y"] + r["h"] <= 800 for r in rects),
        "selection cards stay inside the 1280x800 stage",
    )
    if shot_dir:
        screenshot(driver, shot_dir / "00-select.png")

    # Open side/charm setup for Volume II (Yokai) and verify skin & 3-charm loadout
    side = js(driver, "return window.__ESR__.openSide(1)")
    suite.eq(side["screen"], "SELECT_SIDE", "openSide(1) enters SELECT_SIDE screen")
    suite.eq(side["boardIdx"], 1, "selecting volume II targets the yokai board")
    suite.eq(side["uiSkin"], "dark-temple", "side screen uses the yokai skin")
    suite.eq(len(side["charms"]), 3, "side screen starts with three equipped charms")
    if shot_dir:
        screenshot(driver, shot_dir / "01-side-yokai.png")

    # Start the match via beginMatch()
    playing = js(driver, "return window.__ESR__.beginMatch()")
    suite.eq(playing["screen"], "PLAYING", "beginMatch() enters PLAYING screen")
    suite.eq(playing["boardIdx"], 1, "beginMatch() starts the selected volume")
    suite.eq(playing["turn"], 0, "human player takes the first turn")
    suite.eq(playing["phase"], "ROLL", "match opens in the roll phase")


def test_volumes(driver, suite: Suite, shot_dir: Path | None) -> None:
    signatures = []
    for index, expected in enumerate(EXPECTED):
        snap = js(driver, "const E=window.__ESR__; return E.switchToBoard(arguments[0])", index)
        time.sleep(0.35)
        label = f"{index + 1}. {expected['id']}"
        suite.eq(snap["boardIdx"], index, f"{label}: active board index")
        suite.eq(snap["boardId"], expected["id"], f"{label}: board id")
        suite.eq(snap["layout"], expected["layout"], f"{label}: independent layout")
        suite.eq(snap["shape"], expected["shape"], f"{label}: independent card shape")
        suite.eq(snap["uiSkin"], expected["skin"], f"{label}: independent UI skin")
        suite.eq(snap["hud"], expected["hud"], f"{label}: independent HUD")
        suite.eq(snap["diceDevice"], expected["device"], f"{label}: independent dice vessel")
        suite.eq(snap["diceShape"], expected["dice_shape"], f"{label}: independent dice shape")
        suite.eq(snap["requiredTokens"], expected["required"], f"{label}: required token count")
        suite.eq(snap["goal"], expected["goal"], f"{label}: goal node")
        suite.eq(len(snap["nodeRects"]), expected["nodes"], f"{label}: node count")
        suite.eq(snap["screen"], "PLAYING", f"{label}: snapshot is a playable scene")
        suite.check(len(snap["statusText"]) > 0, f"{label}: status line is populated")
        signatures.append(snap["geometrySignature"])

        nodes = snap["nodeRects"]
        suite.eq(len({n["id"] for n in nodes}), expected["nodes"], f"{label}: node ids are unique")
        suite.check(all(n["title"] for n in nodes), f"{label}: every node has a title")
        suite.check(
            all(
                n["x"] >= 0
                and n["y"] >= 0
                and n["x"] + n["w"] <= 800
                and n["y"] + n["h"] <= 640
                for n in nodes
            ),
            f"{label}: every card fits the 800x640 print surface",
        )
        suite.check(
            snap["start"] in {n["id"] for n in nodes} and snap["goal"] in {n["id"] for n in nodes},
            f"{label}: start and goal nodes exist",
        )
        suite.check(
            any(n["kind"] == "goal" for n in nodes) and any(n["kind"] == "start" for n in nodes),
            f"{label}: start and goal kinds are explicit",
        )

        # Each layout carries a different geometric idea and V1.2 board metadata.
        if expected["id"] == "tokaido":
            goal = nodes[snap["goal"]]
            suite.check(
                abs((goal["x"] + goal["w"] / 2) - 400) < 20 and abs((goal["y"] + goal["h"] / 2) - 320) < 20,
                "tokaido: goal (#24) sits at the centre of the clockwise spiral",
            )
            suite.check(
                all(0 <= n["id"] <= 23 for n in nodes if n["id"] != snap["goal"]),
                "tokaido: twenty-four corridor cards (#0..#23) surround the goal (#24)",
            )
            gourmet_ids = js(
                driver,
                "return window.__ESR__.boards[0].nodes.filter(n => (n.gourmetBit|0) > 0).map(n => n.id)",
            )
            suite.eq(gourmet_ids, [2, 7, 12], "tokaido: exactly three gourmet stations (#2, #7, #12)")
        elif expected["id"] == "yokai":
            areas = [n["w"] * n["h"] for n in nodes if n["kind"] != "goal"]
            suite.check(max(areas) / min(areas) >= 1.25, "yokai: cards have strongly irregular sizes")
            suite.check(
                len({(n["x"], n["y"]) for n in nodes}) == len(nodes),
                "yokai: collage cards are staggered, not grid-aligned",
            )
            lantern_ids = js(
                driver,
                "return window.__ESR__.boards[1].nodes.filter(n => (n.lanternBit|0) > 0).map(n => n.id)",
            )
            suite.eq(lantern_ids, [4, 10, 16, 22], "yokai: four Ao-Andon lantern nodes (#4, #10, #16, #22)")
            suite.eq(len(snap["previewTargets"]), 6, "yokai: all six die faces have preview targets")
            suite.eq(
                [item["roll"] for item in snap["previewTargets"]],
                [1, 2, 3, 4, 5, 6],
                "yokai: previews cover rolls 1 through 6",
            )
            suite.check(
                len({item["to"] for item in snap["previewTargets"]}) >= 4,
                "yokai: jump-table previews resolve to multiple distinct landing squares",
            )
            suite.check(
                all(0 <= item["to"] <= snap["goal"] for item in snap["previewTargets"]),
                "yokai: preview destinations stay on the board",
            )
        elif expected["id"] == "kesshu":
            tilts = [abs(n["tilt"]) for n in nodes]
            suite.check(sum(1 for t in tilts if t > 0.03) >= 10, "kesshu: warrior cards are visibly tilted")
            start = nodes[snap["start"]]
            goal = nodes[snap["goal"]]
            others = [n for n in nodes if n["id"] not in {snap["start"], snap["goal"]}]
            median_area = sorted(n["w"] * n["h"] for n in others)[len(others) // 2]
            suite.check(
                start["w"] * start["h"] >= median_area * 1.4
                and goal["w"] * goal["h"] >= median_area * 1.4,
                "kesshu: 出陣 (#0) and 上り (#23) are oversized army cards",
            )
            suite.eq(snap["kesshuPieces"], 0, "kesshu: regalia progress starts empty")
        elif expected["id"] == "genji":
            strip_colors = {n["stripColor"] for n in nodes if n["stripColor"]}
            suite.eq(strip_colors, FOUR_STRIP_COLORS, "genji: four colour-coded outer strips")
            suite.eq(
                sum(1 for n in nodes if n["kind"] == "good"),
                5,
                "genji: golden good track has five cards (#16..#20)",
            )
            suite.eq(
                sum(1 for n in nodes if n["kind"] == "evil"),
                5,
                "genji: purple evil track has five cards (#21..#25)",
            )
            suite.check(
                any(n["kind"] == "branch" and n["id"] == 15 for n in nodes),
                "genji: branch node #15 (関屋) separates good and evil tracks",
            )

        if shot_dir:
            screenshot(driver, shot_dir / f"{index + 2:02d}-board-{expected['id']}.png")

    suite.eq(len(set(signatures)), 4, "all four board geometry signatures are unique")
    suite.eq(
        len({e["hud"] for e in EXPECTED}),
        4,
        "all four HUD skins are distinct",
    )
    suite.eq(
        len({e["device"] for e in EXPECTED}),
        4,
        "all four dice vessels are distinct",
    )


def test_rules(driver, suite: Suite) -> None:
    # I. 東海道 (25 nodes, goal #24): gourmet coin collection, active coin spend, and goal overshoot bounce.
    js(driver, "return window.__ESR__.switchToBoard(0)")
    gourmet_snap = js(
        driver,
        """
        const E=window.__ESR__, m=E.state.match;
        m.pos[0]=1; m.tokens[0]=0; m.skip[0]=0; m.turn=0; m.charms=[0,0];
        m.customBuff=null; m.playerBuffs=[null,null];
        return E.applyRollNow(1, { spendCoin: false });
        """,
    )
    suite.eq(gourmet_snap["boardState"]["tokaido"]["gourmetMask"][0], 1, "tokaido: landing on #2 grants gourmet bit 1")
    suite.eq(gourmet_snap["boardState"]["tokaido"]["coins"][0], 1, "tokaido: landing on #2 grants +1 travel coin")

    snap = js(
        driver,
        """
        const E=window.__ESR__, m=E.state.match;
        m.pos[0]=23; m.tokens[0]=0; m.skip[0]=0; m.turn=0; m.charms=[0,0];
        m.boardState.tokaido.coins[0]=0;
        m.customBuff=null; m.playerBuffs=[null,null];
        return E.applyRollNow(3);
        """,
    )
    events = js(driver, "return window.__ESR__.state.match.events")
    suite.check(any(e["type"] == "bounce" for e in events), "tokaido: overshoot at #24 emits a bounce event")
    suite.eq(snap["pos"][0], 19, "tokaido: overshooting #24 by 2 bounces to #22 (鈴鹿関所) and pulls back -3 to #19")

    # II. 百種怪談 (25 nodes, goal #24): landing on #4 lights Ao-Andon lantern #1 and triggers jump table.
    js(driver, "return window.__ESR__.switchToBoard(1)")
    snap = js(
        driver,
        """
        const E=window.__ESR__, m=E.state.match;
        m.pos[0]=0; m.turn=0; m.charms=[0,0];
        m.customBuff=null; m.playerBuffs=[null,null];
        return E.applyRollNow(4);
        """,
    )
    events = js(driver, "return window.__ESR__.state.match.events")
    suite.check(any(e["type"] == "jump" for e in events), "yokai: landing performs a jump-table lookup")
    suite.eq(snap["pos"][0], 6, "yokai: roll 4 at start contacts #4 and jumps +2 to #6")
    suite.eq(snap["boardState"]["yokai"]["lanternMask"][0], 1, "yokai: contacting #4 lights Ao-Andon lantern bit 1")
    suite.check(snap["lanterns"] < 4, "yokai: lighting an Ao-Andon lantern decrements remaining unlit lanterns")

    # III. 英勇揃 (24 nodes, goal #23): 3 combat stances + goal locked until 3 regalia (mask 7) collected.
    js(driver, "return window.__ESR__.switchToBoard(2)")
    stance_pause = js(
        driver,
        """
        const E=window.__ESR__, m=E.state.match;
        m.pos[0]=1; m.pos[1]=2; m.tokens=[1,2]; m.turn=0; m.charms=[0,0];
        m.customBuff=null; m.playerBuffs=[null,null];
        return E.applyRollNow(1, { pauseOnChoice: true });
        """,
    )
    suite.eq(stance_pause["pendingChoice"]["type"], "kesshu_stance", "kesshu: clash pauses for 3-stance tactical choice")
    stance_res = js(driver, "return window.__ESR__.applyChoice({ type: 'kesshu_stance', stance: 'assault' }).snapshot")
    suite.eq(stance_res["tokens"][0], 3, "kesshu: assault stance steals missing regalia bit from opponent")

    snap = js(
        driver,
        """
        const E=window.__ESR__, m=E.state.match;
        m.pos[0]=22; m.tokens[0]=0; m.turn=0; m.charms=[0,0];
        m.customBuff=null; m.playerBuffs=[null,null];
        return E.applyRollNow(2);
        """,
    )
    events = js(driver, "return window.__ESR__.state.match.events")
    suite.check(any(e["type"] == "goal_locked" for e in events), "kesshu: goal #23 rejects an unprovisioned player")
    suite.eq(snap["pos"][0], 22, "kesshu: locked goal #23 pushes the piece back to #22")
    suite.eq(snap["winner"], -1, "kesshu: locked approach does not win")

    snap = js(
        driver,
        """
        const E=window.__ESR__, m=E.state.match;
        m.pos[0]=22; m.tokens[0]=7; m.turn=0; m.charms=[0,0];
        m.customBuff=null; m.playerBuffs=[null,null];
        return E.applyRollNow(1);
        """,
    )
    suite.eq(snap["winner"], 0, "kesshu: three regalia (mask 7) unlock goal #23 and win")
    suite.eq(snap["phase"], "SETTLEMENT", "kesshu: winning enters settlement")

    # IV. 源氏絵合 (27 nodes, goal #26): active choice at #15 関屋 + non-interactive parity fallback.
    js(driver, "return window.__ESR__.switchToBoard(3)")
    paused_branch = js(
        driver,
        """
        const E=window.__ESR__, m=E.state.match;
        m.pos[0]=14; m.turn=0; m.charms=[0,0];
        m.customBuff=null; m.playerBuffs=[null,null];
        return E.applyRollNow(3, { pauseOnChoice: true });
        """,
    )
    suite.eq(paused_branch["pendingChoice"]["type"], "genji_branch", "genji: reaching #15 pauses for active route choice")
    chosen_good = js(driver, "return window.__ESR__.applyChoice({ type: 'genji_branch', route: 'good' }).snapshot")
    suite.eq(chosen_good["pos"][0], 17, "genji: active choice 'good' on odd roll 3 enters good track (#16->#17)")

    js(driver, "return window.__ESR__.switchToBoard(3)")
    good = js(
        driver,
        """
        const E=window.__ESR__, m=E.state.match;
        m.pos[0]=15; m.turn=0; m.charms=[0,0];
        m.customBuff=null; m.playerBuffs=[null,null];
        return E.applyRollNow(2);
        """,
    )
    good_events = good.get("events") or js(driver, "return window.__ESR__.state.match.events")
    suite.check(any(e["type"] == "branch_good" for e in good_events), "genji: non-interactive even roll branches to good track")
    suite.eq(good["pos"][0], 17, "genji: even roll 2 from #15 advances two squares on the good track to #17")

    js(driver, "return window.__ESR__.switchToBoard(3)")
    evil = js(
        driver,
        """
        const E=window.__ESR__, m=E.state.match;
        m.pos[0]=15; m.turn=0; m.charms=[0,0];
        m.customBuff=null; m.playerBuffs=[null,null];
        return E.applyRollNow(3);
        """,
    )
    evil_events = evil.get("events") or js(driver, "return window.__ESR__.state.match.events")
    suite.check(any(e["type"] == "branch_evil" for e in evil_events), "genji: non-interactive odd roll branches to evil track")
    suite.eq(evil["pos"][0], 21, "genji: odd roll 3 from #15 enters evil track (#21..#23 -> -2 jump to #21)")


def test_dice_and_stability(driver, suite: Suite) -> None:
    js(driver, "return window.__ESR__.switchToBoard(0)")
    time.sleep(0.35)
    suite.check(
        js(driver, "return window.__ESR__.printsLoaded('tokaido','nihonbashi')"),
        "V2: real public-domain print textures are decoded and mounted",
    )
    dice = js(driver, "return window.__ESR__.state.physDice.map(d=>({x:d.x,y:d.y,z:d.z,value:d.value,settled:d.settled}))")
    suite.eq(len(dice), 1, "a single large bone die is present")
    suite.check(all(1040 < d["x"] < 1200 and 570 < d["y"] < 690 for d in dice), "die rests inside the right-hand tray")
    suite.check(all(d["settled"] for d in dice), "die begins settled")
    suite.check(all(1 <= d["value"] <= 6 for d in dice), "die has a legal pip value")
    suite.check(js(driver, "return window.__ESR__.state.physDice[0].active"), "the die is the active caster")

    # Verify 12-charm loadout customization & 4 AI difficulty tiers
    charm_snap = js(driver, "return window.__ESR__.setCharms(['wind', 'purify', 'reroll'])")
    suite.eq(charm_snap["charms"], ["wind", "purify", "reroll"], "3-slot charm loadout updates from 12-charm pool")
    ai_snap = js(driver, "return window.__ESR__.setAiDifficulty('master')")
    suite.eq(ai_snap["aiDifficulty"], "master", "AI difficulty switches to master Expectiminimax")
    js(driver, "return window.__ESR__.setAiDifficulty('normal')")

    # Trigger a physics roll and verify settled die orientation matches logic face
    js(driver, "window.__ESR__.roll(4)")
    time.sleep(0.18)
    spinning = js(driver, "return window.__ESR__.state.physDice.some(d=>!d.settled)")
    suite.check(spinning or js(driver, "return window.__ESR__.state.phase !== 'ROLL'"), "dice physics actually runs")
    settled_snap = js(driver, "window.__ESR__.settleDiceNow(); return window.__ESR__.settleMove();")
    suite.eq(settled_snap["dice"][0]["value"], 4, "settled die logic value is 4")
    suite.eq(settled_snap["dice"][0]["eulerTopFace"], 4, "settled 3D die Euler top face matches logic roll 4")
    suite.eq(settled_snap["dice"][0]["eulerAlignmentDot"], 1.0, "settled 3D die top face normal is strictly +Y (1.0)")


def test_flows(driver, suite: Suite, shot_dir: Path | None) -> None:
    js(driver, "return window.__ESR__.switchToBoard(3)")
    js(driver, "window.__ESR__.showGallery(true,'cards')")
    time.sleep(0.25)
    suite.check(js(driver, "return window.__ESR__.state.showGallery"), "card gallery opens")
    suite.eq(js(driver, "return window.__ESR__.state.galleryTab"), "cards", "gallery opens on the card tab")
    if shot_dir:
        screenshot(driver, shot_dir / "06-gallery-cards.png")
    js(driver, "document.getElementById('btn-gallery-close').click()")
    time.sleep(0.15)
    suite.check(not js(driver, "return window.__ESR__.state.showGallery"), "gallery close button works")

    js(driver, "window.__ESR__.showGallery(true,'achievements')")
    time.sleep(0.2)
    suite.eq(js(driver, "return window.__ESR__.state.galleryTab"), "achievements", "achievements tab opens")
    if shot_dir:
        screenshot(driver, shot_dir / "07-gallery-achievements.png")
    js(driver, "window.__ESR__.showGallery(false)")

    js(driver, "return window.__ESR__.switchToBoard(2)")
    snap = js(
        driver,
        """
        const E=window.__ESR__, m=E.state.match;
        m.pos[0]=22; m.tokens[0]=7; m.turn=0; m.charms=[0,0];
        m.customBuff=null; m.playerBuffs=[null,null];
        return E.applyRollNow(1);
        """,
    )
    suite.eq(snap["winner"], 0, "settlement flow is reachable at Kesshu goal #23")
    time.sleep(0.25)
    if shot_dir:
        screenshot(driver, shot_dir / "08-settlement.png")
    js(driver, "document.getElementById('btn-settlement-lobby').click()")
    time.sleep(0.2)
    suite.eq(snapshot(driver)["screen"], "SELECT_BOARD", "settlement menu returns to volume selection")


if __name__ == "__main__":
    sys.exit(main())
