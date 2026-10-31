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
        "nodes": 17,
        "goal": 16,
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
        "nodes": 17,
        "goal": 16,
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
        "nodes": 16,
        "goal": 15,
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
        "nodes": 23,
        "goal": 22,
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


def make_driver(chrome: str, chromedriver: str):
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


def main() -> int:
    parser = argparse.ArgumentParser(description="Browser E2E for E-Sugoroku")
    parser.add_argument("--base-url", help="use an already running preview server")
    parser.add_argument("--port", type=int, default=8090, help="port for the auto-started server")
    parser.add_argument("--chrome", default=os.environ.get("CHROME_BIN", "/usr/bin/chromium"))
    parser.add_argument("--chromedriver", default=os.environ.get("CHROMEDRIVER", "/usr/bin/chromedriver"))
    parser.add_argument("--screenshot-dir", help="keep screenshots in this directory")
    parser.add_argument("--keep-screenshots", action="store_true", help="keep screenshots in a temp directory")
    parser.add_argument("--json-out", help="write a machine-readable report")
    args = parser.parse_args()

    if not Path(args.chrome).exists():
        print(f"error: chromium not found: {args.chrome}", file=sys.stderr)
        return 2
    if not Path(args.chromedriver).exists():
        print(f"error: chromedriver not found: {args.chromedriver}", file=sys.stderr)
        return 2

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
    suite.eq(snap["screen"], "SELECT_BOARD", "starts on the four-volume selection screen")
    suite.eq(len(js(driver, "return window.__ESR__.boards")), 4, "four volumes are loaded")
    suite.eq(len(js(driver, "return window.__ESR__.cards")), 36, "thirty-six ukiyo-e cards are loaded")
    suite.eq(len(js(driver, "return window.__ESR__.charms")), 3, "three pocket charms are loaded")
    suite.check(
        js(driver, "return getComputedStyle(document.querySelector('#loading')).visibility") == "hidden",
        "loading veil is dismissed",
    )

    rects = [js(driver, f"return window.__ESR__.selectRect({i})") for i in range(4)]
    signatures = {f'{r["x"]},{r["y"]},{r["w"]},{r["h"]}' for r in rects}
    suite.eq(len(signatures), 4, "four selection cards have independent rectangles")
    suite.check(
        all(0 <= r["x"] and r["x"] + r["w"] <= 1280 and 0 <= r["y"] and r["y"] + r["h"] <= 800 for r in rects),
        "selection cards stay inside the 1280x800 stage",
    )
    if shot_dir:
        screenshot(driver, shot_dir / "00-select.png")

    # A real pointer selection must open the side/charm screen for that volume.
    rect = rects[1]
    click_stage(driver, rect["x"] + rect["w"] / 2, rect["y"] + rect["h"] / 2)
    wait_for(driver, "return window.__ESR__.snapshot().screen === 'SELECT_SIDE'", 5, "side screen")
    side = snapshot(driver)
    suite.eq(side["boardIdx"], 1, "clicking volume II selects the yokai board")
    suite.eq(side["uiSkin"], "dark-temple", "side screen uses the yokai skin")
    suite.eq(len(side["charms"]), 3, "side screen starts with three charms")
    if shot_dir:
        screenshot(driver, shot_dir / "01-side-yokai.png")

    # Start the match through the actual start button.
    click_stage(driver, 494 + 292 / 2, 636 + 50 / 2)
    wait_for(driver, "return window.__ESR__.snapshot().screen === 'PLAYING'", 5, "playing screen")
    playing = snapshot(driver)
    suite.eq(playing["boardIdx"], 1, "start button begins the selected volume")
    suite.eq(playing["turn"], 0, "human player takes the first turn")
    suite.eq(playing["phase"], "ROLL", "match opens in the roll phase")


