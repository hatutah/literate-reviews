// `.md` files are loaded as raw text — by wrangler via the `Text`
// module rule in each wrangler.*.toml, and by vitest via the
// `md-as-text` plugin in vitest.config.ts.
declare module "*.md" {
  const content: string;
  export default content;
}
