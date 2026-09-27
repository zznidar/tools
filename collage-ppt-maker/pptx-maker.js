const EMU_PER_PX = 9525;
const SLIDE_PATH = "ppt/slides/slide1.xml";
const RELS_PATH = "ppt/slides/_rels/slide1.xml.rels";
const PRESENTATION_PATH = "ppt/presentation.xml";

const filePicker = document.getElementById("filePicker");
const rowsSetting = document.getElementById("rowsSetting");
const roundedCornersToggle = document.getElementById("roundedCornersToggle");
const cornerRadiusSlider = document.getElementById("cornerRadiusSlider");
const cornerRadiusValue = document.getElementById("cornerRadiusValue");
const tileSpacingSlider = document.getElementById("tileSpacingSlider");
const tileSpacingValue = document.getElementById("tileSpacingValue");
const shuffleBtn = document.getElementById("shuffleBtn");
const downloadBtn = document.getElementById("downloadBtn");
const previewViewport = document.getElementById("previewViewport");
const preview = document.getElementById("preview");
const statusEl = document.getElementById("status");

const parser = new DOMParser();

const state = {
    file: null,
    entries: [],
    slideDoc: null,
    slideXmlEntryName: null,
    relsEntryName: null,
    slideWidthPx: 0,
    slideHeightPx: 0,
    items: [],
    selectedIndex: null,
};

filePicker.addEventListener("change", async function (event) {
    const file = event.target.files && event.target.files[0] ? event.target.files[0] : null;
    if (!file) {
        resetState();
        return;
    }

    try {
        await loadPptx(file);
    } catch (error) {
        console.error(error);
        setStatus(error instanceof Error ? error.message : String(error));
        resetState(false);
    }
});

rowsSetting.addEventListener("change", function () {
    if (!state.items.length) {
        return;
    }

    state.selectedIndex = null;
    renderPreview();
});

roundedCornersToggle.addEventListener("change", function () {
    updateCornerUi();
    if (state.items.length) {
        renderPreview();
    }
});

cornerRadiusSlider.addEventListener("input", function () {
    updateCornerUi();
    if (state.items.length) {
        renderPreview();
    }
});

tileSpacingSlider.addEventListener("input", function () {
    updateCornerUi();
    if (state.items.length) {
        renderPreview();
    }
});

shuffleBtn.addEventListener("click", function () {
    if (!state.items.length) {
        return;
    }

    shuffleArray(state.items);
    state.selectedIndex = null;
    renderPreview();
});

downloadBtn.addEventListener("click", async function () {
    if (!state.items.length) {
        return;
    }

    try {
        downloadBtn.disabled = true;
        setStatus("Writing updated positions into a new .pptx...");
        const blob = await buildUpdatedPptx();
        downloadBlob(blob, buildOutputFileName(state.file.name));
        setStatus("Download started.");
    } catch (error) {
        console.error(error);
        setStatus(error instanceof Error ? error.message : String(error));
    } finally {
        downloadBtn.disabled = !state.items.length;
    }
});

window.addEventListener("resize", resizePreview);

function resetState(clearStatus = true) {
    revokeImageUrls(state.items);
    state.file = null;
    state.entries = [];
    state.slideDoc = null;
    state.slideXmlEntryName = null;
    state.relsEntryName = null;
    state.slideWidthPx = 0;
    state.slideHeightPx = 0;
    state.items = [];
    state.selectedIndex = null;
    preview.innerHTML = "";
/*     preview.style.width = "0px";
    preview.style.height = "0px";
    preview.style.transform = "scale(1, 1)";
 */    updateCornerUi();
    if (clearStatus) {
        setStatus("");
    }
    downloadBtn.disabled = true;
    shuffleBtn.disabled = true;
}

