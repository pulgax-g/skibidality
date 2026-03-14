<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Basic Draggable Window Test</title>

<style>
body {
    background:#111;
    font-family:Arial;
    color:white;
}

#window {
    width:300px;
    position:absolute;
    top:100px;
    left:100px;
    border:1px solid #444;
    background:#1e1e1e;
    box-shadow:0 0 10px rgba(0,0,0,0.6);
}

#titlebar {
    background:#333;
    padding:8px;
    cursor:move;
    font-weight:bold;
}

#content {
    padding:10px;
    font-size:14px;
}

.pass { color:lime; }
.fail { color:red; }
</style>
</head>

<body>

<div id="window">
    <div id="titlebar">UNC Style Test Window</div>
    <div id="content">
        Running checks...
        <ul id="results"></ul>
    </div>
</div>

<script>
/* -----------------
   DRAGGING SYSTEM
------------------*/
const win = document.getElementById("window");
const bar = document.getElementById("titlebar");

let dragging = false;
let offsetX = 0;
let offsetY = 0;

bar.addEventListener("mousedown", (e)=>{
    dragging = true;
    offsetX = e.clientX - win.offsetLeft;
    offsetY = e.clientY - win.offsetTop;
});

document.addEventListener("mouseup", ()=>{
    dragging = false;
});

document.addEventListener("mousemove", (e)=>{
    if(!dragging) return;

    win.style.left = (e.clientX - offsetX) + "px";
    win.style.top  = (e.clientY - offsetY) + "px";
});

/* -----------------
   BASIC ENV CHECKS
------------------*/
const tests = {
    "JavaScript Running": () => true,
    "LocalStorage Support": () => typeof localStorage !== "undefined",
    "Fetch API Support": () => typeof fetch !== "undefined",
    "ES6 Arrow Functions": () => {
        try { eval("(()=>{})"); return true; }
        catch { return false; }
    },
    "Promise Support": () => typeof Promise !== "undefined"
};

const results = document.getElementById("results");

for (let name in tests) {
    const li = document.createElement("li");
    let passed = false;

    try {
        passed = tests[name]();
    } catch {
        passed = false;
    }

    li.textContent = name + ": " + (passed ? "PASS" : "FAIL");
    li.className = passed ? "pass" : "fail";

    results.appendChild(li);
}
</script>

</body>
</html>
