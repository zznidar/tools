var xml;
async function parse() {
    parser = new DOMParser();
    fetch("template.xml")    
    .then((response) => response.text())
    .then((text) => {
        xml = parser.parseFromString(text, "text/xml");
        console.log(xml);
        generate();
    });
}

function generate() {
    datoteke = document.getElementById("inputArea").value.trim().split("\n");
    console.log(datoteke);

    ori = xml.getElementsByTagName("conditions")[0].firstElementChild;

    for(let d of datoteke) {
        let c = xml.createElement("condition");
        c.setAttribute("type", "leafCondition");
        c.setAttribute("property", "System.FileName");
        c.setAttribute("operator", "eq");
        c.setAttribute("value", d);
        ori.appendChild(c); 
    }

    let folder = document.getElementById("inputFolder").value.trim();
    xml.getElementsByTagName("include")[0].setAttribute("path", folder);

    // XML is ready; download it!
    download((`${(new Date()).getTime()}.search-ms`), new XMLSerializer().serializeToString(xml.documentElement));
    
}

// https://ourcodeworld.com/articles/read/189/how-to-create-a-file-and-generate-a-download-with-javascript-in-the-browser-without-a-server
function download(filename, text) {
    var element = document.createElement('a');
    element.setAttribute('href', 'data:application/xml;charset=utf-8,' + encodeURIComponent(text));
    element.setAttribute('download', filename);
  
    element.style.display = 'none';
    document.body.appendChild(element);
  
    element.click();
  
    document.body.removeChild(element);
  }