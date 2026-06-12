const filePicker = document.getElementById("filePicker");
const decimalSeparatorToggle = document.getElementById("decimalSeparatorToggle");
const tableContainer = document.getElementById("tableContainer");
const downloadCsvBtn = document.getElementById("downloadCsvBtn");
const results = document.getElementById("results");

let lastExtracted = [];

const parser = new DOMParser();

filePicker.addEventListener("change", function (event) {
    loadZips(Array.from(event.target.files));
});

decimalSeparatorToggle.addEventListener("change", function () {
    renderSummaryTable(lastExtracted);
});

downloadCsvBtn.addEventListener("click", function () {
    downloadCsv(lastExtracted);
});

function getEntries(file) {
    return new zip.ZipReader(new zip.BlobReader(file)).getEntries();
}

function getDirectChildText(parent, tagName) {
    const child = Array.from(parent.children).find(element => element.tagName === tagName);
    return child ? child.textContent : null;
}

function extractPeaks(xmlText) {
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");
    const peaks = Array.from(xmlDoc.getElementsByTagName("Peak"));

    return peaks.map((peak, index) => ({
        peakIndex: index + 1,
        ExtCoeff: getDirectChildText(peak, "ExtCoeff"),
        ExtCoeffAmount: getDirectChildText(peak, "ExtCoeffAmount"),
        ExtCoeffConc: getDirectChildText(peak, "ExtCoeffConc"),
    })).filter(peak => peak.ExtCoeff && peak.ExtCoeffAmount && peak.ExtCoeffConc);
}

async function extractChromFromZip(file) {
    try {
        const entries = await getEntries(file);
        const chromEntry = entries.find(entry => entry.filename.replace(/\\/g, "/").endsWith("Chrom.1.Xml"));

        if (!chromEntry) {
            return {
                fileName: file.name,
                error: "Chrom.1.Xml not found",
                peaks: [],
            };
        }

        const xmlText = await chromEntry.getData(new zip.TextWriter());
        return {
            fileName: file.name,
            peaks: extractPeaks(xmlText),
        };
    } catch (error) {
        return {
            fileName: file.name,
            error: error instanceof Error ? error.message : String(error),
            peaks: [],
        };
    }
}

async function loadZips(files) {
    if (!files.length) {
        lastExtracted = [];
        tableContainer.innerHTML = "";
        downloadCsvBtn.disabled = true;
        results.textContent = "";
        return;
    }

    results.textContent = "Processing...";

    const extracted = [];
    for (const file of files) {
        extracted.push(await extractChromFromZip(file));
    }

    lastExtracted = extracted;

    renderSummaryTable(extracted);
    downloadCsvBtn.disabled = extracted.length === 0;

    const output = JSON.stringify(extracted, null, 2);
    results.textContent = output;
    downloadJson(output, "akta-extracted-peaks.json");
}

function formatLabel(fileName) {
    return fileName.split("(")[0].trim();
}

