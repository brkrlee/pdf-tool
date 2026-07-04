pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js";

const { PDFDocument } = PDFLib;

// ---------- 공통 유틸 ----------

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

function dataURLToUint8Array(dataURL) {
  const base64 = dataURL.split(",")[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// 페이지들을 캔버스에 렌더링 -> JPEG bytes 배열로 반환
async function renderPdfPagesToJpeg(arrayBuffer, scale, quality, onProgress) {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;
    const dataURL = canvas.toDataURL("image/jpeg", quality);
    pages.push({
      jpegBytes: dataURLToUint8Array(dataURL),
      widthPt: viewport.width / scale,
      heightPt: viewport.height / scale,
    });
    if (onProgress) onProgress(i, pdf.numPages);
  }
  return pages;
}

function parseSingleRange(token, maxPage) {
  const m = token.match(/^(\d+)(?:-(\d+))?$/);
  if (!m) throw new Error(`잘못된 범위 형식: "${token}"`);
  const start = parseInt(m[1], 10);
  const end = m[2] ? parseInt(m[2], 10) : start;
  if (start < 1 || end > maxPage || start > end) {
    throw new Error(`페이지 범위가 올바르지 않습니다: "${token}" (전체 ${maxPage}페이지)`);
  }
  const indices = [];
  for (let p = start; p <= end; p++) indices.push(p - 1);
  return indices;
}

// 쉼표로 구분된 각 구간이 별도의 출력 파일이 되는 그룹 목록을 반환한다.
// 그룹 내에서 "+"로 여러 범위를 묶으면 한 파일 안에 함께 들어간다. 예: "1-2,4,6-8+10"
function parsePageGroups(rangeStr, maxPage) {
  const groups = rangeStr.split(",").map((s) => s.trim()).filter(Boolean);
  if (groups.length === 0) throw new Error("페이지 범위를 입력해주세요.");
  return groups.map((group) => {
    const tokens = group.split("+").map((s) => s.trim()).filter(Boolean);
    if (tokens.length === 0) throw new Error(`잘못된 범위 형식: "${group}"`);
    const indices = [];
    for (const token of tokens) indices.push(...parseSingleRange(token, maxPage));
    return { label: group.replace(/\+/g, "_"), indices };
  });
}

// ---------- 탭 전환 ----------

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
  });
});

// 공통 드롭존 연결
function setupDropzone(dropEl, inputEl, onFiles) {
  dropEl.addEventListener("click", () => inputEl.click());
  inputEl.addEventListener("change", () => onFiles(inputEl.files));
  dropEl.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropEl.classList.add("dragover");
  });
  dropEl.addEventListener("dragleave", () => dropEl.classList.remove("dragover"));
  dropEl.addEventListener("drop", (e) => {
    e.preventDefault();
    dropEl.classList.remove("dragover");
    onFiles(e.dataTransfer.files);
  });
}

// ================= 병합 =================

let mergeFiles = [];