async function loadPptx(file) {
    resetState();
    state.file = file;
    setStatus("Opening archive...");

    const reader = new zip.ZipReader(new zip.BlobReader(file));
    const entries = await reader.getEntries();
    state.entries = entries;

    const slideEntry = findEntry(entries, SLIDE_PATH);
    const relsEntry = findEntry(entries, RELS_PATH);
    const presentationEntry = findEntry(entries, PRESENTATION_PATH);

    if (!slideEntry) {
        throw new Error("ppt/slides/slide1.xml was not found in the .pptx file.");
    }

    if (!relsEntry) {
        throw new Error("ppt/slides/_rels/slide1.xml.rels was not found in the .pptx file.");
    }

    state.slideXmlEntryName = slideEntry.filename;
    state.relsEntryName = relsEntry.filename;

    const loadTasks = [
        slideEntry.getData(new zip.TextWriter()),
        relsEntry.getData(new zip.TextWriter()),
    ];

    if (presentationEntry) {
        loadTasks.push(presentationEntry.getData(new zip.TextWriter()));
    }

    const loaded = await Promise.all(loadTasks);
    const slideXmlText = loaded[0];
    const relsXmlText = loaded[1];
    const presentationXmlText = loaded[2] || "";

    state.slideDoc = parser.parseFromString(slideXmlText, "text/xml");
    const relsDoc = parser.parseFromString(relsXmlText, "text/xml");

    const slideSize = getSlideSizePx(presentationXmlText);
    state.slideWidthPx = slideSize.width;
    state.slideHeightPx = slideSize.height;

    const relMap = buildRelationshipMap(relsDoc);
    state.items = await buildPictureItems(state.slideDoc, relMap, entries, state.relsEntryName);

    if (!state.items.length) {
        setStatus("No <p:pic> elements with local image relationships were found on slide 1.");
        renderPreview();
        downloadBtn.disabled = true;
        shuffleBtn.disabled = true;
        return;
    }

    shuffleBtn.disabled = false;
    downloadBtn.disabled = false;
    setStatus(`Loaded ${state.items.length} pictures from slide 1.`);
    renderPreview();
}

function findEntry(entries, filename) {
    const target = normalizeZipPath(filename);
    for (const entry of entries) {
        if (normalizeZipPath(entry.filename) === target) {
            return entry;
        }
    }

    return null;
}

function normalizeZipPath(path) {
    return String(path).replace(/\\/g, "/").replace(/^\/?/, "");
}

function buildRelationshipMap(relsDoc) {
    const map = new Map();
    const relationships = Array.from(relsDoc.getElementsByTagName("Relationship"));

    for (const relationship of relationships) {
        const id = relationship.getAttribute("Id");
        const type = relationship.getAttribute("Type") || "";
        const target = relationship.getAttribute("Target");

        if (!id || !target) {
            continue;
        }

        if (type.indexOf("/image") === -1) {
            continue;
        }

        map.set(id, target);
    }

    return map;
}

async function buildPictureItems(slideDoc, relMap, entries, relsEntryName) {
    const pictureElements = Array.from(slideDoc.getElementsByTagName("p:pic"));
    const items = [];

    for (const picElement of pictureElements) {
        const blip = picElement.getElementsByTagName("a:blip")[0];
        const embedId = blip ? blip.getAttribute("r:embed") : null;

        if (!embedId) {
            continue;
        }

        const target = relMap.get(embedId);
        if (!target) {
            continue;
        }

        const imagePath = resolveRelationshipTarget(relsEntryName, target);
        const imageEntry = findEntry(entries, imagePath);

        if (!imageEntry) {
            continue;
        }

        const imageBlob = await getBlobFromEntry(imageEntry);
        const imageUrl = URL.createObjectURL(imageBlob);
        const imageSize = await getImageSize(imageUrl);
        const label = getPictureLabel(picElement, imagePath);

        items.push({
            picElement: picElement,
            embedId: embedId,
            imagePath: normalizeZipPath(imagePath),
            imageUrl: imageUrl,
            width: imageSize.width,
            height: imageSize.height,
            label: label,
        });
    }

    return items;
}

function resolveRelationshipTarget(relsEntryName, target) {
    const relsPath = normalizeZipPath(relsEntryName);
    const sourcePartPath = relsPath.replace(/\/_rels\/([^/]+)\.rels$/i, "/$1");
    return resolveRelativePath(sourcePartPath, target);
}

function resolveRelativePath(baseFilePath, relativePath) {
    const baseFolder = baseFilePath.substring(0, baseFilePath.lastIndexOf("/") + 1);
    const segments = baseFolder.split("/").filter(Boolean);
    const relativeSegments = normalizeZipPath(relativePath).split("/");

    for (const segment of relativeSegments) {
        if (!segment || segment === ".") {
            continue;
        }

        if (segment === "..") {
            segments.pop();
            continue;
        }

        segments.push(segment);
    }

    return segments.join("/");
}

function getSlideSizePx(presentationXmlText) {
    if (!presentationXmlText) {
        return { width: 1920 / 1, height: 1080 / 1 };
    }

    const presentationDoc = parser.parseFromString(presentationXmlText, "text/xml");
    const slideSize = presentationDoc.getElementsByTagName("p:sldSz")[0];
    const widthEmu = slideSize ? Number(slideSize.getAttribute("cx")) : 9906000;
    const heightEmu = slideSize ? Number(slideSize.getAttribute("cy")) : 6858000;

    return {
        width: Math.max(1, widthEmu / EMU_PER_PX),
        height: Math.max(1, heightEmu / EMU_PER_PX),
    };
}

