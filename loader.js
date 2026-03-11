(function () {
    const scripts = {
        "krunker.io": "https://raw.githubusercontent.com/pulgax-g/skibidality/refs/heads/main/krunker.open.js",
        "test2.com": "https://raw.githubusercontent.com/pulgax-g/skibidality/refs/heads/main/test2.js",
        "test3.com": "https://raw.githubusercontent.com/pulgax-g/skibidality/refs/heads/main/test3.js"
    };

    const src = scripts[window.location.hostname];

    if (src) {
        const s = document.createElement("script");
        s.src = src;
        document.head.appendChild(s);
    }
})();
