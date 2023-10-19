// Due to renumbering, these additional data become invalid and should be removed
const linesToBeSkipped = ["CONECT", "HELIX", "SHEET", "SSBOND"];

filePicker = document.getElementById('filePicker');

loadPdb(filePicker.files[0]);

filePicker.addEventListener('change', function(e) {
    loadPdb(e.target.files[0]);
});

async function loadPdb(file) {
    // read as text
    content = await file.text();
    out = "";
    offset = 0;
    lastResid = 0;
    lastIcode = " ";
    lines = content.split('\n');
    for(let line of lines) {
        if(line.startsWith('ATOM') || line.startsWith('HETATM')) {
            resid = parseInt(line.substr(22, 4));
            icode = line.substr(26, 1);
            console.log(resid, icode)
            if(resid !== lastResid || (icode !== lastIcode && icode !== ' ')) {
                lastResid = resid;
                lastIcode = icode;
                if(icode !== " ") offset++;
            }        
            line = `${line.substr(0, 22)}${`${(resid + offset)}`.padStart(4, " ")}${" "}${line.substr(27)}`;
            console.log(line);
        }
        if(linesToBeSkipped.some((skip) => line.startsWith(skip))) continue;
        out += line + '\n';
    }
    download(`${file.name.split(".")[0]}_rac.pdb` , out);
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