function renderMergeList() {
  const list = document.getElementById("mergeList");
  list.innerHTML = "";
  mergeFiles.forEach((file, idx) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="name">${idx + 1}. ${file.name} (${formatBytes(file.size)})</span>
      <span class="btns">
        <button type="button" data-action="up">↑</button>
        <button type="button" data-action="down">↓</button>
        <button type="button" class="remove" data-action="remove">✕</button>
      </span>
    `;
    li.querySelector('[data-action="up"]').addEventListener("click", () => {
      if (idx === 0) return;
      [mergeFiles[idx - 1], mergeFiles[idx]] = [mergeFiles[idx], mergeFiles[idx - 1]];
      renderMergeList();
    });
    li.querySelector('[data-action="down"]').addEventListener("click", () => {
      if (idx === mergeFiles.length - 1) return;
      [mergeFiles[idx + 1], mergeFiles[idx]] = [mergeFiles[idx], mergeFiles[idx + 1]];
      renderMergeList();
    });
    li.querySelector('[data-action="remove"]').addEventListener("click", () => {
      mergeFiles.splice(idx, 1);
      renderMergeList();
    });
    list.appendChild(li);
  });
  document.getElementById("mergeBtn").disabled = mergeFiles.length < 2;
}

setupDropzone(document.getElementById("mergeDrop"), document.getElementById("mergeFiles"), (files) => {
  for (const f of files) {
    if (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")) {
      mergeFiles.push(f);
    }
  }
  renderMergeList();
});

document.getElementById("mergeBtn").addEventListener("click", async () => {
  const btn = document.getElementById("mergeBtn");
  const status = document.getElementById("mergeStatus");
  btn.disabled = true;
  status.textContent = "병합 중...";
  try {
    const outDoc = await PDFDocument.create();
    for (const file of mergeFiles) {
      const bytes = await readFileAsArrayBuffer(file);
      const srcDoc = await PDFDocument.load(bytes);
      const copiedPages = await outDoc.copyPages(srcDoc, srcDoc.getPageIndices());
      copiedPages.forEach((p) => outDoc.addPage(p));
    }
    const outBytes = await outDoc.save();
    downloadBlob(new Blob([outBytes], { type: "application/pdf" }), "merged.pdf");
    status.textContent = `완료! ${mergeFiles.length}개 파일을 병합했습니다. (${formatBytes(outBytes.length)})`;
  } catch (err) {
    status.textContent = "오류: " + err.message;
  } finally {
    btn.disabled = mergeFiles.length < 2;
  }
});

// ================= 분할 =================

let splitFile = null;

document.querySelectorAll('input[name="splitMode"]').forEach((radio) => {
  radio.addEventListener("change", () => {
    document.getElementById("splitRange").disabled = radio.value !== "range" || !radio.checked;
  });
});
document.querySelectorAll('input[name="splitMode"]').forEach((radio) => {
  if (radio.checked) document.getElementById("splitRange").disabled = radio.value !== "range";
});

setupDropzone(document.getElementById("splitDrop"), document.getElementById("splitFile"), (files) => {
  if (files.length === 0) return;
  splitFile = files[0];
  document.getElementById("splitFileName").textContent = `선택됨: ${splitFile.name} (${formatBytes(splitFile.size)})`;
  document.getElementById("splitBtn").disabled = false;
});

document.getElementById("splitBtn").addEventListener("click", async () => {
  const btn = document.getElementById("splitBtn");
  const status = document.getElementById("splitStatus");
  const mode = document.querySelector('input[name="splitMode"]:checked').value;
  btn.disabled = true;
  status.textContent = "분할 중...";
  try {
    const bytes = await readFileAsArrayBuffer(splitFile);
    const srcDoc = await PDFDocument.load(bytes);
    const pageCount = srcDoc.getPageCount();

    if (mode === "each") {
      if (pageCount === 1) {
        const singleBytes = await srcDoc.save();
        downloadBlob(new Blob([singleBytes], { type: "application/pdf" }), "page-1.pdf");
      } else {
        const zip = new JSZip();
        for (let i = 0; i < pageCount; i++) {
          const newDoc = await PDFDocument.create();
          const [page] = await newDoc.copyPages(srcDoc, [i]);
          newDoc.addPage(page);
          const pageBytes = await newDoc.save();
          zip.file(`page-${i + 1}.pdf`, pageBytes);
          status.textContent = `분할 중... (${i + 1}/${pageCount})`;
        }
        const zipBlob = await zip.generateAsync({ type: "blob" });
        downloadBlob(zipBlob, "split_pages.zip");
      }
      status.textContent = `완료! 총 ${pageCount}페이지를 개별 PDF로 분할했습니다.`;
    } else {
      const rangeStr = document.getElementById("splitRange").value;
      const groups = parsePageGroups(rangeStr, pageCount);

      if (groups.length === 1) {
        const newDoc = await PDFDocument.create();
        const copiedPages = await newDoc.copyPages(srcDoc, groups[0].indices);
        copiedPages.forEach((p) => newDoc.addPage(p));
        const outBytes = await newDoc.save();
        downloadBlob(new Blob([outBytes], { type: "application/pdf" }), "extracted.pdf");
        status.textContent = `완료! ${groups[0].indices.length}개 페이지를 추출했습니다.`;
      } else {
        const zip = new JSZip();
        for (let i = 0; i < groups.length; i++) {
          const group = groups[i];
          const newDoc = await PDFDocument.create();
          const copiedPages = await newDoc.copyPages(srcDoc, group.indices);
          copiedPages.forEach((p) => newDoc.addPage(p));
          const outBytes = await newDoc.save();
          zip.file(`pages_${group.label}.pdf`, outBytes);
          status.textContent = `분할 중... (${i + 1}/${groups.length})`;
        }
        const zipBlob = await zip.generateAsync({ type: "blob" });
        downloadBlob(zipBlob, "split_ranges.zip");
        status.textContent = `완료! ${groups.length}개의 파일로 분할했습니다.`;
      }
    }
  } catch (err) {
    status.textContent = "오류: " + err.message;
  } finally {
    btn.disabled = false;
  }
});

// ================= 압축 =================

let compressFile = null;

document.getElementById("compressQuality").addEventListener("input", (e) => {
  document.getElementById("compressQualityVal").textContent = e.target.value;
});
document.getElementById("compressScale").addEventListener("input", (e) => {
  document.getElementById("compressScaleVal").textContent = (e.target.value / 10).toFixed(1);
});

setupDropzone(document.getElementById("compressDrop"), document.getElementById("compressFile"), (files) => {
  if (files.length === 0) return;
  compressFile = files[0];
  document.getElementById("compressFileName").textContent = `선택됨: ${compressFile.name} (${formatBytes(compressFile.size)})`;
  document.getElementById("compressBtn").disabled = false;
});

document.getElementById("compressBtn").addEventListener("click", async () => {
  const btn = document.getElementById("compressBtn");
  const status = document.getElementById("compressStatus");
  const quality = parseInt(document.getElementById("compressQuality").value, 10) / 100;
  const scale = parseInt(document.getElementById("compressScale").value, 10) / 10;
  btn.disabled = true;
  status.textContent = "압축 중...";
  try {
    const arrayBuffer = await readFileAsArrayBuffer(compressFile);
    const originalSize = arrayBuffer.byteLength;

    const pages = await renderPdfPagesToJpeg(arrayBuffer, scale, quality, (cur, total) => {
      status.textContent = `페이지 렌더링 중... (${cur}/${total})`;
    });

    const outDoc = await PDFDocument.create();
    for (const p of pages) {
      const jpgImage = await outDoc.embedJpg(p.jpegBytes);
      const page = outDoc.addPage([p.widthPt, p.heightPt]);
      page.drawImage(jpgImage, { x: 0, y: 0, width: p.widthPt, height: p.heightPt });
    }
    const outBytes = await outDoc.save();

    downloadBlob(new Blob([outBytes], { type: "application/pdf" }), "compressed.pdf");

    const ratio = (100 * (1 - outBytes.length / originalSize)).toFixed(1);
    status.textContent =
      `완료! ${formatBytes(originalSize)} → ${formatBytes(outBytes.length)} ` +
      (outBytes.length < originalSize ? `(${ratio}% 감소)` : "(용량이 늘었다면 화질/해상도를 낮춰보세요)");
  } catch (err) {
    status.textContent = "오류: " + err.message;
  } finally {
    btn.disabled = false;
  }
});

// ================= JPG 변환 =================

let jpgFile = null;

document.getElementById("jpgQuality").addEventListener("input", (e) => {
  document.getElementById("jpgQualityVal").textContent = e.target.value;
});
document.getElementById("jpgScale").addEventListener("input", (e) => {
  document.getElementById("jpgScaleVal").textContent = (e.target.value / 10).toFixed(1);
});

setupDropzone(document.getElementById("jpgDrop"), document.getElementById("jpgFile"), (files) => {
  if (files.length === 0) return;
  jpgFile = files[0];
  document.getElementById("jpgFileName").textContent = `선택됨: ${jpgFile.name} (${formatBytes(jpgFile.size)})`;
  document.getElementById("jpgBtn").disabled = false;
});

document.getElementById("jpgBtn").addEventListener("click", async () => {
  const btn = document.getElementById("jpgBtn");
  const status = document.getElementById("jpgStatus");
  const quality = parseInt(document.getElementById("jpgQuality").value, 10) / 100;
  const scale = parseInt(document.getElementById("jpgScale").value, 10) / 10;
  btn.disabled = true;
  status.textContent = "변환 중...";
  try {
    const arrayBuffer = await readFileAsArrayBuffer(jpgFile);
    const pages = await renderPdfPagesToJpeg(arrayBuffer, scale, quality, (cur, total) => {
      status.textContent = `변환 중... (${cur}/${total})`;
    });

    const baseName = jpgFile.name.replace(/\.pdf$/i, "");

    if (pages.length === 1) {
      downloadBlob(new Blob([pages[0].jpegBytes], { type: "image/jpeg" }), `${baseName}.jpg`);
    } else {
      const zip = new JSZip();
      pages.forEach((p, idx) => {
        zip.file(`${baseName}-${idx + 1}.jpg`, p.jpegBytes);
      });
      const zipBlob = await zip.generateAsync({ type: "blob" });
      downloadBlob(zipBlob, `${baseName}_jpg.zip`);
    }
    status.textContent = `완료! 총 ${pages.length}페이지를 JPG로 변환했습니다.`;
  } catch (err) {
    status.textContent = "오류: " + err.message;
  } finally {
    btn.disabled = false;
  }
});
