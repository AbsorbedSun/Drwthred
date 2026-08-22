# Prueba de integración manual: escena + cámara + gestos, con un navegador
# real (Playwright). No corre sola — necesita:
#   1. Un servidor estático parado en la raíz del proyecto:
#        python3 -m http.server 8944
#   2. Ajustar el puerto en la URL de abajo si usaste otro.
#   3. pip install playwright && playwright install chromium
#
# Simula gestos de 2 y 3 dedos con PointerEvents sintéticos (un mouse físico
# no genera multi-touch real) y verifica que theta/target/radius de la
# cámara cambien como corresponde.

from playwright.sync_api import sync_playwright

errors = []
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={'width': 900, 'height': 700})
    page.on('console', lambda m: errors.append(f"[{m.type}] {m.text}") if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(f"[pageerror] {e}"))

    page.goto('http://localhost:8944/index.html', wait_until='networkidle', timeout=15000)
    page.wait_for_timeout(300)
    page.screenshot(path='/tmp/scene_1_initial.png')

    canvas_visible = page.locator('#scene-canvas').is_visible()
    print("canvas visible:", canvas_visible, flush=True)

    state_before = page.evaluate("() => ({theta: window.__camCtl.state.theta, phi: window.__camCtl.state.phi, radius: window.__camCtl.state.radius, target: window.__camCtl.state.target.toArray()})")
    print("estado inicial de cámara:", state_before, flush=True)

    page.evaluate("""() => {
        const el = document.getElementById('scene-canvas');
        function fire(type, id, x, y) {
            el.dispatchEvent(new PointerEvent(type, {pointerId:id, clientX:x, clientY:y, bubbles:true, cancelable:true}));
        }
        fire('pointerdown', 1, 400, 300);
        fire('pointerdown', 2, 460, 300);
        fire('pointermove', 1, 480, 300);
        fire('pointermove', 2, 540, 300);
        fire('pointerup', 1, 480, 300);
        fire('pointerup', 2, 540, 300);
    }""")
    page.wait_for_timeout(200)
    state_after_orbit = page.evaluate("() => ({theta: window.__camCtl.state.theta, phi: window.__camCtl.state.phi})")
    print("estado tras orbit de 2 dedos:", state_after_orbit, flush=True)
    print("¿cambió theta?", state_after_orbit['theta'] != state_before['theta'], flush=True)

    target_before_pan = page.evaluate("() => window.__camCtl.state.target.toArray()")
    page.evaluate("""() => {
        const el = document.getElementById('scene-canvas');
        function fire(type, id, x, y) {
            el.dispatchEvent(new PointerEvent(type, {pointerId:id, clientX:x, clientY:y, bubbles:true, cancelable:true}));
        }
        fire('pointerdown', 1, 300, 300);
        fire('pointerdown', 2, 360, 300);
        fire('pointerdown', 3, 420, 300);
        fire('pointermove', 1, 260, 340);
        fire('pointermove', 2, 320, 340);
        fire('pointermove', 3, 380, 340);
        fire('pointerup', 1, 260, 340);
        fire('pointerup', 2, 320, 340);
        fire('pointerup', 3, 380, 340);
    }""")
    page.wait_for_timeout(200)
    target_after_pan = page.evaluate("() => window.__camCtl.state.target.toArray()")
    print("target antes del pan:", target_before_pan, flush=True)
    print("target después del pan:", target_after_pan, flush=True)
    print("¿se movió el target?", target_before_pan != target_after_pan, flush=True)

    radius_before_zoom = page.evaluate("() => window.__camCtl.state.radius")
    page.evaluate("""() => {
        const el = document.getElementById('scene-canvas');
        function fire(type, id, x, y) {
            el.dispatchEvent(new PointerEvent(type, {pointerId:id, clientX:x, clientY:y, bubbles:true, cancelable:true}));
        }
        fire('pointerdown', 1, 440, 300);
        fire('pointerdown', 2, 460, 300);
        fire('pointermove', 1, 340, 300);
        fire('pointermove', 2, 560, 300);
        fire('pointerup', 1, 340, 300);
        fire('pointerup', 2, 560, 300);
    }""")
    page.wait_for_timeout(200)
    radius_after_zoom = page.evaluate("() => window.__camCtl.state.radius")
    print("radius antes del pellizco:", radius_before_zoom, "-> después:", radius_after_zoom, flush=True)

    page.screenshot(path='/tmp/scene_2_after_gestures.png')
    browser.close()

print("\nERRORS:", errors if errors else "ninguno", flush=True)
