// Lets plain `node` run the app's TypeScript sources (CLI scripts + tests) without a
// build step: type stripping is native in Node 22, this only teaches the resolver about
// the `@/*` path alias and extensionless imports that the bundler handles for us.
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register(pathToFileURL(new URL('./ts-hooks.mjs', import.meta.url).pathname));