function getPictureLabel(picElement, fallbackPath) {
    const cNvPr = picElement.getElementsByTagName("p:cNvPr")[0];
    const name = cNvPr ? cNvPr.getAttribute("name") : "";
    if (name) {
        return name;
    }

    const fallback = fallbackPath.split("/").pop();
    return fallback || "Picture";
}

function getImageSize(url) {
    return new Promise(function (resolve, reject) {
        const image = new Image();
        image.onload = function () {
            resolve({ width: image.naturalWidth || image.width, height: image.naturalHeight || image.height });
        };
        image.onerror = function () {
            reject(new Error("Failed to decode image preview."));
        };
        image.src = url;
    });
}

async function getBlobFromEntry(entry) {
    if (typeof zip.BlobWriter === "function") {
        return entry.getData(new zip.BlobWriter());
    }

    const bytes = await entry.getData(new zip.Uint8ArrayWriter());
    return new Blob([bytes]);
}

function makeLayout(items, requestedRows, slideWidthPx, slideHeightPx, tileSpacingPx) {
    const photoItems = items.map(function (item) {
        return Object.assign({}, item, {
            aspectRatio: item.width / item.height,
        });
    });

    const viewport = slideWidthPx;
    const idealHeight = slideHeightPx / 2;
    const summedWidth = photoItems.reduce(function (sum, item) {
        return sum + item.aspectRatio * idealHeight;
    }, 0);

    const rows = requestedRows > 0 ? requestedRows : Math.max(1, Math.round(summedWidth / viewport));
    const weights = photoItems.map(function (item) {
        return item.aspectRatio * 100;
    });
    const partition = linearPartition(weights, rows);

    const layout = [];
    let itemIndex = 0;
    let yOffset = 0;
    let totalHeight = 0;

    for (const row of partition) {
        const rowItems = photoItems.slice(itemIndex, itemIndex + row.length);
        itemIndex += row.length;

        const summedRatios = rowItems.reduce(function (sum, item) {
            return sum + item.aspectRatio;
        }, 0);

        const horizontalGapTotal = tileSpacingPx * Math.max(0, rowItems.length - 1);
        const rowHeight = (viewport - horizontalGapTotal) / summedRatios;
        let xOffset = 0;

        for (const item of rowItems) {
            const width = rowHeight * item.aspectRatio;
            layout.push({
                item: item,
                x: xOffset,
                y: yOffset,
                width: width,
                height: rowHeight,
            });
            xOffset += width + tileSpacingPx;
        }

        yOffset += rowHeight + tileSpacingPx;
        totalHeight = yOffset;
    }

    if (layout.length) {
        totalHeight -= tileSpacingPx;
    }

    const fitScale = totalHeight > slideHeightPx ? slideHeightPx / totalHeight : 1;

    return layout.map(function (entry) {
        return {
            item: entry.item,
            x: entry.x * fitScale,
            y: entry.y * fitScale,
            width: entry.width * fitScale,
            height: entry.height * fitScale,
        };
    });
}

