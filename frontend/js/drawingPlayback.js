/* Local, disposable presentation of a saved image. No model calls or image mutations. */
(() => {
  const DURATION = 60000;
  const canvas = (width, height) => {
    const element = document.createElement("canvas");
    element.width = width;
    element.height = height;
    return element;
  };

  // Trace connected high-contrast pixels at a bounded resolution. These are
  // display paths, not an attempt to recover the artist's original strokes.
  function trace(data, width, height) {
    const gray = new Float32Array(width * height);
    const edges = new Uint8Array(width * height);
    for (let i = 0; i < gray.length; i++) {
      const a = data[i * 4 + 3] / 255;
      gray[i] = (data[i * 4] * .299 + data[i * 4 + 1] * .587 + data[i * 4 + 2] * .114) * a + 255 * (1 - a);
    }
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;
        const gx = gray[i + 1] - gray[i - 1];
        const gy = gray[i + width] - gray[i - width];
        // Include the middle of dark narrow lines as well as contrast edges.
        const ridge = gray[i] < 110 &&
          ((gray[i - 1] > gray[i] + 12 && gray[i + 1] > gray[i] + 12) ||
           (gray[i - width] > gray[i] + 12 && gray[i + width] > gray[i] + 12));
        if (gx * gx + gy * gy > 2200 || ridge) edges[i] = 1;
      }
    }
    const paths = [];
    const neighbors = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (!edges[y * width + x]) continue;
        const points = [];
        let px = x, py = y, direction = 0;
        while (points.length < 240) {
          points.push([px / width, py / height]);
          edges[py * width + px] = 0;
          let next = null;
          // Favor continuing the stroke over turning back into a noisy edge.
          for (const turn of [0, 1, 7, 2, 6, 3, 5, 4]) {
            const d = (direction + turn) % 8;
            const nx = px + neighbors[d][0], ny = py + neighbors[d][1];
            if (nx > 0 && nx < width - 1 && ny > 0 && ny < height - 1 && edges[ny * width + nx]) {
              next = [nx, ny, d];
              break;
            }
          }
          if (!next) break;
          [px, py, direction] = next;
        }
        if (points.length >= 5) paths.push(points);
      }
    }
    // Work within local regions, drawing the longer contours first.
    const region = p => Math.floor(p[0][1] * 6) * 4 + Math.floor(p[0][0] * 4);
    paths.sort((a, b) => region(a) - region(b) || b.length - a.length);
    return paths;
  }

  function brushPaths(width, height) {
    const paths = [];
    const columns = 5, rows = 7;
    const tw = width / columns, th = height / rows;
    const size = Math.max(12, Math.min(width, height) / 32);
    for (let row = 0; row < rows; row++) {
      // Alternating local regions and diagonal strokes avoid a screen wipe.
      for (let colIndex = 0; colIndex < columns; colIndex++) {
        const col = row % 2 ? columns - colIndex - 1 : colIndex;
        const x = col * tw, y = row * th;
        for (let offset = -th; offset < tw + size; offset += size * .65) {
          const points = [];
          for (let step = 0; step <= 12; step++) {
            const py = th * step / 12;
            const px = offset + py;
            if (px >= -size && px <= tw + size)
              points.push([(x + px + Math.sin(step * 1.8 + col) * size * .12) / width, (y + py) / height]);
          }
          if (points.length > 1) paths.push(points);
        }
      }
    }
    return { paths, size };
  }

  function stroke(ctx, points, from, to, width, height) {
    ctx.beginPath();
    const sample = t => {
      const index = Math.min(points.length - 2, Math.floor(t));
      const f = t - index;
      return [(points[index][0] * (1 - f) + points[index + 1][0] * f) * width,
        (points[index][1] * (1 - f) + points[index + 1][1] * f) * height];
    };
    const start = sample(from);
    ctx.moveTo(...start);
    for (let i = Math.floor(from) + 1; i < to; i++)
      ctx.lineTo(points[i][0] * width, points[i][1] * height);
    const end = sample(to);
    ctx.lineTo(...end);
    ctx.stroke();
    return end;
  }

  // Incremental painting: previously drawn paths are never redrawn per frame.
  function painter(ctx, paths, width, height) {
    const total = paths.reduce((sum, path) => sum + path.length - 1, 0);
    let index = 0, position = 0, painted = 0;
    return progress => {
      const target = total * Math.min(1, Math.max(0, progress));
      let tip = null;
      while (index < paths.length && painted < target) {
        const end = Math.min(paths[index].length - 1, position + target - painted);
        tip = stroke(ctx, paths[index], position, end, width, height);
        painted += end - position;
        position = end;
        if (position >= paths[index].length - 1) { index++; position = 0; }
      }
      return tip;
    };
  }

  let active = null;
  async function play(url, { title = "漫画" } = {}) {
    active?.();
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const dialog = document.createElement("dialog");
    dialog.className = "drawing-dialog";
    dialog.setAttribute("aria-labelledby", "drawing-title");
    dialog.innerHTML = `<header class="drawing-header"><div><h2 id="drawing-title"></h2><p data-drawing-status role="status">正在准备画纸…</p></div><button type="button" class="button" data-drawing-skip autofocus>跳过，查看成图</button></header><div class="drawing-stage"><canvas aria-label="漫画描线与上色过程" role="img"></canvas><svg class="drawing-pencil" viewBox="0 0 32 32" width="32" height="32" aria-hidden="true" hidden><path d="M3 29 6 19 23 2 30 9 13 26Z" fill="var(--brand)" stroke="white" stroke-width="1.5"/><path d="m3 29 3-10 7 7Z" fill="#252d35"/><path d="m20 5 7 7" stroke="white" stroke-width="1.5"/></svg></div><footer class="drawing-footer"><span>绘制回放 · 原图已保存</span><progress max="1" value="0" aria-label="绘制进度"></progress><span data-drawing-time>约 1 分钟</span></footer>`;
    dialog.querySelector("h2").textContent = `${title} · 绘制过程`;
    document.body.append(dialog);
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    let closed = false, raf = 0, loadingTimer, image;
    let settle;
    const finished = new Promise(resolve => { settle = resolve; });
    const finish = () => {
      if (closed) return;
      closed = true;
      cancelAnimationFrame(raf);
      clearTimeout(loadingTimer);
      if (image) { image.onload = null; image.onerror = null; }
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", finish);
      window.removeEventListener("hashchange", finish);
      if (dialog.open) dialog.close();
      dialog.remove();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      if (active === finish) active = null;
      settle();
    };
    let last = null;
    const visibility = () => { last = null; };
    active = finish;
    dialog.querySelector("[data-drawing-skip]").addEventListener("click", finish);
    dialog.addEventListener("cancel", e => { e.preventDefault(); finish(); });
    dialog.addEventListener("close", finish);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", finish);
    window.addEventListener("hashchange", finish);
    try {
      dialog.showModal();
      document.body.style.overflow = "hidden";
      image = new Image();
      image.crossOrigin = "anonymous";
      const loaded = new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error("Image could not be loaded for playback"));
        loadingTimer = setTimeout(() => reject(new Error("Drawing image load timed out")), 15000);
        image.src = url;
      });
      await Promise.race([loaded, finished]);
      clearTimeout(loadingTimer);
      if (closed) return;
      const scale = Math.min(1, 1440 / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const output = dialog.querySelector("canvas");
      output.width = width; output.height = height;
      const ctx = output.getContext("2d");
      const source = canvas(width, height), ink = canvas(width, height), color = canvas(width, height);
      const src = source.getContext("2d");
      src.fillStyle = "white"; src.fillRect(0, 0, width, height);
      src.drawImage(image, 0, 0, width, height);
      const ratio = Math.min(1, 480 / Math.max(width, height));
      const small = canvas(Math.max(1, Math.round(width * ratio)), Math.max(1, Math.round(height * ratio)));
      const smallCtx = small.getContext("2d", { willReadFrequently: true });
      smallCtx.drawImage(source, 0, 0, small.width, small.height);
      const paths = trace(smallCtx.getImageData(0, 0, small.width, small.height).data, small.width, small.height);
      // Reveal actual dark marks from the image under the traced pen. Drawing
      // the coarse paths themselves would introduce jagged, doubled outlines.
      const inkSource = canvas(width, height);
      const inkSourceCtx = inkSource.getContext("2d");
      const inkPixels = src.getImageData(0, 0, width, height);
      for (let i = 0; i < inkPixels.data.length; i += 4) {
        const gray = inkPixels.data[i] * .299 + inkPixels.data[i + 1] * .587 + inkPixels.data[i + 2] * .114;
        inkPixels.data[i] = inkPixels.data[i + 1] = inkPixels.data[i + 2] = 40;
        inkPixels.data[i + 3] = Math.max(0, 1 - gray / 200) * 255;
      }
      inkSourceCtx.putImageData(inkPixels, 0, 0);
      const inkCtx = ink.getContext("2d");
      inkCtx.strokeStyle = inkCtx.createPattern(inkSource, "no-repeat");
      inkCtx.lineWidth = Math.max(2, width / small.width * 3);
      inkCtx.lineCap = inkCtx.lineJoin = "round";
      const drawInk = painter(inkCtx, paths, width, height);
      const brush = brushPaths(width, height);
      const colorCtx = color.getContext("2d");
      colorCtx.strokeStyle = colorCtx.createPattern(source, "no-repeat");
      colorCtx.lineWidth = brush.size * 1.6;
      colorCtx.lineCap = colorCtx.lineJoin = "round";
      const drawColor = painter(colorCtx, brush.paths, width, height);
      const status = dialog.querySelector("[data-drawing-status]");
      const time = dialog.querySelector("[data-drawing-time]");
      const progress = dialog.querySelector("progress");
      const pencil = dialog.querySelector(".drawing-pencil");
      let elapsed = 0, renderedAt = -Infinity, second = -1;
      const frame = timestamp => {
        if (closed) return;
        if (!document.hidden) {
          if (last !== null) elapsed += timestamp - last;
          last = timestamp;
        } else last = null;
        if (timestamp - renderedAt >= 32 && !document.hidden) {
          renderedAt = timestamp;
          const p = Math.min(1, elapsed / DURATION);
          let tip;
          if (p < .45) tip = drawInk(p / .45);
          else { drawInk(1); tip = drawColor(Math.min(1, (p - .45) / .47)); }
          ctx.globalAlpha = 1;
          ctx.fillStyle = "white"; ctx.fillRect(0, 0, width, height);
          ctx.drawImage(ink, 0, 0);
          ctx.drawImage(color, 0, 0);
          // Resolve every fine detail to the exact saved image at the end.
          if (p > .92) {
            ctx.globalAlpha = Math.min(1, (p - .92) / .065);
            ctx.drawImage(source, 0, 0);
            ctx.globalAlpha = 1;
          }
          pencil.hidden = !tip || p >= .92;
          if (tip) {
            pencil.style.left = `${tip[0] / width * 100}%`;
            pencil.style.top = `${tip[1] / height * 100}%`;
          }
          progress.value = p;
          if (Math.floor(elapsed / 1000) !== second) {
            second = Math.floor(elapsed / 1000);
            status.textContent = p < .45 ? "正在勾勒线条" : p < .92 ? "正在逐笔上色" : "正在完善细节";
            time.textContent = `剩余 ${Math.max(0, 60 - second)} 秒`;
          }
        }
        if (elapsed >= DURATION) finish();
        else raf = requestAnimationFrame(frame);
      };
      // The pencil shares the canvas coordinate box, including on resize.
      const paper = document.createElement("div");
      paper.className = "drawing-paper";
      paper.style.aspectRatio = `${width} / ${height}`;
      paper.style.setProperty("--paper-ratio", width / height);
      output.before(paper); paper.append(output, pencil);
      raf = requestAnimationFrame(frame);
      await finished;
    } catch (error) {
      console.warn("Drawing playback skipped:", error);
    } finally {
      finish();
    }
  }
  window.DrawingPlayback = { play };
})();
