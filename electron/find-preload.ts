import { ipcRenderer } from "electron";

interface FoundInPageResult {
  activeMatchOrdinal: number;
  matches: number;
}

const icons = {
  previous:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m18 15-6-6-6 6"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
  close:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
};

function renderFindBar() {
  document.documentElement.innerHTML = `
    <head>
      <meta charset="UTF-8">
      <style>
        :root {
          color-scheme: light dark;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        * { box-sizing: border-box; }
        html, body {
          width: 100%;
          height: 100%;
          margin: 0;
          overflow: hidden;
          background: transparent;
        }
        form {
          display: flex;
          align-items: center;
          gap: 4px;
          height: 100%;
          padding: 4px;
          border: 1px solid light-dark(hsl(214 32% 91%), hsl(217 33% 17%));
          border-radius: 6px;
          color: light-dark(hsl(222 47% 11%), hsl(210 40% 98%));
          background: light-dark(hsl(0 0% 100%), hsl(222 47% 11%));
          box-shadow: 0 4px 10px rgb(0 0 0 / 0.15);
        }
        input {
          min-width: 0;
          width: 192px;
          height: 28px;
          padding: 0 8px;
          border: 0;
          outline: 0;
          color: inherit;
          background: transparent;
          font: inherit;
          font-size: 14px;
        }
        input::placeholder { color: light-dark(hsl(215 16% 47%), hsl(215 20% 65%)); }
        output {
          min-width: 56px;
          padding: 0 4px;
          color: light-dark(hsl(215 16% 47%), hsl(215 20% 65%));
          text-align: center;
          font-size: 12px;
          font-variant-numeric: tabular-nums;
        }
        output.no-match { color: hsl(0 72% 51%); }
        button {
          display: inline-flex;
          width: 28px;
          height: 28px;
          flex: 0 0 28px;
          align-items: center;
          justify-content: center;
          padding: 0;
          border: 0;
          border-radius: 4px;
          color: inherit;
          background: transparent;
        }
        button:hover:not(:disabled) { background: light-dark(hsl(210 40% 96%), hsl(217 33% 17%)); }
        button:focus-visible { outline: 2px solid hsl(221 83% 53%); outline-offset: -2px; }
        button:disabled { opacity: 0.45; }
        svg {
          width: 16px;
          height: 16px;
          fill: none;
          stroke: currentColor;
          stroke-width: 2;
          stroke-linecap: round;
          stroke-linejoin: round;
        }
      </style>
    </head>
    <body>
      <form>
        <input type="text" placeholder="Find" aria-label="Find in page">
        <output></output>
        <button name="previous" type="button" aria-label="Previous match">${icons.previous}</button>
        <button name="next" type="button" aria-label="Next match">${icons.next}</button>
        <button name="close" type="button" aria-label="Close">${icons.close}</button>
      </form>
    </body>
  `;

  const input = document.querySelector("input");
  const output = document.querySelector("output");
  const previous = document.querySelector<HTMLButtonElement>(
    'button[name="previous"]',
  );
  const next = document.querySelector<HTMLButtonElement>('button[name="next"]');
  const close = document.querySelector<HTMLButtonElement>(
    'button[name="close"]',
  );
  if (!input || !output || !previous || !next || !close) return;

  const updateButtons = () => {
    const disabled = input.value.length === 0;
    previous.disabled = disabled;
    next.disabled = disabled;
  };

  const find = (findNext: boolean, forward = true) => {
    ipcRenderer.send("find:start", {
      text: input.value,
      findNext,
      forward,
    });
  };

  input.addEventListener("input", () => {
    output.value = "";
    output.classList.remove("no-match");
    updateButtons();
    if (input.value) {
      find(true);
    } else {
      ipcRenderer.send("find:stop", "clearSelection");
    }
  });

  input.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
      event.preventDefault();
      input.select();
    } else if (event.key === "Escape") {
      event.preventDefault();
      ipcRenderer.send("find:close");
    } else if (event.key === "Enter") {
      event.preventDefault();
      find(false, !event.shiftKey);
    }
  });

  previous.addEventListener("click", () => find(false, false));
  next.addEventListener("click", () => find(false, true));
  close.addEventListener("click", () => ipcRenderer.send("find:close"));

  ipcRenderer.on("find:result", (_event, result: FoundInPageResult) => {
    if (!input.value) return;
    output.value = `${result.activeMatchOrdinal}/${result.matches}`;
    output.classList.toggle("no-match", result.matches === 0);
    input.focus();
  });

  ipcRenderer.on("find:show", () => {
    input.focus();
    input.select();
  });

  updateButtons();
}

window.addEventListener("DOMContentLoaded", renderFindBar);
