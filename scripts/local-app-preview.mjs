import postcss from 'postcss';

// Reuse installed-app rules in local mobile previews without changing production.
export function localAppPreview() {
  return {
    name: 'local-app-preview',
    apply: 'serve',
    enforce: 'pre',
    transformIndexHtml() {
      return [
        {tag:'script',children:"if(new URLSearchParams(location.search).get('app')==='1')document.documentElement.dataset.localAppPreview='true';",injectTo:'head'},
        {tag:'style',children:'@media(max-width:1023px){html[data-local-app-preview] .install-suggestion{display:none}}',injectTo:'head'},
      ];
    },
    transform(code,id) {
      if (!id.split('?')[0].endsWith('.css')) return null;
      const root = postcss.parse(code,{from:id});
      root.walkAtRules('media',rule => {
        if (!/^\(display-mode: standalone\) and \(max-width: 1023px\)$/.test(rule.params)) return;
        const preview = rule.clone({params:'(max-width: 1023px)'});
        preview.walkRules(child => {
          child.selectors = child.selectors.map(selector => `:where(html[data-local-app-preview]) ${selector}`);
        });
        rule.after(preview);
      });
      return {code:root.toString(),map:null};
    },
  };
}