function renderSummaryTable(extracted) {
    const useDecimalComma = decimalSeparatorToggle.checked;
    const maxPeaks = extracted.reduce((max, file) => Math.max(max, file.peaks.length), 0);

    if (!maxPeaks) {
        tableContainer.innerHTML = "<p>No peaks with ExtCoeff, ExtCoeffAmount, and ExtCoeffConc were found.</p>";
        downloadCsvBtn.disabled = true;
        return;
    }

    const headerCells = ["<th>label</th>"];
    for (let peakIndex = 1; peakIndex <= maxPeaks; peakIndex += 1) {
        const peakLabel = peakIndex === 1 ? "" : `Peak ${peakIndex} `;
        headerCells.push(
            `<th>${peakLabel}ExtCoeff</th>`,
            `<th>${peakLabel}ExtCoeffAmount [mg]</th>`,
            `<th>${peakLabel}ExtCoeffConc [mg/mL]</th>`,
        );
    }

    const bodyRows = extracted.map(file => {
        const rowCells = [`<td>${escapeHtml(formatLabel(file.fileName))}</td>`];

        for (let peakIndex = 0; peakIndex < maxPeaks; peakIndex += 1) {
            const peak = file.peaks[peakIndex];
            if (peak) {
                rowCells.push(
                    `<td>${escapeHtml(formatDecimalSeparator(peak.ExtCoeff, useDecimalComma))}</td>`,
                    `<td>${escapeHtml(formatDecimalSeparator(peak.ExtCoeffAmount, useDecimalComma))}</td>`,
                    `<td>${escapeHtml(formatDecimalSeparator(peak.ExtCoeffConc, useDecimalComma))}</td>`,
                );
            } else {
                rowCells.push("<td></td>", "<td></td>", "<td></td>");
            }
        }

        return `<tr>${rowCells.join("")}</tr>`;
    });

    tableContainer.innerHTML = `
        <table>
            <thead>
                <tr>${headerCells.join("")}</tr>
            </thead>
            <tbody>${bodyRows.join("")}</tbody>
        </table>
    `;
}

function buildCsv(extracted) {
    const useDecimalComma = decimalSeparatorToggle.checked;
    const delimiter = useDecimalComma ? ";" : ",";
    const maxPeaks = extracted.reduce((max, file) => Math.max(max, file.peaks.length), 0);

    const headerCells = ["label"];
    for (let peakIndex = 1; peakIndex <= maxPeaks; peakIndex += 1) {
        const peakLabel = peakIndex === 1 ? "" : `Peak ${peakIndex} `;
        headerCells.push(
            `${peakLabel}ExtCoeff`,
            `${peakLabel}ExtCoeffAmount [mg]`,
            `${peakLabel}ExtCoeffConc [mg/mL]`,
        );
    }

    const rows = [headerCells.map(value => escapeCsv(value, delimiter)).join(delimiter)];

    for (const file of extracted) {
        const rowCells = [formatLabel(file.fileName)];

        for (let peakIndex = 0; peakIndex < maxPeaks; peakIndex += 1) {
            const peak = file.peaks[peakIndex];
            if (peak) {
                rowCells.push(
                    formatDecimalSeparator(peak.ExtCoeff, useDecimalComma),
                    formatDecimalSeparator(peak.ExtCoeffAmount, useDecimalComma),
                    formatDecimalSeparator(peak.ExtCoeffConc, useDecimalComma),
                );
            } else {
                rowCells.push("", "", "");
            }
        }

        rows.push(rowCells.map(value => escapeCsv(value, delimiter)).join(delimiter));
    }

    return rows.join("\r\n");
}

function escapeCsv(value, delimiter) {
    const text = String(value ?? "");
    if (text.includes('"') || text.includes("\n") || text.includes("\r") || text.includes(delimiter)) {
        return `"${text.replaceAll('"', '""')}"`;
    }

    return text;
}

function formatDecimalSeparator(value, useDecimalComma) {
    if (value === null || value === undefined) {
        return "";
    }

    return useDecimalComma ? String(value).replaceAll(".", ",") : String(value);
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function downloadJson(content, fileName) {
    const blob = new Blob([content], { type: "application/json" });
    const objectUrl = URL.createObjectURL(blob);
    const element = document.createElement("a");
    element.href = objectUrl;
    element.download = fileName;
    element.style.display = "none";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    URL.revokeObjectURL(objectUrl);
}

function downloadCsv(extracted) {
    if (!extracted.length) {
        return;
    }

    const csv = buildCsv(extracted);
    const useDecimalComma = decimalSeparatorToggle.checked;
    const fileName = useDecimalComma ? "akta-extracted-peaks-decimal-comma.csv" : "akta-extracted-peaks.csv";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    const element = document.createElement("a");
    element.href = objectUrl;
    element.download = fileName;
    element.style.display = "none";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    URL.revokeObjectURL(objectUrl);
}