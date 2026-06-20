/* Celestial Console / Command Deck — theme engine for the LoL ops dashboard.
   Two styles, each reshaping the whole UI via CSS-var color channels ("R G B" triplets)
   + fonts + a data-style attribute that drives structural CSS. */
(function () {
  const styles = {
    celestial: {
      label: 'CELESTIAL CONSOLE',
      tag: '观测台 · 历法',
      swatch: '#e8742a',
      fonts: {
        display: '"Saira Condensed", "Noto Sans SC", sans-serif',
        serif: '"Newsreader", "Noto Serif SC", Georgia, serif',
        body: '"Saira", "Noto Sans SC", system-ui, sans-serif',
        mono: '"Space Mono", "JetBrains Mono", monospace',
      },
      vars: {
        '--bg': '18 14 10', '--surface': '24 19 13', '--panel': '28 22 16', '--panel-2': '38 30 22',
        '--line': '58 47 35', '--ink': '239 230 216', '--dim': '184 168 146', '--faint': '122 110 92',
        '--accent': '232 116 42', '--accent-2': '255 158 74', '--good': '120 196 120',
        '--bad': '224 96 72', '--gold': '230 178 90', '--hot': '232 132 42', '--glow': '0.85',
      },
    },
    command: {
      label: 'PERSONAL COMMAND DECK',
      tag: '指挥舱 · 任务',
      swatch: '#36d4e6',
      fonts: {
        display: '"Saira Condensed", "Noto Sans SC", sans-serif',
        serif: '"Saira Condensed", "Noto Sans SC", sans-serif',
        body: '"Saira", "Noto Sans SC", system-ui, sans-serif',
        mono: '"JetBrains Mono", monospace',
      },
      vars: {
        '--bg': '8 13 20', '--surface': '11 17 26', '--panel': '13 21 32', '--panel-2': '17 28 42',
        '--line': '29 53 72', '--ink': '216 230 238', '--dim': '138 160 176', '--faint': '90 112 128',
        '--accent': '54 212 230', '--accent-2': '92 232 200', '--good': '108 222 150',
        '--bad': '255 110 120', '--gold': '255 196 96', '--hot': '255 138 56', '--glow': '0.9',
      },
    },
  };

  function apply(key) {
    const s = styles[key] || styles.celestial;
    const root = document.documentElement;
    Object.entries(s.vars).forEach(([k, v]) => root.style.setProperty(k, v));
    root.style.setProperty('--font-display', s.fonts.display);
    root.style.setProperty('--font-serif', s.fonts.serif);
    root.style.setProperty('--font-body', s.fonts.body);
    root.style.setProperty('--font-mono', s.fonts.mono);
    root.setAttribute('data-style', styles[key] ? key : 'celestial');
  }

  window.OPS_THEME = { styles, apply };
})();
