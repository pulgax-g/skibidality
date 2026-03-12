// ==UserScript==
// @name         skibidality loader
// @namespace    http://tampermonkey.net/
// @version      0.3.3
// @description  loader
// @author       skibidality
// @match        *://*/*
// @grant        none
// @run-at       document-start
// @require      https://unpkg.com/three@0.150.0/build/three.min.js
// ==/UserScript==
(function () {
    const s = document.createElement("script");
    s.src = "https://raw.githubusercontent.com/pulgax-g/skibidality/refs/heads/main/loader.js";
    s.type = "text/javascript";
    document.head.appendChild(s);
})();
