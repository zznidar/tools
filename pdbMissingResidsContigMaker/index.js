// Due to renumbering, these additional data become invalid and should be removed
const linesToBeSkipped = ["CONECT", "HELIX", "SHEET", "SSBOND"];

filePicker = document.getElementById('filePicker');

//loadPdb(filePicker.files[0]);

function begin() {
    loadPdb(filePicker.files[0]);
}

filePicker.addEventListener('change', function(e) {
    //loadPdb(e.target.files[0]);
});

async function loadPdb(file) {
    // read as text
    content = await file.text();
    out = "";
    offset = 0;
    lastResid = "[";
    resid = "";
    //lastIcode = " ";
    lines = content.split('\n');
    chain = "";
    lastChain = "";
    contigOutput = "";

    hotspotInput = document.getElementById("hotspotInput").value.split(","); // e.g. B435,B431,B876

    starts = []; // Contains resid numbers where a section starts
    ends = []; // Contains resid numbers where sections end

    for(let line of lines) {
        if(line.startsWith('ATOM') || "Only use atoms, ignore heteroatoms" === false) {
            resid = parseInt(line.substr(22, 4));
            //icode = line.substr(26, 1);
            //console.log(resid)
            if(resid !== lastResid && resid !== lastResid+1 || ("Ignore insertion codes. If they are present, user should use the other tool first to renumber them." === false)) {
                // We should end previous section.
                ends.push(lastResid);
                contigOutput += `${lastResid}`;
                // add inpaint
                // We should start a new section.
                chain = line.substr(21,1);
                contigOutput += lastChain == chain ? `/${resid - lastResid - 1}/` : "/0 ";
                starts.push(`${chain}${resid}`);
                contigOutput += `${chain}${resid}-`;

                offset += (resid - (lastResid?.replace?.("[", 0) ?? lastResid) - 1);

                //lastIcode = icode;
                //if(icode !== " ") offset++;
            }        
            lastResid = resid;
            lastChain = chain;
            //console.log(`resid: ${resid}, lastResid: ${lastResid?.replace?.("[", 0) ?? lastResid}, offset: ${offset}`);
            line = `${line.substr(0, 22)}${`${(resid - offset)}`.padStart(4, " ")}${" "}${line.substr(27)}`;
            //console.log(line);

            if(hotspotInput.includes(`${chain}${resid}`)) {
                console.log(`Hotspot found: ${chain}${resid}, renumbered to ${chain}${resid - offset}`);
                hotspotInput[hotspotInput.indexOf(`${chain}${resid}`)] = `${chain}${resid - offset}`;
            }
        }
        if(linesToBeSkipped.some((skip) => line.startsWith(skip))) continue;
        if(line.startsWith('TER')) offset = 0; // very inaccurate, but sufficient for my current use-case
        out += line + '\n';
    }
    contigOutput += `${resid}]`; // Add the last residue to the contig
    console.log("Contig output:", contigOutput);
    document.getElementById("outputText").innerText += `\n\n${contigOutput}`;

    document.getElementById("hotspotOutput").innerText += `\n\n${hotspotInput.join(", ")}`;

    out = out.replaceAll("\n\n", "\n");
    //download(`${file.name.split(".")[0]}_rac.pdb` , out);
    document.getElementById("downloadButton").disabled = false;

    // Now generate contig
}

function downloadRenumbered() {
    download(`${filePicker.files[0].name.split(".")[0]}_renumbered.pdb` , out);
}


// https://ourcodeworld.com/articles/read/189/how-to-create-a-file-and-generate-a-download-with-javascript-in-the-browser-without-a-server
function download(filename, text) {
    var element = document.createElement('a');
    element.setAttribute('href', 'data:chemical/pdb;charset=utf-8,' + encodeURIComponent(text));
    element.setAttribute('download', filename);
  
    element.style.display = 'none';
    document.body.appendChild(element);
  
    element.click();
  
    document.body.removeChild(element);
  }

// PDB specification reference: https://www.cgl.ucsf.edu/chimera/docs/UsersGuide/tutorials/pdbintro.html