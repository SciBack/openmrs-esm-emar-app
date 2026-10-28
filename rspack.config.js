const config = require('openmrs/default-rspack-config');

// The 244 KiB asset-size budget rspack warns about isn't meaningful for O3
// modules: framework + Carbon design system push every bundle past it, so the
// hint just adds noise on every build. Disable it.
config.overrides.performance = { hints: false };

// @openmrs/esm-patient-common-lib is published as TypeScript source ("main": "src/index.ts").
// It is a shared (peer) dependency provided at runtime by the patient chart; only the fallback copy
// required by Module Federation is transpiled here. node_modules is excluded except for that package.
config.scriptRuleConfig.exclude = /node_modules(?![\\/]@openmrs[\\/]esm-patient-common-lib[\\/])/;

module.exports = config;
