# Market Conditions Analyzer v2

GitHub Pages-friendly modular architecture.

- `index.html` — application shell and navigation
- `js/csv-import.js` — CSV parsing and dataset creation
- `js/data-model.js` — shared dataset namespace
- `js/analyses/market.js` — existing Market Analysis functionality
- `js/components/date-picker.js` — shared custom calendar
- `js/components/comp-remove.js` — comp removal control

The CSV is loaded once in the browser and passed to the analysis modules locally.
