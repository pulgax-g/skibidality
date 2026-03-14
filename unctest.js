// create window
const win = document.createElement("div");
win.style.position = "fixed";
win.style.top = "120px";
win.style.left = "120px";
win.style.width = "300px";
win.style.background = "#1e1e1e";
win.style.color = "white";
win.style.border = "1px solid #444";
win.style.fontFamily = "Arial";
win.style.zIndex = "999999";
win.style.boxShadow = "0 0 10px rgba(0,0,0,0.6)";

// title bar
const title = document.createElement("div");
title.textContent = "JS Test Window";
title.style.background = "#333";
title.style.padding = "8px";
title.style.cursor = "move";
title.style.fontWeight = "bold";

// content
const content = document.createElement("div");
content.style.padding = "10px";
content.innerHTML = "Running checks...";

// result list
const list = document.createElement("ul");
content.appendChild(list);

win.appendChild(title);
win.appendChild(content);
document.body.appendChild(win);

// dragging
let dragging = false;
let offsetX = 0;
let offsetY = 0;

title.addEventListener("mousedown", e => {
    dragging = true;
    offsetX = e.clientX - win.offsetLeft;
    offsetY = e.clientY - win.offsetTop;
});

document.addEventListener("mouseup", () => dragging = false);

document.addEventListener("mousemove", e => {
    if (!dragging) return;
    win.style.left = e.clientX - offsetX + "px";
    win.style.top = e.clientY - offsetY + "px";
});

// tests
const tests = {
    "JavaScript Running": () => true,
    "LocalStorage": () => typeof localStorage !== "undefined",
    "Fetch API": () => typeof fetch !== "undefined",
    "Promise": () => typeof Promise !== "undefined",
    "Arrow Functions": () => {
        try { eval("(()=>{})"); return true; }
        catch { return false; }
    }
};

// run tests
for (const name in tests) {
    const li = document.createElement("li");
    let result = false;

    try {
        result = tests[name]();
    } catch {
        result = false;
    }

    li.textContent = name + ": " + (result ? "PASS" : "FAIL");
    li.style.color = result ? "lime" : "red";

    list.appendChild(li);
}