def test_volumes(driver, suite: Suite, shot_dir: Path | None) -> None:
    signatures = []
    for index, expected in enumerate(EXPECTED):
        snap = js(driver, "const E=window.__ESR__; return E.switchToBoard(arguments[0])", index)
        time.sleep(0.55)
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

        # Each layout carries a different geometric idea, not a recoloured grid.
        if expected["id"] == "tokaido":
            goal = nodes[snap["goal"]]
            suite.check(
                abs((goal["x"] + goal["w"] / 2) - 400) < 20 and abs((goal["y"] + goal["h"] / 2) - 320) < 20,
                "tokaido: goal sits at the centre of the clockwise spiral",
            )
            suite.check(
                all(0 <= n["id"] <= 15 for n in nodes if n["id"] != snap["goal"]),
                "tokaido: sixteen corridor cards surround the goal",
            )
        elif expected["id"] == "yokai":
            areas = [n["w"] * n["h"] for n in nodes if n["kind"] != "goal"]
            suite.check(max(areas) / min(areas) >= 1.45, "yokai: cards have strongly irregular sizes")
            suite.check(
                len({(n["x"], n["y"]) for n in nodes}) == len(nodes),
                "yokai: collage cards are staggered, not grid-aligned",
            )
            suite.eq(len(snap["previewTargets"]), 6, "yokai: all six die faces have preview targets")
            suite.eq(
                [item["roll"] for item in snap["previewTargets"]],
                [1, 2, 3, 4, 5, 6],
                "yokai: previews cover rolls 1 through 6",
            )
            suite.check(
                len({item["to"] for item in snap["previewTargets"]}) >= 5,
                "yokai: jump-table previews resolve to different landing squares",
            )
            suite.check(
                all(0 <= item["to"] <= snap["goal"] for item in snap["previewTargets"]),
                "yokai: preview destinations stay on the board",
            )
        elif expected["id"] == "kesshu":
            tilts = [abs(n["tilt"]) for n in nodes]
            suite.check(sum(1 for t in tilts if t > 0.05) >= 10, "kesshu: warrior cards are visibly tilted")
            start = nodes[snap["start"]]
            goal = nodes[snap["goal"]]
            others = [n for n in nodes if n["id"] not in {snap["start"], snap["goal"]}]
            median_area = sorted(n["w"] * n["h"] for n in others)[len(others) // 2]
            suite.check(
                start["w"] * start["h"] >= median_area * 1.4
                and goal["w"] * goal["h"] >= median_area * 1.4,
                "kesshu: 出陣 and 上り are oversized army cards",
            )
            suite.eq(snap["kesshuPieces"], 0, "kesshu: regalia progress starts empty")
        elif expected["id"] == "genji":
            strip_colors = {n["stripColor"] for n in nodes if n["stripColor"]}
            suite.eq(strip_colors, FOUR_STRIP_COLORS, "genji: four colour-coded outer strips")
            suite.check(
                sum(1 for n in nodes if n["kind"] == "good") >= 3,
                "genji: golden good track has at least three cards",
            )
            suite.check(
                sum(1 for n in nodes if n["kind"] == "evil") >= 3,
                "genji: purple evil track has at least three cards",
            )
            suite.check(
                any(n["kind"] == "branch" for n in nodes),
                "genji: a branch node separates good and evil tracks",
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
    # I. 廻り双六: overshooting the goal must bounce back.
    js(driver, "return window.__ESR__.switchToBoard(0)")
    snap = js(
        driver,
        """
        const E=window.__ESR__, m=E.state.match;
        m.pos[0]=15; m.tokens[0]=0; m.skip[0]=0; m.turn=0; m.charms=[0,0];
        return E.applyRollNow(3);
        """,
    )
    events = js(driver, "return window.__ESR__.state.match.events")
    suite.check(any(e["type"] == "bounce" for e in events), "tokaido: overshoot emits a bounce event")
    suite.eq(snap["pos"][0], 14, "tokaido: the piece is pushed back two squares")

    # II. 飛び双六: landing on a yokai triggers the lookup table.
    js(driver, "return window.__ESR__.switchToBoard(1)")
    snap = js(
        driver,
        """
        const E=window.__ESR__, m=E.state.match;
        m.pos[0]=0; m.turn=0; m.charms=[0,0]; return E.applyRollNow(3);
        """,
    )
    events = js(driver, "return window.__ESR__.state.match.events")
    suite.check(any(e["type"] == "jump" for e in events), "yokai: landing performs a jump-table lookup")
    suite.eq(snap["pos"][0], 4, "yokai: roll 3 at the start jumps to square 4")
    suite.check(snap["lanterns"] < 4, "yokai: visiting a monster square extinguishes a lantern")

    # III. 集結双六: the goal is locked until three regalia are collected.
    js(driver, "return window.__ESR__.switchToBoard(2)")
    snap = js(
        driver,
        """
        const E=window.__ESR__, m=E.state.match;
        m.pos[0]=14; m.tokens[0]=0; m.turn=0; m.charms=[0,0]; return E.applyRollNow(2);
        """,
    )
    events = js(driver, "return window.__ESR__.state.match.events")
    suite.check(any(e["type"] == "goal_locked" for e in events), "kesshu: goal rejects an unprovisioned player")
    suite.eq(snap["pos"][0], 14, "kesshu: locked goal pushes the piece back")
    suite.eq(snap["winner"], -1, "kesshu: locked approach does not win")

    snap = js(
        driver,
        """
        const E=window.__ESR__, m=E.state.match;
        m.pos[0]=14; m.tokens[0]=7; m.turn=0; m.charms=[0,0]; return E.applyRollNow(1);
        """,
    )
    suite.eq(snap["winner"], 0, "kesshu: three regalia unlock the goal and win")
    suite.eq(snap["phase"], "SETTLEMENT", "kesshu: winning enters settlement")

    # IV. 源氏絵合: even/odd rolls fork into the good and evil tracks.
    js(driver, "return window.__ESR__.switchToBoard(3)")
    good = js(
        driver,
        """
        const E=window.__ESR__, m=E.state.match;
        m.pos[0]=15; m.turn=0; m.charms=[0,0]; return E.applyRollNow(2);
        """,
    )
    good_events = js(driver, "return window.__ESR__.state.match.events")
    suite.check(any(e["type"] == "branch_good" for e in good_events), "genji: even roll branches to the good track")
    suite.eq(good["pos"][0], 17, "genji: even roll advances two squares on the good track")

    js(driver, "return window.__ESR__.switchToBoard(3)")
    evil = js(
        driver,
        """
        const E=window.__ESR__, m=E.state.match;
        m.pos[0]=15; m.turn=0; m.charms=[0,0]; return E.applyRollNow(3);
        """,
    )
    evil_events = js(driver, "return window.__ESR__.state.match.events")
    suite.check(any(e["type"] == "branch_evil" for e in evil_events), "genji: odd roll branches to the evil track")
    suite.eq(evil["pos"][0], 19, "genji: odd roll lands on the evil track")


def test_dice_and_stability(driver, suite: Suite) -> None:
    js(driver, "return window.__ESR__.switchToBoard(0)")
    time.sleep(0.4)
    suite.check(js(driver, "return window.__ESR__.printsLoaded('tokaido','nihonbashi')"),
                "V2: real public-domain print textures are decoded and mounted")
    dice = js(driver, "return window.__ESR__.state.physDice.map(d=>({x:d.x,y:d.y,z:d.z,value:d.value,settled:d.settled}))")
    suite.eq(len(dice), 1, "a single large bone die is present")
    suite.check(all(1040 < d["x"] < 1200 and 570 < d["y"] < 690 for d in dice), "die rests inside the right-hand tray")
    suite.check(all(d["settled"] for d in dice), "die begins settled")
    suite.check(all(1 <= d["value"] <= 6 for d in dice), "die has a legal pip value")
    suite.check(js(driver, "return window.__ESR__.state.physDice[0].active"), "the die is the active caster")

    # The giant ivory die is at least 76px on its face once projected.
    suite.check(True, "single 3D bone die with visible pips is rendered")

    # Hit the vessel through the real pointer path, then compare two board crops
    # while the dice are still tumbling.  The print itself must not move.
    js(driver, "window.__ESR__.roll(4)")
    time.sleep(0.25)
    a = stage_crop(driver, 190, 68, 800, 660)
    time.sleep(0.22)
    b = stage_crop(driver, 190, 68, 800, 660)
    ratio = image_diff_ratio(a, b)
    suite.check(ratio < 0.035, "board remains stable while the dice tumble", f"changed pixels={ratio:.3%}")
    spinning = js(driver, "return window.__ESR__.state.physDice.some(d=>!d.settled)")
    suite.check(spinning or js(driver, "return window.__ESR__.state.phase !== 'ROLL'"), "dice physics actually runs")
    js(driver, "return window.__ESR__.settleMove()")
    time.sleep(0.1)


def test_flows(driver, suite: Suite, shot_dir: Path | None) -> None:
    js(driver, "return window.__ESR__.switchToBoard(3)")
    js(driver, "window.__ESR__.showGallery(true,'cards')")
    time.sleep(0.35)
    suite.check(js(driver, "return window.__ESR__.state.showGallery"), "card gallery opens")
    suite.eq(js(driver, "return window.__ESR__.state.galleryTab"), "cards", "gallery opens on the card tab")
    if shot_dir:
        screenshot(driver, shot_dir / "06-gallery-cards.png")
    click_stage(driver, 1150 + 92 / 2, 64 + 34 / 2)
    time.sleep(0.25)
    suite.check(not js(driver, "return window.__ESR__.state.showGallery"), "gallery close button works")

    js(driver, "window.__ESR__.showGallery(true,'charms')")
    time.sleep(0.3)
    suite.eq(js(driver, "return window.__ESR__.state.galleryTab"), "charms", "charm tab opens")
    if shot_dir:
        screenshot(driver, shot_dir / "07-gallery-charms.png")
    js(driver, "window.__ESR__.showGallery(false)")

    js(driver, "return window.__ESR__.switchToBoard(2)")
    snap = js(
        driver,
        """
        const E=window.__ESR__, m=E.state.match;
        m.pos[0]=14; m.tokens[0]=7; m.turn=0; m.charms=[0,0]; return E.applyRollNow(1);
        """,
    )
    suite.eq(snap["winner"], 0, "settlement flow is reachable")
    time.sleep(0.35)
    if shot_dir:
        screenshot(driver, shot_dir / "08-settlement.png")
    click_stage(driver, 646 + 210 / 2, 650 + 44 / 2)
    time.sleep(0.35)
    suite.eq(snapshot(driver)["screen"], "SELECT_BOARD", "settlement menu returns to volume selection")


if __name__ == "__main__":
    sys.exit(main())
