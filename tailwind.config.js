module.exports = {
  content: ["./src/views/**/*.ejs"],
  theme: {
    extend: {
      colors: {
        ink:        "#1A1410",
        coal:       "#2B221C",
        smoke:      "#7A6E62",
        mist:       "#A89889",
        cream:      "#F4ECDF",
        parchment:  "#EBE0CC",
        paper:      "#FAF6EE",
        ember:      "#C75D34",
        "ember-deep": "#9E4524",
        leaf:       "#5C7558",
        clay:       "#B68A3C",
        crimson:    "#8B2A26",
      },
      borderColor: {
        rule:          "rgba(26, 20, 16, 0.12)",
        "rule-strong": "rgba(26, 20, 16, 0.24)",
      },
      fontFamily: {
        display: ['"Fraunces"', 'Georgia', 'serif'],
        sans:    ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono:    ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      letterSpacing: {
        smallcaps: "0.12em",
        button:    "0.06em",
      },
      borderRadius: {
        sharp: "0",
        soft:  "2px",
        pill:  "9999px",
      },
      spacing: {
        "gutter-tight": "8px",
        "gutter":       "16px",
        "gutter-lg":    "24px",
        "air":          "40px",
        "air-lg":       "64px",
        "chapter":      "96px",
      },
    },
  },
};