function linearPartition(seq, partitions) {
    const n = seq.length;

    if (partitions <= 0) {
        return [];
    }

    if (partitions > n) {
        return seq.map(function (value) {
            return [value];
        });
    }

    const table = [];
    const solution = [];

    for (let rowIndex = 0; rowIndex < n; rowIndex += 1) {
        const row = [];
        for (let partitionIndex = 0; partitionIndex < partitions; partitionIndex += 1) {
            row.push(0);
        }
        table.push(row);
    }

    for (let rowIndex = 0; rowIndex < n - 1; rowIndex += 1) {
        const row = [];
        for (let partitionIndex = 0; partitionIndex < partitions - 1; partitionIndex += 1) {
            row.push(0);
        }
        solution.push(row);
    }

    for (let rowIndex = 0; rowIndex < n; rowIndex += 1) {
        if (rowIndex === 0) {
            table[rowIndex][0] = seq[rowIndex];
        } else {
            table[rowIndex][0] = seq[rowIndex] + table[rowIndex - 1][0];
        }
    }

    for (let partitionIndex = 0; partitionIndex < partitions; partitionIndex += 1) {
        table[0][partitionIndex] = seq[0];
    }

    for (let rowIndex = 1; rowIndex < n; rowIndex += 1) {
        for (let partitionIndex = 1; partitionIndex < partitions; partitionIndex += 1) {
            const listOfPairs = [];

            for (let splitIndex = 0; splitIndex < rowIndex; splitIndex += 1) {
                const maxValue = Math.max(table[splitIndex][partitionIndex - 1], table[rowIndex][0] - table[splitIndex][0]);
                listOfPairs.push([maxValue, splitIndex]);
            }

            const best = listOfPairs.reduce(function (previous, current) {
                return current[0] <= previous[0] ? current : previous;
            }, [Infinity, 0]);

            table[rowIndex][partitionIndex] = best[0];
            solution[rowIndex - 1][partitionIndex - 1] = best[1];
        }
    }

    let rowCursor = n - 1;
    let partitionCursor = partitions - 2;
    const answer = [];

    while (partitionCursor >= 0) {
        const start = solution[rowCursor - 1][partitionCursor] + 1;
        const rowSlice = [];

        for (let index = start; index < rowCursor + 1; index += 1) {
            rowSlice.push(seq[index]);
        }

        answer.unshift(rowSlice);
        rowCursor = solution[rowCursor - 1][partitionCursor];
        partitionCursor -= 1;
    }

    const firstSlice = [];
    for (let index = 0; index < rowCursor + 1; index += 1) {
        firstSlice.push(seq[index]);
    }
    answer.unshift(firstSlice);

    return answer;
}

function renderPreview() {
    if (!state.items.length) {
        preview.innerHTML = "";
/*         preview.style.width = "0px";
        preview.style.height = "0px";
 */        resizePreview();
        return;
    }

    const rows = parseInt(rowsSetting.value, 10) || 0;
    const layout = makeLayout(state.items, rows, state.slideWidthPx, state.slideHeightPx, getTileSpacingPx());

    preview.innerHTML = "";
    /*     preview.style.width = state.slideWidthPx + "px";
        preview.style.height = state.slideHeightPx + "px";
 */ 
    resizePreview();
    layout.forEach(function (entry, index) {
        const tile = document.createElement("button");
        tile.type = "button";
        tile.className = "tile";
/*         tile.style.borderRadius = getTileRadiusPx(entry.width, entry.height) + "px";
 *//*         tile.style.left = entry.x + "px";
        tile.style.top = entry.y + "px";
 *//*         tile.style.width = entry.width + "px";
        tile.style.height = entry.height + "px";
 */
        tile.style.setProperty("--tileW", entry.width);
        tile.style.setProperty("--tileH", entry.height);
        tile.style.setProperty("--tileL", entry.x);
        tile.style.setProperty("--tileT", entry.y);
        document.documentElement.style.setProperty("--R", cornerRadiusSlider.value/50000);
        tile.style.zIndex = String(index + 1);
        if (index === state.selectedIndex) {
            tile.classList.add("selected");
        }

        tile.addEventListener("click", function () {
            handleTileClick(index);
        });

        const image = document.createElement("img");
        image.src = entry.item.imageUrl;
        image.alt = entry.item.label;

        const caption = document.createElement("div");
        caption.className = "tile-label";
        caption.textContent = entry.item.label;

        tile.appendChild(image);
        tile.appendChild(caption);
        preview.appendChild(tile);
    });

    resizePreview();
}

function handleTileClick(index) {
    if (state.selectedIndex === null) {
        state.selectedIndex = index;
        renderPreview();
        return;
    }

    if (state.selectedIndex === index) {
        state.selectedIndex = null;
        renderPreview();
        return;
    }

    swapItems(state.selectedIndex, index);
    state.selectedIndex = null;
    renderPreview();
}

function swapItems(firstIndex, secondIndex) {
    const temp = state.items[firstIndex];
    state.items[firstIndex] = state.items[secondIndex];
    state.items[secondIndex] = temp;
}

function shuffleArray(array) {
    for (let index = array.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        const temp = array[index];
        array[index] = array[swapIndex];
        array[swapIndex] = temp;
    }
}

function resizePreview() {
    const width = state.slideWidthPx || 1;
    const height = state.slideHeightPx || 1;

/*     previewViewport.style.width = width + "px";
    previewViewport.style.height = height + "px"; */

    // set the root variable --W to width
    document.documentElement.style.setProperty("--W", width);
    document.documentElement.style.setProperty("--H", height);

    const availableWidth = Math.max(320, document.documentElement.clientWidth - 80);
    const availableHeight = Math.max(300, document.documentElement.clientHeight - 260);
    const scale = Math.min(1, availableWidth / width, availableHeight / height) * 0.96;

/*     previewViewport.style.transform = "scale(" + scale + ", " + scale + ")";
 */}

