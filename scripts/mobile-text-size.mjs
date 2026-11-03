// Scale text through one inherited variable; spacing and desktop remain unchanged.
export default function mobileTextSize() {
  return {
    postcssPlugin:'mobile-text-size',
    OnceExit(root) {
      root.walkDecls(/^(font-size|line-height)$/,decl => {
        if (decl.value.includes('--mb-text-scale')) return;
        const length = /^[\d.]+(?:px|rem)$/.test(decl.value);
        const fontVariable = decl.prop === 'font-size' && /^var\(--text-[\w-]+\)$/.test(decl.value);
        if (length || fontVariable) decl.value = `calc(${decl.value} * var(--mb-text-scale, 1))`;
      });
    },
  };
}
