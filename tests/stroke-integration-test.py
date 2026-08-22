# Prueba de integración manual: dibujo + navegación juntos, con un navegador
# real (Playwright). No corre sola — necesita:
#   1. Un servidor estático parado en la raíz del proyecto.
#   2. Ajustar PORT abajo si usaste otro puerto.
#   3. pip install playwright && playwright install chromium

PORT = 8945

from playwright.sync_api import sync_playwright

errors = []
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={'width': 900, 'height': 700})
    page.on('console', lambda m: errors.append(f"[{m.type}] {m.text}") if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(f"[pageerror] {e}"))

    page.goto(f'http://localhost:{PORT}/index.html', wait_until='networkidle', timeout=15000)
    page.wait_for_timeout(300)

    strokes_before = page.evaluate("() => window.__scene.children.length")
    print("meshes en la escena antes de dibujar:", strokes_before, flush=True)

    # ── Simular un trazo de 1 dedo: bajar, mover varias veces, soltar ──
    page.evaluate("""() => {
        const el = document.getElementById('scene-canvas');
        function fire(type, id, x, y) {
            el.dispatchEvent(new PointerEvent(type, {pointerId:id, clientX:x, clientY:y, bubbles:true, cancelable:true}));
        }
        fire('pointerdown', 1, 400, 300);
        fire('pointermove', 1, 430, 310);
        fire('pointermove', 1, 460, 330);
        fire('pointermove', 1, 490, 300);
        fire('pointerup',   1, 490, 300);
    }""")
    page.wait_for_timeout(200)

    strokes_after = page.evaluate("() => window.__scene.children.length")
    print("meshes en la escena después de dibujar:", strokes_after, flush=True)
    is_drawing_after = page.evaluate("() => window.__strokeEngine.isDrawing()")
    print("¿sigue 'dibujando' después de soltar? (debe ser false):", is_drawing_after, flush=True)
    finished_count = page.evaluate("() => window.__strokeEngine.finished.length")
    print("trazos terminados registrados:", finished_count, flush=True)

    page.screenshot(path='/tmp/stroke_1_drawn.png')

    # ── Ahora un segundo trazo, y verificar que orbitar con 2 dedos NO dibuja nada nuevo ──
    page.evaluate("""() => {
        const el = document.getElementById('scene-canvas');
        function fire(type, id, x, y) {
            el.dispatchEvent(new PointerEvent(type, {pointerId:id, clientX:x, clientY:y, bubbles:true, cancelable:true}));
        }
        fire('pointerdown', 1, 600, 200);
        fire('pointerdown', 2, 660, 200);
        fire('pointermove', 1, 620, 220);
        fire('pointermove', 2, 680, 220);
        fire('pointerup',   1, 620, 220);
        fire('pointerup',   2, 680, 220);
    }""")
    page.wait_for_timeout(200)
    strokes_after_orbit = page.evaluate("() => window.__scene.children.length")
    print("meshes después de orbitar con 2 dedos (no debe cambiar):", strokes_after_orbit, flush=True)

    # ── Trazo cancelado a medias: bajar 1 dedo, mover, y agregar un 2do dedo
    #     ANTES de soltar → debe cerrar el trazo en curso, no perderlo silenciosamente ──
    page.evaluate("""() => {
        const el = document.getElementById('scene-canvas');
        function fire(type, id, x, y) {
            el.dispatchEvent(new PointerEvent(type, {pointerId:id, clientX:x, clientY:y, bubbles:true, cancelable:true}));
        }
        fire('pointerdown', 1, 300, 500);
        fire('pointermove', 1, 340, 520);
        fire('pointerdown', 2, 400, 500); // segundo dedo llega a mitad de trazo
        fire('pointermove', 1, 360, 540);
        fire('pointermove', 2, 420, 520);
        fire('pointerup',   1, 360, 540);
        fire('pointerup',   2, 420, 520);
    }""")
    page.wait_for_timeout(200)
    is_drawing_final = page.evaluate("() => window.__strokeEngine.isDrawing()")
    print("¿quedó 'dibujando' colgado tras la transición 1→2 dedos? (debe ser false):", is_drawing_final, flush=True)

    page.screenshot(path='/tmp/stroke_2_final.png')
    browser.close()

print("\nERRORS:", errors if errors else "ninguno", flush=True)