function updateCornerUi() {
    cornerRadiusValue.textContent = `${(cornerRadiusSlider.value / 100_000 * 100).toFixed(2)} %`;
    tileSpacingValue.textContent = `${tileSpacingSlider.value} px`;
    cornerRadiusSlider.disabled = !roundedCornersToggle.checked;
}

function getTileRadiusPx(width, height) {
    if (!roundedCornersToggle.checked) {
        return 0;
    }

    const shortestSide = Math.min(width, height);
    return Math.round(shortestSide * (Number(cornerRadiusSlider.value) / 100000));
}

function getTileSpacingPx() {
    return Number(tileSpacingSlider.value);
}

function setStatus(message) {
    statusEl.textContent = message;
}

async function buildUpdatedPptx() {
    const slideXml = writeSlidePositions();
    const outputWriter = new zip.ZipWriter(new zip.BlobWriter("application/vnd.openxmlformats-officedocument.presentationml.presentation"));

    for (const entry of state.entries) {
        if (entry.directory) {
            continue;
        }

        if (normalizeZipPath(entry.filename) === normalizeZipPath(state.slideXmlEntryName)) {
            const blob = new Blob([slideXml], { type: "application/xml" });
            await outputWriter.add(entry.filename, new zip.BlobReader(blob));
            continue;
        }

        const blob = await getBlobFromEntry(entry);
        await outputWriter.add(entry.filename, new zip.BlobReader(blob));
    }

    return outputWriter.close();
}

function writeSlidePositions() {
    const layout = makeLayout(state.items, parseInt(rowsSetting.value, 10) || 0, state.slideWidthPx, state.slideHeightPx, getTileSpacingPx());

    layout.forEach(function (entry) {
        const xfrm = entry.item.picElement.getElementsByTagName("a:xfrm")[0];
        const off = xfrm ? xfrm.getElementsByTagName("a:off")[0] : null;
        const ext = xfrm ? xfrm.getElementsByTagName("a:ext")[0] : null;
        const spPr = entry.item.picElement.getElementsByTagName("p:spPr")[0];

        if (!off || !ext) {
            return;
        }

        off.setAttribute("x", String(Math.round(entry.x * EMU_PER_PX)));
        off.setAttribute("y", String(Math.round(entry.y * EMU_PER_PX)));
        ext.setAttribute("cx", String(Math.round(entry.width * EMU_PER_PX)));
        ext.setAttribute("cy", String(Math.round(entry.height * EMU_PER_PX)));

        if (spPr) {
            applyRoundedCorners(spPr);
        }
    });

    const serializer = new XMLSerializer();
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' + serializer.serializeToString(state.slideDoc.documentElement);
}

function applyRoundedCorners(spPr) {
    const xfrm = spPr.getElementsByTagName("a:xfrm")[0];
    const existingGeometry = spPr.getElementsByTagName("a:prstGeom")[0];
    if (existingGeometry) {
        existingGeometry.parentNode.removeChild(existingGeometry);
    }

    const geometry = state.slideDoc.createElementNS("http://schemas.openxmlformats.org/drawingml/2006/main", "a:prstGeom");
    geometry.setAttribute("prst", roundedCornersToggle.checked ? "roundRect" : "rect");

    const avLst = state.slideDoc.createElementNS("http://schemas.openxmlformats.org/drawingml/2006/main", "a:avLst");

    if (roundedCornersToggle.checked) {
        const guide = state.slideDoc.createElementNS("http://schemas.openxmlformats.org/drawingml/2006/main", "a:gd");
        guide.setAttribute("name", "adj");
        guide.setAttribute("fmla", "val " + cornerRadiusSlider.value);
        avLst.appendChild(guide);
    }

    geometry.appendChild(avLst);

    if (xfrm && xfrm.nextSibling) {
        spPr.insertBefore(geometry, xfrm.nextSibling);
        return;
    }

    if (xfrm) {
        spPr.appendChild(geometry);
        return;
    }

    spPr.insertBefore(geometry, spPr.firstChild);
}

function buildOutputFileName(fileName) {
    const baseName = fileName.replace(/\.pptx$/i, "");
    return baseName + "_collage.pptx";
}

function downloadBlob(blob, fileName) {
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(objectUrl);
}

function revokeImageUrls(items) {
    items.forEach(function (item) {
        if (item.imageUrl) {
            URL.revokeObjectURL(item.imageUrl);
        }
    });
}

updateCornerUi();