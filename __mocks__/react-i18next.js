// react-i18next test double: returns the default (English) text and interpolates {{variables}}.
const interpolate = (text, vars) =>
  vars ? String(text).replace(/{{\s*(\w+)\s*}}/g, (_, k) => (vars[k] !== undefined ? vars[k] : `{{${k}}}`)) : text;

const t = (key, defaultValue, options) => {
  if (defaultValue && typeof defaultValue === 'object') {
    return interpolate(defaultValue.defaultValue || key, defaultValue);
  }
  return interpolate(defaultValue || key, options);
};

module.exports = {
  useTranslation: () => ({
    t,
    i18n: {
      changeLanguage: () => new Promise(() => {}),
    },
  }),
  Trans: ({ children }) => children,
};
