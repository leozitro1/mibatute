import { randomUUID } from 'node:crypto';

export function appVersion() {
  const version = randomUUID();
  return {
    name: 'app-version',
    apply: 'build',
    config: () => ({define:{'import.meta.env.APP_BUILD_ID':JSON.stringify(version)}}),
    generateBundle() {
      this.emitFile({type:'asset',fileName:'app-version.json',source:JSON.stringify({version})});
    },
  };
}
